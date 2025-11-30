<!-- src/components/layout/FileSidebar.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { useUIStore } from "@/features/UI/UI.store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RecursiveFileTree from "@/features/FileSystem/FileTree/RecursiveFileTree.vue";
import { X, Search } from "lucide-vue-next";
import { Input } from "@/components/ui/input";

const store = useUIStore();
const searchQuery = ref("");

const activeTab = ref("character");
let hoverTimer: number | null = null;
const HOVER_TO_SWITCH_DELAY = 300;

const views = [
  { name: "角色", path: "character" },
  { name: "全局", path: "global" },
  { name: "根目录", path: "" },
];

function handleTabDragEnter(tabPath: string) {
  if (hoverTimer) clearTimeout(hoverTimer);
  if (activeTab.value !== tabPath) {
    hoverTimer = window.setTimeout(() => {
      activeTab.value = tabPath;
    }, HOVER_TO_SWITCH_DELAY);
  }
}

function handleTabDragLeave() {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = null;
}
</script>

<template>
  <!--
    修改点：
    1. 移除 v-if
    2. 添加 transition-all 和 duration-300 实现动画
    3. 根据 store.uiState.isFileSidebarOpen 动态切换宽度、透明度和内边距
    4. 添加 overflow-hidden 防止关闭时内容溢出
  -->
  <aside
    class="shrink-0 bg-background flex flex-col transition-all duration-300 ease-in-out overflow-hidden border-r-0"
    :class="[
      store.uiState.isFileSidebarOpen
        ? 'w-64 opacity-100 border-r'
        : 'w-0 opacity-0 border-none',
    ]"
  >
    <!-- 内部容器：设置固定宽度 w-64。
         这样当外部 aside 宽度变小时，内部内容不会被挤压变形，而是被裁切，视觉效果更好。 -->
    <div class="w-64 h-full flex flex-col p-2">
      <!-- 搜索栏 -->
      <div class="relative mb-2 shrink-0">
        <Search
          class="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
        />
        <Input
          v-model="searchQuery"
          type="text"
          placeholder="搜索文件..."
          class="w-full pl-8 h-9"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted"
          title="清除搜索"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- 视图 Tabs -->
      <Tabs
        v-model:model-value="activeTab"
        default-value="character"
        class="flex flex-col h-full overflow-hidden"
      >
        <TabsList class="shrink-0 flex-wrap h-auto">
          <TabsTrigger
            v-for="view in views"
            :key="view.path"
            :value="view.path"
            class="relative data-[state=active]:shadow-none"
            @dragenter.prevent="handleTabDragEnter(view.path)"
            @dragleave.prevent="handleTabDragLeave"
            @dragover.prevent
          >
            <span>{{ view.name }}</span>
          </TabsTrigger>
        </TabsList>

        <div class="overflow-y-auto mt-2 grow">
          <TabsContent
            v-for="view in views"
            :key="`content-${view.path}`"
            :value="view.path"
            class="h-full"
          >
            <RecursiveFileTree
              :root-path="view.path"
              :search-query="searchQuery"
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  </aside>
</template>
