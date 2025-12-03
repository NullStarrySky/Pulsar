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
 * 1. 如果以 $ 开头，移除 $ 并直接返回 (内置组件)
 * 2. 否则，从路径中提取基本文件名，并移除扩展名和语义标签
 */
function getFileName(path: string): string {
  if (!path) return "";

  // 1. 处理内置组件 (例如 $character -> character)
  if (path.startsWith("$")) {
    return path.substring(1);
  }

  // 2. 处理常规文件
  const name = path.split(/[\\/]/).pop() || path;
  const lastDotIndex = name.lastIndexOf(".");
  const nameWithoutExt =
    lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;

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

<!-- template 部分保持不变，只需确保使用的是新的 getFileName 即可 -->
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
          <!-- 这里使用更新后的 getFileName -->
          <span>{{ getFileName(path) }}</span>
          <button
            class="rounded-full p-0.5 hover:bg-muted-foreground/20 transition-opacity"
            @click="handleClose($event, path)"
            :title="`关闭: ${getFileName(path)}`"
          >
            <XIcon class="h-3.5 w-3.5" />
          </button>
        </Button>
      </template>
    </draggable>

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
.overflow-x-auto::-webkit-scrollbar {
  display: none;
}
.overflow-x-auto {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
</style>
