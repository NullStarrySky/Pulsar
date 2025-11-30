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

// --- Worker 配置 ---
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
});
const editorRef = shallowRef<editor.IStandaloneCodeEditor | null>(null);
const editorOptions = {
  theme: "vs-dark",
  language: "typescript",
  automaticLayout: true,
  minimap: { enabled: false },
  wordWrap: "on",
} as const;
const typeDefs = `...`; // typeDefs 内容省略

// 还是空的
const handleEditorDidMount = (editorInstance: editor.IStandaloneCodeEditor) => {
  editorRef.value = editorInstance;
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    typeDefs,
    "file:///global.d.ts",
  );
};
</script>

<template>
  <Card class="w-full h-full flex flex-col">
    <CardHeader>
      <CardTitle>{{ props.title }}</CardTitle>
      <CardDescription>{{ props.description }}</CardDescription>
    </CardHeader>
    <CardContent class="grow min-h-0">
      <MonacoEditor
        id="code-editor"
        class="h-full w-full rounded-md border"
        v-model="model"
        language="typescript"
        :options="editorOptions"
        @editor-did-mount="handleEditorDidMount"
      />
    </CardContent>
  </Card>
</template>
