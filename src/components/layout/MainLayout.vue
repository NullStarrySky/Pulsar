<!-- src/components/layout/MainLayout.vue -->
<script setup lang="ts">
import LeftSidebar from "./LeftSidebar.vue";
import SidePanelWrapper from "./SidePanelWrapper.vue"; // 引入封装的外壳
import FileSidebar from "./FileSidebar.vue";
import CharacterSidebar from "./CharacterSidebar.vue"; // 引入新组件
import BottomBar from "@/components/layout/BottomBar.vue";
import Workbench from "./workbench/Workbench.vue";
import { Files, PlugIcon, Settings, User, FlaskConical } from "lucide-vue-next";
import { useProcessManagerStore } from "@/features/ProcessManager/ProcessManager.store";
import { useUIStore } from "@/features/UI/UI.store";
import { onMounted } from "vue";

const processStore = useProcessManagerStore();
const uiStore = useUIStore();

onMounted(() => {
  processStore.initializeEventListeners();
});

// 调整 topButtons 的 action
// "onClick" 字符串现在对应 Store 中的 SidebarView 类型
const topButtons = [
  { svg: User, onClick: "character", title: "Character Library" },
  { svg: Files, onClick: "files", title: "File Explorer" },
];

const bottomButtons = [
  { svg: FlaskConical, onClick: "$test", title: "testComponent" },
  {
    svg: PlugIcon,
    onClick: "modelConfig.[modelConfig].json",
    title: "Model Config",
  },
  { svg: Settings, onClick: "setting.[setting].json", title: "Settings" },
];
</script>

<template>
  <div
    class="flex flex-col h-screen w-full overflow-hidden bg-gray-100 dark:bg-gray-900"
  >
    <!-- 中间主体区域 -->
    <div class="flex flex-1 overflow-hidden w-full">
      <!-- Activity Bar -->
      <LeftSidebar :top="topButtons" :bottom="bottomButtons" />

      <!-- 通用侧边栏容器 -->
      <SidePanelWrapper>
        <!-- 根据 Store 状态显示不同内容 -->
        <FileSidebar v-if="uiStore.uiState.leftSidebarView === 'files'" />
        <CharacterSidebar
          v-else-if="uiStore.uiState.leftSidebarView === 'character'"
        />
      </SidePanelWrapper>

      <!-- 主工作台 -->
      <Workbench class="flex-1 min-w-0" />
    </div>

    <!-- 底部状态栏 -->
    <BottomBar />
  </div>
</template>
