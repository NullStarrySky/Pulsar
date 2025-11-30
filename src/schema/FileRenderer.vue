<!-- src/schema/FileRenderer.vue -->
<script setup lang="ts">
import { computed, ref, watch, onUnmounted, type Component } from "vue";
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store.ts";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent.ts";
import { useVueComponent } from "@/features/FileSystem/composables/useVueComponent.ts";
import { SemanticTypeMap } from "@/schema/SemanticType.ts";
import { Schema } from "@/components/SchemaRenderer/SchemaRenderer.types";

import SchemaRenderer from "@/components/SchemaRenderer/SchemaRenderer.vue";
import UnknownFileRenderer from "./unknown/UnknownFileRenderer.vue";

import CharacterLibrary from "./CharacterLibrary.vue";

// --- 1. Props and Store Initialization ---
const props = defineProps<{
  path: string;
}>();

const fsStore = useFileSystemStore();

// --- Helper function to reliably check for a Vue component ---
const isVueComponent = (obj: any): obj is Component => {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return false;
  }
  return "render" in obj || "setup" in obj || "template" in obj;
};

// --- 2. File Content and Data Management ---
const { content: remoteContent, sync } = useFileContent<Record<string, any>>(
  props.path
);
const localContent = ref<Record<string, any> | null>(null);

// --- 3. Core Rendering Logic ---

// Key: 文件名 (例如 'secrets.json')
// Value: 直接导入的组件
const inlineComponentOverrides: Record<string, Component> = {
  characterLibrary: CharacterLibrary,
};

const semanticType = computed(() => {
  if (!props.path) return null;
  return fsStore.fs.getSemanticType(props.path);
});

// 3a. 解析自定义组件覆盖 (来自 manifest 的动态方式)
const contextRoots = computed(() => {
  const parts = props.path.split("/");
  let selfRootPath: string | null = null;
  if (parts[0] === "character" && parts.length > 1) {
    selfRootPath = `character/${parts[1]}`;
  }
  return { self: selfRootPath, global: "global" };
});

const selfMetaPath = computed(() =>
  contextRoots.value.self
    ? `${contextRoots.value.self}/manifest.[manifest].json`
    : null
);
const { content: selfMeta } = useFileContent<any>(selfMetaPath);
const { content: globalMeta } = useFileContent<any>(
  ref("global/manifest.[manifest].json")
);

const customComponentPath = computed(() => {
  const type = semanticType.value;
  if (!type) return null;
  const selfOverride = selfMeta.value?.customComponent?.[type];
  if (selfOverride) return selfOverride;
  const globalOverride = globalMeta.value?.customComponent?.[type];
  if (globalOverride) return globalOverride;
  return null;
});

const CustomComponent = useVueComponent(customComponentPath);

/**
 * 核心决策引擎：根据所有可用信息，决定最终的渲染方式。
 */
const renderConfig = computed(() => {
  const filename = props.path.split("/").pop();
  if (filename && inlineComponentOverrides[filename]) {
    if (!localContent.value) {
      return { status: "loading", message: "Loading Editor..." };
    }
    return {
      status: "render",
      type: "component", // 标记为普通组件渲染
      component: inlineComponentOverrides[filename], // 使用内联映射中的组件
      props: {
        path: props.path,
        data: localContent.value,
      },
    };
  }

  // --- 如果没有内联覆盖，则执行原有逻辑 ---
  const type = semanticType.value;

  if (!type) {
    return { status: "loading", message: "Resolving file type..." };
  }

  // 检查来自 manifest.[manifest].json 的动态组件覆盖
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

  if (!(type in SemanticTypeMap)) {
    console.warn(
      `[FileRenderer] Semantic type "${type}" not found. Falling back to UnknownFileRenderer.`
    );
    return {
      status: "render",
      type: "component",
      component: UnknownFileRenderer,
      props: { path: props.path },
    };
  }

  const definition = SemanticTypeMap[type as keyof typeof SemanticTypeMap];
  const renderMethod = definition.renderingMethod;

  if (isVueComponent(renderMethod)) {
    return {
      status: "render",
      type: "component",
      component: renderMethod,
      props: { path: props.path },
    };
  }

  const schema =
    typeof renderMethod === "function"
      ? (renderMethod as () => Schema)()
      : (renderMethod as Schema);
  if (schema) {
    if (!localContent.value) {
      return { status: "loading", message: "Loading Editor..." };
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
    type: type,
    message: `The semantic type '${type}' is not configured for rendering.`,
  };
});

// --- 4. Data Synchronization Logic ---
function handleDataUpdate(newData: Record<string, any>) {
  if (JSON.stringify(localContent.value) !== JSON.stringify(newData)) {
    localContent.value = newData;
  }
}

watch(
  localContent,
  (newContent, oldContent) => {
    if (
      newContent &&
      JSON.stringify(newContent) !== JSON.stringify(oldContent)
    ) {
      sync(newContent);
    }
  },
  { deep: true }
);

watch(
  remoteContent,
  (newRemoteContent) => {
    if (
      JSON.stringify(newRemoteContent) !== JSON.stringify(localContent.value)
    ) {
      localContent.value = newRemoteContent
        ? JSON.parse(JSON.stringify(newRemoteContent))
        : null;
    }
  },
  { immediate: true, deep: true }
);
onUnmounted(() => {
  sync.cancel?.();
});
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
        <h3 class="font-semibold">渲染错误</h3>
        <p class="text-sm">{{ renderConfig.message }}</p>
      </div>
    </div>
  </div>
</template>
