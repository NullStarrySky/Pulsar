<!-- src/components/layout/FileSidebar.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RecursiveFileTree from "@/features/FileSystem/FileTree/RecursiveFileTree.vue";
import { X, Search } from "lucide-vue-next";
import { Input } from "@/components/ui/input";

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
  <div class="flex flex-col h-full gap-2">
    <!-- 搜索栏 -->
    <div class="relative shrink-0">
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
      <TabsList class="shrink-0 flex-wrap h-auto w-full justify-start">
        <TabsTrigger
          v-for="view in views"
          :key="view.path"
          :value="view.path"
          class="flex-1"
          @dragenter.prevent="handleTabDragEnter(view.path)"
          @dragleave.prevent="handleTabDragLeave"
          @dragover.prevent
        >
          {{ view.name }}
        </TabsTrigger>
      </TabsList>

      <div class="overflow-y-auto mt-2 grow -mx-2 px-2">
        <TabsContent
          v-for="view in views"
          :key="`content-${view.path}`"
          :value="view.path"
          class="h-full mt-0"
        >
          <RecursiveFileTree
            :root-path="view.path"
            :search-query="searchQuery"
          />
        </TabsContent>
      </div>
    </Tabs>
  </div>
</template>
