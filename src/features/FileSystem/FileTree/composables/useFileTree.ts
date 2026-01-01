// src/features/FileSystem/FileTree/composables/useFileTree.ts
import { computed, onMounted, type Ref, ref, watch } from "vue";
import {
  useFileSystemStore,
  type VirtualFile,
  VirtualFolder,
} from "@/features/FileSystem/FileSystem.store";

export interface FlatTreeItem {
  type: "folder" | "file" | "input";
  path: string;
  name: string;
  parentPath: string | null;
  indentLevel: number;
  isExpanded?: boolean;
  isFolder?: boolean;
  id?: string; // 用于 input 的唯一键
}

export function useFileTree(
  rootPath: string,
  searchQuery: Ref<string | undefined>
) {
  const store = useFileSystemStore();
  const expandedFolders = ref<Set<string>>(new Set());
  const editingNodeId = ref<string | null>(null);
  const newName = ref("");

  // Storage Persistence (Keyed by rootPath to support multiple tree instances)
  const storageKey = `VFS_expanded_${rootPath}`;

  onMounted(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        expandedFolders.value = new Set(JSON.parse(saved));
      } catch (e) {
        /* ignore */
      }
    }
  });

  watch(
    expandedFolders,
    (val) => {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(val)));
    },
    { deep: true }
  );

  const toggleExpand = (path: string) => {
    if (expandedFolders.value.has(path)) expandedFolders.value.delete(path);
    else expandedFolders.value.add(path);
  };

  const startEdit = (pathOrId: string, isCreation = false) => {
    editingNodeId.value = pathOrId;
    if (isCreation) {
      newName.value = "";
    } else {
      const node = store.resolvePath(pathOrId);
      newName.value = node ? node.name : "";
    }
  };

  const cancelEdit = () => {
    editingNodeId.value = null;
    newName.value = "";
  };

  const flatList = computed<FlatTreeItem[]>(() => {
    if (!store.isInitialized) return [];

    const rootNode = store.resolvePath(rootPath);
    if (!(rootNode instanceof VirtualFolder)) return [];

    const query = searchQuery.value?.trim().toLowerCase();
    const list: FlatTreeItem[] = [];

    // --- Search Mode ---
    if (query) {
      const traverse = (node: VirtualFolder | VirtualFile) => {
        if (node.name.toLowerCase().includes(query) && node.path !== rootPath) {
          list.push({
            type: node instanceof VirtualFolder ? "folder" : "file",
            path: node.path,
            name: node.name,
            parentPath: node.parent?.path ?? null,
            indentLevel: 0,
            isExpanded: false,
            isFolder: node instanceof VirtualFolder,
          });
        }
        if (node instanceof VirtualFolder) {
          for (const child of node.children.values()) {
            if (child instanceof VirtualFolder) traverse(child);
          }
        }
      };
      traverse(rootNode);
      return list;
    }

    // --- Tree Mode ---
    const traverse = (folder: VirtualFolder, level: number) => {
      // 1. Check for "New Item" input placeholder
      if (
        editingNodeId.value?.startsWith(`new:`) &&
        editingNodeId.value.includes(`:${folder.path}:`)
      ) {
        list.push({
          type: "input",
          id: editingNodeId.value,
          path: folder.path, // Parent path
          name: "",
          parentPath: folder.path,
          indentLevel: level,
        });
      }

      // 2. Sort children: Folders first, then Files, both alphabetical
      const children = Array.from(folder.children.values());
      children.sort((a, b) => {
        const aIsDir = a instanceof VirtualFolder;
        const bIsDir = b instanceof VirtualFolder;
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.name.localeCompare(b.name);
      });

      // 3. Process children
      for (const node of children) {
        if (editingNodeId.value === node.path) {
          // Edit Mode Placeholder
          list.push({
            type: "input",
            id: node.path,
            path: node.path,
            name: node.name,
            parentPath: folder.path,
            indentLevel: level,
          });
        } else {
          // View Mode Item
          const isFolder = node instanceof VirtualFolder;
          const isExpanded = isFolder && expandedFolders.value.has(node.path);

          list.push({
            type: isFolder ? "folder" : "file",
            path: node.path,
            name: node.name,
            parentPath: folder.path,
            indentLevel: level,
            isExpanded,
            isFolder,
          });

          if (isFolder && isExpanded) {
            traverse(node as VirtualFolder, level + 1);
          }
        }
      }
    };

    traverse(rootNode, 0);
    return list;
  });

  return {
    expandedFolders,
    editingNodeId,
    newName,
    flatList,
    toggleExpand,
    startEdit,
    cancelEdit,
  };
}
