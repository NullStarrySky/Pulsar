// src/stores/UI.store.ts

import { defineStore } from "pinia";
import {
  ref,
  computed,
  watch,
  type Ref,
  shallowRef,
  markRaw,
  type Component,
} from "vue";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import {
  useFileSystemStore,
  VirtualFile,
  TRASH_DIR_PATH, // 引入垃圾桶路径常量
} from "../FileSystem/FileSystem.store";

// 引入事件系统
import { FSEventType, fsEmitter } from "../FileSystem/FileSystem.events";

import { Cpu, ClipboardList, Key, Server, Settings2 } from "lucide-vue-next";
import ProcessPanel from "../ProcessManager/ProcessPanel.vue";
import TaskPanel from "../Task/TaskPanel.vue";
import SecretsPanel from "../Secrets/SecretsPanel.vue";
import McpPanel from "../MCP/McpPanel.vue";
import ManifestPanel from "@/schema/manifest/ManifestPanel.vue";

// ... (BottomBarItem, SidebarView, UIState 接口定义保持不变) ...
export interface BottomBarItem {
  id: string;
  name: string;
  icon?: Component;
  component?: Component;
}

export type SidebarView = "files" | "character" | "none";

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

  // --- State ---
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
    activeRightPanelId: "process-manager",
    customSidebarIds: [],
  });

  const customComponents = shallowRef<Record<string, Component>>({});
  const isSingle = computed(() => uiState.value.windowMode === "single");

  const bottomBarItems = shallowRef<BottomBarItem[]>([
    {
      id: "manifest-config",
      name: "角色配置",
      icon: Settings2,
      component: markRaw(ManifestPanel),
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
    const existingIndex = bottomBarItems.value.findIndex(
      (i) => i.id === item.id
    );
    if (existingIndex !== -1) return;

    const newItem = {
      ...item,
      component: item.component ? markRaw(item.component) : undefined,
    };
    bottomBarItems.value = [...bottomBarItems.value, newItem];
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
    const item = bottomBarItems.value.find(
      (i) => i.id === uiState.value.activeRightPanelId
    );
    return item ? item.component : null;
  });

  // --- File Logic ---
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

    // 如果关闭的是当前激活的文件，尝试切换到其他文件
    if (uiState.value.activeFile === path) {
      // 优先选右边的，没有则选左边的，再没有则置空
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

  // --- Persistence ---
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
      // 恢复时验证文件是否存在（可选，防止打开已死的文件）
      uiState.value.openedFiles = state.openedFiles || [];
      uiState.value.activeFile = state.activeFile || null;
      if (state.leftSidebarView !== undefined)
        uiState.value.leftSidebarView = state.leftSidebarView;
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

  // --- Event Handling Logic ---

  /**
   * 处理文件/文件夹路径变更（重命名或移动）
   */
  const handlePathChange = (oldPath: string, newPath: string) => {
    // 检查是否移入了回收站
    if (
      newPath.startsWith(TRASH_DIR_PATH + "/") ||
      newPath === TRASH_DIR_PATH
    ) {
      handlePathDeletion(oldPath);
      return;
    }

    // 1. 更新 openedFiles
    // 必须创建一个新数组以保持响应性，或者小心地替换
    for (let i = 0; i < uiState.value.openedFiles.length; i++) {
      const currentPath = uiState.value.openedFiles[i];
      if (currentPath === oldPath) {
        // 完全匹配（文件重命名）
        uiState.value.openedFiles[i] = newPath;
      } else if (currentPath.startsWith(oldPath + "/")) {
        // 前缀匹配（文件夹重命名导致子文件路径变更）
        uiState.value.openedFiles[i] =
          newPath + currentPath.slice(oldPath.length);
      }
    }

    // 2. 更新 activeFile
    const active = uiState.value.activeFile;
    if (active) {
      if (active === oldPath) {
        uiState.value.activeFile = newPath;
      } else if (active.startsWith(oldPath + "/")) {
        uiState.value.activeFile = newPath + active.slice(oldPath.length);
      }
    }
  };

  /**
   * 处理文件/文件夹删除
   */
  const handlePathDeletion = (path: string) => {
    // 找出所有受影响的打开文件（自身或子文件）
    const filesToClose = uiState.value.openedFiles.filter(
      (opened) => opened === path || opened.startsWith(path + "/")
    );

    // 逐个关闭
    filesToClose.forEach((file) => closeFile(file));
  };

  const setupEventListeners = () => {
    // 文件事件
    fsEmitter.on(FSEventType.FILE_RENAMED, ({ oldPath, newPath }) =>
      handlePathChange(oldPath, newPath)
    );
    fsEmitter.on(FSEventType.FILE_MOVED, ({ oldPath, newPath }) =>
      handlePathChange(oldPath, newPath)
    );
    fsEmitter.on(FSEventType.FILE_DELETED, ({ path }) =>
      handlePathDeletion(path)
    );

    // 文件夹事件
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

    // 启动监听
    setupEventListeners();

    restoreState();
    uiState.value.isInitialized = true;
  };

  return {
    uiState,
    customComponents,
    registerComponent,
    bottomBarItems,
    addSidebarItem,
    setSidebarContainers,
    isLeftSidebarOpen,
    toggleSidebarView,
    toggleRightSidebar,
    activeRightComponent,
    isSingle,
    init,
    openFile,
    closeFile,
    setActiveFile,
  };
});
