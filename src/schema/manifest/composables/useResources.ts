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
} from "@/features/FileSystem/FileSystem.store";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import { useInlineResources } from "./useInlineResources";
import { createExecuteContext } from "./useExecuteContext";
import type { ManifestContent } from "@/schema/manifest/manifest.types";
import { useVueComponent } from "@/features/FileSystem/composables/useVueComponent";

const AVAILABLE_RESOURCE_TYPES = ["character", "lorebook", "preset"] as const;
type ResourceTypes = (typeof AVAILABLE_RESOURCE_TYPES)[number];

// --- 类型定义 ---

// 运行时使用的资源节点（包含内容）
type ResourceNode<T = any> = { path: string; content: T };

export type Resource = {
  [K in ResourceTypes]: ResourceNode[];
};

// UI 展示用的资源项（包含元数据）
export type ResourceItem = {
  path: string;
  name: string;
  type: ResourceTypes;
  source: "global" | "local" | "external";
  selected: boolean;
};

export type ResourceGroup = {
  [K in ResourceTypes]: ResourceItem[];
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

    // B. 父目录寻找 (Local)
    const parts = current.split("/");
    const parentDir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
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

    // C. Global fallback
    const globalManifest = "global/manifest.[manifest].json";
    if (store.resolvePath(globalManifest) instanceof VirtualFile) {
      return globalManifest;
    }
    return null;
  });

  // 使用 useFileContent (自动读写缓存)
  const manifestContent = useFileContent<ManifestContent>(manifestPath);

  // =========================================================================
  // 2. UI 逻辑：可用资源扫描 (availableResources)
  // =========================================================================

  const availableResources = computed<ResourceGroup>(() => {
    const result: ResourceGroup = { character: [], lorebook: [], preset: [] };
    const mContent = manifestContent.value;

    if (!mContent) return result;

    const currentSelection = mContent.selection || {
      character: [],
      lorebook: [],
      preset: [],
    };

    const processedPaths = new Set<string>();

    const addResource = (
      path: string,
      type: ResourceTypes,
      source: "global" | "local" | "external",
      forceSelected = false
    ) => {
      if (processedPaths.has(path)) return;
      processedPaths.add(path);

      const isSelected =
        forceSelected || (currentSelection[type] || []).includes(path);
      const name = path.split("/").pop() || path;

      result[type].push({
        path,
        name,
        type,
        source,
        selected: isSelected,
      });
    };

    // A. 扫描 Local (Manifest 所在目录)
    if (manifestPath.value) {
      const parentDirPath = manifestPath.value
        .split("/")
        .slice(0, -1)
        .join("/");
      const localNode = store.resolvePath(parentDirPath);
      if (localNode instanceof VirtualFolder) {
        scanFolderForResources(localNode, "local", addResource);
      }
    }

    // B. 扫描 Global (global 目录)
    const globalNode = store.resolvePath("global");
    if (globalNode instanceof VirtualFolder) {
      scanFolderForResources(globalNode, "global", addResource);
    }

    // 排序
    AVAILABLE_RESOURCE_TYPES.forEach((type) => {
      result[type].sort((a, b) => {
        if (a.selected !== b.selected) return a.selected ? -1 : 1;
        if (a.source !== b.source) {
          const score = { local: 0, global: 1, external: 2 };
          return score[a.source] - score[b.source];
        }
        return a.name.localeCompare(b.name);
      });
    });

    return result;
  });

  // 辅助扫描函数
  function scanFolderForResources(
    folder: VirtualFolder,
    sourceTag: "global" | "local",
    adder: (path: string, type: ResourceTypes, source: any) => void
  ) {
    for (const [_, node] of folder.children) {
      if (node instanceof VirtualFile) {
        if (node.path === manifestPath.value) continue;
        const type = node.semanticType;
        if (type && AVAILABLE_RESOURCE_TYPES.includes(type as any)) {
          adder(node.path, type as ResourceTypes, sourceTag);
        }
      }
    }
  }

  // =========================================================================
  // 3. 运行时逻辑：内容加载与构建 (Resources & Snapshot)
  // =========================================================================

  // 获取当前选中的所有路径
  const activePaths = computed(() => {
    const s = manifestContent.value?.selection;
    if (!s) return { character: [], lorebook: [], preset: [] };
    return {
      character: s.character || [],
      lorebook: s.lorebook || [],
      preset: s.preset || [],
    };
  });

  // A. 自动加载选中资源的内容
  watch(
    activePaths,
    async (paths) => {
      const allPaths = [...paths.character, ...paths.lorebook, ...paths.preset];
      if (allPaths.length === 0) return;
      if (!store.isInitialized) return;

      await Promise.all(
        allPaths.map(async (p) => {
          const node = store.resolvePath(p);
          if (node instanceof VirtualFile) {
            // read() 内部会自动检查缓存，未缓存则读取文件
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
    const paths = activePaths.value;
    const result: any = { character: [], lorebook: [], preset: [] };

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

  const safeJsonParse = (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  };

  // C. !!! 核心：提供执行上下文快照 !!!
  const getExecuteContextSnapshot = (
    customContext: Record<string, any> = {}
  ) => {
    // 确保 Setting 和 ModelConfig 已加载
    if (!store.setting || !store.modelConfig) {
      console.warn("[Resources] Settings or ModelConfig not loaded yet.");
    }

    return createExecuteContext(
      customContext,
      resources.value,
      store.setting!,
      store.modelConfig!
    );
  };

  // =========================================================================
  // 4. Actions & Helpers
  // =========================================================================

  const updateManifest = (newContent: ManifestContent) => {
    if (manifestContent.value) {
      manifestContent.value = { ...newContent, last_modified: Date.now() };
    }
  };

  const toggleSelection = (
    type: ResourceTypes,
    path: string,
    isSelected: boolean
  ) => {
    if (!manifestContent.value) return;
    const currentList = manifestContent.value.selection?.[type] || [];
    let newList: string[];

    if (isSelected) {
      newList = Array.from(new Set([...currentList, path]));
    } else {
      newList = currentList.filter((p) => p !== path);
    }

    updateManifest({
      ...manifestContent.value,
      selection: {
        ...(manifestContent.value.selection || {}),
        [type]: newList,
      },
    });
  };

  // =========================================================================
  // 5. 其他 (Avatar, Background, Components)
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
    // 基础
    manifestPath,
    manifestContent,

    // UI 列表 (Global + Local + Selected)
    availableResources,

    // 运行时数据
    resources, // 仅包含选中的且已加载内容的资源
    getExecuteContextSnapshot,

    // Actions
    updateManifest,
    toggleSelection,

    // 杂项
    avatar,
    customComponents,
    background,
  };
}
