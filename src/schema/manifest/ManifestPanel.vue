<!-- src/schema/manifest/ManifestPanel.vue -->
<script setup lang="ts">
import { computed } from "vue";
import {
  useFileSystemStore,
  FileNode,
} from "@/features/FileSystem/FileSystem.store";
import { useUIStore } from "@/features/UI/UI.store";
import { useResources } from "@/schema/manifest/composables/useResources";
import { writeTextFile } from "@/features/FileSystem/fs.api";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import ManifestEditor from "./ManifestEditor.vue";
import { FileWarning, Plus, Settings2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

const props = defineProps<{ activeFilePath?: string | null }>();

const fsStore = useFileSystemStore();
const uiStore = useUIStore();

// --- 核心路径解析逻辑 ---
const targetDirectory = computed(() => {
  // 1. 优先检查 uiStore 中是否有明确的被选中角色 (CharacterLibrary 上下文)
  if (uiStore.uiState.activeCharacter) {
    const charPath = `character/${uiStore.uiState.activeCharacter}`;
    // 简单校验该路径是否存在
    if (fsStore.getNodeByPath(fsStore.fileStructure, charPath)) {
      return charPath;
    }
  }

  // 2. 降级逻辑：检查传入的 props 或 uiStore 的 activeFile
  const rawPath = props.activeFilePath ?? uiStore.uiState.activeFile;
  if (!rawPath) return null;

  const node = fsStore.getNodeByPath(fsStore.fileStructure, rawPath);
  const isFile =
    node instanceof FileNode ||
    (typeof rawPath === "string" && rawPath.includes("."));

  if (isFile) {
    const parts = rawPath.split("/");
    parts.pop();
    return parts.join("/") || null;
  }
  return rawPath;
});

const potentialManifestPath = computed(() => {
  if (!targetDirectory.value) return null;
  const prefix = targetDirectory.value ? `${targetDirectory.value}/` : "";
  return `${prefix}manifest.[manifest].json`;
});

const existingManifestPath = computed(() => {
  const path = potentialManifestPath.value;
  if (!path) return null;
  return fsStore.getNodeByPath(fsStore.fileStructure, path) ? path : null;
});

const {
  manifestPath,
  manifestContent,
  toggleSelection,
  inlineResources: inlinePaths,
} = useResources(existingManifestPath);

// --- 动作 ---
const syncManifest = async (newContent: any) => {
  if (!manifestPath.value) return;
  try {
    await writeTextFile(
      manifestPath.value,
      JSON.stringify(newContent, null, 2),
      { baseDir: BaseDirectory.AppData }
    );
  } catch (e) {
    console.error("Failed to sync manifest:", e);
  }
};

const createManifest = async () => {
  const path = potentialManifestPath.value;
  if (!path) return;

  const defaultManifest = {
    name: targetDirectory.value?.split("/").pop() || "New Manifest",
    selection: { character: [], lorebook: [], preset: [] },
    customComponents: {},
  };

  try {
    await writeTextFile(path, JSON.stringify(defaultManifest, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
    setTimeout(() => fsStore.refresh(), 500);
  } catch (e) {
    console.error("Failed to create manifest:", e);
  }
};

const allResources = computed(() => {
  return { character: [], lorebook: [], preset: [] };
});
</script>

<template>
  <div class="h-full w-full flex flex-col bg-background">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-border shrink-0 space-y-3">
      <div class="flex items-center gap-2 text-foreground">
        <Settings2 class="w-4 h-4" />
        <h2 class="font-semibold text-sm tracking-tight">
          {{
            uiStore.uiState.activeCharacter
              ? `${uiStore.uiState.activeCharacter} 的环境`
              : "环境控制"
          }}
        </h2>
      </div>

      <!-- 路径展示区域 -->
      <div
        class="bg-muted/50 rounded-md border border-border/50 p-2 space-y-1"
        v-if="targetDirectory"
      >
        <p
          class="text-[10px] uppercase text-muted-foreground font-bold tracking-wider"
        >
          {{ manifestPath ? "Configuration Source" : "Target Directory" }}
        </p>
        <p class="text-xs font-mono text-foreground break-all leading-tight">
          {{ manifestPath || targetDirectory }}
        </p>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden flex flex-col relative">
      <!-- Case 1: 没有找到 Manifest 文件 (空状态) -->
      <div
        v-if="!manifestPath"
        class="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300"
      >
        <div
          class="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4"
        >
          <FileWarning class="w-6 h-6 text-muted-foreground" />
        </div>

        <h3 class="text-sm font-medium text-foreground mb-1">未找到环境配置</h3>

        <p
          class="text-xs text-muted-foreground max-w-[200px] mb-6 leading-relaxed"
        >
          {{
            targetDirectory
              ? `当前目录没有检测到 manifest 配置文件。`
              : "请先在库中选择一个角色或目录。"
          }}
        </p>

        <Button
          v-if="potentialManifestPath"
          variant="outline"
          size="sm"
          class="gap-2 border-dashed border-border hover:border-primary/50 hover:bg-muted"
          @click="createManifest"
        >
          <Plus class="w-3.5 h-3.5" />
          初始化配置
        </Button>
      </div>

      <!-- Case 2: 编辑器 -->
      <div v-else-if="manifestContent" class="flex-1 overflow-y-auto">
        <ManifestEditor
          :manifest="manifestContent"
          :inline-resources="inlinePaths"
          :all-resources="allResources"
          @toggle="toggleSelection"
          @update="syncManifest"
        />
      </div>
    </div>
  </div>
</template>
