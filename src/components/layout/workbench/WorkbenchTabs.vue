<!-- src/components/layout/workbench/WorkbenchTabs.vue -->
<script setup lang="ts">
import { computed } from "vue";
import draggable from "vuedraggable";
import { Button } from "@/components/ui/button";
import { XIcon, Minus, Square, X } from "lucide-vue-next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUIStore } from "@/features/UI/UI.store";

const uiStore = useUIStore();

const appWindow = getCurrentWindow();
const minimizeWindow = () => appWindow.minimize();
const toggleMaximizeWindow = () => appWindow.toggleMaximize();
const closeWindow = () => appWindow.close();

const dragOptions = computed(() => ({
  animation: 200,
  group: "tabs",
  ghostClass: "ghost-tab",
  handle: ".drag-handle",
}));

/**
 * 从完整路径中获取并解析文件名。
 * 1. 从路径中提取基本文件名 (e.g., "file.[type].json")
 * 2. 移除文件扩展名 (e.g., "file.[type]")
 * 3. 移除语义化后缀 (e.g., "file")
 * @param path 文件路径
 * @returns 清理后的显示名称
 */
function getFileName(path: string): string {
  if (!path) return "";
  // 1. 获取基本文件名
  const name = path.split(/[\\/]/).pop() || path;

  // 2. 移除文件扩展名
  const lastDotIndex = name.lastIndexOf(".");
  const nameWithoutExt =
    lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;

  // 3. 移除语义化后缀
  const semanticMatch = nameWithoutExt.match(/\.\[(.*?)\]$/);
  const displayName = semanticMatch
    ? nameWithoutExt.substring(0, semanticMatch.index)
    : nameWithoutExt;

  return displayName;
}

function handleClose(event: MouseEvent, path: string) {
  event.stopPropagation();
  uiStore.closeFile(path);
}
</script>

<template>
  <nav
    class="shrink-0 border-b border-border bg-background flex justify-between"
    aria-label="Opened files"
    data-tauri-drag-region
  >
    <draggable
      :list="uiStore.uiState.openedFiles"
      :item-key="(file: string) => file"
      class="flex-1 flex items-center gap-1 p-1 overflow-x-auto"
      v-bind="dragOptions"
      data-tauri-drag-region
    >
      <template #item="{ element: path }">
        <Button
          :variant="uiStore.uiState.activeFile === path ? 'secondary' : 'ghost'"
          size="sm"
          class="h-8 gap-2 px-3 relative group drag-handle cursor-grab"
          @click="uiStore.setActiveFile(path)"
          @click.middle="handleClose($event, path)"
        >
          <!-- 这里现在会显示清理后的名称 -->
          <span>{{ getFileName(path) }}</span>
          <button
            class="rounded-full p-0.5 hover:bg-muted-foreground/20 transition-opacity"
            @click="handleClose($event, path)"
            :title="`关闭文件: ${getFileName(path)}`"
          >
            <XIcon class="h-3.5 w-3.5" />
          </button>
        </Button>
      </template>
    </draggable>

    <!-- 这个容器添加了 shrink-0 (flex-shrink: 0)，确保它不会被挤压 -->
    <div class="flex items-center shrink-0">
      <button
        @click="minimizeWindow"
        class="inline-flex justify-center items-center h-8 w-8 hover:bg-muted rounded-none"
        title="最小化"
      >
        <Minus class="h-4 w-4" />
      </button>
      <button
        @click="toggleMaximizeWindow"
        class="inline-flex justify-center items-center h-8 w-8 hover:bg-muted rounded-none"
        title="最大化"
      >
        <Square class="h-4 w-4" />
      </button>
      <button
        @click="closeWindow"
        class="inline-flex justify-center items-center h-8 w-8 hover:bg-destructive hover:text-destructive-foreground rounded-none"
        title="关闭"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </nav>
</template>

<style>
.ghost-tab {
  opacity: 0.5;
  background: hsl(var(--accent));
  border-radius: var(--radius-md);
}

/* 隐藏滚动条以优化 UI */
.overflow-x-auto::-webkit-scrollbar {
  display: none;
}

.overflow-x-auto {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE, Edge */
}
</style>
