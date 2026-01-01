<script setup lang="ts">
// <!-- src/App.vue -->
import { onMounted } from "vue";
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store";
import MainLayout from "@/components/layout/MainLayout.vue";
import { useProcessManagerStore } from "./features/ProcessManager/ProcessManager.store";
import { useCustomPageStore } from "./features/CustomPage/CustomPage.store";
import {
	Notivue,
	NotivueSwipe,
	Notification,
	pastelTheme,
	outlinedIcons,
	// push,
} from "notivue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUIStore } from "./features/UI/UI.store";

const fsStore = useFileSystemStore();
// 获取 process manager store 实例
const processStore = useProcessManagerStore();
const uiStore = useUIStore();

const customPageStore = useCustomPageStore();

const appWindow = getCurrentWindow();

async function setupStores() {
	// 1. 初始化事件监听
	await processStore.initializeEventListeners();
	console.log("[App] ProcessManager event listeners initialized.");

	// 2. 初始化文件系统
	await fsStore.init();
	console.log("[App] FileSystem Store initialized.");

	// 初始化 UI Store
	await uiStore.init();
	console.log("[App] UI Store initialized.");

	// 3. 初始化自定义页面
	await customPageStore.init();
	console.log("[App] CustomPage Store initialized.");
}

onMounted(() => {
	// 这里不需要await，保证store的初始化顺序就好
	setupStores().catch((error) => {
		console.error("Failed during app initialization:", error);
	});
	requestAnimationFrame(() => {
		window.performance.mark("appLoaded");
		const measure = window.performance.measure(
			"Startup Duration",
			"appStart",
			"appLoaded",
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
