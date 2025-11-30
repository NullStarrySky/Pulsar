// src/features/UI/UI.store.ts
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
  WebviewWindow,
  getCurrentWebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { useFileSystemStore } from "../FileSystem/FileSystem.store";

import { Cpu, ClipboardList, Key, Server, Settings2 } from "lucide-vue-next";
import ProcessPanel from "../ProcessManager/ProcessPanel.vue";
import TaskPanel from "../Task/TaskPanel.vue";
import SecretsPanel from "../Secrets/SecretsPanel.vue";
import McpPanel from "../MCP/McpPanel.vue";
import ManifestPanel from "@/schema/manifest/ManifestPanel.vue";

export interface BottomBarItem {
  id: string;
  name: string;
  icon?: Component;
  component?: Component;
}

export interface UIState {
  openedFiles: string[];
  activeFile: string | null;
  activeCharacter: string | null;
  isFileSidebarOpen: boolean;
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
    activeCharacter: null,
    isFileSidebarOpen: true,
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

  const isSingle = computed(() => uiState.value.windowMode === "single");

  // --- Sidebar & Bottom Bar Config ---
  const bottomBarItems = shallowRef<BottomBarItem[]>([
    {
      id: "manifest-config",
      name: "角色配置",
      icon: Settings2,
      component: ManifestPanel,
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
    // 避免重复添加
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

  const toggleFileSidebar = (isOpen?: boolean) => {
    if (typeof isOpen === "boolean") {
      uiState.value.isFileSidebarOpen = isOpen;
    } else {
      uiState.value.isFileSidebarOpen = !uiState.value.isFileSidebarOpen;
    }
  };

  const toggleRightSidebar = (id?: string) => {
    if (!id) {
      uiState.value.isRightSidebarOpen = !uiState.value.isRightSidebarOpen;
      return;
    }
    // 如果已经在该 ID 打开，则关闭；否则切换到该 ID 并打开
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
    if (!fsStore.getNodeByPath(fsStore.fileStructure, path)) {
      console.warn(`[VFS UI] Attempted to open non-existent file: ${path}`);
      return;
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
      uiState.value.activeFile =
        uiState.value.openedFiles.length > 0
          ? uiState.value.openedFiles[index] ??
            uiState.value.openedFiles[uiState.value.openedFiles.length - 1]
          : null;
    }
  };

  const setActiveFile = (path: string) => {
    uiState.value.activeFile = path;
  };

  // [NEW] 设置当前选中的角色
  const setActiveCharacter = (charName: string | null) => {
    uiState.value.activeCharacter = charName;
  };

  // --- Persistence & Init ---
  const saveState = () => {
    try {
      localStorage.setItem(
        "FileSystem_uiState",
        JSON.stringify({
          openedFiles: uiState.value.openedFiles,
          activeFile: uiState.value.activeFile,
          activeCharacter: uiState.value.activeCharacter, // 持久化
          isFileSidebarOpen: uiState.value.isFileSidebarOpen,
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
      uiState.value.activeCharacter = state.activeCharacter || null;
      if (state.isFileSidebarOpen !== undefined)
        uiState.value.isFileSidebarOpen = state.isFileSidebarOpen;
    } catch (e) {
      console.error(e);
    }
  };

  watch(
    () => [
      uiState.value.openedFiles,
      uiState.value.activeFile,
      uiState.value.activeCharacter,
      uiState.value.isFileSidebarOpen,
    ],
    saveState,
    { deep: true }
  );

  const init = async () => {
    if (uiState.value.isInitialized) return;
    uiState.value.currentWindowLabel = getCurrentWebviewWindow().label;
    restoreState();
    uiState.value.isInitialized = true;
  };

  return {
    uiState,
    bottomBarItems,
    addSidebarItem,
    setSidebarContainers,
    toggleFileSidebar,
    toggleRightSidebar,
    activeRightComponent,
    isSingle,
    init,
    openFile,
    closeFile,
    setActiveFile,
    setActiveCharacter,
  };
});
