// src/features/FileSystem/FileSystem.store.ts
import { defineStore } from "pinia";
import { computed, ref, watch, type Ref } from "vue";
import {
  readDir,
  watch as tauriWatch,
  exists,
  rename,
  mkdir,
  writeTextFile,
  readTextFile,
  readFile,
  appDataDir,
  convertFileSrc as tauriConvertFileSrc,
  dirname,
} from "@/features/FileSystem/fs.api";
import { newModelConfig } from "@/schema/modelConfig/modelConfig";
import {
  BaseDirectory,
  type FileInfo,
  type WatchEvent,
} from "@tauri-apps/plugin-fs";
import { DEFAULT, EMPTY_FOLDER } from "./commands";
import {
  useFileSystemProxy,
  _getUniqueNameForCopy,
} from "./useFileSystemProxy";
import { SemanticType } from "@/schema/SemanticType";
import { newSetting } from "@/schema/setting/setting";
import type { Setting } from "@/schema/setting/setting.types";
import type { ModelConfig } from "@/schema/modelConfig/modelConfig.types";
import { debounce } from "lodash-es";
import urlJoin from "url-join";

type nodeName = string;

export class FileNode {
  content: null | string | Uint8Array;
  constructor(content: null | string | Uint8Array) {
    this.content = content;
  }
}

export type FolderContent = {
  [K in nodeName]: FileNode | FolderContent;
};

export type FileSystemProxy = {
  getSemanticType(fileName: string): SemanticType;
  getType(fileName: string): Promise<string>;
  toTrash(nodeName: string): Promise<void>;
  createTypedFile(
    baseName: string,
    semanticType: SemanticType,
    withTemplate?: boolean
  ): Promise<void>;
  readonly toPath: string;
  readonly stat: Promise<FileInfo>;
  readonly toSrc: Promise<string>;
  load(config?: { exclude?: string[] }): Promise<void>;
  unload(): void;
  recursiveFolder(callback: (path: string) => void): void;
  recursiveFile(callback: (path: string) => void): void;
  download(fileName: string): Promise<void>;
  empty(): Promise<void>;
  [key: string]: FileSystemProxy | FileNode["content"] | any;
};

export type StructuredCreateNode = {
  [K in string]:
    | StructuredCreateNode
    | ((path?: string) => Object | string | Uint8Array);
};

export const isFolderNode = (node: any): node is FolderContent => {
  return (
    typeof node === "object" && node !== null && !(node instanceof FileNode)
  );
};

let _appDataDirPath: string | null = null;

// --- 垃圾桶相关 ---
export const TRASH_DIR_PATH = "trash";
const TRASH_MANIFEST_PATH = urlJoin(TRASH_DIR_PATH, "manifest.json");

export interface TrashItem {
  key: string;
  originalPath: string;
  name: string;
  type: "file" | "directory";
  trashedAt: string;
}

// =========================================================================
// Store 定义
// =========================================================================

export const useFileSystemStore = defineStore("newFile", () => {
  const fileStructure: Ref<FolderContent> = ref({});
  const tasks: Ref<Promise<any>[]> = ref([]);
  const isInitialized = ref(false);

  const lockedPaths: Ref<Set<string>> = ref(new Set(["default"]));

  const setting = ref<Setting | null>(null);
  const modelConfig = ref<ModelConfig | null>(null);

  const watchedFiles: Ref<Set<string>> = ref(new Set());
  const fileUnwatchers: Map<string, () => void> = new Map();

  // =========================================================================
  // 内部辅助函数
  // =========================================================================

  const _buildStructureRecursively = async (
    path: string
  ): Promise<FolderContent> => {
    const structure: FolderContent = {};
    try {
      const entries = await readDir(path, { baseDir: BaseDirectory.AppData });
      for (const entry of entries) {
        if (entry.name === TRASH_DIR_PATH) continue;
        const entryName = entry.name!;
        if (entry.isDirectory) {
          const childPath = urlJoin(path, entryName);
          structure[entryName] = await _buildStructureRecursively(childPath);
        } else {
          structure[entryName] = new FileNode(null);
        }
      }
    } catch (error) {
      console.error(`[VFS] Failed to read directory at '${path}':`, error);
    }
    return structure;
  };

  const _readManifest = async (): Promise<TrashItem[]> => {
    try {
      if (
        await exists(TRASH_MANIFEST_PATH, { baseDir: BaseDirectory.AppData })
      ) {
        const content = await readTextFile(TRASH_MANIFEST_PATH, {
          baseDir: BaseDirectory.AppData,
        });
        return JSON.parse(content);
      }
    } catch (error) {
      console.error("[VFS] Failed to read or parse trash manifest.", error);
    }
    return [];
  };

  const _writeManifest = async (manifest: TrashItem[]): Promise<void> => {
    try {
      await writeTextFile(
        TRASH_MANIFEST_PATH,
        JSON.stringify(manifest, null, 2),
        { baseDir: BaseDirectory.AppData }
      );
    } catch (error) {
      console.error("[VFS] Failed to write trash manifest.", error);
    }
  };

  // =========================================================================
  // 文件监视
  // =========================================================================

  const watchFile = async (path: string) => {
    if (watchedFiles.value.has(path) || fileUnwatchers.has(path)) {
      console.warn(`[VFS] File at path '${path}' is already being watched.`);
      return;
    }
    try {
      const unwatchFn = await tauriWatch(
        path,
        async (event: WatchEvent) => {
          if (
            typeof event.type === "object" &&
            event.type !== null &&
            "modify" in event.type
          ) {
            console.log(
              `[VFS] Watched file modified: ${path}. Reloading content.`
            );
            const node = getNodeByPath<FileNode>(fileStructure.value, path);
            if (node instanceof FileNode) {
              node.content = null;
              await load(path, isImageFile(path));
            }
          }
        },
        { baseDir: BaseDirectory.AppData }
      );

      fileUnwatchers.set(path, unwatchFn);
      watchedFiles.value.add(path);
      console.log(`[VFS] Started watching file: ${path}`);
    } catch (error) {
      console.error(`[VFS] Failed to start watching file '${path}':`, error);
    }
  };

  const unwatchFile = (path: string) => {
    if (!fileUnwatchers.has(path)) return;
    const unwatchFn = fileUnwatchers.get(path);
    if (unwatchFn) unwatchFn();
    fileUnwatchers.delete(path);
    watchedFiles.value.delete(path);
    console.log(`[VFS] Stopped watching file: ${path}`);
  };

  const toggleWatchFile = (path: string) => {
    if (watchedFiles.value.has(path)) {
      unwatchFile(path);
    } else {
      watchFile(path);
    }
  };

  const isImageFile = (fileName: string): boolean => {
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);
  };

  // 保持 uploadFile，因为它是通用的工具方法
  const uploadFile = async (
    directoryPath: string,
    file: File
  ): Promise<void> => {
    const fsProxy = useFileSystemProxy(directoryPath);
    if (lockedPaths.value.has(directoryPath)) {
      throw new Error(`操作失败：目录 "${directoryPath}" 受保护。`);
    }
    if (file.name in fsProxy) {
      throw new Error(`File ${file.name} already exists in ${directoryPath}`);
    }
    try {
      const content = await file.arrayBuffer();
      (fsProxy as any)[file.name] = new Uint8Array(content);
    } catch (error) {
      console.error(
        `[VFS] Failed to upload file ${file.name} to ${directoryPath}`,
        error
      );
      throw error;
    }
  };

  const restoreTrashItem = async (key: string): Promise<void> => {
    const manifest = await _readManifest();
    const itemToRestore = manifest.find((item) => item.key === key);
    if (!itemToRestore) {
      throw new Error(`垃圾桶中未找到 key 为 "${key}" 的项目。`);
    }
    const sourcePath = urlJoin(TRASH_DIR_PATH, itemToRestore.key);
    let destinationPath = itemToRestore.originalPath;
    try {
      const parentDir = await dirname(destinationPath);
      if (!(await exists(parentDir, { baseDir: BaseDirectory.AppData }))) {
        await mkdir(parentDir, {
          baseDir: BaseDirectory.AppData,
          recursive: true,
        });
      }
      if (await exists(destinationPath, { baseDir: BaseDirectory.AppData })) {
        const parentProxy = useFileSystemProxy(parentDir);
        const newName = _getUniqueNameForCopy(itemToRestore.name, parentProxy);
        destinationPath = urlJoin(parentDir, newName);
      }
      await rename(sourcePath, destinationPath, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
      });
      const newManifest = manifest.filter((item) => item.key !== key);
      await _writeManifest(newManifest);
      fileStructure.value = await _buildStructureRecursively("");
    } catch (error) {
      console.error(`[VFS] Failed to restore item with key '${key}'`, error);
      throw error;
    }
  };

  const convertFileSrc = (relativePath: string): string => {
    if (!_appDataDirPath) {
      // 可以在 init 时设置，或者在这里 fallback
      console.warn("[VFS] appDataDir not set, waiting for init...");
    }
    // 如果 _appDataDirPath 为空，tauriConvertFileSrc 可能会失败或返回错误路径，
    // 这里假设 init 已完成或使用 fallback 逻辑
    const base = _appDataDirPath || "";
    const fullPath = urlJoin(base, relativePath);
    return tauriConvertFileSrc(fullPath);
  };

  // =========================================================================
  // 初始化与导出
  // =========================================================================
  const fs = computed(() => useFileSystemProxy(""));

  const createStructuredContent = async (
    basePath: string,
    config: StructuredCreateNode
  ) => {
    const fsProxy = useFileSystemProxy(basePath);
    for (const key in config) {
      const node = config[key];
      const currentPath = urlJoin(basePath, key);
      if (await exists(currentPath, { baseDir: BaseDirectory.AppData })) {
        if (typeof node === "object" && node !== null) {
          await createStructuredContent(
            currentPath,
            node as StructuredCreateNode
          );
        }
        continue;
      }
      if (typeof node === "function") {
        const content = node(currentPath);
        (fsProxy as any)[key] = content;
      } else if (typeof node === "object" && node !== null) {
        (fsProxy as any)[key] = new DEFAULT(EMPTY_FOLDER);
        await Promise.all(tasks.value);
        tasks.value = [];
        await createStructuredContent(
          currentPath,
          node as StructuredCreateNode
        );
      }
    }
  };

  const refresh = async () => {
    fileStructure.value = await _buildStructureRecursively("");
  };

  const init = async () => {
    if (isInitialized.value) return;

    _appDataDirPath = await appDataDir();

    try {
      const initialStructure: StructuredCreateNode = {
        global: {
          character: {},
          lorebook: {},
          preset: {},
        },
        character: {},
        page: {},
        plugin: {},
        remote: {},
        executable: {},
        trash: {
          "manifest.json": () => "[]",
        },
        "setting.[setting].json": () => newSetting(),
        "modelConfig.[modelConfig].json": () => newModelConfig(),
        "manifest.json": () => ({ mcpServers: {} }),
        "secrets.json": () => ({}),
      };

      await createStructuredContent("", initialStructure);
      await Promise.all(tasks.value);
      tasks.value = [];

      fileStructure.value = await _buildStructureRecursively("");

      await load("setting.[setting].json");
      setting.value = fs.value["setting.[setting].json"];

      await load("modelConfig.[modelConfig].json");
      modelConfig.value = fs.value["modelConfig.[modelConfig].json"];

      isInitialized.value = true;
      console.log("[VFS] File system core initialized successfully.");
    } catch (error) {
      console.error("[VFS] Failed to initialize file system core:", error);
    }
  };

  function getNodeByPath<T = FolderContent | any>(
    rootNode: FolderContent,
    path: string
  ): T | undefined {
    if (!path) return rootNode as T;
    const parts = path.split("/").filter(Boolean);
    let currentNode: any = rootNode;
    for (const part of parts) {
      if (
        typeof currentNode !== "object" ||
        currentNode === null ||
        !(part in currentNode)
      ) {
        return undefined;
      }
      currentNode = currentNode[part];
    }
    return currentNode as T;
  }

  const _debouncedWriteSetting = debounce(async (newValue: Setting) => {
    if (!isInitialized.value) return;
    try {
      console.log("[VFS] 同步 setting.json...");
      fs.value["setting.json"] = newValue;
      await Promise.all(tasks.value);
    } catch (error) {
      console.error("[VFS] 同步 setting.json 失败:", error);
    }
  }, 1000);

  watch(
    setting,
    (newValue) => {
      newValue && _debouncedWriteSetting(newValue);
    },
    { deep: true }
  );

  const load = async (
    path: string,
    loadBinaryData: boolean = false
  ): Promise<void> => {
    const startNode = getNodeByPath(fileStructure.value, path);
    if (!startNode) {
      console.warn(`[VFS] 调用 load 失败: 路径 "${path}" 不存在。`);
      return;
    }
    const _loadRecursive = async (
      currentPath: string,
      node: FolderContent | FileNode
    ) => {
      if (isFolderNode(node)) {
        for (const key in node) {
          const childPath = urlJoin(currentPath, key);
          await _loadRecursive(
            childPath,
            node[key] as FolderContent | FileNode
          );
        }
        return;
      }
      if (node instanceof FileNode && node.content === null) {
        try {
          const content = await readTextFile(currentPath, {
            baseDir: BaseDirectory.AppData,
          });
          node.content = content;
        } catch (e) {
          if (loadBinaryData || isImageFile(currentPath)) {
            try {
              const content = await readFile(currentPath, {
                baseDir: BaseDirectory.AppData,
              });
              node.content = content;
            } catch (readErr) {
              console.error(
                `[VFS] 加载二进制文件失败: ${currentPath}`,
                readErr
              );
            }
          }
        }
      }
    };
    await _loadRecursive(path, startNode);
  };

  return {
    // State
    fileStructure,
    tasks,
    isInitialized,
    lockedPaths,
    setting,
    modelConfig,
    watchedFiles,

    fs,

    // Actions
    init,
    refresh,
    load,
    uploadFile,
    restoreTrashItem,
    getNodeByPath,
    convertFileSrc,
    toggleWatchFile,
    unwatchFile,
    watchFile,

    _readManifest,
    _writeManifest,
  };
});
