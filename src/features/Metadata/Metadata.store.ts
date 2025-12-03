// src/features/Metadata/Metadata.store.ts

import { defineStore } from "pinia";
import { ref, type Ref } from "vue";
import Database from "@tauri-apps/plugin-sql";
import {
  fsEmitter,
  FSEventType,
} from "@/features/FileSystem/FileSystem.events";

/**
 * Metadata Store
 *
 * 职责：
 * 1. 维护文件/文件夹的附加属性（元数据），如：标签、备注、自定义排序等。
 * 2. 监听 FileSystem 事件，自动同步元数据的路径变更（移动、重命名、删除）。
 * 3. 使用 SQLite 持久化存储，与文件系统解耦，仅通过路径关联。
 */
export const useMetadataStore = defineStore("metadata", () => {
  // --- State ---
  const db: Ref<Database | null> = ref(null);
  const isInitialized = ref(false);

  // --- Helpers ---

  /** 确保数据库已连接，否则抛出异常 */
  const _assertDb = () => {
    if (!db.value) {
      throw new Error(
        "[Metadata] Database not initialized. Call init() first."
      );
    }
  };

  /**
   * 将路径标准化的辅助函数（可选）
   * 如果文件系统保证路径格式统一（如无尾随斜杠），则不需要过多处理
   */
  const normalizePath = (p: string) => p;

  // --- Actions: Core Logic ---

  /**
   * 初始化数据库并绑定 FS 事件监听
   */
  const init = async () => {
    if (isInitialized.value) return;

    try {
      console.log("[Metadata] Initializing Database...");
      // 加载 SQLite 数据库，位于 AppData 目录下
      db.value = await Database.load("sqlite:metadata.db");

      // 建表：path 为主键 (TEXT), meta 为 JSON 字符串 (TEXT)
      await db.value.execute(`
        CREATE TABLE IF NOT EXISTS metadata (
          path TEXT PRIMARY KEY,
          meta TEXT NOT NULL
        );
      `);

      // --- 绑定事件监听 ---

      // 1. 重命名 (文件 & 文件夹) -> 更新路径
      const handleRename = ({
        oldPath,
        newPath,
      }: {
        oldPath: string;
        newPath: string;
      }) => {
        rePath(oldPath, newPath);
      };
      fsEmitter.on(FSEventType.FILE_RENAMED, handleRename);
      fsEmitter.on(FSEventType.DIR_RENAMED, handleRename);

      // 2. 移动 (文件 & 文件夹) -> 更新路径 (逻辑同重命名)
      const handleMove = ({
        oldPath,
        newPath,
      }: {
        oldPath: string;
        newPath: string;
      }) => {
        rePath(oldPath, newPath);
      };
      fsEmitter.on(FSEventType.FILE_MOVED, handleMove);
      fsEmitter.on(FSEventType.DIR_MOVED, handleMove);

      // 3. 删除 (文件 & 文件夹) -> 删除元数据
      const handleDelete = ({ path }: { path: string }) => {
        del(path);
      };
      fsEmitter.on(FSEventType.FILE_DELETED, handleDelete);
      fsEmitter.on(FSEventType.DIR_DELETED, handleDelete);

      // 4. 复制 (文件 & 文件夹) -> 复制元数据
      // 注意：给出的 FileSystem 实现中 VirtualFile.copyTo 目前只发射 FILE_CREATED，
      // 没有发射 FILE_COPIED，因此单个文件复制可能无法自动触发元数据复制。
      // VirtualFolder.copyTo 发射了 DIR_COPIED，可以正常工作。
      const handleCopy = ({ from, to }: { from: string; to: string }) => {
        copy(from, to);
      };
      fsEmitter.on(FSEventType.DIR_COPIED, handleCopy);
      fsEmitter.on(FSEventType.FILE_COPIED, handleCopy);

      isInitialized.value = true;
      console.log("[Metadata] Initialization Complete.");
    } catch (error) {
      console.error("[Metadata] Failed to initialize:", error);
    }
  };

  // --- Actions: CRUD ---

  /** 检查路径是否存在元数据 */
  const exists = async (path: string): Promise<boolean> => {
    _assertDb();
    const res = await db.value!.select<[{ count: number }]>(
      "SELECT COUNT(1) as count FROM metadata WHERE path = $1",
      [normalizePath(path)]
    );
    return res[0].count > 0;
  };

  /** 读取元数据 */
  const read = async <T extends object>(path: string): Promise<T | null> => {
    _assertDb();
    const res = await db.value!.select<{ meta: string }[]>(
      "SELECT meta FROM metadata WHERE path = $1",
      [normalizePath(path)]
    );
    if (res.length === 0) return null;
    try {
      return JSON.parse(res[0].meta) as T;
    } catch (e) {
      console.error(`[Metadata] JSON Parse error for ${path}`, e);
      return null;
    }
  };

  /** 写入/更新元数据 (Upsert) */
  const write = async (path: string, meta: object): Promise<void> => {
    _assertDb();
    const jsonStr = JSON.stringify(meta);
    await db.value!.execute(
      "INSERT OR REPLACE INTO metadata (path, meta) VALUES ($1, $2)",
      [normalizePath(path), jsonStr]
    );
  };

  /** 删除元数据 (递归删除子路径) */
  const del = async (path: string): Promise<void> => {
    // 即使未初始化完成收到事件也不报错，直接忽略即可
    if (!db.value) return;

    const target = normalizePath(path);
    // 删除自身 OR 自身作为前缀的子路径 (target/...)
    await db.value.execute(
      "DELETE FROM metadata WHERE path = $1 OR path LIKE $2",
      [target, `${target}/%`]
    );
  };

  // --- Actions: Internal Synchronization ---

  /**
   * 路径变更同步 (Rename / Move)
   * 将 oldPath 及其所有子路径的元数据记录更新为 newPath
   */
  const rePath = async (oldPath: string, newPath: string): Promise<void> => {
    if (!db.value) return;
    const oldP = normalizePath(oldPath);
    const newP = normalizePath(newPath);

    console.debug(`[Metadata] rePath: ${oldP} -> ${newP}`);

    // 1. 更新节点本身
    await db.value.execute("UPDATE metadata SET path = $1 WHERE path = $2", [
      newP,
      oldP,
    ]);

    // 2. 查找所有子节点 (针对文件夹重命名/移动的情况)
    const children = await db.value.select<{ path: string }[]>(
      "SELECT path FROM metadata WHERE path LIKE $1",
      [`${oldP}/%`]
    );

    // 3. 逐个更新子节点路径
    // 虽然 SQL replace 也可以，但在应用层处理路径替换更精确，防止部分匹配错误
    for (const child of children) {
      // e.g. "folder/sub/file" replace "folder" -> "newFolder/sub/file"
      const childNewPath = child.path.replace(oldP, newP);
      await db.value.execute("UPDATE metadata SET path = $1 WHERE path = $2", [
        childNewPath,
        child.path,
      ]);
    }
  };

  /**
   * 复制同步 (Copy)
   * 将 sourcePath 及其所有子路径的元数据 复制一份给 destinationPath
   */
  const copy = async (
    sourcePath: string,
    destinationPath: string
  ): Promise<void> => {
    if (!db.value) return;
    const src = normalizePath(sourcePath);
    const dest = normalizePath(destinationPath);

    console.debug(`[Metadata] copy: ${src} -> ${dest}`);

    // 查找源路径及其所有子路径
    const entries = await db.value.select<{ path: string; meta: string }[]>(
      "SELECT path, meta FROM metadata WHERE path = $1 OR path LIKE $2",
      [src, `${src}/%`]
    );

    for (const entry of entries) {
      // 计算新路径
      const newEntryPath = entry.path.replace(src, dest);
      // 插入新记录 (使用 INSERT OR REPLACE 防止冲突)
      await db.value.execute(
        "INSERT OR REPLACE INTO metadata (path, meta) VALUES ($1, $2)",
        [newEntryPath, entry.meta]
      );
    }
  };

  return {
    init,
    isInitialized,
    exists,
    read,
    write,
    delete: del, // 导出为 delete 方法
    // 下面两个主要供调试或手动调用，正常情况下由事件自动触发
    rePath,
    copy,
  };
});
