<!-- src/schema/unknown/components/MediaViewer.vue -->
<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { appDataDir, join, basename } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-vue-next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

// --- 1. Props & State ---
const props = defineProps<{
  path: string;
}>();

const isLoading = ref(true);
const mediaSrc = ref("");
const error = ref<string | null>(null);
const fileName = ref("");

// --- 2. Computed Properties ---
const mediaType = computed(() => {
  const extension = props.path.slice(props.path.lastIndexOf(".")).toLowerCase();
  if (!extension) return "unsupported";

  if (
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(
      extension,
    )
  ) {
    return "image";
  }
  if ([".mp4", ".webm", ".ogg", ".mov"].includes(extension)) {
    return "video";
  }
  if ([".mp3", ".wav", ".flac", ".aac"].includes(extension)) {
    return "audio";
  }
  return "unsupported";
});

// --- 3. Logic ---
/**
 * @description 根据文件路径生成可被 Webview 使用的 URL
 */
const generateMediaSrc = async (path: string) => {
  isLoading.value = true;
  error.value = null;

  if (!path || mediaType.value === "unsupported") {
    error.value = "不支持的媒体类型或无效的路径。";
    isLoading.value = false;
    return;
  }

  try {
    // 直接使用 Tauri API 来构建 src，这与 useFileSystemProxy 中的 `toSrc` 逻辑一致
    const appDir = await appDataDir();
    const fullPath = await join(appDir, path);
    mediaSrc.value = convertFileSrc(fullPath);
    fileName.value = await basename(path);
  } catch (e) {
    console.error(`[MediaViewer] Failed to generate source for ${path}`, e);
    error.value = "无法加载媒体文件资源路径。";
  } finally {
    isLoading.value = false;
  }
};

// --- 4. Watcher ---
// 监听路径变化，重新生成 URL
watch(
  () => props.path,
  (newPath) => {
    generateMediaSrc(newPath);
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full w-full items-center justify-center bg-muted/40 p-4">
    <Card class="flex max-h-full w-full max-w-4xl flex-col">
      <CardHeader>
        <CardTitle v-if="!isLoading" class="truncate">{{ fileName }}</CardTitle>
        <Skeleton v-else class="h-8 w-1/2" />
      </CardHeader>
      <CardContent
        class="flex grow items-center justify-center overflow-hidden"
      >
        <!-- Loading State -->
        <div v-if="isLoading" class="h-full w-full p-4">
          <Skeleton class="h-full w-full" />
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="w-full">
          <Alert variant="destructive">
            <AlertCircle class="h-4 w-4" />
            <AlertTitle>加载失败</AlertTitle>
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
        </div>

        <!-- Media Content -->
        <template v-else-if="mediaType === 'image'">
          <img
            :src="mediaSrc"
            :alt="fileName"
            class="max-h-full max-w-full object-contain"
            @error="error = '图片加载失败，文件可能已损坏或不存在。'"
          />
        </template>
        <template v-else-if="mediaType === 'video'">
          <video
            :src="mediaSrc"
            controls
            class="max-h-full max-w-full"
            @error="error = '视频加载失败，文件可能已损坏或格式不受支持。'"
          ></video>
        </template>
        <template v-else-if="mediaType === 'audio'">
          <audio
            :src="mediaSrc"
            controls
            class="w-full"
            @error="error = '音频加载失败，文件可能已损坏或格式不受支持。'"
          ></audio>
        </template>
        <template v-else>
          <Alert variant="destructive">
            <AlertCircle class="h-4 w-4" />
            <AlertTitle>不支持的媒体类型</AlertTitle>
            <AlertDescription>
              无法预览此文件。 ({{ path.slice(path.lastIndexOf(".")) }})
            </AlertDescription>
          </Alert>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
