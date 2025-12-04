<!-- src/features/FileSystem/ResourceSelector/ResourceSelector.vue -->
<script setup lang="ts">
import { ref, computed, toRef, onMounted } from "vue";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-vue-next";
import join from "url-join";

// Stores
import {
  useFileSystemStore,
  VirtualFolder,
} from "@/features/FileSystem/FileSystem.store";
import {
  useFileTree,
  type FlatTreeItem,
} from "@/features/FileSystem/FileTree/composables/useFileTree";

// Components
import ResourceTreeItem from "./ResourceTreeItem.vue";

defineOptions({ name: "ResourceSelector" });

const props = defineProps<{
  rootPath: string;
  modelValue: string[]; // Selected paths
  searchQuery?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
}>();

const store = useFileSystemStore();

// --- File Tree Logic ---
const { flatList, expandedFolders, toggleExpand } = useFileTree(
  props.rootPath,
  toRef(props, "searchQuery")
);

// --- Root Node Logic (New) ---

// 1. 获取根节点实例
const rootNode = computed(() => store.resolvePath(props.rootPath));

// 2. 构造根节点的 TreeItem 表现形式
const rootTreeItem = computed<FlatTreeItem | null>(() => {
  const node = rootNode.value;
  // 确保根节点存在且是文件夹
  if (!node || !(node instanceof VirtualFolder)) return null;

  return {
    type: "folder",
    path: node.path,
    // 如果 name 为空（例如是 FS 根目录），使用 "/" 或 fallback
    name: node.name || props.rootPath || "/",
    parentPath: node.parent?.path ?? null,
    indentLevel: 0, // 根节点层级为 0
    isExpanded: expandedFolders.value.has(node.path),
    isFolder: true,
  };
});

// 3. 组合最终列表：Root + Children
const displayList = computed<FlatTreeItem[]>(() => {
  if (!rootTreeItem.value) return [];

  const isRootExpanded = expandedFolders.value.has(props.rootPath);
  const isSearching = !!props.searchQuery;

  // 如果根节点没展开且不在搜索模式下，只显示根节点自身
  if (!isRootExpanded && !isSearching) {
    return [rootTreeItem.value];
  }

  // 这里的 flatList 是 useFileTree 返回的内容（原顶层），现在变成根节点的子集
  // 所以需要视觉上向右缩进一级
  const children = flatList.value.map((item) => ({
    ...item,
    indentLevel: item.indentLevel + 1,
  }));

  return [rootTreeItem.value, ...children];
});

// 4. 初始化时默认展开根节点，避免用户看到一个只有一行的折叠列表
onMounted(() => {
  if (!expandedFolders.value.has(props.rootPath)) {
    toggleExpand(props.rootPath);
  }
});

// --- Selection Logic ---

// 辅助：检查路径关系
const isAncestor = (ancestor: string, path: string) =>
  path.startsWith(ancestor + "/") && path !== ancestor;

const isOrIsAncestor = (ancestor: string, path: string) =>
  path === ancestor || path.startsWith(ancestor + "/");

// 计算每个节点的状态：checked | indeterminate | unchecked
const getItemState = (
  path: string,
  isFolder: boolean
): "checked" | "indeterminate" | "unchecked" => {
  const selected = props.modelValue;

  if (selected.some((s) => isOrIsAncestor(s, path))) {
    return "checked";
  }

  if (isFolder) {
    if (selected.some((s) => isAncestor(path, s))) {
      return "indeterminate";
    }
  }

  return "unchecked";
};

// 核心：处理点击 Checkbox
const handleToggle = (path: string, isFolder: boolean) => {
  const currentState = getItemState(path, isFolder);
  const nextSet = new Set(props.modelValue);

  if (currentState === "unchecked" || currentState === "indeterminate") {
    // === 执行选中 ===
    for (const p of nextSet) {
      if (isAncestor(path, p)) {
        nextSet.delete(p);
      }
    }
    nextSet.add(path);

    // 向上合并优化 (Compaction)
    let currentPath = path;
    while (true) {
      // 这里的逻辑已兼容选中根目录的情况：
      // 如果 currentPath 是 rootPath，parentDir 将是 rootPath 的上级
      // 下面的 if 会检测并 break，防止向上越界
      const parentDir = join(currentPath, "..");

      // 防止越过 rootPath (如果选中的就是 rootPath，parentDir 不在 rootPath 内，且不等于 rootPath，会 break)
      // 注意：这里的判断确保了我们不会去操作 rootPath 之外的祖先
      if (
        !isOrIsAncestor(props.rootPath, parentDir) &&
        parentDir !== props.rootPath
      )
        break;

      const parentNode = store.resolvePath(parentDir);
      if (!(parentNode instanceof VirtualFolder)) break;

      const allChildren = Array.from(parentNode.children.values());
      const allChildrenSelected = allChildren.every((child) =>
        nextSet.has(child.path)
      );

      if (allChildrenSelected && allChildren.length > 0) {
        allChildren.forEach((child) => nextSet.delete(child.path));
        nextSet.add(parentNode.path);
        currentPath = parentNode.path;
      } else {
        break;
      }
    }
  } else {
    // === 执行取消选中 ===
    if (nextSet.has(path)) {
      nextSet.delete(path);
    } else {
      const ancestorPath = Array.from(nextSet).find((s) => isAncestor(s, path));
      if (ancestorPath) {
        nextSet.delete(ancestorPath);

        const ancestorNode = store.resolvePath(ancestorPath);
        if (ancestorNode instanceof VirtualFolder) {
          const selectAllExceptTarget = (node: VirtualFolder) => {
            for (const child of node.children.values()) {
              if (child.path === path || isAncestor(path, child.path)) {
                if (child.path !== path && child instanceof VirtualFolder) {
                  selectAllExceptTarget(child);
                }
              } else {
                nextSet.add(child.path);
              }
            }
          };
          selectAllExceptTarget(ancestorNode);
        }
      }
    }
  }

  emit("update:modelValue", Array.from(nextSet));
};
</script>

<template>
  <div class="h-full w-full relative border rounded-md bg-background">
    <!-- Loading State -->
    <div
      v-if="!store.isInitialized"
      class="absolute inset-0 flex items-center justify-center bg-background/50 z-10"
    >
      <Loader2 class="animate-spin text-muted-foreground" />
    </div>

    <ScrollArea class="h-full w-full">
      <div class="w-full h-full min-h-[50px] pb-2 pt-1">
        <!-- 使用 displayList 替代 flatList -->
        <ul v-if="displayList.length > 0" class="space-y-0.5 select-none">
          <li v-for="item in displayList" :key="item.path">
            <ResourceTreeItem
              v-if="item.type !== 'input'"
              :item="item"
              :selection-state="getItemState(item.path, !!item.isFolder)"
              @toggle-expand="item.isFolder && toggleExpand(item.path)"
              @toggle-select="handleToggle(item.path, !!item.isFolder)"
            />
          </li>
        </ul>
        <div
          v-else
          class="flex h-full flex-col items-center justify-center p-4 text-sm text-muted-foreground"
        >
          <div class="mb-2">无内容</div>
        </div>
      </div>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  </div>
</template>
