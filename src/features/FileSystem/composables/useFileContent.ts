// src/features/FileSystem/composables/useFileContent.ts
import { useFileSystemStore, VirtualFile } from "../FileSystem.store";
import {
  computed,
  unref,
  watch,
  type Ref,
  type WritableComputedRef,
} from "vue";
import { debounce } from "lodash-es";

export function useFileContent<T = any>(
  path: Ref<string | null> | string | null,
  debounceMs: number = 1000
): WritableComputedRef<T | null> {
  const store = useFileSystemStore();

  // --- 1. 核心保存逻辑 ---

  // 实际执行写入的操作
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

  // 创建防抖函数。
  // 但为了防止路径快速切换导致的数据错乱，我们需要精细控制。
  // 这里的策略是：防抖函数绑定在“当前路径”上。
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
      // 利用 Vue 的响应式特性，这里返回的如果是对象，就是 Proxy
      return p ? (store.contentCache.get(p) as T) || null : null;
    },
    set: (newVal) => {
      const p = unref(path);
      if (!p) return;
      // Setter 只负责更新 Store (内存状态)
      // Vue 的响应式系统会自动触发下面的 Watcher
      store.contentCache.set(p, newVal);
    },
  });

  // --- 统一监听副作用 ---
  watch(
    content, // 监听 computed 的返回值
    (newVal) => {
      const p = unref(path);
      // 只有当路径存在，且内容不为 null/undefined 时才写入
      // (防止文件刚加载尚未读取完成时覆盖为空)
      if (!p || newVal === undefined || newVal === null) return;

      // 触发防抖写入
      getDebouncedWriter(p)(newVal);
    },
    { deep: true } // 关键：深度监听对象内部变化 (content.value.a.b = 1)
  );

  return content as WritableComputedRef<T | null>;
}
