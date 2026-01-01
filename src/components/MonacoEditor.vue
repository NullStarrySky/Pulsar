<!-- src/components/MonacoEditor.vue -->
<script setup lang="ts">
import type { editor } from "monaco-editor";
import { onMounted, onUnmounted, ref, shallowRef, watch } from "vue";

const props = withDefaults(
	defineProps<{
		id?: string;
		language?: string; // 支持 'javascript', 'python', 'rust' 等
		options?: editor.IStandaloneEditorConstructionOptions;
	}>(),
	{
		id: "monaco-editor",
		language: "plaintext",
		options: () => ({}),
	},
);

const emit =
	defineEmits<
		(e: "editorDidMount", editor: editor.IStandaloneCodeEditor) => void
	>();

const model = defineModel<string>({ required: true });
const editorContainer = ref<HTMLElement | null>(null);
const editorRef = shallowRef<editor.IStandaloneCodeEditor | null>(null);

// --- 🚀 核心优化：动态加载语言包 ---
// 当 AI 生成代码时，我们按需下载对应的语言高亮规则
const loadLanguageSupport = async (lang: string) => {
	try {
		switch (lang) {
			case "javascript":
			case "typescript":
				// TS/JS 比较特殊，功能很强，通常需要专门引入
				await import(
					"monaco-editor/esm/vs/language/typescript/monaco.contribution"
				);
				break;
			case "json":
				await import("monaco-editor/esm/vs/language/json/monaco.contribution");
				break;
			case "css":
			case "html":
				// 这些已经在 core 里稍微带了一点，但完整功能需要 contribution
				await import("monaco-editor/esm/vs/language/html/monaco.contribution");
				break;
			case "python":
				// ✅ 关键：对于普通语言，只加载 basic-languages
				await import(
					"monaco-editor/esm/vs/basic-languages/python/python.contribution"
				);
				break;
			case "rust":
				await import(
					"monaco-editor/esm/vs/basic-languages/rust/rust.contribution"
				);
				break;
			case "sql":
				await import(
					"monaco-editor/esm/vs/basic-languages/sql/sql.contribution"
				);
				break;
			// ... 你可以根据需要添加更多 case，或者做一个映射表
			// 如果不想写这么多 case，可以用 import.meta.glob 批量导入，但这比较高级
		}
	} catch (e) {
		console.warn(`Failed to load language support for ${lang}`, e);
	}
};

onMounted(async () => {
	if (editorContainer.value) {
		// 1. 先加载当前需要的语言包
		await loadLanguageSupport(props.language);

		const { default: monaco } = await import("@/utils/monacoCore");

		// 2. 初始化编辑器
		const editorInstance = monaco.editor.create(editorContainer.value, {
			value: model.value,
			language: props.language,
			automaticLayout: true,
			...props.options,
		});

		// 绑定事件
		editorInstance.onDidChangeModelContent(() => {
			const currentValue = editorInstance.getValue();
			if (currentValue !== model.value) {
				model.value = currentValue;
			}
		});

		editorRef.value = editorInstance;
		emit("editorDidMount", editorInstance);
		(window as any).monacoInstance = monaco;
	}
});

// 监听语言变化，动态加载新语言
watch(
	() => props.language,
	async (newLang) => {
		if (editorRef.value) {
			await loadLanguageSupport(newLang);
			// 动态导入再次确保安全
			const { default: monaco } = await import("@/utils/monacoCore");
			monaco.editor.setModelLanguage(editorRef.value.getModel()!, newLang);
		}
	},
);

watch(model, (newValue) => {
	if (editorRef.value && newValue !== editorRef.value.getValue()) {
		editorRef.value.setValue(newValue);
	}
});

watch(
	() => props.options,
	(newOptions) => {
		editorRef.value?.updateOptions(newOptions);
	},
	{ deep: true },
);

onUnmounted(() => {
	editorRef.value?.dispose();
	editorRef.value = null;
});
</script>

<template>
  <div
    :id="props.id"
    ref="editorContainer"
    class="monaco-editor-container"
  ></div>
</template>

<style scoped>
.monaco-editor-container {
  width: 100%;
  height: 100%;
}
</style>
