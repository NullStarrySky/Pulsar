<!-- src/components/layout/SidePanelWrapper.vue -->
<script setup lang="ts">
import { useUIStore } from "@/features/UI/UI.store";

const uiStore = useUIStore();
</script>

<template>
  <aside
    class="shrink-0 bg-background flex flex-col transition-all duration-300 ease-in-out overflow-hidden border-r-0"
    :class="[
      uiStore.isLeftSidebarOpen
        ? 'w-64 opacity-100 border-r'
        : 'w-0 opacity-0 border-none',
    ]"
  >
    <!-- 固定宽度的内部容器，防止内容在过渡时被挤压 -->
    <div class="w-64 h-full flex flex-col p-2 overflow-hidden">
      <slot></slot>
    </div>
  </aside>
</template>
