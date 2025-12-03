<script setup lang="ts">
import {
  useFileSystemStore,
  VirtualFile,
} from "@/features/FileSystem/FileSystem.store";
import WorkbenchTabs from "./WorkbenchTabs.vue";
import FileRenderer from "@/schema/FileRenderer.vue";
import RightSidebar from "@/components/layout/RightSidebar.vue";
import { useUIStore } from "@/features/UI/UI.store";

const uiStore = useUIStore();
const fs = useFileSystemStore();

// --- 拖拽到主区域的处理器 ---
function handleDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

function handleDropOnWorkbench(event: DragEvent) {
  event.preventDefault();
  const path = event.dataTransfer?.getData("text/plain");

  if (!path) return;

  const node = fs.resolvePath(path);

  if (node && node instanceof VirtualFile) {
    uiStore.openFile(path);
  }
}
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden">
    <WorkbenchTabs v-if="!uiStore.isSingle" />

    <div class="flex flex-1 min-h-0">
      <!-- 左侧：核心编辑区域 -->
      <main
        class="flex flex-1 flex-col bg-background min-w-0 overflow-hidden"
        @dragover.prevent="handleDragOver"
        @drop.prevent="handleDropOnWorkbench"
      >
        <!-- WorkbenchTabs 已被移出 -->

        <template v-if="uiStore.uiState.openedFiles.length > 0">
          <div class="flex-1 overflow-auto">
            <div v-show="uiStore.uiState.activeFile" class="w-full h-full p-4">
              <FileRenderer
                v-if="uiStore.uiState.activeFile"
                :key="uiStore.uiState.activeFile"
                :path="uiStore.uiState.activeFile"
              />
            </div>
          </div>
        </template>
        <template v-else>
          <div
            class="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border m-4"
          >
            <div class="text-center">
              <h2 class="text-2xl font-semibold tracking-tight">工作台为空</h2>
              <p class="text-muted-foreground">
                从左侧文件树中打开一个文件以开始。
              </p>
            </div>
          </div>
        </template>
      </main>

      <RightSidebar />
    </div>
  </div>
</template>
