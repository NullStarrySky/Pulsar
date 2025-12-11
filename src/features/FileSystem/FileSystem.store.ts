// src/features/FileSystem/FileSystem.store.ts
import { defineStore } from "pinia";
import { computed, ref, reactive, watch, Ref } from "vue";
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
  watch as fsWatch,
} from "@/features/FileSystem/fs.api";
import { invoke } from "@tauri-apps/api/core";
// [新增] 引入 watch 和类型
import {
  BaseDirectory,
  type FileInfo,
  type WatchEvent,
} from "@tauri-apps/plugin-fs";
import { debounce, isEqual } from "lodash-es";
import urlJoin from "url-join";
import { FSEventType, fsEmitter } from "./FileSystem.events";
import type { Setting } from "@/schema/setting/setting.types";
import type { ModelConfig } from "@/schema/modelConfig/modelConfig.types";
import {
  SemanticType,
  SemanticTypeMap,
  getNewTypedFile,
} from "@/schema/SemanticType";
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

export type FSStructure = {
  [key: string]: FSStructure | (() => any | Promise<any>);
};

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
  // [新增] 存储取消监听的函数
  protected _unwatchFn: (() => void) | null = null;

  public isWatching: Ref<boolean> = ref(false);

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

  // [新增] 抽象刷新方法，由子类实现具体逻辑
  abstract refresh(): Promise<void>;

  // [新增] 监听方法
  async watch(
    options: { recursive?: boolean } = { recursive: true }
  ): Promise<void> {
    if (this._unwatchFn) {
      console.warn(`[FS] Already watching ${this.path}`);
      return;
    }

    const store = useFileSystemStore();
    console.log(`[FS] Start watching ${this.path}`);

    try {
      // 调用 Tauri 插件的 watch 方法
      this._unwatchFn = await fsWatch(
        this.path,
        async (event: WatchEvent) => {
          // 处理防抖在 fsWatch 内部选项 delayMs 控制，或者在这里进一步处理
          // 解析事件涉及的路径
          const paths = event.paths;

          for (const absPath of paths) {
            // 将绝对路径转换为相对 Store 的路径
            let relativePath = absPath;
            if (store.appDataPath && absPath.startsWith(store.appDataPath)) {
              // 移除 appDataPath 前缀，并处理可能的分隔符
              relativePath = absPath
                .slice(store.appDataPath.length)
                .replace(/^[\/\\]/, ""); // 去除开头的 / 或 \
            }
            // windows兼容：将反斜杠转换为正斜杠
            relativePath = relativePath.replaceAll("\\", "/");

            // 寻找对应的节点
            const node = store.resolvePath(relativePath);

            if (node) {
              // 如果节点存在，直接刷新该节点
              // 如果是文件，会检查内容变更；如果是文件夹，会检查子节点变更
              try {
                await node.refresh();
              } catch (e) {
                // 如果刷新失败（例如文件刚被删除），尝试刷新其父节点以更新树结构
                if (node.parent) {
                  await node.parent.refresh();
                }
              }
            } else {
              // 如果节点不存在（例如新建文件），找到最近的存在的父目录进行刷新
              let currentPath = relativePath;
              while (currentPath.includes("/")) {
                currentPath = currentPath.substring(
                  0,
                  currentPath.lastIndexOf("/")
                );
                const parentNode = store.resolvePath(currentPath);
                if (parentNode && parentNode instanceof VirtualFolder) {
                  await parentNode.refresh();
                  break;
                }
              }
              // 如果是根目录下的新文件，直接刷新根
              if (!currentPath.includes("/")) {
                await store.root.refresh();
              }
            }
          }
        },
        {
          recursive: options.recursive,
          baseDir: BaseDirectory.AppData,
          delayMs: 300, // 防抖，避免短时间多次触发
        }
      );
      this.isWatching.value = true;
    } catch (error) {
      console.error(`[FS] Failed to watch ${this.path}:`, error);
    }
  }

  // 取消监听
  unwatch(): void {
    if (this._unwatchFn) {
      this._unwatchFn();
      this._unwatchFn = null;
      console.log(`[FS] Stopped watching ${this.path}`);
    }
    this.isWatching.value = false;
  }

  abstract unload(): void;
  abstract delete(signal?: AbortSignal): Promise<void>;
  abstract rename(newName: string): Promise<void>;
  abstract copyTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void>;

  async moveTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void> {
    return runAsTask(`移动 ${this.name}`, signal, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");
      if (this.parent === targetFolder) return;
      if (this instanceof VirtualFolder) {
        let current: VirtualFolder | null = targetFolder;
        while (current) {
          if (current === (this as any)) {
            throw new Error("Cannot move a folder into itself");
          }
          current = current.parent;
        }
      }

      const store = useFileSystemStore();
      const oldPath = this.path;
      const existingNames = new Set(targetFolder.children.keys());
      const newName = getUniqueName(this.name, existingNames);
      const newPath = urlJoin(targetFolder.path, newName);

      await fsRename(oldPath, newPath, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
      });

      if (this.parent) {
        this.parent.children.delete(this.name);
      }
      this.name = newName;
      this.parent = targetFolder;
      targetFolder.children.set(this.name, this);

      if (this instanceof VirtualFolder) {
        const keysToUpdate: string[] = [];
        for (const key of store.contentCache.keys()) {
          if (key === oldPath || key.startsWith(oldPath + "/")) {
            keysToUpdate.push(key);
          }
        }
        keysToUpdate.forEach((key) => {
          const content = store.contentCache.get(key);
          store.contentCache.delete(key);
          const newKey = newPath + key.slice(oldPath.length);
          store.contentCache.set(newKey, content);
        });
      } else {
        if (store.contentCache.has(oldPath)) {
          const content = store.contentCache.get(oldPath);
          store.contentCache.delete(oldPath);
          store.contentCache.set(newPath, content);
        }
      }

      const isDir = this instanceof VirtualFolder;
      fsEmitter.emit(isDir ? FSEventType.DIR_MOVED : FSEventType.FILE_MOVED, {
        oldPath,
        newPath,
      });
    });
  }

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

    // 移动到回收站也会触发 watch 事件，导致节点被删除，这里手动处理是为了保持状态一致性
    // 如果启用了 watch，这里可能会和 watch 回调竞争，但通常问题不大
    if (this.parent) {
      this.parent.children.delete(this.name);
    }
    this.unwatch(); // 移动到回收站后停止监听

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

  // [新增] 实现文件局部刷新：对比内容，仅在变动时更新缓存
  async refresh(): Promise<void> {
    const store = useFileSystemStore();
    try {
      let newContent: any;
      if (isImageFile(this.name)) {
        newContent = await fsReadFile(this.path, {
          baseDir: BaseDirectory.AppData,
        });
      } else {
        const text = await readTextFile(this.path, {
          baseDir: BaseDirectory.AppData,
        });
        newContent = isJsonFile(this.name) ? JSON.parse(text) : text;
      }

      const oldContent = store.contentCache.get(this.path);

      // 使用 lodash 的 isEqual 进行深比较，如果是对象内容相同则不更新引用
      if (!isEqual(newContent, oldContent)) {
        store.contentCache.set(this.path, newContent);
        console.log(`[FS] File content updated via watch: ${this.path}`);
        fsEmitter.emit(FSEventType.FILE_MODIFIED, { path: this.path });
      }
    } catch (error) {
      console.error(`[FS] Error refreshing file ${this.path}:`, error);
      // 如果文件读取失败（可能已被删除），抛出异常让 watch 回调去处理父节点刷新
      throw error;
    }
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
      // 写入后更新缓存，watch 可能会再次触发 refresh，但 isEqual 会拦截重复更新
      store.contentCache.set(path, content);
      fsEmitter.emit(FSEventType.FILE_MODIFIED, { path });
    } catch (error) {
      console.error(`[FS] Error writing file ${this.path}:`, error);
      throw error;
    }
  }

  async rename(newName: string): Promise<void> {
    if (!this.parent) throw new Error("Cannot rename root file");
    // 重命名会触发 watch 事件，VirtualNode.rename 已处理大部分逻辑
    // 为了防止冲突，可以先 unwatch，但这里 watch 绑在 Node 实例上，实例路径变了，
    // fs plugin 的 watcher 还在监听旧路径还是？通常 fs plugin watch 是按 path 字符串监听的。
    // 最佳实践：rename 后，旧的 watcher 会失效（因为路径没了），需要重新 watch 新路径吗？
    // fs plugin watch 机制如果是 inode 绑定则不需要，如果是 path绑定则需要。
    // 假设是 path 绑定，rename 成功后，建议 restart watch。

    const wasWatching = !!this._unwatchFn;
    if (wasWatching) this.unwatch();

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

    if (wasWatching) await this.watch();
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

      // 新文件会通过 watch 机制自动出现在 targetFolder 中，但为了 UI 响应速度，手动添加
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

  async decompress(signal?: AbortSignal): Promise<void> {
    if (this.extension !== ".zip") {
      throw new Error("仅支持解压 .zip 文件");
    }

    return runAsTask(`解压 ${this.name}`, signal, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");
      const store = useFileSystemStore();
      const fullPath = store.appDataPath
        ? urlJoin(store.appDataPath, this.path)
        : this.path;

      await invoke("decompress", {
        fromPath: fullPath,
        toPath: undefined,
      });
      // 解压会产生大量文件，建议让父文件夹刷新
      if (this.parent) await this.parent.refresh();
      else await store.refresh();
      console.log(`[FS] ${this.name} 解压成功`);
    });
  }

  unload(): void {
    this.unwatch(); // 卸载时取消监听
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
    this.unwatch();

    fsEmitter.emit(FSEventType.FILE_DELETED, { path });
  }

  async moveTo(
    targetFolder: VirtualFolder,
    signal?: AbortSignal
  ): Promise<void> {
    return super.moveTo(targetFolder, signal);
  }
}

export class VirtualFolder extends VirtualNode {
  children: Map<string, VirtualNode> = reactive(new Map());

  constructor(name: string, parent: VirtualFolder | null) {
    super(name, parent);
  }

  // [新增] 文件夹局部刷新：同步子目录结构
  async refresh(): Promise<void> {
    try {
      const entries = await readDir(this.path, {
        baseDir: BaseDirectory.AppData,
      });

      // 1. 获取当前实际存在的名称集合
      const currentNames = new Set(entries.map((e) => e.name));

      // 2. 移除已经不存在的节点
      for (const [name, node] of this.children) {
        if (!currentNames.has(name) && name !== TRASH_DIR_PATH) {
          // 清理资源
          node.unload(); // 会调用 unwatch
          this.children.delete(name);
          console.log(`[FS] Removed stale node: ${node.path}`);
        }
      }

      // 3. 添加或更新节点
      for (const entry of entries) {
        if (entry.name === TRASH_DIR_PATH) continue;

        const name = entry.name!;
        const existingNode = this.children.get(name);

        if (existingNode) {
          // 如果类型不匹配（文件变文件夹或反之），则重建
          const isDir = entry.isDirectory;
          const isExistingDir = existingNode instanceof VirtualFolder;

          if (isDir !== isExistingDir) {
            existingNode.unload();
            const newNode = isDir
              ? new VirtualFolder(name, this)
              : new VirtualFile(name, this);
            this.children.set(name, newNode);
          }
          // 如果类型一致，保留现有节点实例，不需要做额外操作
          // 具体的子内容变化会由子节点的 watch 或递归 refresh 处理
        } else {
          // 新增节点
          const newNode = entry.isDirectory
            ? new VirtualFolder(name, this)
            : new VirtualFile(name, this);
          this.children.set(name, newNode);
          console.log(`[FS] Detected new node: ${newNode.path}`);
        }
      }
    } catch (error) {
      console.error(`[FS] Error refreshing dir ${this.path}:`, error);
      throw error;
    }
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

  async createStructure(
    structure: FSStructure,
    isForced: boolean = false
  ): Promise<void> {
    for (const [name, value] of Object.entries(structure)) {
      const existingNode = this.children.get(name);

      if (typeof value === "function") {
        if (existingNode) {
          if (existingNode instanceof VirtualFolder) {
            throw new Error(
              `Cannot create file '${name}': A folder with this name already exists.`
            );
          }
          if (isForced) {
            const content = await value();
            await (existingNode as VirtualFile).write(content);
          }
        } else {
          const content = await value();
          console.log(`try to write: ${content}`);
          await this.createFile(name, content);
        }
      } else {
        let targetFolder: VirtualFolder;
        if (existingNode) {
          if (existingNode instanceof VirtualFile) {
            throw new Error(
              `Cannot create folder '${name}': A file with this name already exists.`
            );
          }
          targetFolder = existingNode as VirtualFolder;
        } else {
          targetFolder = await this.createDir(name);
        }
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
    const wasWatching = !!this._unwatchFn;
    if (wasWatching) this.unwatch();

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

    const keysToUpdate: string[] = [];
    for (const key of store.contentCache.keys()) {
      if (key === oldPath || key.startsWith(oldPath + "/")) {
        keysToUpdate.push(key);
      }
    }

    keysToUpdate.forEach((key) => {
      const content = store.contentCache.get(key);
      store.contentCache.delete(key);
      const newKey = newPath + key.slice(oldPath.length);
      store.contentCache.set(newKey, content);
    });

    fsEmitter.emit(FSEventType.DIR_RENAMED, { oldPath, newPath });
    if (wasWatching) await this.watch();
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

  async compress(signal?: AbortSignal): Promise<void> {
    return runAsTask(`压缩 ${this.name}`, signal, async (s) => {
      if (s.aborted) throw new DOMException("Aborted", "AbortError");
      const store = useFileSystemStore();
      const fullPath = store.appDataPath
        ? urlJoin(store.appDataPath, this.path)
        : this.path;
      const excludePatterns = ["chat"];

      await invoke("compress", {
        fromPath: fullPath,
        toPath: undefined,
        exclude: excludePatterns,
      });

      // 刷新父目录以显示 zip 文件
      if (this.parent) await this.parent.refresh();
      else await store.refresh();
      console.log(`[FS] ${this.name} 压缩成功`);
    });
  }

  unload(): void {
    this.unwatch(); // 递归卸载前先停止自身的监听
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
      // 调用 unload 清理子节点监听器
      this.unload();

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

    const initialStructure: FSStructure = {
      global: {
        template: {},
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
      [SETTING_PATH]: () => getNewTypedFile("setting"),
      [MODEL_CONFIG_PATH]: () => getNewTypedFile("modelConfig"),
    };

    const newRoot = new VirtualFolder("", null);
    await _buildTreeRecursively("", newRoot);
    root.value = newRoot;

    try {
      await newRoot.createStructure(initialStructure, false);
    } catch (e) {
      console.error("[FS] Failed to initialize file structure", e);
    }

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

  const resolvePackageFolder = (path: string): VirtualFolder => {
    const node = root.value.resolve(path);
    if (!node) {
      throw new Error(`Path does not exist: ${path}`);
    }

    let currentFolder: VirtualFolder | null =
      node instanceof VirtualFolder ? node : node.parent;

    while (currentFolder) {
      if (currentFolder.children.has("manifest.[manifest].json")) {
        return currentFolder;
      }
      if (!currentFolder.parent) break;
      currentFolder = currentFolder.parent;
    }

    throw new Error(
      `Package root not found for path: ${path} (No manifest found in ancestry)`
    );
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
    resolvePackageFolder,
    restoreTrashItem,
    _readManifest,
    _writeManifest,
  };
});

(window as any).ufs = useFileSystemStore;
