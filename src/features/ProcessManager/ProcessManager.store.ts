// src/features/ProcessManager/ProcessManager.store.ts
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ProcessStatus = "running" | "stopped" | "error";

export interface Process {
  id: string;
  name: string;
  type: "sidecar" | "script";
  status: ProcessStatus;
  output: string[];
  isBuiltin: boolean;
}

// 模拟数据
const MOCK_SCRIPT_PATHS = [
  "C:\\Users\\YourUser\\AppData\\Roaming\\com.tauri.dev\\executable\\test-script-1.bat",
  "/Users/youruser/Library/Application Support/com.tauri.dev/executable/test-script-2.sh",
];

const STORAGE_KEY = "process_manager_running_ids";

export const useProcessManagerStore = defineStore("processManager", () => {
  const processes = ref<Record<string, Process>>({
    sidecar: {
      id: "sidecar",
      name: "Core Service",
      type: "sidecar",
      status: "stopped",
      output: [],
      isBuiltin: true,
    },
    ...Object.fromEntries(
      MOCK_SCRIPT_PATHS.map((path) => [
        path,
        {
          id: path,
          name: path.split(/[\\/]/).pop() || "Unknown Script",
          type: "script",
          status: "stopped",
          output: [],
          isBuiltin: false,
        },
      ])
    ),
  });

  const processList = computed(() => Object.values(processes.value));

  // --- 持久化与初始化逻辑 ---

  // 保存当前正在运行的进程 ID
  function saveState() {
    const runningIds = processList.value
      .filter((p) => p.status === "running" && !p.isBuiltin)
      .map((p) => p.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runningIds));
  }

  // 恢复状态或默认启动所有
  async function initPersistence() {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      // 这里的逻辑是：如果有持久化记录，只启动记录中的
      try {
        const idsToStart: string[] = JSON.parse(saved);
        for (const id of idsToStart) {
          if (processes.value[id]) {
            await startScript(id);
          }
        }
      } catch (e) {
        console.error("Failed to parse process persistence", e);
      }
    } else {
      // 如果没有持久化记录（第一次运行），默认启动所有用户脚本
      console.log("No persistence found, auto-starting all user scripts.");
      const userScripts = processList.value.filter((p) => !p.isBuiltin);
      for (const proc of userScripts) {
        await startScript(proc.id);
      }
    }
  }

  // 监听状态变化以触发保存
  watch(
    () => processList.value.map((p) => p.status),
    () => {
      saveState();
    },
    { deep: true }
  );

  // --- 事件监听 ---

  async function initializeEventListeners() {
    // 调用初始化启动逻辑
    await initPersistence();

    await listen<{ path: string; line: string }>("script-output", (event) => {
      const proc = processes.value[event.payload.path];
      if (proc) proc.output.push(event.payload.line);
    });

    await listen<{ path: string }>("script-terminated", (event) => {
      const proc = processes.value[event.payload.path];
      if (proc) {
        proc.status = "stopped";
        proc.output.push("--- PROCESS TERMINATED ---");
      }
    });

    // 监听已有的 sidecar 事件
    await listen<string>("sidecar-stdout", (event) => {
      processes.value.sidecar.output.push(`[STDOUT] ${event.payload}`);
    });
    await listen<string>("sidecar-stderr", (event) => {
      processes.value.sidecar.output.push(`[STDERR] ${event.payload}`);
    });
    await listen<void>("sidecar-terminated", () => {
      processes.value.sidecar.status = "stopped";
      processes.value.sidecar.output.push("--- SIDECAR TERMINATED ---");
    });
  }

  // --- Actions ---

  async function startScript(path: string) {
    const proc = processes.value[path];
    if (!proc || proc.status === "running") return;
    proc.output = [];
    proc.status = "running";
    try {
      await invoke("execute_script", { path });
    } catch (error) {
      proc.status = "error";
      proc.output.push(`--- FAILED TO START: ${error} ---`);
    }
  }

  async function stopScript(path: string) {
    const proc = processes.value[path];
    if (!proc || proc.status === "stopped") return;
    try {
      await invoke("shutdown_script", { path });
      // 状态通常由 terminated 事件更新，但为了 UI 响应可以先设个中间态或等待
    } catch (error) {
      proc.status = "error";
      proc.output.push(`--- FAILED TO STOP: ${error} ---`);
    }
  }

  async function restartScript(path: string) {
    await stopScript(path);
    setTimeout(() => startScript(path), 1000);
  }

  return {
    processes,
    processList,
    initializeEventListeners,
    startScript,
    stopScript,
    restartScript,
  };
});
