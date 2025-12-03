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
import { newSetting } from "@/schema/setting/setting";
import { newModelConfig } from "@/schema/modelConfig/modelConfig";
import type { Setting } from "@/schema/setting/setting.types";
import type { ModelConfig } from "@/schema/modelConfig/modelConfig.types";
import { SemanticType, SemanticTypeMap } from "@/schema/SemanticType";
// 引入 Task Store
import { useTaskStore } from "@/features/Task/Task.store";

// ... (常量定义和辅助函数 checkLocked, getUniqueName 等保持不变) ...

export const TRASH_DIR_PATH = "trash";
const TRASH_MANIFEST_PATH = urlJoin(TRASH_DIR_PATH, "manifest.json");

export type TrashItem = {
  key: string;
  originalPath: string;
  name: string;
  type: "file" | "directory";
  trashedAt: string;
};

// --- 辅助函数 ---
const isJsonFile = (path: string) => path.endsWith(".json");
const isImageFile = (path: string) =>
  /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path);
const getUniqueName = (name: string, existingNames: Set<string>): string => {
  // ... (保持原样)
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

const checkLocked = (path: string, operation: string) => {
  const store = useFileSystemStore();
  if (store.lockedPaths.has(path)) {
    throw new Error(`Cannot ${operation} locked path: ${path}`);
  }
};

/**
 * 核心集成逻辑：运行任务包装器
 * 如果传入了 signal，说明是递归调用或内部调用，直接执行操作。
 * 如果没有 signal，说明是顶层调用，创建 Task。
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

  // 修改：delete 接受可选 signal
  abstract delete(signal?: AbortSignal): Promise<void>;
  abstract rename(newName: string): Promise<void>;

  // 修改：moveTo 接受可选 signal
  async moveTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void> {
    // 移动操作通常很快（rename），除非跨分区（Tauri AppData 不太可能）。
    // 这里也可以包一层 task，但如果是瞬间完成的，UI 会闪一下。
    // 策略：如果操作本身很快，可以不强制包 Task，或者只在 signal 存在时检查。
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (this.parent === targetFolder) return;
    checkLocked(this.path, "move");

    if (targetFolder.children.has(this.name)) {
      throw new Error(`Destination already has a node named ${this.name}`);
    }

    const store = useFileSystemStore();
    const oldPath = this.path;
    const newPath = urlJoin(targetFolder.path, this.name);
    const isDir = this instanceof VirtualFolder;

    await fsRename(oldPath, newPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });

    if (this.parent) {
      this.parent.children.delete(this.name);
    }
    this.parent = targetFolder;
    targetFolder.children.set(this.name, this);

    if (!isDir) {
      const content = store.contentCache.get(oldPath);
      if (content !== undefined) {
        store.contentCache.delete(oldPath);
        store.contentCache.set(newPath, content);
      }
    } else {
      for (const key of store.contentCache.keys()) {
        if (key.startsWith(oldPath + "/")) {
          // 这里简单做清除
          store.contentCache.delete(key);
        }
      }
    }

    fsEmitter.emit(isDir ? FSEventType.DIR_MOVED : FSEventType.FILE_MOVED, {
      oldPath,
      newPath,
    });
  }

  // 修改：copyTo 接受可选 signal
  abstract copyTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void>;

  async moveToTrash(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    checkLocked(this.path, "trash");

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

    // 清理缓存
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
  // ... (semanticType, extension, read, write, rename 保持不变)
  get semanticType(): SemanticType | "unknown" {
    const match = this.name.match(/\.\[(.*?)]\./);
    return (match ? match[1] : "unknown") as SemanticType | "unknown";
  }

  get extension(): string {
    const idx = this.name.lastIndexOf(".");
    return idx !== -1 ? this.name.substring(idx) : "";
  }

  async read(force = false): Promise<any> {
    // 读取通常不做 Task，除非特别大，这里保持原样
    const store = useFileSystemStore();
    if (!force && store.contentCache.has(this.path)) {
      return store.contentCache.get(this.path);
    }
    // ... 原有逻辑 ...
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
    // 写入通常很快，保持原样，也可以加 Task，看需求
    checkLocked(this.path, "write");
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
    checkLocked(this.path, "rename");

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

  // === 集成 Task 的复制 ===
  async copyTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void> {
    return runAsTask(`复制文件 ${this.name}`, signal, async (s) => {
      // 耗时模拟（如果需要测试取消）： await new Promise(r => setTimeout(r, 2000));
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
    // 下载也可以包一个 Task
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
    checkLocked(this.path, "delete");

    // 删除单个文件通常很快，不强制 Task，但如果需要统一管理，也可以 wrap
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const store = useFileSystemStore();
    const path = this.path;

    await fsRemove(path, { baseDir: BaseDirectory.AppData });

    this.parent.children.delete(this.name);
    store.contentCache.delete(path);

    fsEmitter.emit(FSEventType.FILE_DELETED, { path });
  }
}

export class VirtualFolder extends VirtualNode {
  children: Map<string, VirtualNode> = reactive(new Map());

  constructor(name: string, parent: VirtualFolder | null) {
    super(name, parent);
  }

  resolve(relativePath: string): VirtualNode | undefined {
    // ... 保持不变
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
    // ... 保持不变
    checkLocked(this.path, "createDir");
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
    // ... 保持不变
    checkLocked(this.path, "createFile");
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

  // createTypedFile 保持不变 ...
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

  // === 集成 Task 的导入 ===
  async importFile(file: File): Promise<VirtualFile> {
    // 导入可能涉及大文件读取，包一个 Task
    return runAsTask(`导入 ${file.name}`, undefined, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const arrayBuffer = await file.arrayBuffer();

      // 再次检查 signal (如果文件很大，读取后可能被取消)
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
    // ... 保持不变
    if (!this.parent) throw new Error("Cannot rename root");
    checkLocked(this.path, "rename");

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

  // === 集成 Task 的递归复制 (支持取消) ===
  async copyTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void> {
    return runAsTask(`复制文件夹 ${this.name}`, signal, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const existingNames = new Set(targetFolder.children.keys());
      const uniqueName = getUniqueName(this.name, existingNames);

      // 创建目标文件夹
      const newDir = await targetFolder.createDir(uniqueName);

      try {
        // 递归复制子项
        for (const child of this.children.values()) {
          if (s.aborted) throw new DOMException("Aborted", "AbortError");
          // 关键：将 signal 传递给子节点的 copyTo
          await child.copyTo(newDir, s);
        }
      } catch (error: any) {
        // 如果被取消或失败，尝试清理已经创建的半成品文件夹
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

  // === 集成 Task 的清空 ===
  async empty(signal?: AbortSignal): Promise<void> {
    return runAsTask(`清空文件夹 ${this.name}`, signal, async (s) => {
      checkLocked(this.path, "empty");
      const children = Array.from(this.children.values());
      for (const child of children) {
        if (s.aborted) throw new DOMException("Aborted", "AbortError");
        // 传递 signal 给子项的 delete
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
    // ... 保持不变
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

  // === 集成 Task 的删除 ===
  async delete(signal?: AbortSignal): Promise<void> {
    return runAsTask(`删除 ${this.name}`, signal, async (s) => {
      if (!this.parent) return;
      checkLocked(this.path, "delete");

      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const path = this.path;
      const store = useFileSystemStore();

      // fsRemove 递归删除在底层是原子的（或者说难以中断），
      // 但我们还是包在 Task 里，为了 UI 显示和后续清理。
      // 如果需要真正的“一个个文件删除以支持进度条”，需要手动递归调用 child.delete
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
}

// =========================================================================
// Store
// =========================================================================

export const useFileSystemStore = defineStore("newFileSystem", () => {
  // ... (状态和 _buildTreeRecursively, init, refresh 保持不变) ...
  const root = ref<VirtualFolder>(new VirtualFolder("", null));
  const contentCache = reactive(new Map<string, any>());
  const isInitialized = ref(false);
  const appDataPath = ref<string>("");
  const lockedPaths = reactive(new Set<string>());

  const SETTING_PATH = "setting.[setting].json";
  const MODEL_CONFIG_PATH = "modelConfig.[modelConfig].json";

  const _buildTreeRecursively = async (
    dirPath: string,
    parent: VirtualFolder
  ) => {
    // ... 保持原样 ...
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
    // ... 保持原样 ...
    if (isInitialized.value) return;
    console.log("[FS] Initializing File System...");
    try {
      appDataPath.value = await appDataDir();
    } catch (e) {
      console.error("[FS] Failed to get AppData dir", e);
    }

    const requiredDirs = ["global", "character", "preset", "trash"];
    for (const dir of requiredDirs) {
      if (!(await exists(dir, { baseDir: BaseDirectory.AppData }))) {
        await fsMkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
      }
    }
    const templateDir = "global/template";
    if (!(await exists(templateDir, { baseDir: BaseDirectory.AppData }))) {
      await fsMkdir(templateDir, {
        baseDir: BaseDirectory.AppData,
        recursive: true,
      });
    }
    if (!(await exists(SETTING_PATH, { baseDir: BaseDirectory.AppData }))) {
      await writeTextFile(SETTING_PATH, JSON.stringify(newSetting(), null, 2), {
        baseDir: BaseDirectory.AppData,
      });
    }
    if (
      !(await exists(MODEL_CONFIG_PATH, { baseDir: BaseDirectory.AppData }))
    ) {
      await writeTextFile(
        MODEL_CONFIG_PATH,
        JSON.stringify(newModelConfig(), null, 2),
        { baseDir: BaseDirectory.AppData }
      );
    }
    const newRoot = new VirtualFolder("", null);
    await _buildTreeRecursively("", newRoot);
    root.value = newRoot;
    lockedPaths.add(SETTING_PATH);
    lockedPaths.add(MODEL_CONFIG_PATH);
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

  // === 集成 Task 的还原 ===
  const restoreTrashItem = async (key: string) => {
    return runAsTask("还原回收站项目", undefined, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");

      const manifest = await _readManifest();
      const item = manifest.find((i) => i.key === key);
      if (!item) throw new Error("Trash item not found");

      const source = urlJoin(TRASH_DIR_PATH, item.key);
      const parentDir = urlJoin(item.originalPath, "..");

      if (lockedPaths.has(item.originalPath)) {
        throw new Error(`Cannot restore to locked path: ${item.originalPath}`);
      }

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

  const addLock = (path: string) => lockedPaths.add(path);
  const removeLock = (path: string) => lockedPaths.delete(path);

  return {
    root,
    contentCache,
    isInitialized,
    appDataPath,
    lockedPaths,
    setting,
    modelConfig,
    init,
    refresh,
    resolvePath,
    restoreTrashItem,
    _readManifest,
    _writeManifest,
    addLock,
    removeLock,
  };
});
