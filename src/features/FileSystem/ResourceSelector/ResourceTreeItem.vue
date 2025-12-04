<!-- src/features/FileSystem/ResourceSelector/ResourceTreeItem.vue -->
<script setup lang="ts">
import { computed } from "vue";
import {
  Folder as FolderIcon,
  ChevronRight,
  ChevronDown,
  FileJson,
  Image as ImageIcon,
  Square,
  CheckSquare,
  MinusSquare,
  FileText,
} from "lucide-vue-next";
import type { FlatTreeItem } from "@/features/FileSystem/FileTree/composables/useFileTree";

const props = defineProps<{
  item: FlatTreeItem;
  selectionState: "checked" | "indeterminate" | "unchecked";
}>();

const emit = defineEmits<{
  (e: "toggle-expand"): void;
  (e: "toggle-select"): void;
}>();

// --- Icons ---
const icon = computed(() => {
  if (props.item.isFolder) return FolderIcon;
  if (props.item.name.endsWith(".json")) return FileJson;
  if (/\.(jpg|png|webp)$/i.test(props.item.name)) return ImageIcon;
  return FileText;
});

const checkboxIcon = computed(() => {
  switch (props.selectionState) {
    case "checked":
      return CheckSquare;
    case "indeterminate":
      return MinusSquare; // 半选
    default:
      return Square;
  }
});

const checkboxColor = computed(() => {
  return props.selectionState === "unchecked"
    ? "text-muted-foreground/50 hover:text-muted-foreground"
    : "text-primary";
});

// --- Display Name Logic (Copy from FileTreeItem) ---
const displayName = computed(() => {
  const name = props.item.name;
  if (!name) return "";
  if (props.item.isFolder) return name;
  if (name.startsWith("$")) return name.substring(1);
  const lastDotIndex = name.lastIndexOf(".");
  const nameWithoutExt =
    lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;
  const semanticMatch = nameWithoutExt.match(/\.\[(.*?)\]$/);
  return semanticMatch
    ? nameWithoutExt.substring(0, semanticMatch.index)
    : nameWithoutExt;
});
</script>

<template>
  <div
    class="flex items-center space-x-1 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50 group w-full transition-colors cursor-pointer"
    @click.stop="$emit('toggle-select')"
  >
    <div
      class="flex grow items-center overflow-hidden"
      :style="{ paddingLeft: `${item.indentLevel * 20}px` }"
    >
      <!-- Expand/Collapse Chevron (Only for folders) -->
      <!-- 点击箭头只展开，不选中 -->
      <div
        class="h-4 w-4 shrink-0 mr-1 flex items-center justify-center cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
        @click.stop="$emit('toggle-expand')"
      >
        <component
          v-if="item.isFolder"
          :is="item.isExpanded ? ChevronDown : ChevronRight"
          class="h-4 w-4"
        />
      </div>

      <!-- Checkbox -->
      <component
        :is="checkboxIcon"
        class="mr-2 h-4 w-4 shrink-0 transition-colors"
        :class="checkboxColor"
      />

      <!-- File/Folder Icon -->
      <component
        :is="icon"
        class="mr-2 h-4 w-4 shrink-0"
        :class="item.isFolder ? 'text-blue-400' : 'text-slate-500'"
      />

      <!-- Name -->
      <span class="truncate select-none text-foreground/90" :title="item.name">
        {{ displayName }}
      </span>
    </div>
  </div>
</template>
