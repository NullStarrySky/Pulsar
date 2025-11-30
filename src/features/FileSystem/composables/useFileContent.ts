// src/features/FileSystem/composables/useFileContent.ts
import {
  useFileSystemStore,
  FileNode,
  isFolderNode,
} from "../FileSystem.store";
import { computed, ComputedRef, unref, type Ref } from "vue";
import { debounce } from "lodash-es";
import type { DebouncedFunc } from "lodash";

/**
 * 从 KV 文件系统中获取指定路径的文件内容，并提供一个同步函数将其写回。
 * 自动处理 JSON 文件的解析，并在内容未加载时从磁盘加载。
 * @param path - 文件路径，可以是 ref、字符串或 null。
 * @param debounceMs - sync 函数的防抖延迟时间（毫秒）。
 * @returns 包含响应式内容和同步函数的对象。
 */
export function useFileContent<T>(
  path: Ref<string | null> | string | null,
  debounceMs: number = 500,
): {
  content: ComputedRef<T | null>;
  sync: DebouncedFunc<(newData?: T) => Promise<void>>;
} {
  const store = useFileSystemStore();

  const content = computed<T | null>(() => {
    const currentPath = unref(path);
    if (!currentPath) {
      return null;
    }

    // 直接从原始文件结构中获取节点，绕过 proxy 的 get 陷阱
    const node = store.getNodeByPath(store.fileStructure, currentPath);

    if (node === undefined) {
      return null;
    }

    // 如果是文件夹节点，直接返回null，此hook仅用于文件
    if (isFolderNode(node)) {
      console.warn(
        `[useFileContent] Path '${currentPath}' points to a directory, not a file.`,
      );
      return null;
    }

    if (node instanceof FileNode && node.content === null) {
      store.load(currentPath);
      return null;
    }

    const rawContent = node instanceof FileNode ? node.content : node;

    if (rawContent === null || rawContent === undefined) {
      return null;
    }

    if (typeof rawContent === "object" && !(rawContent instanceof Uint8Array)) {
      return rawContent as T;
    }

    if (typeof rawContent === "string" && currentPath.endsWith(".json")) {
      try {
        return JSON.parse(rawContent);
      } catch (e) {
        console.error(`[useFileContent] 解析 JSON 文件失败 ${currentPath}`, e);
        return null;
      }
    }

    return rawContent as T;
  });

  const _performSync = async (dataToSync: T | null): Promise<void> => {
    const currentPath = unref(path);
    if (!currentPath) {
      console.warn("[useFileContent] 路径为空，无法同步。");
      return;
    }

    if (dataToSync === null || dataToSync === undefined) {
      console.warn(`[useFileContent] 内容为空，无法同步路径: ${currentPath}。`);
      return;
    }

    // 如果是JSON文件且数据是对象，则提前将其字符串化。
    // 这可以防止代理层对原始对象进行不正确的处理（例如，递归包装）。
    let dataForProxy: string | Uint8Array | object | null = dataToSync as any;
    if (
      currentPath.endsWith(".json") &&
      typeof dataForProxy === "object" &&
      dataForProxy !== null &&
      !(dataForProxy instanceof Uint8Array)
    ) {
      dataForProxy = JSON.stringify(dataForProxy, null, 2);
    }

    const parts = currentPath.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) {
      throw new Error(`[useFileContent] 无效的文件路径: ${currentPath}`);
    }

    let parentProxy: any = store.fs;
    for (const part of parts) {
      if (typeof parentProxy !== "object" || parentProxy === null) {
        throw new Error(
          `[useFileContent] 无法找到用于同步的父目录: ${currentPath}`,
        );
      }
      parentProxy = parentProxy[part];
    }

    if (typeof parentProxy === "object" && parentProxy !== null) {
      // 使用处理过的数据进行写入
      parentProxy[fileName] = dataForProxy;
      await Promise.all(store.tasks);
      console.log(`[useFileContent] Synced changes for: ${currentPath}`);
    } else {
      throw new Error(
        `[useFileContent] 找不到父目录代理以同步文件: ${currentPath}`,
      );
    }
  };

  const debouncedSync = debounce(async (newData?: T) => {
    const currentPath = unref(path);
    if (!currentPath) return;

    const contentToSync = newData !== undefined ? newData : content.value;

    const node = store.getNodeByPath<FileNode>(
      store.fileStructure,
      currentPath,
    );
    if (node instanceof FileNode && node.content) {
      if (currentPath.endsWith(".json")) {
        try {
          // 规范化比较：都转换成无格式的JSON字符串进行比较
          const oldContent = JSON.stringify(JSON.parse(node.content as string));
          const newContent = JSON.stringify(contentToSync);
          if (oldContent === newContent) {
            return; // 内容相同，无需同步
          }
        } catch (e) {
          // 如果旧内容解析失败，则允许写入以修复文件
        }
      } else {
        // 对非JSON文件进行直接比较
        if (node.content === contentToSync) {
          return; // 内容相同，无需同步
        }
      }
    }

    await _performSync(contentToSync as T | null);
  }, debounceMs);

  return {
    content,
    sync: debouncedSync,
  };
}
