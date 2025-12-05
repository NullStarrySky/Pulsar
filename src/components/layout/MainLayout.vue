<script setup lang="ts">
import LeftSidebar from "./LeftSidebar.vue";
import SidePanelWrapper from "./SidePanelWrapper.vue";
import FileSidebar from "./FileSidebar.vue";
import CharacterSidebar from "./CharacterSidebar.vue";
import BottomBar from "@/components/layout/BottomBar.vue";
import Workbench from "./workbench/Workbench.vue";
import { Files, PlugIcon, Settings, User, FlaskConical } from "lucide-vue-next";
import { useProcessManagerStore } from "@/features/ProcessManager/ProcessManager.store";
import { useUIStore } from "@/features/UI/UI.store";
import { useCustomPageStore } from "@/features/CustomPage/CustomPage.store"; // 引入 store
import { onMounted } from "vue";

const processStore = useProcessManagerStore();
const uiStore = useUIStore();
const customPageStore = useCustomPageStore(); // 初始化 store

onMounted(async () => {
  processStore.initializeEventListeners();
  await customPageStore.init(); // 初始化自定义页面数据
});

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
    <div class="flex flex-1 overflow-hidden w-full">
      <!-- 传入 customPages 参数 -->
      <LeftSidebar
        :top="topButtons"
        :bottom="bottomButtons"
        :custom-pages="customPageStore.visiblePages"
      />

      <SidePanelWrapper>
        <FileSidebar v-if="uiStore.uiState.leftSidebarView === 'files'" />
        <CharacterSidebar
          v-else-if="uiStore.uiState.leftSidebarView === 'character'"
        />
      </SidePanelWrapper>

      <Workbench class="flex-1 min-w-0" />
    </div>

    <BottomBar />
  </div>
</template>
