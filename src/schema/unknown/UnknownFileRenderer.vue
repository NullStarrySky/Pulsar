<!-- src/schema/unknown/UnknownFileRenderer.vue -->
<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { extname } from "@tauri-apps/api/path";
import MediaViewer from "./components/MediaViewer.vue";
import TextEditor from "./components/TextEditor.vue";
import { Skeleton } from "@/components/ui/skeleton";

// --- 1. Props & State ---
const props = defineProps<{
  path: string;
}>();

const viewType = ref<"loading" | "media" | "text">("loading");

// --- 2. Logic ---
// 根据文件扩展名决定渲染哪个组件
watchEffect(async () => {
  viewType.value = "loading";
  if (!props.path) {
    viewType.value = "text"; // 或者一个错误状态
    return;
  }

  try {
    const extension = (await extname(props.path)).toLowerCase();
    const mediaExtensions = [
      // Images
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".bmp",
      ".svg",
      // Videos
      ".mp4",
      ".webm",
      ".ogg",
      ".mov",
      // Audios
      ".mp3",
      ".wav",
      ".flac",
      ".aac",
    ];

    if (mediaExtensions.includes(extension)) {
      viewType.value = "media";
    } else {
      // 默认回退到文本编辑器
      viewType.value = "text";
    }
  } catch (e) {
    console.error(
      `[UnknownEditor] Failed to determine view type for ${props.path}`,
      e
    );
    // 发生错误时，也回退到文本编辑器，以便用户至少能看到某些内容
    viewType.value = "text";
  }
});
</script>

<template>
  <div class="h-full w-full">
    <div v-if="viewType === 'loading'" class="space-y-4 p-4">
      <Skeleton class="h-10 w-1/2" />
      <Skeleton class="h-full w-full" />
    </div>
    <MediaViewer v-else-if="viewType === 'media'" :path="props.path" />
    <TextEditor v-else :path="props.path" />
  </div>
</template>
