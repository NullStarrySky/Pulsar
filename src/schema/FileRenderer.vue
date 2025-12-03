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

import SchemaRenderer from "@/components/SchemaRenderer/SchemaRenderer.vue";
import UnknownFileRenderer from "./unknown/UnknownFileRenderer.vue";
import CharacterLibrary from "./CharacterLibrary.vue"; // 暂时保留引用以便注册，或者在 App 初始化时注册
import { useUIStore } from "@/features/UI/UI.store";

// --- 1. Props and Store Initialization ---
const props = defineProps<{
  path: string;
}>();

const fsStore = useFileSystemStore();
const uiStore = useUIStore(); // Initialize UI Store

// 如果需要在组件内注册默认的内置组件（例如 $character），可以在这里做
// 或者更推荐在 App.vue 或 store 初始化时完成
onMounted(() => {
  if (!uiStore.customComponents["$character"]) {
    uiStore.registerComponent("$character", CharacterLibrary);
  }
});

// --- Helper function to reliably check for a Vue component ---
const isVueComponent = (obj: any): obj is Component => {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return false;
  }
  return "render" in obj || "setup" in obj || "template" in obj || obj.__name;
};

// --- 2. File Content and Data Management ---
const remoteContent = useFileContent<Record<string, any>>(
  computed(() => props.path)
);

const localContent = ref<Record<string, any> | null>(null);

// --- 3. Core Rendering Logic ---

// 移除原有的 inlineComponentOverrides，改用 uiStore 中的配置
const registeredComponent = computed(() => {
  // 优先匹配全路径 (例如 "$character")
  if (uiStore.customComponents[props.path]) {
    return uiStore.customComponents[props.path];
  }
  // 其次匹配文件名 (保持原有逻辑兼容性)
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

// 3a. 解析自定义组件覆盖 (来自 manifest 的动态方式)
const contextManifestPaths = computed(() => {
  const paths: { self: string | null; global: string } = {
    self: null,
    global: "global/manifest.[manifest].json",
  };

  const parts = props.path.split("/");
  if (parts.length > 1) {
    const parentDir = parts.slice(0, -1).join("/");
    const parentNode = fsStore.resolvePath(parentDir);
    if (parentNode instanceof VirtualFolder) {
      for (const [name, node] of parentNode.children) {
        if (name.endsWith(".[manifest].json") || name === "manifest.json") {
          paths.self = node.path;
          break;
        }
      }
    }
  }
  return paths;
});

const selfMeta = useFileContent<any>(
  computed(() => contextManifestPaths.value.self)
);
const globalMeta = useFileContent<any>(
  computed(() => contextManifestPaths.value.global)
);

const customComponentPath = computed(() => {
  const type = semanticType.value;
  if (!type || type === "unknown") return null;

  const selfOverride = selfMeta.value?.customComponent?.[type];
  if (selfOverride) return selfOverride;

  const globalOverride = globalMeta.value?.customComponent?.[type];
  if (globalOverride) return globalOverride;

  return null;
});

const CustomComponent = useVueComponent(customComponentPath);

/**
 * 核心决策引擎
 */
const renderConfig = computed(() => {
  // 1. UI Store 注册的组件优先 (支持 $internal 和手动覆盖)
  if (registeredComponent.value) {
    // 特殊逻辑：如果是以 $ 开头的内置组件，不需要等待 localContent (因为没有文件数据)
    // 或者是已加载数据的普通文件
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
        data: localContent.value, // 内置组件可能收到 null，这是预期的
      },
    };
  }

  const type = semanticType.value;
  if (!type) {
    // 既然不是已注册的内置组件，如果还没有 type，那就是无效路径
    return { status: "error", message: "File not found or Invalid path" };
  }

  // 2. 自定义动态组件覆盖 (基于 Manifest)
  if (CustomComponent.value) {
    if (!localContent.value) {
      return { status: "loading", message: "Loading Editor..." };
    }
    return {
      status: "render",
      type: "custom",
      component: CustomComponent.value,
      props: {
        path: props.path,
        data: localContent.value,
      },
    };
  }

  // 3. 语义类型映射 (SemanticTypeMap)
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

  // 3a. Vue 组件形式
  if (isVueComponent(renderMethod)) {
    return {
      status: "render",
      type: "component",
      component: renderMethod,
      props: { path: props.path },
    };
  }

  // 3b. Schema 形式 (JSON Forms)
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
    message: `The semantic type '${type}' is configured but has no valid rendering method.`,
  };
});

// --- 4. Data Synchronization Logic ---

function handleDataUpdate(newData: Record<string, any>) {
  localContent.value = newData;
}

watch(
  localContent,
  (newContent) => {
    // 只有非内置组件才回写
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
