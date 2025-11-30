<!-- src/features/FileSystem/FileTree/components/FileTreeItem.vue -->
<script setup lang="ts">
import { computed } from "vue";
import {
  Folder as FolderIcon,
  ChevronRight,
  ChevronDown,
  Eye,
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
import { getIconForFile, parseFileName } from "@/features/FileSystem/utils";
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store";
import { useUIStore } from "@/features/UI/UI.store";
import join from "url-join";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { SemanticTypeMap, type SemanticType } from "@/schema/SemanticType";
import { useFileSystemProxy } from "@/features/FileSystem/useFileSystemProxy";

const props = defineProps<{
  item: {
    type: "file" | "folder";
    path: string;
    name: string;
    indentLevel: number;
    isExpanded?: boolean;
  };
  isLocked: boolean;
  canPaste: boolean;
}>();

const store = useFileSystemStore();
const uiStore = useUIStore();

const parsedName = computed(() => parseFileName(props.item.name));
const isFolder = computed(() => props.item.type === "folder");
const icon = computed(() =>
  isFolder.value ? FolderIcon : getIconForFile(props.item.name)
);
const isWatching = computed(() => store.watchedFiles.has(props.item.path));
const creatableTypes = Object.keys(SemanticTypeMap).filter(
  (t) => t !== "unknown" && t !== "setting" && t !== "modelConfig"
) as SemanticType[];

const handleCreateTyped = (type: SemanticType) => {
  const proxy = useFileSystemProxy(props.item.path);
  proxy.createTypedFile(`New ${type}`, type);
};
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger
      class="flex items-center space-x-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer select-none group w-full"
      :class="{ 'bg-accent': uiStore.uiState.activeFile === item.path }"
      @click="$emit('click')"
      @dblclick="$emit('dblclick')"
    >
      <div
        class="flex grow items-center overflow-hidden"
        :style="{ paddingLeft: `${item.indentLevel * 20}px` }"
      >
        <!-- Chevron -->
        <component
          v-if="isFolder"
          :is="item.isExpanded ? ChevronDown : ChevronRight"
          class="h-4 w-4 shrink-0"
        />
        <span v-else class="w-4 h-4 shrink-0"></span>

        <!-- Icon -->
        <component :is="icon" class="ml-1 mr-2 h-4 w-4 shrink-0" />

        <!-- Name -->
        <span class="truncate">{{ parsedName.displayName }}</span>

        <!-- Watch Status -->
        <Eye
          v-if="isWatching"
          class="ml-auto mr-1 h-3 w-3 text-blue-500 shrink-0"
        />
      </div>
    </ContextMenuTrigger>

    <ContextMenuContent class="w-56">
      <ContextMenuItem @select="$emit('create-file')">
        <Plus class="mr-2 h-4 w-4" /><span>新建文件</span>
      </ContextMenuItem>
      <ContextMenuItem @select="$emit('create-folder')">
        <Plus class="mr-2 h-4 w-4" /><span>新建文件夹</span>
      </ContextMenuItem>

      <ContextMenuSub v-if="isFolder">
        <ContextMenuSubTrigger>
          <Plus class="mr-2 h-4 w-4" /><span>新建类型文件</span>
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

      <ContextMenuItem @select="openPath(join(store.fs.toPath, item.path))">
        <FolderOpen class="mr-2 h-4 w-4" /><span>以默认方式打开</span>
      </ContextMenuItem>
      <ContextMenuItem
        @select="revealItemInDir(join(store.fs.toPath, item.path))"
      >
        <FolderSymlink class="mr-2 h-4 w-4" /><span>在文件管理器中显示</span>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem @select="$emit('cut')"
        ><Scissors class="mr-2 h-4 w-4" /><span>剪切</span></ContextMenuItem
      >
      <ContextMenuItem @select="$emit('copy')"
        ><Copy class="mr-2 h-4 w-4" /><span>复制</span></ContextMenuItem
      >
      <ContextMenuItem @select="$emit('duplicate')"
        ><CopyPlus class="mr-2 h-4 w-4" /><span>原地复制</span></ContextMenuItem
      >
      <ContextMenuItem @select="$emit('paste')" :disabled="!canPaste"
        ><Clipboard class="mr-2 h-4 w-4" /><span>粘贴</span></ContextMenuItem
      >

      <ContextMenuSeparator />

      <ContextMenuItem @select="$emit('rename')" :disabled="isLocked"
        ><FileEdit class="mr-2 h-4 w-4" /><span>重命名</span></ContextMenuItem
      >

      <ContextMenuItem
        v-if="!isFolder"
        @select="store.toggleWatchFile(item.path)"
      >
        <Eye class="mr-2 h-4 w-4" /><span>{{
          isWatching ? "取消监视" : "监视文件"
        }}</span>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem @select="$emit('delete')" :disabled="isLocked"
        ><Trash2 class="mr-2 h-4 w-4" /><span>移入垃圾桶</span></ContextMenuItem
      >
      <ContextMenuItem
        @select="$emit('permanent-delete')"
        :disabled="isLocked"
        class="text-red-600 focus:text-red-600"
        ><FileX2 class="mr-2 h-4 w-4" /><span>永久删除</span></ContextMenuItem
      >
    </ContextMenuContent>
  </ContextMenu>
</template>
