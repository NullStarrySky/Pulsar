// src/schema/manifest/composables/useResources.ts

import { computed, watch, unref, MaybeRef, ComputedRef, Component } from "vue";
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import { useInlineResources } from "./useInlineResources";
import { createExecuteContext } from "./useExecuteContext";
import type { ManifestContent } from "@/schema/manifest/manifest.types";

const AVAILABLE_RESOURCE_TYPES = ["character", "lorebook", "preset"] as const;
type ResourceTypes = (typeof AVAILABLE_RESOURCE_TYPES)[number];

type ResourceNode<T = any> = { path: string; content: T };

export type Resource = {
  [K in ResourceTypes]: ResourceNode[];
};
import urlJoin from "url-join";
import { useVueComponent } from "@/features/FileSystem";

export function useResources(activeFilePath: MaybeRef<string | null>) {
  const store = useFileSystemStore();
  const pathRef = computed(() => unref(activeFilePath));

  // --- 1. Manifest 定位逻辑 ---
  const manifestPath = computed(() => {
    const current = pathRef.value;
    if (!current) return null;

    // A. 自身就是 manifest
    if (
      current.endsWith(".[manifest].json") ||
      current.endsWith("manifest.json")
    ) {
      return current;
    }

    // B. 父目录寻找
    const parentDir = current.split("/").slice(0, -1).join("/");
    if (!parentDir) return "global/manifest.[manifest].json";

    const folderNode = store.getNodeByPath(store.fileStructure, parentDir);
    if (folderNode && typeof folderNode === "object") {
      const manifestName = Object.keys(folderNode).find(
        (name) => name.endsWith(".[manifest].json") || name === "manifest.json"
      );
      if (manifestName) return urlJoin(parentDir, manifestName);
    }

    // C. 默认回退
    return null;
  });

  const { content: manifestContent, sync: syncManifest } =
    useFileContent<ManifestContent>(manifestPath);

  // --- 2. 内联资源 & 头像 ---
  const { inlineResources, avatar } = useInlineResources(pathRef);

  // --- 3. 路径解析 (合并 Manifest 选择 + 内联强制) ---
  const resolvedPaths = computed(() => {
    const selection = manifestContent.value?.selection || {
      character: [],
      lorebook: [],
      preset: [],
    };
    const inline = inlineResources.value;

    return {
      character: Array.from(
        new Set([...(selection.character || []), ...inline.character])
      ),
      lorebook: Array.from(
        new Set([...(selection.lorebook || []), ...inline.lorebook])
      ),
      preset: Array.from(
        new Set([...(selection.preset || []), ...inline.preset])
      ),
    };
  });

  // --- 4. 自动加载资源内容 ---
  watch(
    resolvedPaths,
    async (paths) => {
      const allPaths = [...paths.character, ...paths.lorebook, ...paths.preset];
      if (allPaths.length > 0) {
        await Promise.all(allPaths.map((p) => store.load(p)));
      }
    },
    { immediate: true, deep: true }
  );

  // --- 5. 构建资源对象 (Resource Object) ---
  // 这是一个响应式对象，随着文件加载完成而更新
  const resources = computed((): Resource => {
    const paths = resolvedPaths.value;
    const result: any = { character: [], lorebook: [], preset: [] };

    (["character", "lorebook", "preset"] as const).forEach((type) => {
      result[type] = paths[type]
        .map((p) => {
          const node = store.getNodeByPath(store.fileStructure, p);
          // 简单的内容提取逻辑，根据实际 Store 结构调整
          // @ts-ignore
          const rawContent = node?.content;
          const content = rawContent
            ? typeof rawContent === "string"
              ? JSON.parse(rawContent)
              : rawContent
            : null;
          return { path: p, content };
        })
        .filter((r) => r.content !== null);
    });

    return result;
  });

  // --- 6. 提供生成执行上下文切片的方法 ---
  // 这不再是一个 computed，而是一个动作，用于在点击"发送"时获取那一刻的状态
  const getExecuteContextSnapshot = (
    customContext: Record<string, any> = {}
  ) => {
    return createExecuteContext(
      customContext,
      resources.value, // 传入当前的资源快照
      store.setting, // 传入当前的设置快照
      store.modelConfig // 传入当前的模型配置快照
    );
  };

  // --- Actions ---
  const toggleSelection = (
    type: "character" | "lorebook" | "preset",
    path: string
  ) => {
    if (!manifestContent.value) return;
    const currentList = manifestContent.value.selection[type] || [];
    const newList = currentList.includes(path)
      ? currentList.filter((p) => p !== path)
      : [...currentList, path];

    syncManifest({
      ...manifestContent.value,
      selection: { ...manifestContent.value.selection, [type]: newList },
      last_modified: Date.now(),
    });
  };

  const background = computed(() => {
    const bg = manifestContent.value?.background;
    if (!bg || !bg.path) return null;

    // 获取完整资源路径 (如果是相对路径需要处理，这里假设是 store 中的绝对路径)
    const src = store.convertFileSrc(bg.path);
    const isVideo = bg.path.toLowerCase().match(/\.(mp4|webm|ogg)$/);

    return {
      src,
      mode: bg.mode || "cover",
      type: isVideo ? "video" : "image",
    };
  });

  // --- 内联组件逻辑 ---
  const customComponents = computed(() => {
    const map = manifestContent.value?.customComponents || {};
    const componentMap: Record<string, ComputedRef<Component | null>> = {};

    Object.entries(map).forEach(([tagName, componentPath]) => {
      if (!componentPath) return;

      // 这里模拟使用 useVueComponent 或 defineAsyncComponent
      // 实际项目中需要具体的加载器实现
      componentMap[tagName] = useVueComponent(componentPath);
    });

    return componentMap;
  });

  return {
    manifestPath,
    manifestContent,
    inlineResources,
    avatar, // 导出的响应式头像对象 { src, set }
    resources, // 响应式的资源对象
    getExecuteContextSnapshot, // 获取上下文切片的方法
    toggleSelection,
    customComponents,
    background,
  };
}
