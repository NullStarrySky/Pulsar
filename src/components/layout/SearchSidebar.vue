<!-- src/components/layout/SearchSidebar.vue -->
<script setup lang="ts">
import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import {
  CaseSensitive,
  WholeWord,
  Regex,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "lucide-vue-next";
import { useUIStore } from "@/features/UI/UI.store";
import { useFileSystemStore } from "@/features/FileSystem";

// 简单防抖函数
function debounce(fn: Function, delay: number) {
  let timeoutId: any;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

const uiStore = useUIStore();
const query = ref("");
const isCaseSensitive = ref(false);
const isWholeWord = ref(false);
const isRegex = ref(false);
const isLoading = ref(false);

interface SearchResult {
  path: string;
  result: string[];
  isOpen?: boolean; // 前端辅助状态：折叠/展开
}

const results = ref<SearchResult[]>([]);

const performSearch = async () => {
  const fsStore = useFileSystemStore();

  if (!query.value.trim()) {
    results.value = [];
    return;
  }

  isLoading.value = true;
  try {
    // 假设你有一个方法获取当前工作根目录，这里暂时用 "/" 或从 store 获取
    // 实际项目中，你需要传入 fsStore.rootPath 或者类似的东西
    const targetDir = fsStore.appDataPath;

    const data = await invoke<SearchResult[]>("search_in_files", {
      keyword: query.value,
      config: {
        case_sensitive: isCaseSensitive.value,
        whole_word: isWholeWord.value,
        is_regex: isRegex.value,
        target_dir: targetDir,
      },
    });

    // 默认展开所有结果
    results.value = data.map((item) => ({ ...item, isOpen: true }));
  } catch (e) {
    console.error("Search failed:", e);
  } finally {
    isLoading.value = false;
  }
};

const debouncedSearch = debounce(performSearch, 500);

watch([query, isCaseSensitive, isWholeWord, isRegex], () => {
  debouncedSearch();
});

const toggleFile = (index: number) => {
  results.value[index].isOpen = !results.value[index].isOpen;
};

const openFile = (filePath: string) => {
  uiStore.openFile(filePath);
  // 可选：如果是移动端，可能需要关闭侧栏
};

// 格式化路径显示（只显示文件名）
const getFileName = (path: string) => path.split(/[/\\]/).pop();
</script>

<template>
  <div class="flex flex-col h-full bg-sidebar text-sidebar-foreground">
    <!-- Header / Input Area -->
    <div class="p-4 border-b border-border">
      <h2
        class="text-sm font-semibold mb-2 uppercase tracking-wider text-muted-foreground"
      >
        搜索
      </h2>
      <div class="relative">
        <input
          v-model="query"
          type="text"
          placeholder="搜索"
          class="w-full bg-input border border-input rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <!-- Search Options Toggles -->
        <div class="flex gap-1 mt-2 justify-end">
          <button
            @click="isCaseSensitive = !isCaseSensitive"
            :class="[
              'p-1 rounded hover:bg-muted',
              isCaseSensitive
                ? 'bg-muted text-primary'
                : 'text-muted-foreground',
            ]"
            title="匹配大小写"
          >
            <CaseSensitive class="w-4 h-4" />
          </button>
          <button
            @click="isWholeWord = !isWholeWord"
            :class="[
              'p-1 rounded hover:bg-muted',
              isWholeWord ? 'bg-muted text-primary' : 'text-muted-foreground',
            ]"
            title="全字匹配"
          >
            <WholeWord class="w-4 h-4" />
          </button>
          <button
            @click="isRegex = !isRegex"
            :class="[
              'p-1 rounded hover:bg-muted',
              isRegex ? 'bg-muted text-primary' : 'text-muted-foreground',
            ]"
            title="使用正则表达式"
          >
            <Regex class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Results Area -->
    <div class="flex-1 overflow-y-auto p-2">
      <div v-if="isLoading" class="flex justify-center py-4">
        <Loader2 class="w-5 h-5 animate-spin text-muted-foreground" />
      </div>

      <div
        v-else-if="results.length === 0 && query"
        class="text-center py-4 text-sm text-muted-foreground"
      >
        无结果
      </div>

      <div v-else class="space-y-1">
        <div v-for="(file, idx) in results" :key="file.path">
          <!-- File Header -->
          <div
            @click="toggleFile(idx)"
            class="flex items-center gap-1 cursor-pointer hover:bg-accent/50 rounded px-1 py-1 text-sm font-medium select-none"
          >
            <component
              :is="file.isOpen ? ChevronDown : ChevronRight"
              class="w-4 h-4 text-muted-foreground"
            />
            <span class="truncate" :title="file.path">{{
              getFileName(file.path)
            }}</span>
            <span
              class="ml-auto text-xs text-muted-foreground bg-muted px-1.5 rounded-full"
              >{{ file.result.length }}</span
            >
          </div>

          <!-- Matches -->
          <div
            v-if="file.isOpen"
            class="ml-4 border-l border-border pl-2 mt-1 space-y-0.5"
          >
            <div
              v-for="(match, mIdx) in file.result"
              :key="mIdx"
              @click="openFile(file.path)"
              class="text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer rounded px-1 py-0.5 truncate font-mono"
              :title="match"
            >
              {{ match }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
