// src/features/FileSystem/FileTree/composables/useFileDragAndDrop.ts
import { ref } from "vue";
import {
  useFileSystemStore,
  isFolderNode,
} from "@/features/FileSystem/FileSystem.store";
import { dirname } from "@/features/FileSystem/fs.api";

export function useFileDragAndDrop(
  onMove: (src: string, dest: string) => Promise<void>,
  onExpandFolder: (path: string) => void
) {
  const store = useFileSystemStore();
  const draggedItemPath = ref<string | null>(null);
  const hoverTimer = ref<number | null>(null);
  const lastHoveredPath = ref<string | null>(null);

  const handleDragStart = (event: DragEvent, path: string) => {
    if (!event.dataTransfer) return;
    draggedItemPath.value = path;
    event.dataTransfer.setData("text/plain", path);
    event.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      (event.target as HTMLElement).classList.add("is-dragging-source");
    }, 0);
  };

  const handleDragEnd = () => {
    draggedItemPath.value = null;
    document
      .querySelectorAll(".is-dragging-source")
      .forEach((el) => el.classList.remove("is-dragging-source"));
    document
      .querySelectorAll(".can-drop")
      .forEach((el) => el.classList.remove("can-drop"));
    if (hoverTimer.value) clearTimeout(hoverTimer.value);
    lastHoveredPath.value = null;
  };

  const handleDragEnter = (event: DragEvent, dropPath: string) => {
    event.preventDefault();
    const currentDragged = draggedItemPath.value;
    if (
      !currentDragged ||
      currentDragged === dropPath ||
      dropPath.startsWith(currentDragged + "/")
    )
      return;

    // Only drop into folders
    const node = store.getNodeByPath(store.fileStructure, dropPath);
    if (!isFolderNode(node)) return;

    lastHoveredPath.value = dropPath;
    (event.currentTarget as HTMLElement).classList.add("can-drop");

    // Auto expand
    hoverTimer.value = window.setTimeout(() => onExpandFolder(dropPath), 500);
  };

  const handleDragLeave = (event: DragEvent) => {
    (event.currentTarget as HTMLElement).classList.remove("can-drop");
    const targetPath = (event.currentTarget as HTMLElement).dataset.path;
    if (lastHoveredPath.value === targetPath) {
      lastHoveredPath.value = null;
      if (hoverTimer.value) clearTimeout(hoverTimer.value);
    }
  };

  const handleDrop = async (event: DragEvent, dropPath: string) => {
    if (!event.dataTransfer) return;
    const fromPath = event.dataTransfer.getData("text/plain");
    (event.currentTarget as HTMLElement).classList.remove("can-drop");

    if (!fromPath || !dropPath) return;

    let finalDest = dropPath;
    const node = store.getNodeByPath(store.fileStructure, dropPath);
    if (!isFolderNode(node)) {
      finalDest = await dirname(dropPath);
    }

    await onMove(fromPath, finalDest);
  };

  return {
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  };
}
