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
  Loader2, // 添加 loading 图标
} from "lucide-vue-next";
import join from "url-join";

// Stores & Composables
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store"; // 指向新的 Store
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
watch(editingNodeId, async (val) => {
  if (val) {
    await nextTick();
    inputRef.value?.focus();
    if (!val.startsWith("new:")) inputRef.value?.select();
  }
});

const handleFinishEdit = async () => {
  const id = editingNodeId.value;
  const name = newName.value.trim();

  if (!id || !name) {
    cancelEdit();
    return;
  }

  try {
    if (id.startsWith("new:")) {
      const parts = id.split(":"); // new:file:/path/to/parent:timestamp
      const type = parts[1] as "file" | "directory";
      const parentPath = parts[2];
      await ops.handleCreate(type, parentPath, name);
    } else {
      // id 就是 path
      await ops.handleRename(id, name);
    }
  } catch (error) {
    console.error("Operation failed:", error);
    // 这里可以对接 Toast 提示
  } finally {
    cancelEdit();
  }
};

const startCreate = (type: "file" | "directory", parentPath: string) => {
  if (!expandedFolders.value.has(parentPath)) toggleExpand(parentPath);
  // 使用 path 作为 key 的一部分，确保唯一性
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

                <!-- View Mode -->
                <FileTreeItem
                  v-else
                  :item="item"
                  :is-locked="store.lockedPaths.has(item.path)"
                  :can-paste="!!ops.clipboard.value"
                  class="file-tree-item"
                  :data-path="item.path"
                  :draggable="true"
                  @click="
                    item.isFolder
                      ? toggleExpand(item.path)
                      : uiStore.openFile(item.path)
                  "
                  @dblclick="!item.isFolder && uiStore.openFile(item.path)"
                  @dragstart.stop="dnd.handleDragStart($event, item.path)"
                  @dragend.stop="dnd.handleDragEnd"
                  @dragenter.stop="dnd.handleDragEnter($event, item.path)"
                  @dragleave.stop="dnd.handleDragLeave"
                  @dragover.prevent
                  @drop.stop="dnd.handleDrop($event, item.path)"
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

        <!-- Global Context Menu (Right click on empty space) -->
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
