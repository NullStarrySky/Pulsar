<!-- src/components/SchemaRenderer/content-elements/JSCodeEditor.vue -->
<script setup lang="ts">
import { shallowRef } from "vue";
import type { editor } from "monaco-editor";
import MonacoEditor from "@/components/MonacoEditor.vue";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// --- Worker 配置 (保持原样) ---
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

(self as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

const model = defineModel<string>({ required: true });
const props = defineProps({
  title: { type: String, default: "JavaScript 代码编辑器" },
  description: { type: String, default: "在这里编写和编辑您的代码。" },
  // 添加一个 props 来接收外部传入的 class，虽然 Vue 的透传特性会自动处理，
  // 但明确定义或在 template 中处理默认值会更稳健
});

const editorRef = shallowRef<editor.IStandaloneCodeEditor | null>(null);
const editorOptions = {
  theme: "vs-dark",
  language: "typescript",
  automaticLayout: true,
  minimap: { enabled: false },
  wordWrap: "on",
  scrollBeyondLastLine: false, // 建议：防止滚动过多空白
} as const;

const typeDefs = `...`;

const handleEditorDidMount = (editorInstance: editor.IStandaloneCodeEditor) => {
  editorRef.value = editorInstance;
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    typeDefs,
    "file:///global.d.ts"
  );
};
</script>

<template>
  <Card class="w-full flex flex-col h-full">
    <CardHeader>
      <CardTitle>{{ props.title }}</CardTitle>
      <CardDescription>{{ props.description }}</CardDescription>
    </CardHeader>
    <!-- grow 确保内容区域填满 Card 的剩余空间 -->
    <CardContent class="grow p-0 overflow-hidden relative min-h-[400px]">
      <!-- 添加 absolute inset-0 确保 monaco 能够撑满 CardContent -->
      <div class="absolute inset-0 p-6 pt-0">
        <MonacoEditor
          id="code-editor"
          class="h-full w-full rounded-md border"
          v-model="model"
          language="typescript"
          :options="editorOptions"
          @editor-did-mount="handleEditorDidMount"
        />
      </div>
    </CardContent>
  </Card>
</template>
