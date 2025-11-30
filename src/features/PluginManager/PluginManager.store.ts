// src/features/PluginManager/PluginManager.store.ts
//TODO: 这个store暂时没啥用处，等我把常用的插件都吃了再仔细考虑这东西

// src/features/Plugin/Plugin.store.ts
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  readDir,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@/features/FileSystem/fs.api";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import urlJoin from "url-join";
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store";

// --- 插件相关类型 ---
export interface PluginManifest {
  display_name: string;
  enabled: boolean;
  loading_order: number;
  requires: string[];
  optional: string[];
  js?: string; // 入口 JS 文件名，如 "index.js"
  css?: string; // 样式文件名
  author: string;
  version: string;
  homePage: string;
  auto_update: boolean;
  // 运行时附加属性，方便后续索引
  _dirName?: string;
}

// 默认插件 Manifest 模板
const DEFAULT_PLUGIN_MANIFEST: PluginManifest = {
  display_name: "New Plugin",
  enabled: true,
  loading_order: 100,
  requires: [],
  optional: [],
  js: "index.js",
  css: "styles.css",
  author: "Unknown",
  version: "1.0.0",
  homePage: "",
  auto_update: false,
};

export const usePluginStore = defineStore("plugin", () => {
  const fsStore = useFileSystemStore();
  const plugins = ref<Map<string, PluginManifest>>(new Map());

  /**
   * 扫描 plugin 目录，加载所有 manifest.json
   */
  const loadPluginManifests = async (): Promise<void> => {
    const pluginRootDir = "plugin";
    plugins.value.clear();

    // 这里不再依赖 FS Store 的内存结构，而是直接检查物理路径，解耦依赖
    if (!(await exists(pluginRootDir, { baseDir: BaseDirectory.AppData }))) {
      console.warn("[PluginStore] Plugin directory not found on disk.");
      return;
    }

    try {
      const entries = await readDir(pluginRootDir, {
        baseDir: BaseDirectory.AppData,
      });

      for (const entry of entries) {
        if (entry.isDirectory && entry.name) {
          const manifestPath = urlJoin(
            pluginRootDir,
            entry.name,
            "manifest.json"
          );

          if (await exists(manifestPath, { baseDir: BaseDirectory.AppData })) {
            try {
              const content = await readTextFile(manifestPath, {
                baseDir: BaseDirectory.AppData,
              });
              const manifest: PluginManifest = JSON.parse(content);
              manifest._dirName = entry.name; // 注入文件夹名称
              plugins.value.set(entry.name, manifest);
              console.log(
                `[PluginStore] Loaded plugin: ${manifest.display_name} (${entry.name})`
              );
            } catch (err) {
              console.error(
                `[PluginStore] Failed to parse manifest for '${entry.name}':`,
                err
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("[PluginStore] Failed to scan plugin directory:", error);
    }
  };

  /**
   * 根据文件夹名称获取插件信息和可加载的 URL
   */
  const loadPluginByName = (dirName: string) => {
    const manifest = plugins.value.get(dirName);
    if (!manifest) {
      throw new Error(`Plugin '${dirName}' not found.`);
    }

    const pluginDir = urlJoin("plugin", dirName);

    // 使用 fsStore 提供的能力转换路径
    let jsUrl: string | null = null;
    if (manifest.js) {
      jsUrl = fsStore.convertFileSrc(urlJoin(pluginDir, manifest.js));
    }

    let cssUrl: string | null = null;
    if (manifest.css) {
      cssUrl = fsStore.convertFileSrc(urlJoin(pluginDir, manifest.css));
    }

    return {
      manifest,
      jsUrl,
      cssUrl,
    };
  };

  /**
   * 创建一个新的插件文件夹模版
   */
  const createPluginFolder = async (pluginName: string) => {
    const safeName = pluginName.replace(/[^a-zA-Z0-9_-]/g, "");
    const targetDir = urlJoin("plugin", safeName);

    if (await exists(targetDir, { baseDir: BaseDirectory.AppData })) {
      throw new Error(`Plugin directory '${safeName}' already exists.`);
    }

    // 1. 创建物理文件
    await mkdir(targetDir, { baseDir: BaseDirectory.AppData, recursive: true });

    const newManifest = {
      ...DEFAULT_PLUGIN_MANIFEST,
      display_name: pluginName,
      _dirName: safeName,
    };

    await writeTextFile(
      urlJoin(targetDir, "manifest.json"),
      JSON.stringify(newManifest, null, 2),
      { baseDir: BaseDirectory.AppData }
    );

    await writeTextFile(
      urlJoin(targetDir, "index.js"),
      `console.log("Plugin ${pluginName} loaded!");\nexport const onMounted = () => { console.log("Hello World"); }`,
      { baseDir: BaseDirectory.AppData }
    );

    // 2. 通知 FS Store 刷新文件树 (因为我们直接操作了文件系统)
    await fsStore.refresh();

    // 3. 重新加载插件列表
    await loadPluginManifests();

    return safeName;
  };

  return {
    plugins,
    loadPluginManifests,
    loadPluginByName,
    createPluginFolder,
  };
});
