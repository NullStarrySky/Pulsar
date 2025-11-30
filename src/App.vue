<!-- src/App.vue -->
<script setup lang="ts">
import { onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
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

const fsStore = useFileSystemStore();
// 获取 process manager store 实例
const processStore = useProcessManagerStore();

onMounted(async () => {
  try {
    // 1. 初始化事件监听
    await processStore.initializeEventListeners();
    console.log("[App] ProcessManager event listeners initialized.");

    // 2. 初始化文件系统
    await fsStore.init();
    console.log("[App] FileSystem Store initialized.");

    await invoke("initialize_sidecar");
    console.log("[App] Sidecar initialized successfully.");
  } catch (error) {
    console.error("Failed during app initialization:", error);
  }
});
</script>

<template>
  <!-- 全局通知系统 -->
  <Notivue v-slot="item">
    <NotivueSwipe :item="item">
      <Notification :item="item" :theme="pastelTheme" :icons="outlinedIcons">
      </Notification>
    </NotivueSwipe>
  </Notivue>

  <template v-if="fsStore.isInitialized">
    <MainLayout />
  </template>
  <template v-else>
    <div
      class="flex h-screen w-full items-center justify-center bg-background text-foreground"
    >
      <p>正在初始化应用核心服务...</p>
    </div>
  </template>
</template>
