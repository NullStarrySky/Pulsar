// src/features/FileSystem/FileTree/composables/useFileOperations.ts
import { ref, nextTick } from "vue";
import join from "url-join";
import { useFileSystemProxy } from "@/features/FileSystem/useFileSystemProxy";
import {
  useFileSystemStore,
  isFolderNode,
  type FolderContent,
  FileNode,
} from "@/features/FileSystem/FileSystem.store";
import {
  MOVE,
  FOLDER,
  EMPTY_FOLDER,
  NEW_NAME,
} from "@/features/FileSystem/commands";
import {
  basename,
  dirname,
  copyFile,
  appDataDir,
} from "@/features/FileSystem/fs.api";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { parseFileName } from "../../utils";
import { newManifest } from "@/schema/manifest/manifest";

export function useFileOperations() {
  const store = useFileSystemStore();

  // Clipboard State
  const clipboard = ref<{
    path: string;
    name: string;
    operation: "cut" | "copy";
  } | null>(null);

  // Dialog State
  const nodeToDelete = ref<{ name: string; path: string } | null>(null);
  const nodeToPermanentlyDelete = ref<{ name: string; path: string } | null>(
    null
  );
  const isTrashDialogOpen = ref(false);
  const isPermanentDeleteDialogOpen = ref(false);

  // --- Actions ---

  const handleCreate = async (
    type: "file" | "directory",
    parentPath: string,
    name: string
  ) => {
    const parentProxy = useFileSystemProxy(parentPath);
    if (type === "directory") {
      (parentProxy as any)[name] = EMPTY_FOLDER;
      const parentName = await basename(parentPath);
      // Specific logic for 'character' folder
      if (parentName === "character") {
        await nextTick();
        const newFolderPath = join(parentPath, name);
        const newFolderProxy = useFileSystemProxy(newFolderPath);
        (newFolderProxy as any)["manifest.[manifest].json"] = JSON.stringify(
          newManifest()
        );
      }
    } else {
      (parentProxy as any)[name] = "{}";
    }
  };

  const handleRename = async (path: string, newName: string) => {
    const oldName = await basename(path);
    if (newName !== oldName) {
      const parentPath = await dirname(path);
      const parentProxy = useFileSystemProxy(parentPath);
      (parentProxy as any)[oldName] = new NEW_NAME(newName);
    }
  };

  const handleMove = async (sourcePath: string, destFolderPath: string) => {
    const sourceName = await basename(sourcePath);
    const sourceParentPath = await dirname(sourcePath);
    if (
      destFolderPath === sourceParentPath ||
      destFolderPath.startsWith(sourcePath + "/")
    ) {
      console.warn("Invalid move operation");
      return;
    }
    const sourceProxy = useFileSystemProxy(sourceParentPath);
    (sourceProxy as any)[sourceName] = new MOVE(destFolderPath);
  };

  const handleDuplicate = async (sourcePath: string) => {
    const parentPath = await dirname(sourcePath);
    const parentProxy = useFileSystemProxy(parentPath);
    const node = store.getNodeByPath(store.fileStructure, sourcePath);
    const name = await basename(sourcePath);
    const { displayName, semanticType, extension } = parseFileName(name);

    // Logic to find unique name...
    let counter = 1;
    let finalName: string;
    const parentContent = store.getNodeByPath<FolderContent>(
      store.fileStructure,
      parentPath
    )!;
    const semanticStr = semanticType ? `.[${semanticType}]` : "";
    const extStr = extension ? `.${extension}` : "";

    do {
      const copySuffix = counter === 1 ? "_副本" : `_副本_${counter}`;
      finalName = `${displayName}${copySuffix}${semanticStr}${extStr}`;
      counter++;
    } while (finalName in parentContent);

    if (isFolderNode(node)) {
      (parentProxy as any)[finalName] = new FOLDER(sourcePath);
    } else {
      const destPath = join(parentPath, finalName);
      await copyFile(sourcePath, destPath, {
        fromPathBaseDir: BaseDirectory.AppData,
        toPathBaseDir: BaseDirectory.AppData,
      });
      // Force refresh or optimistic update usually handled by store/watcher
      parentContent[finalName] = new FileNode(null);
    }
    return join(parentPath, finalName); // Return new path for editing
  };

  const handlePaste = async (destinationPath: string) => {
    if (!clipboard.value) return;
    const { path: sourcePath, name: sourceName, operation } = clipboard.value;
    const sourceParentPath = await dirname(sourcePath);

    // Normalize destination to a folder
    let finalDestinationPath = destinationPath;
    const destNodeInfo = store.getNodeByPath(
      store.fileStructure,
      destinationPath
    );
    if (destNodeInfo && !isFolderNode(destNodeInfo)) {
      finalDestinationPath = await dirname(destinationPath);
    }

    const destProxy = useFileSystemProxy(finalDestinationPath);
    const destNode = store.getNodeByPath<FolderContent>(
      store.fileStructure,
      finalDestinationPath
    );
    if (!destNode) return;

    let finalName = sourceName;
    // Resolve name conflict logic... (Simplified for brevity, same as original)
    if (
      finalName in destNode &&
      !(operation === "cut" && sourceParentPath === finalDestinationPath)
    ) {
      let counter = 1;
      do {
        finalName = `${sourceName}_${counter}`;
        counter++;
      } while (finalName in destNode);
    }

    if (operation === "cut") {
      if (sourceParentPath !== finalDestinationPath)
        await handleMove(sourcePath, finalDestinationPath);
      clipboard.value = null;
    } else {
      const node = store.getNodeByPath(store.fileStructure, sourcePath);
      if (isFolderNode(node)) {
        (destProxy as any)[finalName] = new FOLDER(sourcePath);
      } else {
        const destPath = join(finalDestinationPath, finalName);
        await copyFile(sourcePath, destPath, {
          fromPathBaseDir: BaseDirectory.AppData,
          toPathBaseDir: BaseDirectory.AppData,
        });
        destNode[finalName] = new FileNode(null);
      }
    }
  };

  const confirmTrash = (item: { name: string; path: string }) => {
    nodeToDelete.value = item;
    isTrashDialogOpen.value = true;
  };

  const executeTrash = async () => {
    if (!nodeToDelete.value) return;
    const parentPath = await dirname(nodeToDelete.value.path);
    const parentProxy = useFileSystemProxy(parentPath);
    await parentProxy.toTrash(nodeToDelete.value.name);
    isTrashDialogOpen.value = false;
  };

  const confirmPermanentDelete = (item: { name: string; path: string }) => {
    nodeToPermanentlyDelete.value = item;
    isPermanentDeleteDialogOpen.value = true;
  };

  const executePermanentDelete = async () => {
    if (!nodeToPermanentlyDelete.value) return;
    const parentPath = await dirname(nodeToPermanentlyDelete.value.path);
    const parentProxy = useFileSystemProxy(parentPath);
    delete (parentProxy as any)[nodeToPermanentlyDelete.value.name];
    isPermanentDeleteDialogOpen.value = false;
  };

  const copyPathToClipboard = async (
    path: string,
    type: "relative" | "absolute" | "src"
  ) => {
    let text = path;
    if (type === "absolute") text = join(await appDataDir(), path);
    else if (type === "src") text = store.convertFileSrc(path);
    await writeText(text);
  };

  return {
    clipboard,
    nodeToDelete,
    nodeToPermanentlyDelete,
    isTrashDialogOpen,
    isPermanentDeleteDialogOpen,
    handleCreate,
    handleRename,
    handleMove,
    handleDuplicate,
    handlePaste,
    confirmTrash,
    executeTrash,
    confirmPermanentDelete,
    executePermanentDelete,
    copyPathToClipboard,
  };
}
