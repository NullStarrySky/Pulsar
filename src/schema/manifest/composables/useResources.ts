import {
  computed,
  watch,
  unref,
  type MaybeRef,
  type ComputedRef,
  type Component,
} from "vue";
import {
  useFileSystemStore,
  VirtualFile,
  VirtualFolder,
  type VirtualNode,
} from "@/features/FileSystem/FileSystem.store";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import { createExecuteContext } from "./useExecuteContext"; // 假设这个文件存在
import { useInlineResources } from "./useInlineResources";
import type { ManifestContent } from "@/schema/manifest/manifest.types";
import { useVueComponent } from "@/features/FileSystem/composables/useVueComponent";

const AVAILABLE_RESOURCE_TYPES = ["character", "lorebook", "preset"] as const;
type ResourceTypes = (typeof AVAILABLE_RESOURCE_TYPES)[number];

// 运行时使用的资源节点（包含内容）
type ResourceNode<T = any> = { path: string; content: T };

export type Resource = {
  [K in ResourceTypes]: ResourceNode[];
};

export function useResources(activeFilePath: MaybeRef<string | null>) {
  const store = useFileSystemStore();
  const pathRef = computed(() => unref(activeFilePath));

  // =========================================================================
  // 1. Manifest 定位与读取
  // =========================================================================

  const manifestPath = computed(() => {
    const current = pathRef.value;
    if (!current) return null;

    // A. 自身就是 manifest
    if (
      current.includes(".[manifest].json") ||
      current.endsWith("manifest.json")
    ) {
      return current;
    }

    // B. 从文件反推 Manifest (通常在同一级，或者在 character/xxx 根目录)
    // 这里的逻辑主要依赖 ManifestPanel 传入正确的 manifest 路径
    // 如果没有传入，这里做一个简单的 fallback
    const parts = current.split("/");
    const parentDir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

    // 尝试在父目录找
    const parentNode = store.resolvePath(parentDir);
    if (parentNode instanceof VirtualFolder) {
      for (const [name, node] of parentNode.children) {
        if (
          node instanceof VirtualFile &&
          (name.includes(".[manifest].json") || name === "manifest.json")
        ) {
          return node.path;
        }
      }
    }

    return null;
  });

  // 读取 Manifest 内容
  const manifestContent = useFileContent<ManifestContent>(manifestPath);

  // =========================================================================
  // 2. 确定 Local 和 Global 的根目录
  // =========================================================================

  const globalRootPath = "global";

  const localRootPath = computed(() => {
    if (!manifestPath.value) return null;
    // Manifest 通常位于 character/name/manifest.json
    // 所以 localRoot 就是 manifest 所在的文件夹
    const parts = manifestPath.value.split("/");
    return parts.slice(0, -1).join("/");
  });

  // =========================================================================
  // 3. 运行时逻辑：内容加载与构建 (Snapshot)
  // =========================================================================

  // 获取当前选中的所有路径 (Raw Paths, 可能包含文件夹)
  const activeRawPaths = computed(() => {
    const s = manifestContent.value?.selection;
    if (!s) return { character: [], lorebook: [], preset: [] };
    return {
      character: s.character || [],
      lorebook: s.lorebook || [],
      preset: s.preset || [],
    };
  });
  /**
   * 获取可用的背景图片列表 (Local + Global)
   */
  const availableBackgrounds = computed<AssetGroup[]>(() => {
    const imgExts = ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm"];
    const groups: AssetGroup[] = [];

    // Local
    if (localRootPath.value) {
      const localOpts = scanDirectoryForAssets(
        `${localRootPath.value}/background`,
        imgExts
      );
      if (localOpts.length > 0) {
        groups.push({ group: "Local", options: localOpts });
      }
    }

    // Global
    const globalOpts = scanDirectoryForAssets(
      `${globalRootPath}/background`,
      imgExts
    );
    if (globalOpts.length > 0) {
      groups.push({ group: "Global", options: globalOpts });
    }

    return groups;
  });

  /**
   * 扫描指定目录下的文件并返回选项列表
   * @param dirPath 目录路径
   * @param extensions 允许的扩展名数组 (如 ['png', 'jpg'])
   */
  const scanDirectoryForAssets = (
    dirPath: string,
    extensions?: string[]
  ): AssetOption[] => {
    const node = store.resolvePath(dirPath);
    if (!(node instanceof VirtualFolder)) return [];

    const options: AssetOption[] = [];
    for (const [name, child] of node.children) {
      if (child instanceof VirtualFile) {
        // 如果指定了扩展名，进行过滤
        if (extensions) {
          const ext = name.split(".").pop()?.toLowerCase();
          if (!ext || !extensions.includes(ext)) continue;
        }
        options.push({
          label: name,
          value: child.path,
        });
      }
    }
    return options;
  };

  /**
   * 获取可用的组件文件列表 (Local + Global)
   */
  const availableComponents = computed<AssetGroup[]>(() => {
    const compExts = ["vue", "js", "ts"]; // 假设组件是这些格式
    const groups: AssetGroup[] = [];

    // Local
    if (localRootPath.value) {
      // 注意：SemanticType 中创建的是 plural "components"
      const localOpts = scanDirectoryForAssets(
        `${localRootPath.value}/components`,
        compExts
      );
      if (localOpts.length > 0) {
        groups.push({ group: "Local", options: localOpts });
      }
    }

    // Global
    const globalOpts = scanDirectoryForAssets(
      `${globalRootPath}/components`,
      compExts
    );
    if (globalOpts.length > 0) {
      groups.push({ group: "Global", options: globalOpts });
    }

    return groups;
  });

  /**
   * 递归解析路径：
   * 如果是文件 -> 返回该文件
   * 如果是文件夹 -> 返回该文件夹下所有 JSON 文件 (或者匹配特定类型)
   */
  const resolveEffectiveFiles = (paths: string[]): string[] => {
    const results = new Set<string>();

    const traverse = (node: VirtualNode) => {
      if (node instanceof VirtualFile) {
        // 简单的过滤逻辑：必须是 json
        if (node.name.endsWith(".json")) {
          results.add(node.path);
        }
      } else if (node instanceof VirtualFolder) {
        for (const child of node.children.values()) {
          traverse(child);
        }
      }
    };

    for (const path of paths) {
      const node = store.resolvePath(path);
      if (node) {
        traverse(node);
      }
    }

    return Array.from(results);
  };

  // 计算出真正需要加载的扁平化文件列表
  const effectiveFilePaths = computed(() => {
    const raw = activeRawPaths.value;
    return {
      character: resolveEffectiveFiles(raw.character),
      lorebook: resolveEffectiveFiles(raw.lorebook),
      preset: resolveEffectiveFiles(raw.preset),
    };
  });

  // A. 自动预加载内容
  watch(
    effectiveFilePaths,
    async (paths) => {
      const allPaths = [...paths.character, ...paths.lorebook, ...paths.preset];
      if (allPaths.length === 0) return;
      if (!store.isInitialized) return;

      await Promise.all(
        allPaths.map(async (p) => {
          const node = store.resolvePath(p);
          if (node instanceof VirtualFile) {
            await node
              .read()
              .catch((e) => console.warn(`[Resources] Load failed: ${p}`, e));
          }
        })
      );
    },
    { immediate: true, deep: true }
  );

  // B. 构建 Resources 对象 (供 ExecuteContext 使用)
  const resources = computed((): Resource => {
    const paths = effectiveFilePaths.value;
    const result: any = { character: [], lorebook: [], preset: [] };

    const safeJsonParse = (str: string) => {
      try {
        return JSON.parse(str);
      } catch {
        return str;
      }
    };

    AVAILABLE_RESOURCE_TYPES.forEach((type) => {
      result[type] = paths[type]
        .map((p) => {
          const content = store.contentCache.get(p);
          if (!content) return null;
          return {
            path: p,
            content:
              typeof content === "string" ? safeJsonParse(content) : content,
          };
        })
        .filter((r): r is ResourceNode => r !== null);
    });

    return result;
  });

  // C. 核心：提供执行上下文快照
  const getExecuteContextSnapshot = (
    customContext: Record<string, any> = {}
  ) => {
    if (!store.setting || !store.modelConfig) {
      console.warn("[Resources] Settings or ModelConfig not loaded yet.");
    }

    return createExecuteContext(
      customContext,
      resources.value, // 这里已经是解析文件夹后的扁平数组
      store.setting!,
      store.modelConfig!
    );
  };

  // =========================================================================
  // 4. Actions
  // =========================================================================

  const updateManifest = (newContent: ManifestContent) => {
    if (manifestContent.value) {
      manifestContent.value = { ...newContent, last_modified: Date.now() };
    }
  };

  // 直接更新某一类别的选中列表 (ResourceSelector v-model 使用)
  const updateSelection = (type: ResourceTypes, paths: string[]) => {
    if (!manifestContent.value) return;
    updateManifest({
      ...manifestContent.value,
      selection: {
        ...(manifestContent.value.selection || {}),
        [type]: paths,
      },
    });
  };

  // =========================================================================
  // 5. 其他
  // =========================================================================

  const { avatar } = useInlineResources(manifestPath);

  const background = computed(() => {
    const bg = manifestContent.value?.background;
    if (!bg || !bg.path) return null;
    const node = store.resolvePath(bg.path);
    if (!node || !(node instanceof VirtualFile)) return null;
    const isVideo = bg.path.toLowerCase().match(/\.(mp4|webm|ogg)$/);
    return {
      src: node.url,
      mode: bg.mode || "cover",
      type: isVideo ? "video" : "image",
    };
  });

  const customComponents = computed(() => {
    const map = manifestContent.value?.customComponents || {};
    const componentMap: Record<string, ComputedRef<Component | null>> = {};
    Object.entries(map).forEach(([tagName, componentPath]) => {
      if (!componentPath) return;
      componentMap[tagName] = useVueComponent(componentPath);
    });
    return componentMap;
  });

  return {
    manifestPath,
    manifestContent,

    // 路径信息
    localRootPath,
    globalRootPath,

    // 运行时数据
    resources,
    getExecuteContextSnapshot,

    // Actions
    updateManifest,
    updateSelection,

    // 杂项
    avatar,
    customComponents,
    background,

    // 图片和组件
    availableBackgrounds,
    availableComponents,
  };
}
