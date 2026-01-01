// src/features/ProcessManager/ProcessManager.store.ts

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { type as getOsType } from "@tauri-apps/plugin-os";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  useFileSystemStore,
  VirtualFile,
  VirtualFolder,
} from "@/features/FileSystem/FileSystem.store";

export type ProcessStatus = "running" | "stopped" | "error";

export interface Process {
  id: string; // 绝对路径
  name: string; // 文件夹名称
  type: "sidecar" | "script";
  status: ProcessStatus;
  output: string[];
  isBuiltin: boolean;
}

const STOPPED_SCRIPTS_KEY = "process_manager_stopped_scripts";

export const useProcessManagerStore = defineStore("processManager", () => {
  const fsStore = useFileSystemStore();

  // State
  const processes = ref<Record<string, Process>>({});

  const processList = computed(() => Object.values(processes.value));
  const unlistenFunctions: UnlistenFn[] = [];

  // --- 持久化辅助 ---

  // 获取用户手动停止的脚本列表（黑名单）
  function getStoppedPreferences(): Set<string> {
    const saved = localStorage.getItem(STOPPED_SCRIPTS_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  }

  function saveStoppedPreference(path: string, isStopped: boolean) {
    const current = getStoppedPreferences();
    if (isStopped) {
      current.add(path);
    } else {
      current.delete(path);
    }
    localStorage.setItem(
      STOPPED_SCRIPTS_KEY,
      JSON.stringify(Array.from(current))
    );
  }

  // --- 核心逻辑 ---

  async function scanAndHydrate() {
    // 1. 确保文件系统已初始化
    if (!fsStore.isInitialized) {
      await fsStore.init();
    }

    // 2. 获取 executable 目录
    const executableDir = fsStore.root.resolve("executable");
    if (!executableDir || !(executableDir instanceof VirtualFolder)) {
      console.warn("[ProcessManager] 'executable' directory not found.");
      return;
    }

    // 3. 确定当前平台的脚本文件名
    const osType = getOsType();
    const targetScriptName = osType === "windows" ? "start.bat" : "start.sh";

    const stoppedPrefs = getStoppedPreferences();
    const newProcesses: Record<string, Process> = { ...processes.value }; // 保留 sidecar

    // 4. 扫描子文件夹
    for (const [folderName, childNode] of executableDir.children) {
      if (childNode instanceof VirtualFolder) {
        // 查找目标脚本
        const scriptNode = childNode.children.get(targetScriptName);

        if (scriptNode && scriptNode instanceof VirtualFile) {
          // 构建绝对路径 (AppData绝对路径 + 相对路径)
          // 注意：FileSystem.store 中的 path 是相对路径，且使用 / 分隔
          // 我们使用 tauri path api 的 join 来确保跨平台路径分隔符正确
          const absolutePath = await join(fsStore.appDataPath, scriptNode.path);

          // 如果进程已存在（例如热重载），保留原有状态和输出，否则新建
          if (!newProcesses[absolutePath]) {
            newProcesses[absolutePath] = {
              id: absolutePath,
              name: folderName, // 显示子文件夹名为名称
              type: "script",
              status: "stopped",
              output: [],
              isBuiltin: false,
            };
          }

          // 5. 自动启动逻辑
          // 如果不在“手动停止”的黑名单中，且当前未运行，则启动
          if (
            !stoppedPrefs.has(absolutePath) &&
            newProcesses[absolutePath].status !== "running"
          ) {
            // 这里不等待 startScript 完成，以免阻塞 UI 初始化
            startScript(absolutePath, true).catch((err) => {
              console.error(
                `[ProcessManager] Auto-start failed for ${folderName}:`,
                err
              );
            });
          }
        }
      }
    }

    // 更新状态（会移除掉文件系统中不再存在的脚本）
    // 注意：这里简单的替换可能会导致正在运行但在FS中被删掉的脚本UI消失，
    // 实际生产中可能需要更复杂的 diff 逻辑，但此处符合“基于FS实现”的要求。
    processes.value = newProcesses;
  }

  // --- 事件监听 ---

  async function initializeEventListeners() {
    // 防止重复监听
    if (unlistenFunctions.length > 0) return;

    // 脚本输出
    const ul1 = await listen<{ path: string; line: string; stream: string }>(
      "script-output",
      (event) => {
        const proc = processes.value[event.payload.path];
        if (proc) {
          // 可以根据 stream 区分颜色，这里暂且合并
          const prefix = event.payload.stream === "stderr" ? "[ERR] " : "";
          proc.output.push(prefix + event.payload.line);
        }
      }
    );

    // 脚本结束
    const ul2 = await listen<{ path: string; code: number | null }>(
      "script-terminated",
      (event) => {
        const proc = processes.value[event.payload.path];
        if (proc) {
          proc.status = "stopped";
          const codeMsg =
            event.payload.code !== null
              ? `Exit Code: ${event.payload.code}`
              : "Unknown signal";
          proc.output.push(`--- PROCESS TERMINATED (${codeMsg}) ---`);
        }
      }
    );

    // Sidecar 输出
    const ul3 = await listen<string>("sidecar-stdout", (event) => {
      processes.value.sidecar.output.push(`[STDOUT] ${event.payload}`);
    });
    const ul4 = await listen<string>("sidecar-stderr", (event) => {
      processes.value.sidecar.output.push(`[STDERR] ${event.payload}`);
    });
    const ul5 = await listen<void>("sidecar-terminated", () => {
      processes.value.sidecar.status = "stopped";
      processes.value.sidecar.output.push("--- SIDECAR TERMINATED ---");
    });

    unlistenFunctions.push(ul1, ul2, ul3, ul4, ul5);

    // 初始化并扫描
    await scanAndHydrate();
  }

  // --- Actions ---

  /**
   * 启动脚本
   * @param path 脚本绝对路径
   * @param isAutoStart 是否为系统自动启动（不影响用户偏好设置）
   */
  async function startScript(path: string, isAutoStart = false) {
    const proc = processes.value[path];
    if (!proc) return;

    if (proc.status === "running") return;

    // 清空旧日志
    proc.output = [];
    proc.status = "running";

    // 如果是用户手动启动，从“停止名单”中移除，以便下次自动启动
    if (!isAutoStart && !proc.isBuiltin) {
      saveStoppedPreference(path, false);
    }

    try {
      if (proc.isBuiltin) {
        await invoke("initialize_sidecar"); // 假设后端有此命令
      } else {
        await invoke("execute_script", { path });
      }
    } catch (error) {
      proc.status = "error";
      proc.output.push(`--- FAILED TO START: ${error} ---`);
    }
  }

  async function stopScript(path: string) {
    const proc = processes.value[path];
    if (!proc || proc.status === "stopped") return;

    // 如果是用户手动停止，加入“停止名单”，下次不再自动启动
    if (!proc.isBuiltin) {
      saveStoppedPreference(path, true);
    }

    try {
      if (proc.isBuiltin) {
        await invoke("shutdown_sidecar");
      } else {
        await invoke("shutdown_script", { path });
      }
      // 状态会在 terminated 事件中更新，但为了 UI 即时反馈：
      // 注意：这里不立即设为 stopped，等待事件是更准确的做法
    } catch (error) {
      proc.status = "error";
      proc.output.push(`--- FAILED TO STOP: ${error} ---`);
    }
  }

  async function restartScript(path: string) {
    await stopScript(path);
    // 给一点时间让进程完全退出
    setTimeout(() => startScript(path), 1000);
  }

  // 刷新列表（例如在文件系统变更后）
  async function refresh() {
    await scanAndHydrate();
  }

  return {
    processes,
    processList,
    initializeEventListeners,
    startScript,
    stopScript,
    restartScript,
    refresh,
  };
});
