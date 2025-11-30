<!-- src/components/layout/RightSidebar.vue -->
<template>
  <aside
    v-if="uiStore.uiState.isRightSidebarOpen"
    :class="
      cn(
        'w-80 h-full flex flex-col',
        'border-l border-border bg-background text-foreground',
        'transition-all duration-300 ease-in-out relative'
      )
    "
  >
    <!-- 1. 渲染内置组件 -->
    <!-- 使用 v-for 和 v-show 保持组件实例存活 (Keep-Alive 效果) -->
    <template v-for="item in uiStore.bottomBarItems" :key="item.id">
      <div
        v-show="uiStore.uiState.activeRightPanelId === item.id"
        class="flex-1 w-full h-full overflow-hidden flex flex-col"
      >
        <component :is="item.component" v-if="item.component" />
      </div>
    </template>

    <!-- 2. 渲染自定义 Teleport 容器 (Task 2) -->
    <!-- 始终渲染这些 ID，使用 v-show 控制显示，供 <Teleport to="#id"> 使用 -->
    <template v-for="id in uiStore.uiState.customSidebarIds" :key="id">
      <div
        :id="id"
        v-show="uiStore.uiState.activeRightPanelId === id"
        class="flex-1 w-full h-full overflow-hidden flex flex-col custom-teleport-container"
      >
        <!-- 外部组件的内容将 Teleport 到这里 -->
      </div>
    </template>

    <!-- 空状态提示 -->
    <div
      v-if="!hasActiveContent"
      class="flex-1 flex items-center justify-center p-4 text-sm text-muted-foreground"
    >
      <div class="text-center space-y-2">
        <p>暂无内容</p>
        <p class="text-xs opacity-70">没有选择面板或内容为空</p>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUIStore } from "@/features/UI/UI.store";
import { cn } from "@/lib/utils"; // 假设你遵循 shadcn 标准目录结构

const uiStore = useUIStore();

// 辅助判断是否显示内容
const hasActiveContent = computed(() => {
  const activeId = uiStore.uiState.activeRightPanelId;
  const isBuiltIn = uiStore.bottomBarItems.some((i) => i.id === activeId);
  const isCustom = uiStore.uiState.customSidebarIds.includes(activeId);
  return isBuiltIn || isCustom;
});
</script>

<style scoped>
/*
  虽然使用了 flex flex-col，但在某些复杂嵌套下，
  显式的 flex 定义有助于 Teleport 进来的内容撑开高度
*/
.custom-teleport-container {
  display: flex;
  flex-direction: column;
}
</style>
