// src/features/FileSystem/FileTree/composables/useFileDragAndDrop.ts
import { ref } from "vue";
import {
  useFileSystemStore,
  VirtualFolder,
} from "@/features/FileSystem/FileSystem.store";

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

    // Add styling class
    setTimeout(() => {
      (event.target as HTMLElement).classList.add("opacity-50");
    }, 0);
  };

  const handleDragEnd = (event: DragEvent) => {
    draggedItemPath.value = null;
    (event.target as HTMLElement).classList.remove("opacity-50");

    document
      .querySelectorAll(".bg-accent\\/50")
      .forEach((el) => el.classList.remove("bg-accent\\/50"));

    if (hoverTimer.value) clearTimeout(hoverTimer.value);
    lastHoveredPath.value = null;
  };

  const handleDragEnter = (event: DragEvent, dropPath: string) => {
    const currentDragged = draggedItemPath.value;
    if (!currentDragged) return; // Ignore external files for now

    // Prevent dropping into self or children
    if (
      currentDragged === dropPath ||
      dropPath.startsWith(currentDragged + "/")
    ) {
      return;
    }

    // Only allow drop if target is a folder
    const node = store.resolvePath(dropPath);
    if (!(node instanceof VirtualFolder)) return;

    event.preventDefault();
    event.dataTransfer!.dropEffect = "move";

    lastHoveredPath.value = dropPath;
    (event.currentTarget as HTMLElement).classList.add("bg-accent/50");

    // Auto expand folder on hover
    if (hoverTimer.value) clearTimeout(hoverTimer.value);
    hoverTimer.value = window.setTimeout(() => {
      onExpandFolder(dropPath);
    }, 600);
  };

  const handleDragLeave = (event: DragEvent) => {
    (event.currentTarget as HTMLElement).classList.remove("bg-accent/50");
    const targetPath = (event.currentTarget as HTMLElement).dataset.path;
    if (lastHoveredPath.value === targetPath) {
      if (hoverTimer.value) clearTimeout(hoverTimer.value);
    }
  };

  const handleDrop = async (event: DragEvent, dropPath: string) => {
    if (!event.dataTransfer) return;
    (event.currentTarget as HTMLElement).classList.remove("bg-accent/50");

    const fromPath = event.dataTransfer.getData("text/plain");
    if (!fromPath || !dropPath) return;

    let finalDest = dropPath;
    const node = store.resolvePath(dropPath);

    // If dropped on a file, move to its parent folder
    if (node && !(node instanceof VirtualFolder) && node.parent) {
      finalDest = node.parent.path;
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
