// src/features/FileSystem/composables/useFileContent.ts

import { debounce } from "lodash-es";
import {
  computed,
  type Ref,
  unref,
  type WritableComputedRef,
  watch,
} from "vue";
import { useFileSystemStore, VirtualFile } from "../FileSystem.store";

export function useFileContent<T = any>(
  path: Ref<string | null> | string | null,
  initialValue: T | null = null, // 新增：可选的初始值
  debounceMs: number = 1000 // 顺延：防抖时间
): WritableComputedRef<T | null> {
  const store = useFileSystemStore();

  // --- 1. 核心保存逻辑 ---
  const performWrite = async (filePath: string, data: any) => {
    const node = store.resolvePath(filePath);
    if (node instanceof VirtualFile) {
      try {
        await node.write(data);
        console.debug(`[AutoSave] Saved: ${filePath}`);
      } catch (e) {
        console.error(`[AutoSave] Failed to save ${filePath}`, e);
      }
    }
  };

  const debouncedWriteMap = new Map<string, ReturnType<typeof debounce>>();

  const getDebouncedWriter = (filePath: string) => {
    if (!debouncedWriteMap.has(filePath)) {
      const writer = debounce(
        (data: any) => performWrite(filePath, data),
        debounceMs
      );
      debouncedWriteMap.set(filePath, writer);
    }
    return debouncedWriteMap.get(filePath)!;
  };

  // --- 2. 自动加载与路径切换处理 ---
  watch(
    () => unref(path),
    async (newPath, oldPath) => {
      // Flush 旧文件的写入
      if (oldPath && debouncedWriteMap.has(oldPath)) {
        debouncedWriteMap.get(oldPath)!.flush();
        debouncedWriteMap.delete(oldPath);
      }
      // 加载新文件
      if (newPath) {
        const node = store.resolvePath(newPath);
        // 如果是文件且缓存中没有，则触发读取
        if (node instanceof VirtualFile && !store.contentCache.has(newPath)) {
          await node.read().catch(console.error);
        }
      }
    },
    { immediate: true }
  );

  // --- 构造返回值 ---
  const content = computed({
    get: () => {
      const p = unref(path);
      if (!p) return null;

      // 获取缓存内容
      const cached = store.contentCache.get(p);

      // 修改逻辑：
      // 如果缓存中有值（不为 undefined/null），返回缓存值
      // 否则，如果提供了 initialValue，返回 initialValue
      // 最后返回 null
      if (cached !== undefined && cached !== null) {
        return cached as T;
      }
      return initialValue ?? null;
    },
    set: (newVal) => {
      const p = unref(path);
      if (!p) return;
      // Setter 更新 Store，这会让 store.contentCache.has(p) 变为 true
      store.contentCache.set(p, newVal);
    },
  });

  // --- 统一监听副作用 ---
  watch(
    content,
    (newVal) => {
      const p = unref(path);

      // 基础空值检查
      if (!p || newVal === undefined || newVal === null) return;

      // --- 关键安全检查 ---
      // 如果当前 Store 缓存中没有这个文件的记录，说明当前的 newVal 是来自于 initialValue。
      // 这种情况下，我们绝对不能执行写入操作，否则会发生"竞态条件"：
      // 在文件内容从磁盘读取完成前，就用 initialValue 把磁盘文件覆盖清空了。
      //
      // 只有当用户主动触发了 setter (content.value = ...)，Store 中才会有值，
      // 此时 has(p) 为 true，允许写入。
      if (!store.contentCache.has(p)) {
        return;
      }

      // 触发防抖写入
      getDebouncedWriter(p)(newVal);
    },
    { deep: true }
  );

  return content as WritableComputedRef<T | null>;
}
