// src/features/FileSystem/FileSystem.store.ts
import { defineStore } from "pinia";
import { computed, ref, reactive, watch } from "vue";
import {
  readDir,
  exists,
  rename as fsRename,
  mkdir as fsMkdir,
  writeTextFile,
  readTextFile,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  remove as fsRemove,
  copyFile as fsCopyFile,
  stat as fsStat,
  convertFileSrc as tauriConvertFileSrc,
  appDataDir,
} from "@/features/FileSystem/fs.api";
import { BaseDirectory, type FileInfo } from "@tauri-apps/plugin-fs";
import { debounce } from "lodash-es";
import urlJoin from "url-join";
import { FSEventType, fsEmitter } from "./FileSystem.events";
import type { Setting } from "@/schema/setting/setting.types";
import type { ModelConfig } from "@/schema/modelConfig/modelConfig.types";
import {
  SemanticType,
  SemanticTypeMap,
  createTypedFile,
} from "@/schema/SemanticType";
// 引入 Task Store
import { useTaskStore } from "@/features/Task/Task.store";

export const TRASH_DIR_PATH = "trash";
const TRASH_MANIFEST_PATH = urlJoin(TRASH_DIR_PATH, "manifest.json");

export type TrashItem = {
  key: string;
  originalPath: string;
  name: string;
  type: "file" | "directory";
  trashedAt: string;
};

// 递归结构类型定义
export type FSStructure = {
  [key: string]: FSStructure | (() => any | Promise<any>);
};

// --- 辅助函数 ---
const isJsonFile = (path: string) => path.endsWith(".json");
const isImageFile = (path: string) =>
  /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path);
const getUniqueName = (name: string, existingNames: Set<string>): string => {
  if (!existingNames.has(name)) return name;
  const parts = name.split(".");
  let ext = "";
  let semantic = "";
  let base = name;
  if (parts.length > 1) {
    ext = "." + parts.pop();
    base = parts.join(".");
  }
  const semanticMatch = base.match(/^(.+)(\.\[.*\])$/);
  if (semanticMatch) {
    base = semanticMatch[1];
    semantic = semanticMatch[2];
  }
  let counter = 2;
  let newName = "";
  do {
    newName = `${base} (${counter})${semantic}${ext}`;
    counter++;
  } while (existingNames.has(newName));
  return newName;
};

/**
 * 核心集成逻辑：运行任务包装器
 */
async function runAsTask<T>(
  name: string,
  signal: AbortSignal | undefined,
  operation: (s: AbortSignal) => Promise<T>
): Promise<T> {
  if (signal) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return operation(signal);
  } else {
    const taskStore = useTaskStore();
    return taskStore.dispatchTask(name, (s) => operation(s));
  }
}

// =========================================================================
// Class Definitions (Virtual FS)
// =========================================================================

export abstract class VirtualNode {
  name: string;
  parent: VirtualFolder | null;

  constructor(name: string, parent: VirtualFolder | null) {
    this.name = name;
    this.parent = parent;
  }

  get path(): string {
    if (!this.parent) return "";
    const parentPath = this.parent.path;
    return parentPath ? urlJoin(parentPath, this.name) : this.name;
  }

  get url(): string {
    const store = useFileSystemStore();
    if (!store.appDataPath) return tauriConvertFileSrc(this.path, "appData");
    const absolutePath = urlJoin(store.appDataPath, this.path);
    return tauriConvertFileSrc(absolutePath);
  }

  async stat(): Promise<FileInfo> {
    return await fsStat(this.path, { baseDir: BaseDirectory.AppData });
  }

  abstract unload(): void;
  abstract delete(signal?: AbortSignal): Promise<void>;
  abstract rename(newName: string): Promise<void>;
  abstract moveTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void>;
  abstract copyTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void>;

  async moveToTrash(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const store = useFileSystemStore();
    const trashedName = this.name;
    const originalPath = this.path;
    const destPath = urlJoin(TRASH_DIR_PATH, trashedName);
    const isDir = this instanceof VirtualFolder;

    await fsRename(originalPath, destPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });

    const manifest = await store._readManifest();
    manifest.push({
      key: trashedName,
      originalPath,
      name: this.name,
      type: isDir ? "directory" : "file",
      trashedAt: new Date().toISOString(),
    });
    await store._writeManifest(manifest);

    if (this.parent) {
      this.parent.children.delete(this.name);
    }

    if (!isDir) {
      store.contentCache.delete(originalPath);
    } else {
      for (const key of store.contentCache.keys()) {
        if (key.startsWith(originalPath + "/")) {
          store.contentCache.delete(key);
        }
      }
    }

    fsEmitter.emit(isDir ? FSEventType.DIR_MOVED : FSEventType.FILE_MOVED, {
      oldPath: originalPath,
      newPath: destPath,
    });
  }
}

export class VirtualFile extends VirtualNode {
  get semanticType(): SemanticType | "unknown" {
    const match = this.name.match(/\.\[(.*?)]\./);
    return (match ? match[1] : "unknown") as SemanticType | "unknown";
  }

  get extension(): string {
    const idx = this.name.lastIndexOf(".");
    return idx !== -1 ? this.name.substring(idx) : "";
  }

  async read(force = false): Promise<any> {
    const store = useFileSystemStore();
    if (!force && store.contentCache.has(this.path)) {
      return store.contentCache.get(this.path);
    }
    try {
      let content: any;
      if (isImageFile(this.name)) {
        content = await fsReadFile(this.path, {
          baseDir: BaseDirectory.AppData,
        });
      } else {
        const text = await readTextFile(this.path, {
          baseDir: BaseDirectory.AppData,
        });
        content = isJsonFile(this.name) ? JSON.parse(text) : text;
      }
      store.contentCache.set(this.path, content);
      return content;
    } catch (error) {
      console.error(`[FS] Error reading file ${this.path}:`, error);
      throw error;
    }
  }

  async write(content: any): Promise<void> {
    const store = useFileSystemStore();
    const path = this.path;
    try {
      if (content instanceof Uint8Array) {
        await fsWriteFile(path, content, { baseDir: BaseDirectory.AppData });
      } else {
        const text =
          typeof content === "object"
            ? JSON.stringify(content, null, 2)
            : String(content);
        await writeTextFile(path, text, { baseDir: BaseDirectory.AppData });
      }
      store.contentCache.set(path, content);
      fsEmitter.emit(FSEventType.FILE_MODIFIED, { path });
    } catch (error) {
      console.error(`[FS] Error writing file ${this.path}:`, error);
      throw error;
    }
  }

  async rename(newName: string): Promise<void> {
    if (!this.parent) throw new Error("Cannot rename root file");

    const store = useFileSystemStore();
    const oldPath = this.path;
    const newPath = urlJoin(this.parent.path, newName);

    await fsRename(oldPath, newPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });

    this.parent.children.delete(this.name);
    this.name = newName;
    this.parent.children.set(newName, this);

    if (store.contentCache.has(oldPath)) {
      const content = store.contentCache.get(oldPath);
      store.contentCache.delete(oldPath);
      store.contentCache.set(newPath, content);
    }

    fsEmitter.emit(FSEventType.FILE_RENAMED, { oldPath, newPath });
  }

  async copyTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void> {
    return runAsTask(`复制文件 ${this.name}`, signal, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const store = useFileSystemStore();
      const existingNames = new Set(targetFolder.children.keys());
      const uniqueName = getUniqueName(this.name, existingNames);
      const destPath = urlJoin(targetFolder.path, uniqueName);

      await fsCopyFile(this.path, destPath, {
        fromPathBaseDir: BaseDirectory.AppData,
        toPathBaseDir: BaseDirectory.AppData,
      });

      const newFile = new VirtualFile(uniqueName, targetFolder);
      targetFolder.children.set(uniqueName, newFile);

      if (store.contentCache.has(this.path)) {
        const content = store.contentCache.get(this.path);
        const clonedContent =
          typeof content === "object"
            ? JSON.parse(JSON.stringify(content))
            : content;
        store.contentCache.set(destPath, clonedContent);
      }

      fsEmitter.emit(FSEventType.FILE_CREATED, { path: destPath });
    });
  }

  async download(): Promise<void> {
    return runAsTask(`准备下载 ${this.name}`, undefined, async () => {
      let content = await this.read();
      if (typeof content === "object" && !(content instanceof Uint8Array)) {
        content = JSON.stringify(content, null, 2);
      }
      const blob = new Blob([content]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = this.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  unload(): void {
    const store = useFileSystemStore();
    if (store.contentCache.has(this.path)) {
      store.contentCache.delete(this.path);
    }
  }

  async delete(signal?: AbortSignal): Promise<void> {
    if (!this.parent) return;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const store = useFileSystemStore();
    const path = this.path;

    await fsRemove(path, { baseDir: BaseDirectory.AppData });

    this.parent.children.delete(this.name);
    store.contentCache.delete(path);

    fsEmitter.emit(FSEventType.FILE_DELETED, { path });
  }

  // File 节点不支持 createStructure，如果需要统一接口可抛错
  async moveTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void> {
    // 复用基类实现
    return super.moveTo(targetFolder, signal);
  }
}

export class VirtualFolder extends VirtualNode {
  children: Map<string, VirtualNode> = reactive(new Map());

  constructor(name: string, parent: VirtualFolder | null) {
    super(name, parent);
  }

  resolve(relativePath: string): VirtualNode | undefined {
    if (!relativePath) return this;
    const parts = relativePath.split("/");
    let current: VirtualNode | undefined = this;
    for (const part of parts) {
      if (current instanceof VirtualFolder) {
        current = current.children.get(part);
      } else {
        return undefined;
      }
      if (!current) return undefined;
    }
    return current;
  }

  async createDir(name: string): Promise<VirtualFolder> {
    const path = urlJoin(this.path, name);
    if (this.children.has(name))
      throw new Error(`Directory ${name} already exists`);

    await fsMkdir(path, { baseDir: BaseDirectory.AppData, recursive: true });
    const newDir = new VirtualFolder(name, this);
    this.children.set(name, newDir);
    fsEmitter.emit(FSEventType.DIR_CREATED, { path });
    return newDir;
  }

  async createFile(name: string, content: any = ""): Promise<VirtualFile> {
    const path = urlJoin(this.path, name);
    if (this.children.has(name)) throw new Error(`File ${name} already exists`);

    const newFile = new VirtualFile(name, this);
    this.children.set(name, newFile);

    try {
      await newFile.write(content);
      fsEmitter.emit(FSEventType.FILE_CREATED, { path, content });
    } catch (e) {
      this.children.delete(name);
      throw e;
    }
    return newFile;
  }

  /**
   * 递归创建子结构
   * @param structure 目录结构定义对象
   * @param isForced 是否强制覆盖，默认为 false（跳过已存在的项）
   */
  async createStructure(
    structure: FSStructure,
    isForced: boolean = false
  ): Promise<void> {
    for (const [name, value] of Object.entries(structure)) {
      const existingNode = this.children.get(name);

      if (typeof value === "function") {
        // --- 目标是文件 ---
        if (existingNode) {
          if (existingNode instanceof VirtualFolder) {
            throw new Error(
              `Cannot create file '${name}': A folder with this name already exists.`
            );
          }
          // 已存在且是文件
          if (isForced) {
            const content = await value();
            await (existingNode as VirtualFile).write(content);
          }
          // 如果不是强制模式，则跳过
        } else {
          // 不存在，直接创建
          const content = await value();
          await this.createFile(name, content);
        }
      } else {
        // --- 目标是文件夹 ---
        let targetFolder: VirtualFolder;

        if (existingNode) {
          if (existingNode instanceof VirtualFile) {
            throw new Error(
              `Cannot create folder '${name}': A file with this name already exists.`
            );
          }
          targetFolder = existingNode as VirtualFolder;
        } else {
          // 不存在则创建
          targetFolder = await this.createDir(name);
        }

        // 递归处理子结构
        // value 此时被判定为 FSStructure (因为不是 function)
        await targetFolder.createStructure(value as FSStructure, isForced);
      }
    }
  }

  async createTypedFile(
    baseName: string,
    semanticType: SemanticType,
    withTemplate = true
  ): Promise<VirtualFile> {
    const finalName = `${baseName}.[${semanticType}].json`;
    if (this.children.has(finalName)) {
      throw new Error(`File ${finalName} already exists`);
    }

    let initialContent: any = {};
    if (withTemplate) {
      const templatePath = `global/template/TEMPLATE.[${semanticType}].json`;
      try {
        if (await exists(templatePath, { baseDir: BaseDirectory.AppData })) {
          const tplStr = await readTextFile(templatePath, {
            baseDir: BaseDirectory.AppData,
          });
          initialContent = JSON.parse(tplStr);
        } else {
          throw new Error("Template not found");
        }
      } catch (e) {
        const definition = SemanticTypeMap[semanticType];
        if (definition && typeof definition.new === "function") {
          initialContent = definition.new();
        }
      }
    } else {
      const definition = SemanticTypeMap[semanticType];
      if (definition && typeof definition.new === "function") {
        initialContent = definition.new();
      }
    }
    return await this.createFile(finalName, initialContent);
  }

  async importFile(file: File): Promise<VirtualFile> {
    return runAsTask(`导入 ${file.name}`, undefined, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const arrayBuffer = await file.arrayBuffer();

      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const uint8Array = new Uint8Array(arrayBuffer);
      const existingNames = new Set(this.children.keys());
      const safeName = getUniqueName(file.name, existingNames);

      let content: any = uint8Array;
      if (isJsonFile(safeName)) {
        try {
          const text = new TextDecoder().decode(uint8Array);
          content = JSON.parse(text);
        } catch (e) {
          /* ignore */
        }
      }
      return await this.createFile(safeName, content);
    });
  }

  async rename(newName: string): Promise<void> {
    if (!this.parent) throw new Error("Cannot rename root");

    const oldPath = this.path;
    const newPath = urlJoin(this.parent.path, newName);

    await fsRename(oldPath, newPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });

    this.parent.children.delete(this.name);
    this.name = newName;
    this.parent.children.set(newName, this);

    const store = useFileSystemStore();
    for (const key of store.contentCache.keys()) {
      if (key.startsWith(oldPath + "/")) {
        store.contentCache.delete(key);
      }
    }
    fsEmitter.emit(FSEventType.DIR_RENAMED, { oldPath, newPath });
  }

  async copyTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void> {
    return runAsTask(`复制文件夹 ${this.name}`, signal, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const existingNames = new Set(targetFolder.children.keys());
      const uniqueName = getUniqueName(this.name, existingNames);

      const newDir = await targetFolder.createDir(uniqueName);

      try {
        for (const child of this.children.values()) {
          if (s.aborted) throw new DOMException("Aborted", "AbortError");
          await child.copyTo(newDir, s);
        }
      } catch (error: any) {
        if (error.name === "AbortError" || s.aborted) {
          console.warn(`[FS] Copy cancelled. Cleaning up ${newDir.path}...`);
          await newDir
            .delete()
            .catch((e) => console.error("Cleanup failed", e));
        }
        throw error;
      }

      fsEmitter.emit(FSEventType.DIR_COPIED, {
        from: this.path,
        to: newDir.path,
      });
    });
  }

  async empty(signal?: AbortSignal): Promise<void> {
    return runAsTask(`清空文件夹 ${this.name}`, signal, async (s) => {
      const children = Array.from(this.children.values());
      for (const child of children) {
        if (s.aborted) throw new DOMException("Aborted", "AbortError");
        await child.delete(s);
      }
    });
  }

  unload(): void {
    for (const child of this.children.values()) {
      child.unload();
    }
  }

  async visitDescendants(
    callback: (node: VirtualNode) => void | Promise<void>
  ) {
    for (const child of this.children.values()) {
      await callback(child);
      if (child instanceof VirtualFolder) {
        await child.visitDescendants(callback);
      }
    }
  }

  async listFiles(): Promise<VirtualFile[]> {
    const files: VirtualFile[] = [];
    this.children.forEach((node) => {
      if (node instanceof VirtualFile) files.push(node);
    });
    return files;
  }

  async listFolders(): Promise<VirtualFolder[]> {
    const folders: VirtualFolder[] = [];
    this.children.forEach((node) => {
      if (node instanceof VirtualFolder) folders.push(node);
    });
    return folders;
  }

  async delete(signal?: AbortSignal): Promise<void> {
    return runAsTask(`删除 ${this.name}`, signal, async (s) => {
      if (!this.parent) return;

      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const path = this.path;
      const store = useFileSystemStore();

      await fsRemove(path, { baseDir: BaseDirectory.AppData, recursive: true });

      this.parent.children.delete(this.name);

      for (const key of store.contentCache.keys()) {
        if (key.startsWith(path + "/")) {
          store.contentCache.delete(key);
        }
      }
      fsEmitter.emit(FSEventType.DIR_DELETED, { path });
    });
  }

  async moveTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void> {
    return super.moveTo(targetFolder, signal);
  }
}

// =========================================================================
// Store
// =========================================================================

export const useFileSystemStore = defineStore("newFileSystem", () => {
  const root = ref<VirtualFolder>(new VirtualFolder("", null));
  const contentCache = reactive(new Map<string, any>());
  const isInitialized = ref(false);
  const appDataPath = ref<string>("");

  const SETTING_PATH = "setting.[setting].json";
  const MODEL_CONFIG_PATH = "modelConfig.[modelConfig].json";

  const _buildTreeRecursively = async (
    dirPath: string,
    parent: VirtualFolder
  ) => {
    try {
      const entries = await readDir(dirPath, {
        baseDir: BaseDirectory.AppData,
      });
      for (const entry of entries) {
        if (entry.name === TRASH_DIR_PATH) continue;
        const name = entry.name!;
        if (entry.isDirectory) {
          const folder = new VirtualFolder(name, parent);
          parent.children.set(name, folder);
          await _buildTreeRecursively(urlJoin(dirPath, name), folder);
        } else {
          const file = new VirtualFile(name, parent);
          parent.children.set(name, file);
        }
      }
    } catch (error) {
      console.error(`[FS] Failed to build tree for ${dirPath}`, error);
    }
  };
  const init = async () => {
    if (isInitialized.value) return;
    console.log("[FS] Initializing File System...");
    try {
      appDataPath.value = await appDataDir();
    } catch (e) {
      console.error("[FS] Failed to get AppData dir", e);
    }

    // 定义初始文件系统结构
    // 键为文件名/文件夹名
    // 值为 FSStructure 对象（代表文件夹）或 返回内容的函数（代表文件）
    const initialStructure: FSStructure = {
      global: {
        template: {}, // 递归创建 global/template
        preset: {},
        lorebook: {},
        background: {},
        components: {},
      },
      character: {},
      page: {},
      plugin: {},
      executable: {},
      trash: {},
      // 如果文件不存在，调用函数获取默认内容并写入
      [SETTING_PATH]: () => createTypedFile("setting"),
      [MODEL_CONFIG_PATH]: () => createTypedFile("modelConfig"),
    };

    // 使用临时根节点来执行结构创建
    // 根节点的 path 为 ""，对应 BaseDirectory.AppData
    const tempRoot = new VirtualFolder("", null);

    try {
      // isForced = false: 仅当文件/文件夹不存在时才创建，避免覆盖用户数据
      await tempRoot.createStructure(initialStructure, false);
    } catch (e) {
      console.error("[FS] Failed to initialize file structure", e);
    }

    // 构建内存中的虚拟文件树
    const newRoot = new VirtualFolder("", null);
    await _buildTreeRecursively("", newRoot);
    root.value = newRoot;

    // 预加载关键配置文件
    const settingFile = newRoot.resolve(SETTING_PATH);
    if (settingFile instanceof VirtualFile) await settingFile.read();

    const modelConfigFile = newRoot.resolve(MODEL_CONFIG_PATH);
    if (modelConfigFile instanceof VirtualFile) await modelConfigFile.read();

    isInitialized.value = true;
    console.log("[FS] Initialization Complete.");
  };

  const refresh = async () => {
    const newRoot = new VirtualFolder("", null);
    await _buildTreeRecursively("", newRoot);
    root.value = newRoot;
  };

  const setting = computed(
    () => contentCache.get(SETTING_PATH) as Setting | undefined
  );
  const modelConfig = computed(
    () => contentCache.get(MODEL_CONFIG_PATH) as ModelConfig | undefined
  );

  watch(
    () => contentCache.get(SETTING_PATH),
    debounce(async (newVal) => {
      if (!newVal || !isInitialized.value) return;
      console.log("[FS] Auto-saving settings...");
      try {
        await writeTextFile(SETTING_PATH, JSON.stringify(newVal, null, 2), {
          baseDir: BaseDirectory.AppData,
        });
      } catch (e) {
        console.error("[FS] Failed to save settings", e);
      }
    }, 1000),
    { deep: true }
  );

  const _readManifest = async (): Promise<TrashItem[]> => {
    if (await exists(TRASH_MANIFEST_PATH, { baseDir: BaseDirectory.AppData })) {
      const content = await readTextFile(TRASH_MANIFEST_PATH, {
        baseDir: BaseDirectory.AppData,
      });
      return JSON.parse(content);
    }
    return [];
  };

  const _writeManifest = async (manifest: TrashItem[]) => {
    await writeTextFile(
      TRASH_MANIFEST_PATH,
      JSON.stringify(manifest, null, 2),
      { baseDir: BaseDirectory.AppData }
    );
  };

  const restoreTrashItem = async (key: string) => {
    return runAsTask("还原回收站项目", undefined, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const manifest = await _readManifest();
      const item = manifest.find((i) => i.key === key);
      if (!item) throw new Error("Trash item not found");

      const source = urlJoin(TRASH_DIR_PATH, item.key);
      const parentDir = urlJoin(item.originalPath, "..");

      if (!(await exists(parentDir, { baseDir: BaseDirectory.AppData }))) {
        await fsMkdir(parentDir, {
          baseDir: BaseDirectory.AppData,
          recursive: true,
        });
      }

      await fsRename(source, item.originalPath, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
      });

      const newManifest = manifest.filter((i) => i.key !== key);
      await _writeManifest(newManifest);
      await refresh();
    });
  };

  const resolvePath = (path: string): VirtualNode | undefined => {
    return root.value.resolve(path);
  };

  return {
    root,
    contentCache,
    isInitialized,
    appDataPath,
    setting,
    modelConfig,
    init,
    refresh,
    resolvePath,
    restoreTrashItem,
    _readManifest,
    _writeManifest,
  };
});
