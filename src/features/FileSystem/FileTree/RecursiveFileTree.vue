<!-- src/features/FileSystem/FileTree/RecursiveFileTree.vue -->
<script setup lang="ts">
import { nextTick, ref, toRef } from "vue";
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

// Focus input when editing starts
import { watch } from "vue";
watch(editingNodeId, async (val) => {
  if (val) {
    await nextTick();
    inputRef.value?.focus();
    if (!val.startsWith("new:")) inputRef.value?.select(); // Or set selection range
  }
});

const handleFinishEdit = async () => {
  const id = editingNodeId.value;
  const name = newName.value.trim();
  if (!id || !name) {
    cancelEdit();
    return;
  }

  if (id.startsWith("new:")) {
    const [, type, path] = id.split(":");
    await ops.handleCreate(type as "file" | "directory", path, name);
  } else {
    await ops.handleRename(id, name);
  }
  cancelEdit();
};

const startCreate = (type: "file" | "directory", path: string) => {
  if (!expandedFolders.value.has(path)) toggleExpand(path);
  const uniqueId = `new:${type}:${path}:${Date.now()}`;
  startEdit(uniqueId, true);
};

// --- Test Helper (Optional) ---
</script>

<template>
  <ScrollArea class="h-full w-full">
    <ContextMenu>
      <!-- Root Drop Zone -->
      <ContextMenuTrigger as-child>
        <div
          class="w-full h-full min-h-5"
          :data-path="props.rootPath"
          @dragenter.stop="dnd.handleDragEnter($event, props.rootPath)"
          @dragleave.stop="dnd.handleDragLeave"
          @dragover.prevent
          @drop.stop="dnd.handleDrop($event, props.rootPath)"
        >
          <ul v-if="flatList.length > 0" class="space-y-0.5">
            <li v-for="item in flatList" :key="item.id || item.path">
              <!-- Editing Mode -->
              <div
                v-if="item.type === 'input'"
                class="flex items-center space-x-1 px-2 py-1.5"
                :style="{ paddingLeft: `${item.indentLevel * 20 + 8}px` }"
              >
                <component
                  :is="item.id?.includes('directory') ? FolderIcon : FileText"
                  class="w-4 h-4 mr-2"
                />
                <Input
                  :ref="setInputRef"
                  v-model="newName"
                  class="h-6 text-sm"
                  @blur="handleFinishEdit"
                  @keydown.enter.prevent="handleFinishEdit"
                  @keydown.esc.prevent="cancelEdit"
                />
              </div>

              <!-- View Mode -->
              <FileTreeItem
                v-else
                :item="item as any"
                :is-locked="store.lockedPaths.has(item.path)"
                :can-paste="!!ops.clipboard.value"
                class="file-tree-item"
                :data-path="item.path"
                :draggable="true"
                @click="
                  item.type === 'folder'
                    ? toggleExpand(item.path)
                    : uiStore.openFile(item.path)
                "
                @dblclick="item.type === 'file' && uiStore.openFile(item.path)"
                @dragstart.stop="dnd.handleDragStart($event, item.path)"
                @dragend.stop="dnd.handleDragEnd"
                @dragenter.stop="dnd.handleDragEnter($event, item.path)"
                @dragleave.stop="dnd.handleDragLeave"
                @dragover.prevent
                @drop.stop="dnd.handleDrop($event, item.path)"
                @create-file="
                  startCreate(
                    'file',
                    item.type === 'folder' ? item.path : props.rootPath
                  )
                "
                @create-folder="
                  startCreate(
                    'directory',
                    item.type === 'folder' ? item.path : props.rootPath
                  )
                "
                @rename="startEdit(item.path)"
                @delete="ops.confirmTrash(item)"
                @permanent-delete="ops.confirmPermanentDelete(item)"
                @cut="
                  ops.clipboard.value = {
                    path: item.path,
                    name: item.name,
                    operation: 'cut',
                  }
                "
                @copy="
                  ops.clipboard.value = {
                    path: item.path,
                    name: item.name,
                    operation: 'copy',
                  }
                "
                @duplicate="
                  () => ops.handleDuplicate(item.path).then((p) => startEdit(p))
                "
                @paste="ops.handlePaste(item.path)"
                @copy-path="(type: 'relative' | 'absolute' | 'src') => ops.copyPathToClipboard(item.path, type)"
              />
            </li>
          </ul>
          <div
            v-else
            class="flex h-full items-center justify-center p-4 text-sm text-muted-foreground"
          >
            此文件夹为空
          </div>
        </div>
      </ContextMenuTrigger>

      <!-- Global Context Menu -->
      <ContextMenuContent class="w-56">
        <ContextMenuItem @select="startCreate('file', props.rootPath)"
          ><Plus class="mr-2 h-4 w-4" />新建文件</ContextMenuItem
        >
        <ContextMenuItem @select="startCreate('directory', props.rootPath)"
          ><Plus class="mr-2 h-4 w-4" />新建文件夹</ContextMenuItem
        >
        <ContextMenuSeparator />
        <ContextMenuItem
          @select="revealItemInDir(join(store.fs.toPath, props.rootPath))"
          ><FolderSymlink
            class="mr-2 h-4 w-4"
          />在文件管理器中显示</ContextMenuItem
        >
        <ContextMenuItem
          @select="ops.handlePaste(props.rootPath)"
          :disabled="!ops.clipboard.value"
          ><Clipboard class="mr-2 h-4 w-4" />粘贴</ContextMenuItem
        >
      </ContextMenuContent>
    </ContextMenu>
    <ScrollBar orientation="vertical" />
  </ScrollArea>

  <FileOperationDialogs
    v-model:trashOpen="ops.isTrashDialogOpen.value"
    v-model:permanentDeleteOpen="ops.isPermanentDeleteDialogOpen.value"
    :item-to-delete="
      ops.nodeToDelete.value || ops.nodeToPermanentlyDelete.value
    "
    @confirm-trash="ops.executeTrash"
    @confirm-permanent-delete="ops.executePermanentDelete"
  />
</template>
