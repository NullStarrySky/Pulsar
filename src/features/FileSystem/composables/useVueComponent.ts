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
// 添加这一行：导入完整的 Vue 命名空间
import * as Vue from "vue";
import { loadModule } from "vue3-sfc-loader";
import { useFileSystemStore, VirtualFile } from "../FileSystem.store";

// 缓存已编译的组件，避免重复编译
const componentCache = new Map<string, Component>();

// @ts-ignore
const tauri = window.__TAURI__ || {};

const options = {
  /**
   * 模块依赖重定向
   * 定义 .vue 文件中可以 import 的模块
   */
  moduleCache: {
    // 修复点：直接传递 Vue 对象，而不是 import("vue")
    // 这确保了 pushScopeId, popScopeId 等内部方法对 scoped 样式可用
    vue: Vue,

    // 映射 Tauri API
    "@tauri-apps/api/core": tauri.core,
    "@tauri-apps/plugin-fs": tauri.fs,
    "@tauri-apps/plugin-dialog": tauri.dialog,
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
      // 增加更详细的错误日志有助于调试
      console.warn(`[useVueComponent] File not found: ${url}`);
      return Promise.reject(new Error(`File not found: ${url}`));
    }

    // 3. 获取内容 (优先读缓存，无缓存则通过 fs api 读取)
    let content = await node.read();

    // 4. 类型安全检查 (SFC Loader 需要字符串)
    if (typeof content !== "string") {
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
        loadingComponent: {
          // 可选：渲染一个简单的加载占位符，防止渲染期间属性透传警告
          template: "<div>Loading...</div>",
        },
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
