<!-- src/components/SchemaRenderer/content-elements/JSCodeEditor.vue -->
<script setup lang="ts">
import { defineAsyncComponent, shallowRef } from "vue";
import type { editor } from "monaco-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// 配合 loadingComponent 可以在加载时显示占位符
const MonacoEditor = defineAsyncComponent({
  loader: () => import("@/components/MonacoEditor.vue"),
  loadingComponent: {
    template:
      '<div class="h-full w-full flex items-center justify-center text-muted-foreground">编辑器资源加载中...</div>',
  },
  delay: 200, // 延迟显示 loading，避免闪烁
});

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
  scrollBeyondLastLine: false,
} as const;

const typeDefs = `...`;

const handleEditorDidMount = async (
  editorInstance: editor.IStandaloneCodeEditor
) => {
  editorRef.value = editorInstance;

  const { default: monaco } = await import("@/utils/monacoCore");

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
