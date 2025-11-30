// src/features/FileSystem/composables/useVueComponent.ts
import {
  computed,
  unref,
  defineAsyncComponent,
  type Ref,
  type Component,
  type ComputedRef,
} from "vue";
import { loadModule } from "vue3-sfc-loader";
import { useFileSystemStore } from "../FileSystem.store";
import { FileNode } from "../FileSystem.store";

// 1. 全局组件缓存
// 创建一个 Map 来缓存已加载和解析的组件，避免重复工作。
const componentCache = new Map<string, Component>();

// 2. 配置 vue3-sfc-loader
// 这些选项是单例的，只需在应用生命周期内配置一次。

// @ts-ignore - 因为 Tauri 的 API 是在运行时通过 withGlobalTauri 注入的
const tauri = window.__TAURI__;

const options = {
  /**
   * @description 模块缓存和依赖重定向。
   * 这是最关键的部分，它告诉 loader 如何处理 .vue 文件中的 import 语句。
   */
  moduleCache: {
    // 将 'import { ... } from "vue"' 重定向到全局的 Vue 实例。
    // 这对于在 Vite 中外部化 'vue' 的项目至关重要。
    vue: import("vue"),

    // 将 Tauri API 的导入重定向到全局的 __TAURI__ 对象。
    // 注意：您需要为您动态组件中用到的所有 Tauri 模块添加映射。
    // 核心 API 模块
    "@tauri-apps/api/path": tauri.path,
    "@tauri-apps/api/event": tauri.event,
    "@tauri-apps/api/window": tauri.window,
    "@tauri-apps/api/webview": tauri.webview,
    "@tauri-apps/api/core": tauri.core,

    // START: 根据 package.json 添加的 Tauri 插件
    "@tauri-apps/plugin-autostart": tauri.autostart,
    "@tauri-apps/plugin-clipboard-manager": tauri.clipboardManager,
    "@tauri-apps/plugin-dialog": tauri.dialog,
    "@tauri-apps/plugin-fs": tauri.fs,
    "@tauri-apps/plugin-http": tauri.http,
    "@tauri-apps/plugin-notification": tauri.notification,
    "@tauri-apps/plugin-opener": tauri.opener,
    "@tauri-apps/plugin-os": tauri.os,
    "@tauri-apps/plugin-positioner": tauri.positioner,
    "@tauri-apps/plugin-process": tauri.process,
    "@tauri-apps/plugin-shell": tauri.shell,
    "@tauri-apps/plugin-sql": tauri.sql,
    "@tauri-apps/plugin-store": tauri.store,
    "@tauri-apps/plugin-upload": tauri.upload,
    "@tauri-apps/plugin-websocket": tauri.websocket,

    // 如果您的动态组件还导入了其他库（例如 lodash-es），您也需要在这里添加映射：
    // 'lodash-es': import('lodash-es'),
  },

  /**
   * @description 自定义文件获取逻辑。
   * 我们将默认的 fetch 替换为从我们的 VFS (Pinia store) 中读取文件。
   */
  async getFile(url: string) {
    const store = useFileSystemStore();

    // 使用 getNodeByPath 直接访问 KV 结构，避免不必要的 proxy 循环。
    const node = store.getNodeByPath(store.fileStructure, url);

    if (node === undefined || !(node instanceof FileNode)) {
      throw new Error(
        `[useVueComponent] Vue file not found or is a directory: ${url}`
      );
    }

    let content = node.content;

    // 如果文件内容尚未加载，则从磁盘加载它。
    if (content === null) {
      await store.load(url);
      const updatedNode = store.getNodeByPath(store.fileStructure, url);
      content = updatedNode instanceof FileNode ? updatedNode.content : null;
    }

    // 确保内容是字符串形式。
    if (typeof content !== "string") {
      console.error(
        `[useVueComponent] Content of ${url} is not a string.`,
        content
      );
      throw new Error(
        `[useVueComponent] Failed to load content for ${url} as a string.`
      );
    }

    return {
      getContentData: (asBinary: boolean) =>
        asBinary
          ? Promise.reject("Binary content not supported")
          : Promise.resolve(content),
    };
  },

  /**
   * @description 样式注入逻辑。
   * 将 .vue 文件中的 <style> 内容动态添加到文档头部。
   */
  addStyle(textContent: string) {
    const style = Object.assign(document.createElement("style"), {
      textContent,
    });
    const ref = document.head.getElementsByTagName("style")[0] || null;
    document.head.insertBefore(style, ref);
  },

  /**
   * @description 错误和日志处理
   */
  log(type: string, ...args: any[]) {
    console.log(`[vue3-sfc-loader] ${type}`, ...args);
  },
};

/**
 * @description 从 VFS 中动态加载、解析和缓存 .vue 文件作为 Vue 组件。
 * @param path - .vue 文件的路径，可以是 ref、字符串或 null。
 * @returns 一个计算属性，其值为一个异步 Vue 组件实例或 null。
 */
export function useVueComponent(
  path: Ref<string | null> | string | null
): ComputedRef<Component | null> {
  return computed(() => {
    const currentPath = unref(path);

    // 如果路径无效，则返回 null。
    if (!currentPath || !currentPath.endsWith(".vue")) {
      return null;
    }

    // 步骤 1: 检查缓存
    if (componentCache.has(currentPath)) {
      return componentCache.get(currentPath)!;
    }

    // 步骤 2: 如果不在缓存中，创建一个新的异步组件
    // defineAsyncComponent 是 Vue 官方的异步组件解决方案，非常适合这种场景。
    const asyncComponent = defineAsyncComponent({
      // 加载器函数，调用 vue3-sfc-loader 的 loadModule
      loader: () => loadModule(currentPath, options),
      // 可以在这里添加 loadingComponent, errorComponent 等高级选项
      onError: (err) => {
        console.error(
          `[useVueComponent] Error loading component from ${currentPath}:`,
          err
        );
      },
    });

    // 步骤 3: 将新创建的异步组件存入缓存
    componentCache.set(currentPath, asyncComponent);

    return asyncComponent;
  });
}
