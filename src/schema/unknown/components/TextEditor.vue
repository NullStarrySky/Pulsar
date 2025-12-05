<!-- src/schema/unknown/components/TextEditor.vue -->
<script setup lang="ts">
import { shallowRef, computed, type Ref, defineAsyncComponent } from "vue";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent.ts";
import type { editor } from "monaco-editor";

// 配合 loadingComponent 可以在加载时显示占位符
const MonacoEditor = defineAsyncComponent({
  loader: () => import("@/components/MonacoEditor.vue"),
  loadingComponent: {
    template:
      '<div class="h-full w-full flex items-center justify-center text-muted-foreground">编辑器资源加载中...</div>',
  },
  delay: 200, // 延迟显示 loading，避免闪烁
});

function getLanguageForFile(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (extension) {
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "md":
      return "markdown";
    default:
      return "plaintext";
  }
}

// --- Props and Composables ---
const props = defineProps<{
  path: string;
}>();

const content = useFileContent<string | object>(props.path);

// --- 核心修改：在 set 函数中断言 content 类型 ---
const editorContent = computed<string>({
  get() {
    const rawContent = content.value;
    if (typeof rawContent === "object" && rawContent !== null) {
      return JSON.stringify(rawContent, null, 2);
    }
    return String(rawContent ?? "");
  },
  set(newValue: string) {
    // 2. 将 content 断言为一个可写的 Ref<string | object>
    // 这告诉 TypeScript：“我知道 content 是只读类型，但我确定在这里可以安全地写入它。”
    const writableContent = content as Ref<string | object>;

    if (language.value === "json") {
      try {
        writableContent.value = JSON.parse(newValue);
        return;
      } catch (e) {
        // 如果 JSON 解析失败，则保持为字符串，允许用户继续编辑
      }
    }
    // 对于非 JSON 文件或解析失败的 JSON，直接更新为字符串
    writableContent.value = newValue;
  },
});

// --- Monaco Editor 配置 ---
const editorRef = shallowRef<editor.IStandaloneCodeEditor | null>(null);
const language = computed(() => getLanguageForFile(props.path));
const editorOptions: editor.IStandaloneEditorConstructionOptions = {
  theme: "vs-dark",
  automaticLayout: true,
  minimap: { enabled: false },
  wordWrap: "on",
  renderWhitespace: "boundary",
  tabSize: 2,
};

// --- 生命周期 ---
const handleEditorDidMount = (editorInstance: editor.IStandaloneCodeEditor) => {
  editorRef.value = editorInstance;
  editorRef.value.focus();
};
</script>

<template>
  <div class="h-full w-full">
    <!-- content 加载完毕后再渲染异步组件 -->
    <MonacoEditor
      v-if="content !== null && content !== undefined"
      v-model="editorContent"
      :language="language"
      :options="editorOptions"
      class="h-full w-full"
      @editor-did-mount="handleEditorDidMount"
    />
    <div v-else class="flex h-full w-full items-center justify-center">
      <p>加载文件中……</p>
    </div>
  </div>
</template>
