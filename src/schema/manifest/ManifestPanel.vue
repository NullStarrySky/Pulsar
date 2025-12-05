<script setup lang="ts">
import { computed } from "vue";
import {
  useFileSystemStore,
  VirtualFolder,
  VirtualFile,
} from "@/features/FileSystem/FileSystem.store";
import { useUIStore } from "@/features/UI/UI.store";
import { newManifest } from "@/schema/manifest/manifest";
import ManifestEditor from "./ManifestEditor.vue";
import { FileWarning, Wand2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { getNewTypedFile } from "@/schema/SemanticType";

const props = defineProps<{ activeFilePath?: string | null }>();

const fsStore = useFileSystemStore();
const uiStore = useUIStore();

// --- 1. 确定目标目录 (character/xxx) ---
const targetDirectory = computed(() => {
  const rawPath = props.activeFilePath ?? uiStore.uiState.activeFile;
  if (!rawPath) return null;

  // 策略：尝试匹配 character/{name} 模式
  // 无论当前在 character/Alice/lorebook/a.json 还是 character/Alice/manifest.json
  // 我们都希望定位到 character/Alice

  const parts = rawPath.split("/");

  // 假设结构是 root/type/name/...
  // 例如 character/Alice/...
  if (parts.length >= 2 && parts[0] === "character") {
    return `${parts[0]}/${parts[1]}`;
  }

  // Fallback: 如果不符合上述模式，使用旧逻辑 (文件取父，文件夹取自)
  const node = fsStore.resolvePath(rawPath);
  if (node instanceof VirtualFile && node.parent) {
    return node.parent.path;
  }
  if (node instanceof VirtualFolder) {
    return node.path;
  }
  return null;
});

// --- 2. 预测 Manifest 路径 ---
const potentialManifestPath = computed(() => {
  const dir = targetDirectory.value;
  if (!dir) return null;
  // manifest 通常直接放在 character/Alice/ 下
  return `${dir}/manifest.[manifest].json`;
});

// --- 3. 检查文件是否存在 ---
const manifestExists = computed(() => {
  if (!potentialManifestPath.value) return false;
  const node = fsStore.resolvePath(potentialManifestPath.value);
  return node instanceof VirtualFile;
});

// --- Actions ---
const createManifest = async () => {
  const dirPath = targetDirectory.value;
  if (!dirPath) return;

  const dirNode = fsStore.resolvePath(dirPath);
  if (!(dirNode instanceof VirtualFolder)) return;

  const initialContent = newManifest();
  initialContent.name = dirNode.name || "New Environment";

  // Requirement: 在建立的时候，全局世界书直接选中 global/lorebook 文件夹
  initialContent.selection.lorebook = ["global/lorebook"];

  try {
    // 使用新的 createStructure 方法定义角色结构
    const structure = {
      chat: {}, // 空文件夹
      template: {},
      lorebook: {},
      preset: {},
      background: {},
      components: {},
      // Manifest 文件
      "manifest.[manifest].json": () => {
        return getNewTypedFile("manifest");
      },
    };

    // 递归创建结构
    await dirNode.createStructure(structure);
  } catch (e) {
    console.error("Failed to create manifest", e);
  }
};
</script>

<template>
  <div
    class="h-full w-full flex flex-col bg-background border-l border-border/50"
  >
    <!-- Empty State -->
    <div
      v-if="!manifestExists"
      class="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95"
    >
      <div
        class="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-6 shadow-inner"
      >
        <FileWarning class="w-8 h-8 text-muted-foreground/50" />
      </div>

      <h3 class="text-base font-semibold text-foreground mb-2">
        未检测到环境配置
      </h3>

      <div class="text-xs text-muted-foreground mb-8 max-w-60 leading-relaxed">
        <span v-if="targetDirectory">
          目录
          <span class="font-mono text-foreground bg-muted px-1 rounded">{{
            targetDirectory
          }}</span>
          下没有 manifest 文件。
        </span>
        <span v-else> 请先在左侧文件树中选择一个角色文件夹或任意文件。 </span>
      </div>

      <Button
        v-if="targetDirectory"
        @click="createManifest"
        class="gap-2 shadow-lg hover:shadow-xl transition-all"
      >
        <Wand2 class="w-4 h-4" />
        初始化环境配置
      </Button>
    </div>

    <!-- Editor State -->
    <div v-else-if="potentialManifestPath" class="flex-1 flex flex-col min-h-0">
      <ManifestEditor :path="potentialManifestPath" />
    </div>
  </div>
</template>
