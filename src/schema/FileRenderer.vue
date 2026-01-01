<!-- src/schema/FileRenderer.vue -->
<script setup lang="ts">
import {
	type Component,
	computed,
	defineAsyncComponent,
	onMounted,
	ref,
	watch,
} from "vue";
import type { ManifestContent } from "@/components/EnvironmentSidebar/manifest.types.ts";
import type { Schema } from "@/components/SchemaRenderer/SchemaRenderer.types";
import SchemaRenderer from "@/components/SchemaRenderer/SchemaRenderer.vue";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import { useVueComponent } from "@/features/FileSystem/composables/useVueComponent";
import {
	useFileSystemStore,
	VirtualFile,
	VirtualFolder,
} from "@/features/FileSystem/FileSystem.store";
import { useUIStore } from "@/features/UI/UI.store";
import { type SemanticType, SemanticTypeMap } from "@/schema/SemanticType";
import UnknownFileRenderer from "./unknown/UnknownFileRenderer.vue";

const Tester = defineAsyncComponent(() => import("./Tester.vue"));

// --- 1. Props and Store Initialization ---
const props = defineProps<{
	path: string;
}>();

const fsStore = useFileSystemStore();
const uiStore = useUIStore();

// 注册默认组件 (可选)
onMounted(() => {
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

// ---  0. 检测是否为直接的 .vue 文件 ---
const isDirectVueFile = computed(() => props.path.endsWith(".vue"));

// 使用 useVueComponent 动态编译当前路径
// 如果路径不是 .vue 结尾，传入 null 以跳过编译
const compiledVueFile = useVueComponent(
	computed(() => (isDirectVueFile.value ? props.path : null)),
);

// --- 2. File Content (仅针对数据文件) ---
// 如果是直接渲染 .vue 文件，我们要避免尝试把它当做 JSON 数据读取，
// 否则 JSON.parse 会报错。
const shouldLoadData = computed(
	() => !isDirectVueFile.value && !props.path.startsWith("$"),
);

const remoteContent = useFileContent<Record<string, any>>(
	computed(() => (shouldLoadData.value ? props.path : null)),
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

// 解析 Manifest 路径 (逻辑保持不变)
const contextManifestPaths = computed(() => {
	if (isDirectVueFile.value) return { self: null, global: null }; // .vue 文件不需要 manifest 上下文查找

	const paths: { self: string | null; global: string } = {
		self: null,
		global: "global/manifest.json",
	};

	let currentPath = props.path.split("/").slice(0, -1).join("/");
	while (currentPath !== "") {
		const node = fsStore.resolvePath(currentPath);
		if (node instanceof VirtualFolder) {
			for (const [name, child] of node.children) {
				if (name === "manifest.json" && child instanceof VirtualFile) {
					paths.self = child.path;
					break;
				}
			}
			if (paths.self) break;
		}
		const parts = currentPath.split("/");
		parts.pop();
		currentPath = parts.join("/");
	}
	return paths;
});

const selfMeta = useFileContent<ManifestContent>(
	computed(() => contextManifestPaths.value.self),
);
const globalMeta = useFileContent<ManifestContent>(
	computed(() => contextManifestPaths.value.global),
);

// 计算覆盖组件路径
const overrideComponentPath = computed(() => {
	const type = semanticType.value;
	if (!type || type === "unknown") return null;
	const selfOverride = selfMeta.value?.overrides?.[type];
	if (selfOverride) return selfOverride;
	const globalOverride = globalMeta.value?.overrides?.[type];
	if (globalOverride) return globalOverride;
	return null;
});

const OverrideComponent = useVueComponent(overrideComponentPath);

/**
 * 核心渲染决策 - 更新版
 */
const renderConfig = computed(() => {
	// [优先级 0] 直接渲染 .vue 文件
	// 类似于将 .json 解析为 Object，这里将 .vue 解析为 Component
	if (isDirectVueFile.value) {
		if (compiledVueFile.value) {
			return {
				status: "render",
				type: "direct-vue",
				component: compiledVueFile.value,
				props: {
					// 这里可以传入一些环境属性，或者留空
					// .vue 文件通常自己管理状态
					filePath: props.path,
				},
			};
		} else {
			// 正在通过 vue3-sfc-loader 编译
			return { status: "loading", message: "Compiling Vue Component..." };
		}
	}

	// [优先级 1] UI Store 注册的组件 ($internal)
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

	// [优先级 2] 语义类型渲染器覆盖 (Manifest Overrides)
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

	// [优先级 3] 默认语义类型映射
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

	// 3a. Vue Component (静态映射)
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

// --- 4. Data Sync ---

function handleDataUpdate(newData: Record<string, any>) {
	// 只有非 .vue 文件才处理数据同步
	if (!isDirectVueFile.value) {
		localContent.value = newData;
	}
}

watch(
	localContent,
	(newContent) => {
		if (newContent && !props.path.startsWith("$") && !isDirectVueFile.value) {
			remoteContent.value = newContent;
		}
	},
	{ deep: true },
);

watch(
	remoteContent,
	(newRemoteContent) => {
		if (isDirectVueFile.value) return; // 忽略 .vue 文件的内容同步

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
	{ immediate: true, deep: true },
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
      <div class="flex flex-col items-center gap-2">
        <!-- 这里可以加一个 Loading Spinner -->
        <p class="text-muted-foreground">{{ renderConfig.message }}</p>
      </div>
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
