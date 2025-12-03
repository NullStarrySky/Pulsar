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
} from "../FileSystem/FileSystem.store";

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
    activeCharacter: null, // 当前选中的角色上下文
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

  // --- 新增: 自定义/内置组件映射 ---
  // key: 完整路径 (例如 "$character" 或 "file.json")
  // value: Vue Component
  const customComponents = shallowRef<Record<string, Component>>({});

  const isSingle = computed(() => uiState.value.windowMode === "single");

  // --- Sidebar & Bottom Bar Config ---
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

  /**
   * 注册自定义组件到特定路径
   * 允许注册以 $ 开头的虚拟路径组件
   */
  const registerComponent = (path: string, component: Component) => {
    customComponents.value = {
      ...customComponents.value,
      [path]: markRaw(component),
    };
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
    // 逻辑修改：如果路径以 $ 开头，视为内置虚拟组件，跳过文件系统检查
    const isInternalComponent = path.startsWith("$");

    // 只有非内置组件才检查文件系统
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
          activeCharacter: uiState.value.activeCharacter,
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
    try {
      uiState.value.currentWindowLabel = getCurrentWebviewWindow().label;
    } catch (e) {
      console.warn("Not running in Tauri window context");
    }
    restoreState();
    uiState.value.isInitialized = true;
  };

  return {
    uiState,
    customComponents, // 导出 customComponents
    registerComponent, // 导出注册方法
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
