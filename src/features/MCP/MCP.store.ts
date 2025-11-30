// src/features/MCP/MCP.store.ts
import { defineStore } from "pinia";
import { computed } from "vue";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store";

// 定义类型以增强代码健壮性
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  [key: string]: any;
}

export interface ManifestContent {
  mcpServers: Record<string, McpServerConfig>;
  [key: string]: any;
}

export const useMcpManagerStore = defineStore("mcpManager", () => {
  const fsStore = useFileSystemStore();

  // 使用 useFileContent 钩子自动管理 manifest.json 的读写和响应式
  // 这里的路径 "manifest.json" 对应 FileSystem.store.ts 初始化时的根目录文件
  const { content: manifestContent, sync } =
    useFileContent<ManifestContent>("manifest.json");

  // 计算属性：提取 mcpServers，如果文件未加载或字段不存在则返回空对象
  const mcpServers = computed(() => manifestContent.value?.mcpServers || {});

  // 初始化/加载配置
  // 由于 useFileContent 是惰性的，我们可能需要确保 FileSystem 已初始化
  async function loadConfig() {
    if (!fsStore.isInitialized) {
      await fsStore.init();
    }
    // 触发一次读取（如果内容为空）
    if (manifestContent.value === null) {
      await fsStore.load("manifest.json");
    }
  }

  // 内部辅助：保存整个 mcpServers 对象回 manifest.json
  async function _syncServers(newServers: Record<string, McpServerConfig>) {
    // 构造新的 manifest 对象，保留 manifest.json 中的其他可能的字段
    const currentManifest = manifestContent.value || { mcpServers: {} };
    const newManifest = {
      ...currentManifest,
      mcpServers: newServers,
    };

    // 调用 useFileContent 的 sync 方法写入文件系统
    await sync(newManifest);
  }

  // Action: 添加/更新单个 Server
  async function saveServer(
    key: string,
    config: McpServerConfig,
    oldKey?: string | null
  ) {
    const currentServers = { ...mcpServers.value };

    // 如果是改名，删除旧的
    if (oldKey && oldKey !== key) {
      delete currentServers[oldKey];
    }

    currentServers[key] = config;
    await _syncServers(currentServers);
  }

  // Action: 删除 Server
  async function deleteServer(key: string) {
    const currentServers = { ...mcpServers.value };
    if (key in currentServers) {
      delete currentServers[key];
      await _syncServers(currentServers);
    }
  }

  // Action: 导入 JSON
  async function importJson(importedServers: Record<string, McpServerConfig>) {
    const merged = { ...mcpServers.value, ...importedServers };
    await _syncServers(merged);
  }

  return {
    mcpServers,
    loadConfig,
    saveServer,
    deleteServer,
    importJson,
  };
});
