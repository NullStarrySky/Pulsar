<!-- src/App.vue -->
<script setup lang="ts">
import { onMounted } from "vue";
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store";
import MainLayout from "@/components/layout/MainLayout.vue";
import { useProcessManagerStore } from "./features/ProcessManager/ProcessManager.store";
import {
  Notivue,
  NotivueSwipe,
  Notification,
  pastelTheme,
  outlinedIcons,
  // push,
} from "notivue";
import { getCurrentWindow } from "@tauri-apps/api/window";

const fsStore = useFileSystemStore();
// 获取 process manager store 实例
const processStore = useProcessManagerStore();

const appWindow = getCurrentWindow();

onMounted(async () => {
  try {
    // 1. 初始化事件监听
    processStore.initializeEventListeners();
    console.log("[App] ProcessManager event listeners initialized.");

    // 2. 初始化文件系统
    fsStore.init();
    console.log("[App] FileSystem Store initialized.");
  } catch (error) {
    console.error("Failed during app initialization:", error);
  }
  requestAnimationFrame(() => {
    window.performance.mark("appLoaded");
    const measure = window.performance.measure(
      "Startup Duration",
      "appStart",
      "appLoaded"
    );
    console.log(`启动耗时: ${measure.duration.toFixed(2)}ms`);
    appWindow.show();
    appWindow.setFocus();
  });
});
</script>

<template>
  <MainLayout />

  <!-- 全局通知系统 -->
  <Notivue v-slot="item">
    <NotivueSwipe :item="item">
      <Notification :item="item" :theme="pastelTheme" :icons="outlinedIcons">
      </Notification>
    </NotivueSwipe>
  </Notivue>
</template>
