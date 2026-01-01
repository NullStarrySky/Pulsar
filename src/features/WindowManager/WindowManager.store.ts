// src/features/WindowManager/WindowManager.store.ts
// TODO：这东西需要一个panel吗？有点纠结
// ？？？

import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { WebviewOptions } from "@tauri-apps/api/webview";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import type { WindowOptions } from "@tauri-apps/api/window";
import type { Position } from "@tauri-apps/plugin-positioner";
import { defineStore } from "pinia";
import { v4 as uuid } from "uuid";
import { computed, ref } from "vue";
// 引入 FS Store 仅为了获取当前激活文件路径，避免循环依赖
import { useUIStore } from "@/features/UI/UI.store";

export const PM_EVENT = {
  MOVE_WINDOW: "pm:moveWindow",
};

export interface SubWindowOptions {
  mode?: "full" | "single";
  additionalParams?: Record<string, string>;
  label?: string;
  WebviewWindowOptions?: Omit<WebviewOptions, "width" | "height" | "x" | "y"> &
    WindowOptions;
  position?: Position;
}

export interface RemoteWindowOptions {
  url: string;
  label?: string;
  initializationScriptContent?: string;
  initializationScriptPath?: string;
}

export interface RemoteConnection {
  label: string;
  send: (data: any) => Promise<void>;
  onMessage: (callback: (data: any) => void) => Promise<UnlistenFn>;
}

export const useWindowStore = defineStore("windowManager", () => {
  const subWindows = ref<Map<string, WebviewWindow>>(new Map());
  const currentWindowLabel = ref<string | null>(null);
  const parentWindowLabel = ref<string | null>(null);
  const windowMode = ref<"full" | "single" | null>(null);

  const isMainWindow = computed(() => !parentWindowLabel.value);
  const isSingle = computed(() => windowMode.value === "single");

  // 初始化窗口状态
  const init = () => {
    const currentWindow = getCurrentWebviewWindow();
    currentWindowLabel.value = currentWindow.label;
    const urlParams = new URLSearchParams(window.location.search);
    parentWindowLabel.value = urlParams.get("parentLabel");
    const mode = urlParams.get("mode");
    if (mode === "full" || mode === "single") {
      windowMode.value = mode;
    }
    _setupEventListeners();
  };

  const _setupEventListeners = async () => {
    // 监听来自子窗口的“归位”请求
    await listen(PM_EVENT.MOVE_WINDOW, (event: any) => {
      const { docPath, sourceLabel } = event.payload;
      const uiStore = useUIStore();

      // 调用 FS store 的动作来打开文件
      uiStore.openFile(docPath);

      // 移除子窗口引用
      if (subWindows.value.has(sourceLabel)) {
        subWindows.value.delete(sourceLabel);
      }
    });
  };

  const openSubWindow = async (
    path: string,
    options: SubWindowOptions = {}
  ): Promise<[string, WebviewWindow] | null> => {
    const {
      mode = "single",
      additionalParams,
      label = uuid(),
      WebviewWindowOptions,
    } = options;

    if (mode === "single" && subWindows.value.has(label)) {
      await subWindows.value.get(label)?.close();
    }

    const url = new URL(window.location.origin);
    url.searchParams.set("parentLabel", currentWindowLabel.value!);
    url.searchParams.set("docPath", path);
    if (mode) url.searchParams.set("mode", mode);
    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) =>
        url.searchParams.set(key, value)
      );
    }

    const finalWindowOptions = {
      center: true,
      ...WebviewWindowOptions,
      url: url.toString(),
    };
    const newWindow = new WebviewWindow(label, finalWindowOptions);

    newWindow.once("tauri://close", () => {
      if (subWindows.value.has(label)) {
        subWindows.value.delete(label);
      }
    });

    subWindows.value.set(label, newWindow);
    return [label, newWindow];
  };

  const openRemoteSubWindow = async (
    options: RemoteWindowOptions
  ): Promise<{ windowLabel: string; connection: RemoteConnection }> => {
    const label = options.label || uuid();
    await invoke("open_remote_window", {
      label: label,
      url: options.url,
      initScriptContent: options.initializationScriptContent,
      initScriptPath: options.initializationScriptPath,
    });

    const connection: RemoteConnection = {
      label,
      send: async (data: any) => {
        await invoke("send_to_remote_window", { label, message: data });
      },
      onMessage: async (callback: (data: any) => void) => {
        return await listen("remote-message", (event: any) => {
          const { label: msgLabel, payload } = event.payload;
          if (msgLabel === label) callback(payload);
        });
      },
    };
    return { windowLabel: label, connection };
  };

  // 将当前窗口作为一个子窗口“弹回”到父窗口（关闭自身，让父窗口打开文件）
  const dock = async () => {
    if (isMainWindow.value || !parentWindowLabel.value) return;

    const uiStore = useUIStore();
    const fileToDock = uiStore.uiState.activeFile; // 获取当前文件

    if (!fileToDock) {
      await getCurrentWebviewWindow().close();
      return;
    }

    await emitTo(parentWindowLabel.value, PM_EVENT.MOVE_WINDOW, {
      docPath: fileToDock,
      sourceLabel: currentWindowLabel.value,
    });

    if (isSingle.value) {
      await getCurrentWebviewWindow().close();
    }
  };

  // 将当前文件“弹出”到一个新窗口
  const undock = async (path: string, options: SubWindowOptions) => {
    const uiStore = useUIStore();
    if (!uiStore.uiState.openedFiles.includes(path)) return;

    await openSubWindow(path, options);
    uiStore.closeFile(path);
  };

  return {
    subWindows,
    currentWindowLabel,
    parentWindowLabel,
    isMainWindow,
    isSingle,
    init,
    openSubWindow,
    openRemoteSubWindow,
    dock,
    undock,
  };
});
