// src/features/FileSystem/composables/useVueComponent.ts
import {
  computed,
  unref,
  defineAsyncComponent,
  type Ref,
  type Component,
  type ComputedRef,
  shallowRef,
  watch,
} from "vue";
import { loadModule } from "vue3-sfc-loader";
import { useFileSystemStore, VirtualFile } from "../FileSystem.store";

// 缓存已编译的组件，避免重复编译
const componentCache = new Map<string, Component>();

// 获取全局 Tauri 对象 (适配 Tauri v1 或手动暴露的 v2 globals)
// 如果使用 Tauri v2 且未开启全局变量，此处需要修改为具体 import 映射
// @ts-ignore
const tauri = window.__TAURI__ || {};

const options = {
  /**
   * 模块依赖重定向
   * 定义 .vue 文件中可以 import 的模块
   */
  moduleCache: {
    vue: import("vue"),
    // 映射 Tauri API，确保动态组件可以使用系统能力
    "@tauri-apps/api/core": tauri.core,
    "@tauri-apps/plugin-fs": tauri.fs,
    "@tauri-apps/plugin-dialog": tauri.dialog,
    // 根据需要添加更多插件映射...
    // 'lodash-es': import('lodash-es'),
  },

  /**
   * 自定义文件获取逻辑 - 适配新的 Virtual FS
   */
  async getFile(url: string) {
    const store = useFileSystemStore();

    // 1. 解析路径
    const node = store.resolvePath(url);

    // 2. 校验节点
    if (!node || !(node instanceof VirtualFile)) {
      throw new Error(
        `[useVueComponent] File not found or is directory: ${url}`
      );
    }

    // 3. 获取内容 (优先读缓存，无缓存则通过 fs api 读取)
    let content = await node.read();

    // 4. 类型安全检查 (SFC Loader 需要字符串)
    if (typeof content !== "string") {
      // 尝试自动转换
      if (typeof content === "object") {
        content = JSON.stringify(content);
      } else if (content instanceof Uint8Array) {
        content = new TextDecoder().decode(content);
      } else {
        throw new Error(`[useVueComponent] Content of ${url} is not text.`);
      }
    }

    return {
      getContentData: (asBinary: boolean) =>
        asBinary
          ? Promise.reject("Binary content not supported in SFC loader")
          : Promise.resolve(content),
    };
  },

  addStyle(textContent: string) {
    const style = document.createElement("style");
    style.textContent = textContent;
    const ref = document.head.getElementsByTagName("style")[0] || null;
    document.head.insertBefore(style, ref);
  },

  log(type: string, ...args: any[]) {
    // 仅在开发模式下输出详细日志
    if (process.env.NODE_ENV === "development") {
      console.log(`[vue3-sfc-loader] ${type}`, ...args);
    }
  },
};

/**
 * 动态加载 Vue 组件
 * @param path - .vue 文件的路径
 */
export function useVueComponent(
  path: Ref<string | null> | string | null
): ComputedRef<Component | null> {
  // 使用 shallowRef 缓存生成的异步组件定义
  const asyncComp = shallowRef<Component | null>(null);

  watch(
    () => unref(path),
    (currentPath) => {
      if (!currentPath || !currentPath.endsWith(".vue")) {
        asyncComp.value = null;
        return;
      }

      // 1. 检查缓存
      if (componentCache.has(currentPath)) {
        asyncComp.value = componentCache.get(currentPath)!;
        return;
      }

      // 2. 定义异步组件
      const comp = defineAsyncComponent({
        loader: () => loadModule(currentPath, options),
        onError: (err) => {
          console.error(`[useVueComponent] Error loading ${currentPath}:`, err);
        },
      });

      // 3. 写入缓存并更新状态
      componentCache.set(currentPath, comp);
      asyncComp.value = comp;
    },
    { immediate: true }
  );

  return computed(() => asyncComp.value);
}
