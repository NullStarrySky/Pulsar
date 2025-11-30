// src/features/FileSystem/FileTree/composables/useFileTree.ts
import { ref, computed, watch, onMounted, type Ref } from "vue";
import join from "url-join";
import {
  useFileSystemStore,
  isFolderNode,
  type FolderContent,
} from "@/features/FileSystem/FileSystem.store";
import { basename } from "@/features/FileSystem/fs.api";

export interface FlatTreeItem {
  type: "folder" | "file" | "input";
  path: string; // 对于 input 类型，这是 parentPath
  name: string;
  indentLevel: number;
  isExpanded?: boolean;
  id?: string; // 用于 input 的唯一标识
}

export function useFileTree(
  rootPath: string,
  searchQuery: Ref<string | undefined>
) {
  const store = useFileSystemStore();
  const expandedFolders = ref<Set<string>>(new Set());
  const editingNodeId = ref<string | null>(null);
  const newName = ref("");

  // Storage Persistence
  const storageKey = `VFS_expandedFolders_${rootPath}`;

  onMounted(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) expandedFolders.value = new Set(JSON.parse(saved));
    } catch (e) {
      console.error(e);
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

  const startEdit = async (pathOrId: string, isCreation = false) => {
    // isCreation logic handled by caller creating a specific ID format
    editingNodeId.value = pathOrId;
    if (isCreation) newName.value = "";
    else newName.value = await basename(pathOrId);
  };

  const cancelEdit = () => {
    editingNodeId.value = null;
    newName.value = "";
  };

  const flatList = computed<FlatTreeItem[]>(() => {
    const query = searchQuery.value?.trim().toLowerCase();

    // Search Mode
    if (query) {
      const results: FlatTreeItem[] = [];
      const traverse = (path: string, node: any) => {
        const name = path.split("/").pop()!;
        if (name.toLowerCase().includes(query)) {
          results.push({
            type: isFolderNode(node) ? "folder" : "file",
            path,
            name,
            indentLevel: 0,
            isExpanded: false,
          });
        }
        if (isFolderNode(node)) {
          Object.entries(node).forEach(([k, v]) => traverse(join(path, k), v));
        }
      };
      const root = store.getNodeByPath(store.fileStructure, rootPath);
      if (root) traverse(rootPath, root);
      return results.slice(1); // Skip root itself if needed
    }

    // Normal Mode
    const list: FlatTreeItem[] = [];
    const traverse = (currentPath: string, level: number) => {
      const node = store.getNodeByPath<FolderContent>(
        store.fileStructure,
        currentPath
      );
      if (!node) return;

      // Check if we are creating a new item inside this folder
      if (
        editingNodeId.value?.startsWith(`new:`) &&
        editingNodeId.value.includes(`:${currentPath}:`)
      ) {
        list.push({
          type: "input",
          id: editingNodeId.value,
          path: currentPath,
          name: "",
          indentLevel: level,
        });
      }

      const children = Object.entries(node);
      const folders = children
        .filter(([, v]) => isFolderNode(v))
        .sort(([a], [b]) => a.localeCompare(b));
      const files = children
        .filter(([, v]) => !isFolderNode(v))
        .sort(([a], [b]) => a.localeCompare(b));

      [...folders, ...files].forEach(([name, childNode]) => {
        const childPath = join(currentPath, name);

        if (editingNodeId.value === childPath) {
          list.push({
            type: "input",
            id: childPath,
            path: currentPath,
            name,
            indentLevel: level,
          });
        } else {
          const isFolder = isFolderNode(childNode);
          const expanded = expandedFolders.value.has(childPath);
          list.push({
            type: isFolder ? "folder" : "file",
            path: childPath,
            name,
            indentLevel: level,
            isExpanded: expanded,
          });
          if (isFolder && expanded) traverse(childPath, level + 1);
        }
      });
    };
    traverse(rootPath, 0);
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
