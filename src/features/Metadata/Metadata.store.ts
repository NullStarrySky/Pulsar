// src/features/Metadata/Metadata.store.ts

import { defineStore } from "pinia";
import { ref, type Ref } from "vue";
import Database from "@tauri-apps/plugin-sql";
// 引入事件系统
import { fsEmitter, FSEventType } from "../FileSystem/FileSystem.events";

/**
 * @description
 * 负责管理文件系统元信息（Metadata）的 Pinia Store。
 * 使用 tauri-plugin-sql (SQLite) 作为后端，为每个文件路径提供一个持久化的键值存储。
 * 该 Store 通过监听文件系统事件自动维护元信息，不再与 FileSystemProxy 强耦合。
 */
export const useMetadataStore = defineStore("metadata", () => {
  // 数据库实例的引用
  const db: Ref<Database | null> = ref(null);
  // 初始化状态标志
  const isInitialized = ref(false);

  /**
   * @description 内部工具函数，确保数据库已连接。
   * @throws 如果数据库未初始化，则抛出错误。
   */
  const _assertDb = () => {
    if (!db.value) {
      throw new Error(
        "[MetadataStore] Database not initialized. Please call init() first."
      );
    }
  };

  /**
   * @description 初始化 Metadata Store 并订阅文件系统事件。
   * 连接到 SQLite 数据库并创建所需的表。
   */
  const init = async () => {
    if (isInitialized.value) return;

    try {
      // 加载或创建名为 'metadata.db' 的数据库
      // 路径相对于 AppData 目录
      const database = await Database.load("sqlite:metadata.db");
      db.value = database;

      // 创建元信息表，如果它不存在的话
      // path: 文件或文件夹的完整相对路径，作为主键
      // meta: 存储为 JSON 字符串的元信息对象
      await db.value.execute(`
        CREATE TABLE IF NOT EXISTS metadata (
          path TEXT PRIMARY KEY,
          meta TEXT NOT NULL
        );
      `);

      // --- 订阅文件系统事件 ---
      // 文件/文件夹 重命名 -> rePath
      fsEmitter.on(FSEventType.FILE_RENAMED, ({ oldPath, newPath }) =>
        rePath(oldPath, newPath)
      );
      fsEmitter.on(FSEventType.DIR_RENAMED, ({ oldPath, newPath }) =>
        rePath(oldPath, newPath)
      );

      // 文件/文件夹 移动 -> rePath
      fsEmitter.on(FSEventType.FILE_MOVED, ({ oldPath, newPath }) =>
        rePath(oldPath, newPath)
      );
      fsEmitter.on(FSEventType.DIR_MOVED, ({ oldPath, newPath }) =>
        rePath(oldPath, newPath)
      );

      // 文件夹 复制 -> copy
      // 注意：单个文件复制通常不复制其元数据，除非有明确需求。
      // 这里的 FSEventType.DIR_COPIED 对应 FS Proxy 中的 FOLDER 命令，需要复制结构元数据
      fsEmitter.on(FSEventType.DIR_COPIED, ({ from, to }) => copy(from, to));
      fsEmitter.on(FSEventType.FILE_COPIED, ({ from, to }) => copy(from, to));

      // 文件/文件夹 删除 -> delete
      fsEmitter.on(FSEventType.FILE_DELETED, ({ path }) => del(path));
      fsEmitter.on(FSEventType.DIR_DELETED, ({ path }) => del(path));

      isInitialized.value = true;
      console.log(
        "[MetadataStore] Initialized successfully and listening to FS events."
      );
    } catch (error) {
      console.error("[MetadataStore] Failed to initialize:", error);
    }
  };

  /**
   * @description 检查指定路径是否存在元信息。
   * @param path 要检查的文件或文件夹路径。
   * @returns 如果存在元信息，则返回 true，否则返回 false。
   */
  const exists = async (path: string): Promise<boolean> => {
    _assertDb();
    const result = await db.value!.select<[{ count: number }]>(
      "SELECT COUNT(1) as count FROM metadata WHERE path = $1",
      [path]
    );
    return result[0].count > 0;
  };

  /**
   * @description 读取指定路径的元信息。
   * @param path 要读取元信息的文件或文件夹路径。
   * @returns 解析后的元信息对象，如果不存在则返回 null。
   */
  const read = async <T extends object>(path: string): Promise<T | null> => {
    _assertDb();
    const result = await db.value!.select<{ meta: string }[]>(
      "SELECT meta FROM metadata WHERE path = $1",
      [path]
    );

    if (result.length === 0) {
      return null;
    }

    try {
      return JSON.parse(result[0].meta) as T;
    } catch (error) {
      console.error(
        `[MetadataStore] Failed to parse metadata for path '${path}':`,
        error
      );
      return null;
    }
  };

  /**
   * @description 写入或更新指定路径的元信息。
   * @param path 要写入元信息的文件或文件夹路径。
   * @param meta 要存储的元信息对象。
   */
  const write = async (path: string, meta: object): Promise<void> => {
    _assertDb();
    const jsonMeta = JSON.stringify(meta);
    // 'INSERT OR REPLACE' (UPSERT) 语义：如果路径已存在，则更新；否则，插入新行。
    await db.value!.execute(
      "INSERT OR REPLACE INTO metadata (path, meta) VALUES ($1, $2)",
      [path, jsonMeta]
    );
  };

  /**
   * @description 为指定路径创建元信息，是 write 的别名。
   * @param path 要创建元信息的文件或文件夹路径。
   * @param initialMeta 初始元信息对象。
   */
  const create = async (path: string, initialMeta: object): Promise<void> => {
    return write(path, initialMeta);
  };

  /**
   * @description 删除指定路径及其所有子路径的元信息。
   * @param path 要删除元信息的文件或文件夹路径。
   */
  const del = async (path: string): Promise<void> => {
    if (!db.value) return; // 如果DB未连接（例如在初始化前收到事件），安全退出
    // 删除条目本身以及所有以该路径为前缀的子条目（处理文件夹删除）
    // 'path LIKE $2' where $2 is 'path/%'
    await db.value!.execute(
      "DELETE FROM metadata WHERE path = $1 OR path LIKE $2",
      [path, `${path}/%`]
    );
  };

  /**
   * @description 核心维护函数：当文件或文件夹被移动或重命名时，更新其元信息路径。
   * @param oldPath 原始路径。
   * @param newPath 新路径。
   */
  const rePath = async (oldPath: string, newPath: string): Promise<void> => {
    if (!db.value) return;

    // 1. 更新条目本身的路径
    await db.value!.execute("UPDATE metadata SET path = $1 WHERE path = $2", [
      newPath,
      oldPath,
    ]);

    // 2. 查找并更新所有子路径
    const children = await db.value!.select<{ path: string }[]>(
      "SELECT path FROM metadata WHERE path LIKE $1",
      [`${oldPath}/%`]
    );

    // 批量更新所有子条目
    for (const child of children) {
      const newChildPath = child.path.replace(oldPath, newPath);
      await db.value!.execute("UPDATE metadata SET path = $1 WHERE path = $2", [
        newChildPath,
        child.path,
      ]);
    }
  };

  /**
   * @description 核心维护函数：当文件或文件夹被复制时，为其创建新的元信息记录。
   * @param sourcePath 源路径。
   * @param destinationPath 目标路径。
   */
  const copy = async (
    sourcePath: string,
    destinationPath: string
  ): Promise<void> => {
    if (!db.value) return;

    // 1. 查找源路径及其所有子路径的元信息
    const entriesToCopy = await db.value!.select<
      { path: string; meta: string }[]
    >("SELECT path, meta FROM metadata WHERE path = $1 OR path LIKE $2", [
      sourcePath,
      `${sourcePath}/%`,
    ]);

    // 2. 为每个找到的条目创建新的记录
    for (const entry of entriesToCopy) {
      const newEntryPath = entry.path.replace(sourcePath, destinationPath);
      // 使用 INSERT OR REPLACE 来安全地写入，以防目标路径已存在元数据
      await db.value!.execute(
        "INSERT OR REPLACE INTO metadata (path, meta) VALUES ($1, $2)",
        [newEntryPath, entry.meta]
      );
    }
  };

  return {
    init,
    exists,
    create,
    read,
    write,
    delete: del, // 使用 'del' 以避免与 JavaScript 关键字冲突，但在 FileSystemStore 中导出为 'delete'
    rePath,
    copy,
  };
});
