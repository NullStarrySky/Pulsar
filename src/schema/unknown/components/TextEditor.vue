<!-- src/schema/unknown/components/TextEditor.vue -->
<script setup lang="ts">
import { shallowRef, computed, type Ref } from "vue";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent.ts";
import MonacoEditor from "@/components/MonacoEditor.vue";
import type { editor } from "monaco-editor";

// --- Worker 配置 ---
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

(self as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less")
      return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor")
      return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

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
    <!-- 将 v-model 绑定到新的计算属性 editorContent -->
    <MonacoEditor
      v-if="content !== null && content !== undefined"
      v-model="editorContent"
      :language="language"
      :options="editorOptions"
      class="h-full w-full"
      @editor-did-mount="handleEditorDidMount"
    />
    <div v-else class="flex h-full w-full items-center justify-center">
      <!-- 加载状态或错误状态 -->
      <p>加载文件中……</p>
    </div>
  </div>
</template>
