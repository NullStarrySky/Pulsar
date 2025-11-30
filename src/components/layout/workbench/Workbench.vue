<!-- src/components/layout/workbench/Workbench.vue -->
<script setup lang="ts">
import {
  useFileSystemStore,
  isFolderNode,
} from "@/features/FileSystem/FileSystem.store";
import WorkbenchTabs from "./WorkbenchTabs.vue";
import FileRenderer from "@/schema/FileRenderer.vue";
import { useUIStore } from "@/features/UI/UI.store";

const uiStore = useUIStore();
const fs = useFileSystemStore();

// --- 拖拽到主区域的处理器 ---
function handleDragOver(event: DragEvent) {
  // 必须阻止默认行为，才能触发 drop 事件
  event.preventDefault();
  if (event.dataTransfer) {
    // 提供视觉反馈
    event.dataTransfer.dropEffect = "copy";
  }
}

function handleDropOnWorkbench(event: DragEvent) {
  event.preventDefault();
  const path = event.dataTransfer?.getData("text/plain");

  if (!path) return;

  // 检查拖拽的是否是文件（而不是文件夹）
  const node = fs.getNodeByPath(fs.fileStructure, path);
  if (node && !isFolderNode(node)) {
    uiStore.openFile(path);
  }
}
</script>

<template>
  <!-- --- 在主容器上添加拖放事件监听 --- -->
  <main
    class="flex h-full flex-1 flex-col bg-background min-w-0"
    @dragover.prevent="handleDragOver"
    @drop.prevent="handleDropOnWorkbench"
  >
    <!-- 不再需要传递 props 和监听 events -->
    <WorkbenchTabs v-if="!uiStore.isSingle" />

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
</template>
