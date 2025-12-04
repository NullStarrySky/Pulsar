<template>
  <!-- 1. 渲染到底栏扩展区域 (左侧信息栏) -->
  <Teleport to="#bottom-bar-extra">
    <!-- 使用 span 包裹以保证 flex 布局的稳定性 -->
    <span class="flex items-center gap-2" v-if="$slots.bottom">
      <slot name="bottom" />
    </span>
  </Teleport>

  <!-- 2. 渲染到侧栏区域 -->
  <!-- 只有当 store 中已经注册了该 ID，DOM 节点存在后才进行 Teleport -->
  <Teleport :to="`#${id}`" v-if="isReady && $slots.sidebar">
    <div class="h-full w-full flex flex-col">
      <slot name="sidebar" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, computed, type Component } from "vue";
import { useUIStore } from "@/features/UI/UI.store";

// 定义 Props
const props = defineProps<{
  /** 唯一标识符，用于侧栏 ID 和底栏按钮 ID */
  id: string;
  /** 底栏按钮悬停显示的名称 */
  name: string;
  /** 底栏按钮显示的图标组件 */
  icon?: Component;
}>();

const uiStore = useUIStore();

// 检查是否准备好 Teleport (确保 DOM 节点 ID 已在 store 中注册)
const isReady = computed(() => {
  return uiStore.uiState.customSidebarIds.includes(props.id);
});

onMounted(() => {
  // 1. 注册侧栏容器 ID
  // 这会触发 RightSidebar.vue 中的 v-for 渲染出一个 <div :id="props.id">
  if (!uiStore.uiState.customSidebarIds.includes(props.id)) {
    uiStore.uiState.customSidebarIds.push(props.id);
  }

  // 2. 注册底栏按钮
  // 使用 store 提供的 addSidebarItem 方法
  // 注意：component 字段留空，因为我们使用 Teleport 手动控制渲染位置，
  // 而不是让 RightSidebar 使用 <component :is> 动态渲染
  uiStore.addSidebarItem({
    id: props.id,
    name: props.name,
    icon: props.icon,
    component: undefined,
  });
});

onUnmounted(() => {
  // 1. 清理侧栏容器 ID
  const idIndex = uiStore.uiState.customSidebarIds.indexOf(props.id);
  if (idIndex > -1) {
    uiStore.uiState.customSidebarIds.splice(idIndex, 1);
  }

  // 2. 清理底栏按钮
  // 注意：bottomBarItems 是 shallowRef，最好重新赋值以触发响应性
  uiStore.bottomBarItems = uiStore.bottomBarItems.filter(
    (item) => item.id !== props.id
  );

  // 3. 如果当前激活的是这个面板，关闭侧栏或切换回默认
  if (uiStore.uiState.activeRightPanelId === props.id) {
    uiStore.uiState.isRightSidebarOpen = false;
  }
});
</script>
