<!-- src/components/layout/MainLayout.vue -->
<script setup lang="ts">
import LeftSidebar from "./LeftSidebar.vue";
import FileSidebar from "./FileSidebar.vue";
import RightSidebar from "@/components/layout/RightSidebar.vue";
import BottomBar from "@/components/layout/BottomBar.vue";
import Workbench from "./workbench/Workbench.vue";
import { Files, Settings, User } from "lucide-vue-next";
import { useProcessManagerStore } from "@/features/ProcessManager/ProcessManager.store";
import { onMounted } from "vue";

// 初始化进程管理器监听
const processStore = useProcessManagerStore();
onMounted(() => {
  processStore.initializeEventListeners();
});

// 左侧栏配置
const topButtons = [
  { svg: User, onClick: "character", title: "Character" },
  { svg: Files, onClick: "file-browser", title: "Files" },
];

const bottomButtons = [
  { svg: Settings, onClick: "setting", title: "Settings" },
];
</script>

<template>
  <div
    class="flex flex-col h-screen w-full overflow-hidden bg-gray-100 dark:bg-gray-900"
  >
    <!-- 中间主体区域：包含左侧栏、文件树、工作台、右侧栏 -->
    <div class="flex flex-1 overflow-hidden w-full">
      <!-- Activity Bar (最左侧图标栏) -->
      <LeftSidebar :top="topButtons" :bottom="bottomButtons" />

      <!-- Explorer Sidebar (文件树) -->
      <FileSidebar />

      <!-- 主工作台 (编辑器区域) -->
      <Workbench class="flex-1 min-w-0" />

      <!-- 右侧栏 (进程管理等) -->
      <RightSidebar />
    </div>

    <!-- 底部状态栏 -->
    <BottomBar />
  </div>
</template>

<style scoped>
/* 确保子组件正确填充 */
</style>
