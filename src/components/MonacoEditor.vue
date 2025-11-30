<!-- src/components/MonacoEditor.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef } from "vue";
import * as monaco from "monaco-editor";
import type { editor } from "monaco-editor";

// --- 1. 定义 Props 和 Emits ---

const props = withDefaults(
  defineProps<{
    id?: string;
    language?: string;
    options?: editor.IStandaloneEditorConstructionOptions;
  }>(),
  {
    id: "monaco-editor",
    language: "plaintext",
    options: () => ({}),
  }
);

const emit = defineEmits<{
  (e: "editorDidMount", editor: editor.IStandaloneCodeEditor): void;
}>();

// 使用 defineModel 来实现 v-model 双向绑定
const model = defineModel<string>({ required: true });

// --- 2. 创建编辑器实例 ---

const editorContainer = ref<HTMLElement | null>(null);
// 使用 shallowRef 存储编辑器实例以避免性能问题
const editorRef = shallowRef<editor.IStandaloneCodeEditor | null>(null);

onMounted(() => {
  if (editorContainer.value) {
    const editorInstance = monaco.editor.create(editorContainer.value, {
      value: model.value,
      language: props.language,
      automaticLayout: true, // 编辑器将自动布局
      ...props.options,
    });

    // 监听内容变化并更新 v-model
    editorInstance.onDidChangeModelContent(() => {
      const currentValue = editorInstance.getValue();
      if (currentValue !== model.value) {
        model.value = currentValue;
      }
    });

    editorRef.value = editorInstance;
    // 触发 editorDidMount 事件，将实例暴露给父组件
    emit("editorDidMount", editorInstance);
  }
});

// --- 3. 监听 Props 变化 ---

// 监听外部 v-model 的变化，并同步到编辑器
watch(model, (newValue) => {
  if (editorRef.value && newValue !== editorRef.value.getValue()) {
    editorRef.value.setValue(newValue);
  }
});

// 监听语言变化
watch(
  () => props.language,
  (newLang) => {
    if (editorRef.value) {
      monaco.editor.setModelLanguage(editorRef.value.getModel()!, newLang);
    }
  }
);

// 监听配置项变化
watch(
  () => props.options,
  (newOptions) => {
    editorRef.value?.updateOptions(newOptions);
  },
  { deep: true }
);

// --- 4. 资源清理 ---

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
