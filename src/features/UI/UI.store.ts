// src/features/UI/UI.store.ts

import {
  getCurrentWebviewWindow,
  type WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import {
  ClipboardList,
  Cpu,
  Key,
  Search,
  Server,
  Settings2,
} from "lucide-vue-next";
import { defineStore } from "pinia";
import {
  type Component,
  computed,
  markRaw,
  type Ref,
  ref,
  shallowRef,
  watch,
} from "vue";
import ContentRouter from "@/components/EnvironmentSidebar/ContentRouter.vue";
import SearchSidebar from "@/components/layout/SearchSidebar.vue";
import { FSEventType, fsEmitter } from "../FileSystem/FileSystem.events";
import {
  TRASH_DIR_PATH,
  useFileSystemStore,
  VirtualFile,
} from "../FileSystem/FileSystem.store";
import McpPanel from "../MCP/McpPanel.vue";
import ProcessPanel from "../ProcessManager/ProcessPanel.vue";
import SecretsPanel from "../Secrets/SecretsPanel.vue";
import TaskPanel from "../Task/TaskPanel.vue";

export interface BottomBarItem {
  id: string;
  name: string;
  icon?: Component;
  component?: Component;
}

// 1. 变更：扩展 SidebarView 类型，加入新的功能ID
export type SidebarView =
  | "files"
  | "search"
  | "character"
  | "process-manager"
  | "task-manager"
  | "secrets-manager"
  | "mcp-manager"
  | "none";

export interface UIState {
  openedFiles: string[];
  activeFile: string | null;
  leftSidebarView: SidebarView;
  customViews: { name: string; path: string }[];
  subWindows: Map<string, WebviewWindow>;
  currentWindowLabel: string | null;
  isMainWindow: boolean;
  parentWindowLabel: string | null;
  windowMode: "full" | "single" | null;
  isInitialized: boolean;
  isRightSidebarOpen: boolean;
  activeRightPanelId: string;
  customSidebarIds: string[];
}

export const useUIStore = defineStore("UI", () => {
  const fsStore = useFileSystemStore();

  const uiState: Ref<UIState> = ref({
    openedFiles: [],
    activeFile: null,
    leftSidebarView: "files",
    customViews: [],
    subWindows: new Map(),
    currentWindowLabel: null,
    isMainWindow: true,
    parentWindowLabel: null,
    windowMode: null,
    isInitialized: false,
    isRightSidebarOpen: false,
    activeRightPanelId: "", // 默认为空
    customSidebarIds: [],
  });

  const customComponents = shallowRef<Record<string, Component>>({});
  const isSingle = computed(() => uiState.value.windowMode === "single");

  // 这里包含了所有的工具项定义
  const leftBarItems = shallowRef<BottomBarItem[]>([
    {
      id: "manifest-config",
      name: "角色配置",
      icon: Settings2,
      component: markRaw(ContentRouter),
    },
    {
      id: "search",
      name: "搜索",
      icon: Search,
      component: markRaw(SearchSidebar),
    },
    {
      id: "process-manager",
      name: "进程管理",
      icon: Cpu,
      component: markRaw(ProcessPanel),
    },
    {
      id: "task-manager",
      name: "任务列表",
      icon: ClipboardList,
      component: markRaw(TaskPanel),
    },
    {
      id: "secrets-manager",
      name: "密钥管理",
      icon: Key,
      component: markRaw(SecretsPanel),
    },
    {
      id: "mcp-manager",
      name: "MCP 服务",
      icon: Server,
      component: markRaw(McpPanel),
    },
  ]);

  const addSidebarItem = (item: BottomBarItem) => {
    const existingIndex = leftBarItems.value.findIndex((i) => i.id === item.id);
    if (existingIndex !== -1) return;

    const newItem = {
      ...item,
      component: item.component ? markRaw(item.component) : undefined,
    };
    leftBarItems.value = [...leftBarItems.value, newItem];
  };

  const setSidebarContainers = (ids: string[]) => {
    uiState.value.customSidebarIds = ids;
  };

  const registerComponent = (path: string, component: Component) => {
    customComponents.value = {
      ...customComponents.value,
      [path]: markRaw(component),
    };
  };

  // 切换左侧栏视图
  const toggleSidebarView = (view: SidebarView) => {
    if (uiState.value.leftSidebarView === view) {
      uiState.value.leftSidebarView = "none";
    } else {
      uiState.value.leftSidebarView = view;
    }
  };

  const isLeftSidebarOpen = computed(
    () => uiState.value.leftSidebarView !== "none"
  );

  // 2. 变更：新增计算属性，获取当前左侧栏激活的动态组件
  const activeLeftComponent = computed(() => {
    const view = uiState.value.leftSidebarView;
    // 如果是预设的文件或角色，返回 null (由 layout 显式处理)
    if (view === "files" || view === "character" || view === "none") {
      return null;
    }
    // 查找对应的组件
    const item = leftBarItems.value.find((i) => i.id === view);
    return item ? item.component : null;
  });

  const toggleRightSidebar = (id?: string) => {
    if (!id) {
      uiState.value.isRightSidebarOpen = !uiState.value.isRightSidebarOpen;
      return;
    }
    if (
      uiState.value.isRightSidebarOpen &&
      uiState.value.activeRightPanelId === id
    ) {
      uiState.value.isRightSidebarOpen = false;
    } else {
      uiState.value.activeRightPanelId = id;
      uiState.value.isRightSidebarOpen = true;
    }
  };

  const activeRightComponent = computed(() => {
    const item = leftBarItems.value.find(
      (i) => i.id === uiState.value.activeRightPanelId
    );
    return item ? item.component : null;
  });

  // --- File Logic (保持不变) ---
  const openFile = (path: string) => {
    const isInternalComponent = path.startsWith("$");
    if (!isInternalComponent) {
      const node = fsStore.resolvePath(path);
      if (!node || !(node instanceof VirtualFile)) {
        console.warn(
          `[VFS UI] Attempted to open non-existent file or directory: ${path}`
        );
        return;
      }
    }
    if (!uiState.value.openedFiles.includes(path)) {
      uiState.value.openedFiles.push(path);
    }
    setActiveFile(path);
  };

  const closeFile = (path: string) => {
    const index = uiState.value.openedFiles.indexOf(path);
    if (index === -1) return;
    uiState.value.openedFiles.splice(index, 1);
    if (uiState.value.activeFile === path) {
      const nextFile =
        uiState.value.openedFiles[index] ??
        uiState.value.openedFiles[index - 1] ??
        null;
      uiState.value.activeFile = nextFile;
    }
  };

  const setActiveFile = (path: string) => {
    uiState.value.activeFile = path;
  };

  // --- Persistence (保持不变) ---
  const saveState = () => {
    try {
      localStorage.setItem(
        "FileSystem_uiState",
        JSON.stringify({
          openedFiles: uiState.value.openedFiles,
          activeFile: uiState.value.activeFile,
          leftSidebarView: uiState.value.leftSidebarView,
        })
      );
    } catch (e) {
      console.error(e);
    }
  };

  const restoreState = () => {
    const json = localStorage.getItem("FileSystem_uiState");
    if (!json) return;
    try {
      const state = JSON.parse(json);
      uiState.value.openedFiles = state.openedFiles || [];
      uiState.value.activeFile = state.activeFile || null;
      if (state.leftSidebarView !== undefined)
        uiState.value.leftSidebarView = state.leftSidebarView as SidebarView;
    } catch (e) {
      console.error(e);
    }
  };

  watch(
    () => [
      uiState.value.openedFiles,
      uiState.value.activeFile,
      uiState.value.leftSidebarView,
    ],
    saveState,
    { deep: true }
  );

  // --- Event Handling Logic (保持不变) ---
  const handlePathChange = (oldPath: string, newPath: string) => {
    if (
      newPath.startsWith(TRASH_DIR_PATH + "/") ||
      newPath === TRASH_DIR_PATH
    ) {
      handlePathDeletion(oldPath);
      return;
    }
    for (let i = 0; i < uiState.value.openedFiles.length; i++) {
      const currentPath = uiState.value.openedFiles[i];
      if (currentPath === oldPath) {
        uiState.value.openedFiles[i] = newPath;
      } else if (currentPath.startsWith(oldPath + "/")) {
        uiState.value.openedFiles[i] =
          newPath + currentPath.slice(oldPath.length);
      }
    }
    const active = uiState.value.activeFile;
    if (active) {
      if (active === oldPath) {
        uiState.value.activeFile = newPath;
      } else if (active.startsWith(oldPath + "/")) {
        uiState.value.activeFile = newPath + active.slice(oldPath.length);
      }
    }
  };

  const handlePathDeletion = (path: string) => {
    const filesToClose = uiState.value.openedFiles.filter(
      (opened) => opened === path || opened.startsWith(path + "/")
    );
    filesToClose.forEach((file) => closeFile(file));
  };

  const setupEventListeners = () => {
    fsEmitter.on(FSEventType.FILE_RENAMED, ({ oldPath, newPath }) =>
      handlePathChange(oldPath, newPath)
    );
    fsEmitter.on(FSEventType.FILE_MOVED, ({ oldPath, newPath }) =>
      handlePathChange(oldPath, newPath)
    );
    fsEmitter.on(FSEventType.FILE_DELETED, ({ path }) =>
      handlePathDeletion(path)
    );
    fsEmitter.on(FSEventType.DIR_RENAMED, ({ oldPath, newPath }) =>
      handlePathChange(oldPath, newPath)
    );
    fsEmitter.on(FSEventType.DIR_MOVED, ({ oldPath, newPath }) =>
      handlePathChange(oldPath, newPath)
    );
    fsEmitter.on(FSEventType.DIR_DELETED, ({ path }) =>
      handlePathDeletion(path)
    );
  };

  const init = async () => {
    if (uiState.value.isInitialized) return;
    try {
      uiState.value.currentWindowLabel = getCurrentWebviewWindow().label;
    } catch (e) {
      console.warn("Not running in Tauri window context");
    }
    setupEventListeners();
    restoreState();
    uiState.value.isInitialized = true;
  };

  return {
    uiState,
    customComponents,
    registerComponent,
    bottomBarItems: leftBarItems,
    addSidebarItem,
    setSidebarContainers,
    isLeftSidebarOpen,
    toggleSidebarView,
    activeLeftComponent, // 导出新属性
    toggleRightSidebar,
    activeRightComponent,
    isSingle,
    init,
    openFile,
    closeFile,
    setActiveFile,
  };
});
