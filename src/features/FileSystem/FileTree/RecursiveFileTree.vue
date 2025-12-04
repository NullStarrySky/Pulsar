<!-- src/features/FileSystem/FileTree/RecursiveFileTree.vue -->
<script setup lang="ts">
import { nextTick, ref, toRef, watch } from "vue";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Plus,
  FolderSymlink,
  Clipboard,
  FileText,
  Folder as FolderIcon,
  Loader2,
} from "lucide-vue-next";
import join from "url-join";

// Stores & Composables
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store";
import { useUIStore } from "@/features/UI/UI.store";
import { useFileTree } from "@/features/FileSystem/FileTree/composables/useFileTree";
import { useFileOperations } from "@/features/FileSystem/FileTree/composables/useFileOperations";
import { useFileDragAndDrop } from "@/features/FileSystem/FileTree/composables/useFileDragAndDrop";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

// Components
import FileTreeItem from "./components/FileTreeItem.vue";
import FileOperationDialogs from "./components/FileOperationsDialog.vue";

defineOptions({ name: "RecursiveFileTree" });

const props = defineProps<{
  rootPath: string;
  searchQuery?: string;
}>();

const store = useFileSystemStore();
const uiStore = useUIStore();

// --- Composables ---
const {
  flatList,
  expandedFolders,
  editingNodeId,
  newName,
  toggleExpand,
  startEdit,
  cancelEdit,
} = useFileTree(props.rootPath, toRef(props, "searchQuery"));

const ops = useFileOperations();
const dnd = useFileDragAndDrop(ops.handleMove, toggleExpand);

// --- Event Handlers ---

const inputRef = ref<HTMLInputElement | null>(null);
const setInputRef = (el: any) => {
  if (el) inputRef.value = el.$el || el;
};

// Focus handling
watch(editingNodeId, (val) => {
  if (val) {
    setTimeout(() => {
      const el = inputRef.value;
      if (!el) return;

      el.focus();

      const text = el.value;
      const lastDotIndex = text.lastIndexOf(".");

      if (val.startsWith("new:") || lastDotIndex <= 0) {
        el.select();
      } else {
        el.setSelectionRange(0, lastDotIndex);
      }
    }, 200);
  }
});

const handleFinishEdit = async () => {
  const id = editingNodeId.value;
  if (!id) return;

  const name = newName.value.trim();

  if (!name) {
    cancelEdit();
    return;
  }

  try {
    if (id.startsWith("new:")) {
      const parts = id.split(":");
      const type = parts[1] as "file" | "directory";
      const parentPath = parts[2];
      await ops.handleCreate(type, parentPath, name);
    } else {
      const originalName = id.split("/").pop();
      if (name !== originalName) {
        await ops.handleRename(id, name);
      }
    }
  } catch (error) {
    console.error("Operation failed:", error);
  } finally {
    cancelEdit();
  }
};

const startCreate = (type: "file" | "directory", parentPath: string) => {
  if (!expandedFolders.value.has(parentPath)) toggleExpand(parentPath);
  const uniqueId = `new:${type}:${parentPath}:${Date.now()}`;
  startEdit(uniqueId, true);
};
</script>

<template>
  <div class="h-full w-full relative">
    <!-- Loading State -->
    <div
      v-if="!store.isInitialized"
      class="absolute inset-0 flex items-center justify-center bg-background/50 z-10"
    >
      <Loader2 class="animate-spin" />
    </div>

    <ScrollArea class="h-full w-full">
      <ContextMenu>
        <!-- Root Drop Zone -->
        <ContextMenuTrigger as-child>
          <div
            class="w-full h-full min-h-[50px] pb-10"
            :data-path="props.rootPath"
            @dragenter.stop="dnd.handleDragEnter($event, props.rootPath)"
            @dragleave.stop="dnd.handleDragLeave"
            @dragover.prevent
            @drop.stop="dnd.handleDrop($event, props.rootPath)"
          >
            <ul v-if="flatList.length > 0" class="space-y-0.5 select-none">
              <li v-for="item in flatList" :key="item.id || item.path">
                <!-- Editing Mode -->
                <div
                  v-if="item.type === 'input'"
                  class="flex items-center space-x-1 px-2 py-1.5"
                  :style="{ paddingLeft: `${item.indentLevel * 20 + 8}px` }"
                >
                  <component
                    :is="item.id?.includes('directory') ? FolderIcon : FileText"
                    class="w-4 h-4 mr-2 text-muted-foreground"
                  />
                  <Input
                    :ref="setInputRef"
                    v-model="newName"
                    class="h-6 text-sm"
                    @blur="handleFinishEdit"
                    @keydown.enter.prevent="handleFinishEdit"
                    @keydown.esc.prevent="cancelEdit"
                    @click.stop
                  />
                </div>

                <!-- View Mode (Fix: 使用 div 包裹以确保 draggable 属性生效) -->
                <div
                  v-else
                  class="w-full"
                  :draggable="true"
                  :data-path="item.path"
                  @dragstart.stop="dnd.handleDragStart($event, item.path)"
                  @dragend.stop="dnd.handleDragEnd"
                  @dragenter.stop="dnd.handleDragEnter($event, item.path)"
                  @dragleave.stop="dnd.handleDragLeave"
                  @dragover.prevent
                  @drop.stop="dnd.handleDrop($event, item.path)"
                >
                  <FileTreeItem
                    :item="item"
                    :can-paste="!!ops.clipboard.value"
                    class="file-tree-item"
                    @click="
                      item.isFolder
                        ? toggleExpand(item.path)
                        : uiStore.openFile(item.path)
                    "
                    @dblclick="!item.isFolder && uiStore.openFile(item.path)"
                    @create-file="
                      startCreate(
                        'file',
                        item.isFolder
                          ? item.path
                          : item.parentPath || props.rootPath
                      )
                    "
                    @create-folder="
                      startCreate(
                        'directory',
                        item.isFolder
                          ? item.path
                          : item.parentPath || props.rootPath
                      )
                    "
                    @rename="startEdit(item.path)"
                    @delete="ops.confirmTrash(item)"
                    @permanent-delete="ops.confirmPermanentDelete(item)"
                    @cut="ops.setClipboard(item.path, item.name, 'cut')"
                    @copy="ops.setClipboard(item.path, item.name, 'copy')"
                    @duplicate="ops.handleDuplicate(item.path)"
                    @paste="ops.handlePaste(item.path)"
                    @copy-path="
                      (type) => ops.copyPathToClipboard(item.path, type)
                    "
                  />
                </div>
              </li>
            </ul>
            <div
              v-else
              class="flex h-full flex-col items-center justify-center p-4 text-sm text-muted-foreground"
            >
              <div class="mb-2">文件夹为空</div>
              <div class="text-xs opacity-50">右键点击创建新内容</div>
            </div>
          </div>
        </ContextMenuTrigger>

        <!-- Global Context Menu -->
        <ContextMenuContent class="w-56">
          <ContextMenuItem @select="startCreate('file', props.rootPath)">
            <Plus class="mr-2 h-4 w-4" />新建文件
          </ContextMenuItem>
          <ContextMenuItem @select="startCreate('directory', props.rootPath)">
            <Plus class="mr-2 h-4 w-4" />新建文件夹
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            v-if="store.appDataPath"
            @select="revealItemInDir(join(store.appDataPath, props.rootPath))"
          >
            <FolderSymlink class="mr-2 h-4 w-4" />在文件管理器中显示
          </ContextMenuItem>
          <ContextMenuItem
            @select="ops.handlePaste(props.rootPath)"
            :disabled="!ops.clipboard.value"
          >
            <Clipboard class="mr-2 h-4 w-4" />粘贴
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <ScrollBar orientation="vertical" />
    </ScrollArea>

    <FileOperationDialogs
      v-model:trashOpen="ops.isTrashDialogOpen.value"
      v-model:permanentDeleteOpen="ops.isPermanentDeleteDialogOpen.value"
      :item-to-delete="ops.nodeToDelete.value"
      @confirm-trash="ops.executeTrash"
      @confirm-permanent-delete="ops.executePermanentDelete"
    />
  </div>
</template>
