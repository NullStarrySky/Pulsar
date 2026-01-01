// src/features/FileSystem/FileTree/composables/useFileOperations.ts

import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import join from "url-join";
import { ref } from "vue";
import {
  type FileSignal,
  useFileSystemStore,
  VirtualFile,
  VirtualFolder,
} from "@/features/FileSystem/FileSystem.store";
import type { SemanticType } from "@/schema/SemanticType";

export function useFileOperations() {
  const store = useFileSystemStore();

  // Clipboard (In-Memory for App-internal ops)
  const clipboard = ref<{
    path: string;
    name: string;
    operation: "cut" | "copy";
  } | null>(null);

  // Dialog States
  const nodeToDelete = ref<{ name: string; path: string } | null>(null);
  const isTrashDialogOpen = ref(false);
  const isPermanentDeleteDialogOpen = ref(false);

  // --- Actions ---

  const handleCreate = async (
    type: "file" | "directory",
    parentPath: string,
    name: string
  ) => {
    const parent = store.resolvePath(parentPath);
    if (!parent || !(parent instanceof VirtualFolder)) {
      throw new Error(`Invalid parent directory: ${parentPath}`);
    }

    if (type === "directory") {
      await parent.createDir(name);
    } else {
      await parent.createFile(name, ""); // Create empty file
    }
  };

  const handleCreateTyped = async (parentPath: string, type: SemanticType) => {
    const parent = store.resolvePath(parentPath);
    if (parent instanceof VirtualFolder) {
      await parent.createTypedFile("New " + type, type, true);
    }
  };

  const handleRename = async (path: string, newName: string) => {
    const node = store.resolvePath(path);
    if (node && node.name !== newName) {
      await node.rename(newName);
    }
  };

  const handleMove = async (sourcePath: string, destFolderPath: string) => {
    const node = store.resolvePath(sourcePath);
    const destFolder = store.resolvePath(destFolderPath);

    if (!node || !destFolder || !(destFolder instanceof VirtualFolder)) return;

    // Prevent moving into self or children
    if (destFolderPath.startsWith(sourcePath)) return;

    await node.moveTo(destFolder);
  };

  const handleDuplicate = async (sourcePath: string) => {
    const node = store.resolvePath(sourcePath);
    if (!node || !node.parent) return;

    // copyTo 内部会使用 getUniqueName 处理重名，从而实现 "副本" 效果
    await node.copyTo(node.parent);
  };

  const setClipboard = (path: string, name: string, op: "cut" | "copy") => {
    clipboard.value = { path, name, operation: op };
  };

  const handlePaste = async (destinationPath: string) => {
    if (!clipboard.value) return;

    // Determine target folder
    let targetFolder: VirtualFolder | undefined;
    const destNode = store.resolvePath(destinationPath);

    if (destNode instanceof VirtualFolder) {
      targetFolder = destNode;
    } else if (destNode?.parent) {
      targetFolder = destNode.parent;
    } else {
      // Fallback to root if path is root
      const root = store.root;
      if (destinationPath === root.path) targetFolder = root;
    }

    if (!targetFolder) return;

    const sourceNode = store.resolvePath(clipboard.value.path);
    if (!sourceNode) {
      // Source might have been deleted
      clipboard.value = null;
      return;
    }

    if (clipboard.value.operation === "cut") {
      await sourceNode.moveTo(targetFolder);
      clipboard.value = null; // Cut is one-time
    } else {
      await sourceNode.copyTo(targetFolder);
    }
  };

  // --- Deletion ---

  const confirmTrash = (item: { name: string; path: string }) => {
    nodeToDelete.value = item;
    isTrashDialogOpen.value = true;
  };

  const executeTrash = async () => {
    if (nodeToDelete.value) {
      const node = store.resolvePath(nodeToDelete.value.path);
      if (node) await node.moveToTrash();
      isTrashDialogOpen.value = false;
      nodeToDelete.value = null;
    }
  };

  const confirmPermanentDelete = (item: { name: string; path: string }) => {
    nodeToDelete.value = item; // Re-use same ref for dialog prop
    isPermanentDeleteDialogOpen.value = true;
  };

  const executePermanentDelete = async () => {
    if (nodeToDelete.value) {
      const node = store.resolvePath(nodeToDelete.value.path);
      if (node) await node.delete();
      isPermanentDeleteDialogOpen.value = false;
      nodeToDelete.value = null;
    }
  };

  // 在资源管理器中显示
  const handleOpenInExplorer = async (path: string) => {
    if (!store.appDataPath) return;
    try {
      // 拼接绝对路径
      const absPath = join(store.appDataPath, path);
      await revealItemInDir(absPath);
    } catch (error) {
      console.error("Failed to reveal item:", error);
    }
  };

  // 以默认应用打开
  const handleOpenWithDefault = async (path: string) => {
    if (!store.appDataPath) return;
    try {
      const absPath = join(store.appDataPath, path);
      await openPath(absPath);
    } catch (error) {
      console.error("Failed to open item:", error);
    }
  };

  // --- Utils ---

  const copyPathToClipboard = async (
    path: string,
    type: "relative" | "absolute" | "src"
  ) => {
    let text = path;
    const node = store.resolvePath(path);
    if (!node) return;

    if (type === "absolute" && store.appDataPath) {
      text = join(store.appDataPath, path);
    } else if (type === "src") {
      text = node.url;
    }
    await writeText(text);
  };

  // --- 新增: 压缩与解压逻辑 ---
  const handleCompress = async (path: string) => {
    const node = store.resolvePath(path);
    if (node instanceof VirtualFolder) {
      try {
        await node.compress();
      } catch (error) {
        console.error("Compression failed:", error);
        // 这里可以对接您的 Toast/Notification 系统
      }
    }
  };

  const handleDecompress = async (path: string) => {
    const node = store.resolvePath(path);
    // 确保是文件且是 .zip
    if (node instanceof VirtualFile && node.name.endsWith(".zip")) {
      try {
        await node.decompress();
      } catch (error) {
        console.error("Decompression failed:", error);
      }
    }
  };

  const handleSetSignal = async (path: string, signal: FileSignal | null) => {
    const node = store.resolvePath(path);
    if (node instanceof VirtualFile) {
      if (signal) {
        await node.setSignal(signal);
      } else {
        await node.removeSignal();
      }
    }
  };

  return {
    clipboard,
    nodeToDelete,
    isTrashDialogOpen,
    isPermanentDeleteDialogOpen,
    handleCreate,
    handleCreateTyped,
    handleRename,
    handleMove,
    handleDuplicate,
    setClipboard,
    handlePaste,
    confirmTrash,
    executeTrash,
    confirmPermanentDelete,
    executePermanentDelete,
    copyPathToClipboard,
    handleCompress,
    handleOpenInExplorer,
    handleOpenWithDefault,
    handleDecompress,
    handleSetSignal,
  };
}
