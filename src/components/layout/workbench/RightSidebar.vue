<template>
  <aside
    :class="
      cn(
        'shrink-0 bg-background flex flex-col overflow-hidden',
        'transition-all duration-300 ease-in-out',
        // 动态控制宽度、透明度和边框
        uiStore.uiState.isRightSidebarOpen
          ? 'w-80 opacity-100 border-l border-border'
          : 'w-0 opacity-0 border-none'
      )
    "
  >
    <!-- 固定宽度的内部容器，防止过渡时内容被挤压 -->
    <div class="w-80 h-full flex flex-col relative text-foreground">
      <!-- 1. 渲染内置组件 -->
      <template v-for="item in uiStore.bottomBarItems" :key="item.id">
        <div
          v-show="uiStore.uiState.activeRightPanelId === item.id"
          class="flex-1 w-full h-full overflow-hidden flex flex-col"
        >
          <component :is="item.component" v-if="item.component" />
        </div>
      </template>

      <!-- 2. 渲染自定义 Teleport 容器 -->
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
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUIStore } from "@/features/UI/UI.store";
import { cn } from "@/lib/utils";

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
.custom-teleport-container {
  display: flex;
  flex-direction: column;
}
</style>
