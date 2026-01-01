// src/features/CustomPage/CustomPage.store.ts

import { debounce } from "lodash-es";
import { defineStore } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import {
  useFileSystemStore,
  VirtualFile,
  VirtualFolder,
} from "@/features/FileSystem/FileSystem.store";

export interface CustomPage {
  name: string; // 文件夹名称，也是唯一ID
  icon: string | null; // 图标的 URL (tauri asset protocol)
  entry: string; // app.vue 的虚拟路径 (用于 openFile)
  isVisible: boolean; // 是否显示
}

const STORAGE_KEY_ORDER = "custom_page_order";
const STORAGE_KEY_HIDDEN = "custom_page_hidden";

export const useCustomPageStore = defineStore("customPage", () => {
  const fsStore = useFileSystemStore();

  // --- State ---
  // 注册表：Map<PageName, PageInfo>
  const registry = reactive(new Map<string, Omit<CustomPage, "isVisible">>());

  // 排序列表 (存储 name)
  const pageOrder = ref<string[]>([]);

  // 隐藏列表 Set<name>
  const hiddenPages = ref<Set<string>>(new Set());

  // --- Persistence Helpers ---
  const loadPreferences = () => {
    try {
      const savedOrder = localStorage.getItem(STORAGE_KEY_ORDER);
      if (savedOrder) {
        pageOrder.value = JSON.parse(savedOrder);
      }

      const savedHidden = localStorage.getItem(STORAGE_KEY_HIDDEN);
      if (savedHidden) {
        hiddenPages.value = new Set(JSON.parse(savedHidden));
      }
    } catch (e) {
      console.error("Failed to load custom page preferences", e);
    }
  };

  const savePreferences = debounce(() => {
    localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(pageOrder.value));
    localStorage.setItem(
      STORAGE_KEY_HIDDEN,
      JSON.stringify(Array.from(hiddenPages.value))
    );
  }, 500);

  // --- Actions ---

  /**
   * 扫描 page 文件夹并重建注册表
   */
  const scanPages = async () => {
    // 确保 FS 已初始化
    if (!fsStore.isInitialized) await fsStore.init();

    const pageDir = fsStore.root.resolve("page");
    if (!pageDir || !(pageDir instanceof VirtualFolder)) {
      return;
    }

    // 临时 Map 用于构建
    const foundPages = new Map<string, Omit<CustomPage, "isVisible">>();

    for (const [dirName, node] of pageDir.children) {
      if (node instanceof VirtualFolder) {
        // 1. 寻找入口 app.vue
        const entryFile = node.children.get("app.vue");
        if (!entryFile || !(entryFile instanceof VirtualFile)) {
          continue; // 没有入口文件，跳过
        }

        // 2. 寻找图标 icon.*
        let iconUrl: string | null = null;
        for (const [fileName, child] of node.children) {
          if (fileName.startsWith("icon.") && child instanceof VirtualFile) {
            // VirtualNode 自带 .url getter，返回 tauri convertFileSrc 后的路径
            iconUrl = child.url;
            break;
          }
        }

        foundPages.set(dirName, {
          name: dirName,
          entry: entryFile.path, // 例如 "page/my-plugin/app.vue"
          icon: iconUrl,
        });
      }
    }

    // 更新注册表
    registry.clear();
    foundPages.forEach((val, key) => registry.set(key, val));

    // 更新 Order：
    // 1. 移除不存在的页面
    pageOrder.value = pageOrder.value.filter((name) => registry.has(name));
    // 2. 追加新发现的页面
    for (const name of registry.keys()) {
      if (!pageOrder.value.includes(name)) {
        pageOrder.value.push(name);
      }
    }

    savePreferences();
  };

  /**
   * 初始化
   */
  const init = async () => {
    loadPreferences();
    await scanPages();
    // 监听 preferences 变化自动保存
    watch([pageOrder, hiddenPages], () => savePreferences(), { deep: true });
  };

  /**
   * 切换显隐
   */
  const toggleVisibility = (name: string) => {
    if (hiddenPages.value.has(name)) {
      hiddenPages.value.delete(name);
    } else {
      hiddenPages.value.add(name);
    }
  };

  /**
   * 重排序
   */
  const setOrder = (newOrder: string[]) => {
    pageOrder.value = newOrder;
  };

  // --- Getters ---

  // 最终提供给 Sidebar 渲染的列表（已排序，过滤掉隐藏的）
  const visiblePages = computed(() => {
    return pageOrder.value
      .filter((name) => !hiddenPages.value.has(name) && registry.has(name))
      .map((name) => {
        const page = registry.get(name)!;
        return {
          ...page,
          isVisible: true,
        };
      });
  });

  // 提供给“管理菜单”的列表（包含所有，带状态）
  const allPages = computed(() => {
    return pageOrder.value
      .map((name) => {
        const page = registry.get(name);
        if (!page) return null;
        return {
          ...page,
          isVisible: !hiddenPages.value.has(name),
        };
      })
      .filter(Boolean) as CustomPage[];
  });

  return {
    registry,
    pageOrder,
    hiddenPages,
    visiblePages,
    allPages,
    init,
    scanPages,
    toggleVisibility,
    setOrder,
  };
});
