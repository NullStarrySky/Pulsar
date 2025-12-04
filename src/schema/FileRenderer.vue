<script setup lang="ts">
import { computed, ref, watch, type Component, onMounted } from "vue";
import {
  useFileSystemStore,
  VirtualFile,
  VirtualFolder,
} from "@/features/FileSystem/FileSystem.store";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import { useVueComponent } from "@/features/FileSystem/composables/useVueComponent";
import { SemanticTypeMap, type SemanticType } from "@/schema/SemanticType";
import type { Schema } from "@/components/SchemaRenderer/SchemaRenderer.types";
import type { ManifestContent } from "@/schema/manifest/manifest.types";

import SchemaRenderer from "@/components/SchemaRenderer/SchemaRenderer.vue";
import UnknownFileRenderer from "./unknown/UnknownFileRenderer.vue";
import CharacterLibrary from "./CharacterLibrary.vue";
import Tester from "./Tester.vue";
import { useUIStore } from "@/features/UI/UI.store";

// --- 1. Props and Store Initialization ---
const props = defineProps<{
  path: string;
}>();

const fsStore = useFileSystemStore();
const uiStore = useUIStore();

// 注册默认组件 (可选)
onMounted(() => {
  if (!uiStore.customComponents["$character"]) {
    uiStore.registerComponent("$character", CharacterLibrary);
  }
  if (!uiStore.customComponents["$test"]) {
    uiStore.registerComponent("$test", Tester);
  }
});

const isVueComponent = (obj: any): obj is Component => {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return false;
  }
  return "render" in obj || "setup" in obj || "template" in obj || obj.__name;
};

// --- 2. File Content ---
const remoteContent = useFileContent<Record<string, any>>(
  computed(() => props.path)
);
const localContent = ref<Record<string, any> | null>(null);

// --- 3. Core Logic ---

const registeredComponent = computed(() => {
  if (uiStore.customComponents[props.path]) {
    return uiStore.customComponents[props.path];
  }
  const filename = props.path.split("/").pop();
  if (filename && uiStore.customComponents[filename]) {
    return uiStore.customComponents[filename];
  }
  return null;
});

const fileNode = computed(() => fsStore.resolvePath(props.path));
const semanticType = computed(() => {
  if (fileNode.value instanceof VirtualFile) {
    return fileNode.value.semanticType;
  }
  return null;
});

/**
 * 3a. 解析 Manifest 路径 (修复逻辑：递归向上查找)
 * 解决深层目录下的文件无法找到根目录 manifest 的问题
 */
const contextManifestPaths = computed(() => {
  const paths: { self: string | null; global: string } = {
    self: null,
    global: "global/manifest.[manifest].json",
  };

  // 从当前文件的父目录开始，向上遍历直到根目录
  let currentPath = props.path.split("/").slice(0, -1).join("/");

  while (currentPath !== "") {
    const node = fsStore.resolvePath(currentPath);
    if (node instanceof VirtualFolder) {
      // 检查当前目录下是否有 manifest
      for (const [name, child] of node.children) {
        if (
          (name.endsWith(".[manifest].json") || name === "manifest.json") &&
          child instanceof VirtualFile
        ) {
          paths.self = child.path;
          break;
        }
      }
      if (paths.self) break; // 找到了最近的 manifest，停止查找
    }

    // 向上移动一级
    const parts = currentPath.split("/");
    parts.pop();
    currentPath = parts.join("/");
  }

  return paths;
});

// 使用 ManifestContent 接口泛型
const selfMeta = useFileContent<ManifestContent>(
  computed(() => contextManifestPaths.value.self)
);
const globalMeta = useFileContent<ManifestContent>(
  computed(() => contextManifestPaths.value.global)
);

/**
 * 3b. 计算覆盖组件路径
 * 逻辑：semanticType -> overrides (在 manifest 中) -> path
 */
const overrideComponentPath = computed(() => {
  const type = semanticType.value;
  if (!type || type === "unknown") return null;

  // 优先查找局部 manifest 中的 overrides
  const selfOverride = selfMeta.value?.overrides?.[type];
  if (selfOverride) return selfOverride;

  // 其次查找全局 manifest 中的 overrides
  const globalOverride = globalMeta.value?.overrides?.[type];
  if (globalOverride) return globalOverride;

  return null;
});

// 动态加载覆盖组件
const OverrideComponent = useVueComponent(overrideComponentPath);

/**
 * 核心渲染决策
 */
const renderConfig = computed(() => {
  // 1. UI Store 注册的组件优先 ($internal 等)
  if (registeredComponent.value) {
    const isInternal = props.path.startsWith("$");
    if (!isInternal && !localContent.value) {
      return { status: "loading", message: "Loading Data..." };
    }
    return {
      status: "render",
      type: "component",
      component: registeredComponent.value,
      props: {
        path: props.path,
        data: localContent.value,
      },
    };
  }

  const type = semanticType.value;
  if (!type) {
    return { status: "error", message: "File not found or Invalid path" };
  }

  // 2. 语义类型渲染器覆盖 (Based on Manifest Overrides)
  // 这是本次重构的核心区别：使用 overrides 而不是 customComponents
  if (OverrideComponent.value) {
    if (!localContent.value) {
      return { status: "loading", message: "Loading Custom Editor..." };
    }
    return {
      status: "render",
      type: "custom",
      component: OverrideComponent.value,
      props: {
        path: props.path,
        data: localContent.value,
      },
    };
  }

  // 3. 默认语义类型映射
  if (type === "unknown" || !(type in SemanticTypeMap)) {
    return {
      status: "render",
      type: "unknown",
      component: UnknownFileRenderer,
      props: { path: props.path },
    };
  }

  const definition = SemanticTypeMap[type as SemanticType];
  const renderMethod = definition.renderingMethod;

  // 3a. Vue Component
  if (isVueComponent(renderMethod)) {
    return {
      status: "render",
      type: "component",
      component: renderMethod,
      props: { path: props.path },
    };
  }

  // 3b. Schema Form
  const schema =
    typeof renderMethod === "function"
      ? (renderMethod as () => Schema)()
      : (renderMethod as Schema);

  if (schema) {
    if (!localContent.value) {
      return { status: "loading", message: "Loading Schema Data..." };
    }
    return {
      status: "render",
      type: "schema",
      component: SchemaRenderer,
      props: {
        schema: schema,
        data: localContent.value,
      },
    };
  }

  return {
    status: "error",
    message: `No rendering method for type '${type}'.`,
  };
});

// --- 4. Data Sync (保持原有逻辑) ---

function handleDataUpdate(newData: Record<string, any>) {
  localContent.value = newData;
}

watch(
  localContent,
  (newContent) => {
    if (newContent && !props.path.startsWith("$")) {
      remoteContent.value = newContent;
    }
  },
  { deep: true }
);

watch(
  remoteContent,
  (newRemoteContent) => {
    if (newRemoteContent) {
      if (
        JSON.stringify(newRemoteContent) !== JSON.stringify(localContent.value)
      ) {
        localContent.value = JSON.parse(JSON.stringify(newRemoteContent));
      }
    } else {
      localContent.value = null;
    }
  },
  { immediate: true, deep: true }
);
</script>

<template>
  <div class="h-full w-full" :key="props.path">
    <template v-if="renderConfig.status === 'render'">
      <component
        :is="renderConfig.component"
        v-bind="renderConfig.props"
        @update:data="handleDataUpdate"
      />
    </template>

    <div
      v-else-if="renderConfig.status === 'loading'"
      class="flex h-full w-full items-center justify-center"
    >
      <p class="text-muted-foreground">{{ renderConfig.message }}</p>
    </div>

    <div
      v-else-if="renderConfig.status === 'error'"
      class="flex h-full w-full items-center justify-center p-4 text-center"
    >
      <div
        class="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive"
      >
        <h3 class="font-semibold">Render Error</h3>
        <p class="text-sm">{{ renderConfig.message }}</p>
      </div>
    </div>
  </div>
</template>
