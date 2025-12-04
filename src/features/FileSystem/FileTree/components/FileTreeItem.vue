<!-- src/features/FileSystem/FileTree/components/FileTreeItem.vue -->
<script setup lang="ts">
import { computed } from "vue";
import {
  Folder as FolderIcon,
  ChevronRight,
  ChevronDown,
  FileEdit,
  FolderOpen,
  FolderSymlink,
  Scissors,
  Copy,
  CopyPlus,
  Clipboard,
  Trash2,
  FileX2,
  Plus,
  FileJson,
  Image as ImageIcon,
} from "lucide-vue-next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useFileOperations } from "../composables/useFileOperations";
import { SemanticTypeMap, type SemanticType } from "@/schema/SemanticType";
import type { FlatTreeItem } from "../composables/useFileTree";

const props = defineProps<{
  item: FlatTreeItem;
  canPaste: boolean;
}>();

defineEmits<{
  (e: "click"): void;
  (e: "dblclick"): void;
  (e: "create-file"): void;
  (e: "create-folder"): void;
  (e: "rename"): void;
  (e: "delete"): void;
  (e: "permanent-delete"): void;
  (e: "cut"): void;
  (e: "copy"): void;
  (e: "duplicate"): void;
  (e: "paste"): void;
  (e: "copy-path", type: "relative" | "absolute" | "src"): void;
}>();

const ops = useFileOperations();

// Icons
const icon = computed(() => {
  if (props.item.isFolder) return FolderIcon;
  if (props.item.name.endsWith(".json")) return FileJson;
  if (/\.(jpg|png|webp)$/i.test(props.item.name)) return ImageIcon;
  return FileJson; // Default
});

// Semantic Types for Context Menu
const creatableTypes = Object.keys(SemanticTypeMap).filter(
  (t) => t !== "unknown" && t !== "setting" && t !== "modelConfig"
) as SemanticType[];

const handleCreateTyped = (type: SemanticType) => {
  ops.handleCreateTyped(props.item.path, type);
};

// --- 新增逻辑: 计算显示名称 ---
const displayName = computed(() => {
  const name = props.item.name;
  if (!name) return "";

  // 1. 如果是文件夹，通常直接显示完整名称（防止像 v1.0 这样的文件夹被截断），
  //    但如果你希望文件夹也隐藏类似语义标签的内容，可以去掉这个判断。
  if (props.item.isFolder) {
    return name;
  }

  // 2. 处理内置组件 (例如 $character -> character)
  if (name.startsWith("$")) {
    return name.substring(1);
  }

  // 3. 移除扩展名
  const lastDotIndex = name.lastIndexOf(".");
  const nameWithoutExt =
    lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;

  // 4. 移除语义标签 (例如 name.[character] -> name)
  const semanticMatch = nameWithoutExt.match(/\.\[(.*?)\]$/);
  return semanticMatch
    ? nameWithoutExt.substring(0, semanticMatch.index)
    : nameWithoutExt;
});
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger
      class="flex items-center space-x-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer select-none group w-full transition-colors"
      :class="{
        'bg-accent text-accent-foreground font-medium': false /* TODO: 对接 UI Store 的 activeFile */,
      }"
      @click="$emit('click')"
      @dblclick="$emit('dblclick')"
    >
      <div
        class="flex grow items-center overflow-hidden"
        :style="{ paddingLeft: `${item.indentLevel * 20}px` }"
      >
        <!-- Chevron -->
        <component
          v-if="item.isFolder"
          :is="item.isExpanded ? ChevronDown : ChevronRight"
          class="h-4 w-4 shrink-0 text-muted-foreground mr-1"
        />
        <span v-else class="w-4 h-4 shrink-0 mr-1"></span>

        <!-- Icon -->
        <component
          :is="icon"
          class="mr-2 h-4 w-4 shrink-0"
          :class="item.isFolder ? 'text-blue-400' : 'text-slate-500'"
        />

        <!-- Name: 使用 displayName 替换 item.name -->
        <span class="truncate" :title="item.name">{{ displayName }}</span>
      </div>
    </ContextMenuTrigger>

    <ContextMenuContent class="w-56">
      <ContextMenuItem @select="$emit('create-file')">
        <Plus class="mr-2 h-4 w-4" />新建文件
      </ContextMenuItem>
      <ContextMenuItem @select="$emit('create-folder')">
        <Plus class="mr-2 h-4 w-4" />新建文件夹
      </ContextMenuItem>

      <ContextMenuSub v-if="item.isFolder">
        <ContextMenuSubTrigger>
          <Plus class="mr-2 h-4 w-4" />新建类型文件
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem
            v-for="t in creatableTypes"
            :key="t"
            @select="handleCreateTyped(t)"
          >
            {{ t }}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem @select="$emit('copy-path', 'src')">
        <FolderOpen class="mr-2 h-4 w-4" />复制 Asset URL
      </ContextMenuItem>
      <ContextMenuItem @select="$emit('copy-path', 'absolute')">
        <FolderSymlink class="mr-2 h-4 w-4" />复制绝对路径
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem @select="$emit('cut')">
        <Scissors class="mr-2 h-4 w-4" />剪切
      </ContextMenuItem>
      <ContextMenuItem @select="$emit('copy')">
        <Copy class="mr-2 h-4 w-4" />复制
      </ContextMenuItem>
      <ContextMenuItem @select="$emit('duplicate')">
        <CopyPlus class="mr-2 h-4 w-4" />创建副本
      </ContextMenuItem>
      <ContextMenuItem @select="$emit('paste')" :disabled="!canPaste">
        <Clipboard class="mr-2 h-4 w-4" />粘贴
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem @select="$emit('rename')">
        <FileEdit class="mr-2 h-4 w-4" />重命名
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem @select="$emit('delete')">
        <Trash2 class="mr-2 h-4 w-4" />移入垃圾桶
      </ContextMenuItem>
      <ContextMenuItem
        @select="$emit('permanent-delete')"
        class="text-red-600 focus:text-red-600 focus:bg-red-50"
      >
        <FileX2 class="mr-2 h-4 w-4" />永久删除
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
