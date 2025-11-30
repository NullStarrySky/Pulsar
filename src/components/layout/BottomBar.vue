<!-- src/components/layout/BottomBar.vue -->
<template>
  <div
    class="h-10 border-t bg-background flex items-center px-2 gap-1 text-muted-foreground"
  >
    <!-- 1. 将扩展信息区域移到左侧 -->
    <!-- 外部组件可以使用 <Teleport to="#bottom-bar-extra"> -->
    <div id="bottom-bar-extra" class="flex items-center gap-2 text-xs"></div>

    <!-- 2. 添加弹性占位符，将右侧的内容顶到最右边 -->
    <div class="flex-1" />

    <!-- 3. 分隔符 -->
    <Separator orientation="vertical" class="h-4 mx-2" />

    <!-- 4. 渲染内置项的图标（现在位于最右侧） -->
    <Button
      v-for="item in uiStore.bottomBarItems"
      :key="item.id"
      variant="ghost"
      size="icon"
      :class="[
        'h-7 w-7',
        uiStore.uiState.activeRightPanelId === item.id
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted hover:text-foreground',
      ]"
      @click="uiStore.toggleRightSidebar(item.id)"
      :title="item.name"
    >
      <component :is="item.icon" v-if="item.icon" class="w-4 h-4" />
      <span v-else class="text-xs font-medium">{{
        item.name.substring(0, 2)
      }}</span>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { useUIStore } from "@/features/UI/UI.store";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const uiStore = useUIStore();
</script>
