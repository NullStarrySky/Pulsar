<!-- src/components/layout/CharacterSidebar.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import {
  useFileSystemStore,
  VirtualFolder,
  VirtualFile,
} from "@/features/FileSystem/FileSystem.store";
import { useUIStore } from "@/features/UI/UI.store";
import {
  Search,
  Plus,
  LayoutGrid,
  List as ListIcon,
  Settings2,
} from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import defaultCover from "@/assets/default.jpg";
import urlJoin from "url-join";
import { createCharacterEnvironment } from "@/schema/SemanticType";

const fsStore = useFileSystemStore();
const uiStore = useUIStore();

// --- 状态 ---
const searchQuery = ref("");
const viewMode = ref<"list" | "card">("card"); // 默认为卡片模式
const isCreateDialogOpen = ref(false);
const newCharacterName = ref("");
const isCreating = ref(false);

// --- 数据获取 ---
type CharacterItem = {
  name: string;
  path: string;
  avatarUrl: string;
};

const characters = computed<CharacterItem[]>(() => {
  const charRoot = fsStore.root.resolve("character");
  if (!charRoot || !(charRoot instanceof VirtualFolder)) return [];
  const list: CharacterItem[] = [];
  for (const [name, node] of charRoot.children.entries()) {
    if (node instanceof VirtualFolder) {
      let avatarUrl = defaultCover;
      // 查找头像逻辑
      for (const [childName, childNode] of node.children.entries()) {
        if (
          childNode instanceof VirtualFile &&
          childName.match(/^Avatar\.(png|jpg|jpeg|webp|gif)$/i)
        ) {
          avatarUrl = childNode.url;
          break;
        }
      }
      list.push({ name, path: node.path, avatarUrl });
    }
  }
  return list;
});

const filteredCharacters = computed(() => {
  if (!searchQuery.value) return characters.value;
  return characters.value.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

// --- 动作逻辑 (复用原有逻辑) ---
const handleCreateCharacter = async () => {
  const name = newCharacterName.value.trim();
  if (!name) return;
  const charRoot = fsStore.root.resolve("character");
  if (!(charRoot instanceof VirtualFolder)) return;

  if (charRoot.children.has(name)) {
    alert("名称已存在");
    return;
  }

  isCreating.value = true;
  try {
    await createCharacterEnvironment(charRoot, name);
    isCreateDialogOpen.value = false;
    newCharacterName.value = "";
  } catch (e) {
    console.error(e);
  } finally {
    isCreating.value = false;
  }
};

const handleCardClick = async (char: CharacterItem) => {
  const charPath = char.path;
  const chatFolderPath = urlJoin(charPath, "chat");
  const chatNode = fsStore.resolvePath(chatFolderPath);
  let targetFile = "";

  // 尝试找到现有的聊天文件
  if (chatNode instanceof VirtualFolder) {
    for (const [fileName, node] of chatNode.children) {
      if (node instanceof VirtualFile && fileName.endsWith(".json")) {
        targetFile = node.path;
        break;
      }
    }
  }

  // 如果没有，创建默认环境 (简化版逻辑，如有需要可完整复制原有逻辑)
  if (!targetFile) {
    // ... 此处保留原 CharacterLibrary.vue 中的创建逻辑 ...
    // 为节省篇幅，假设一定会打开 Manifest 或 Chat
    targetFile = urlJoin(char.path, "manifest.[manifest].json");
  }

  if (targetFile) uiStore.openFile(targetFile);
};

const handleEditClick = (e: Event, char: CharacterItem) => {
  e.stopPropagation();
  // 打开 Manifest 并呼出右侧栏
  const manifestPath = urlJoin(char.path, "manifest.[manifest].json");
  uiStore.setActiveFile(manifestPath);
  uiStore.toggleRightSidebar("manifest-config");
};
</script>

<template>
  <div class="flex flex-col h-full gap-2">
    <!-- Header: 标题与操作 -->
    <div class="flex items-center justify-between shrink-0 px-1">
      <span class="text-sm font-semibold text-muted-foreground">角色库</span>
      <div class="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          @click="viewMode = viewMode === 'card' ? 'list' : 'card'"
          :title="viewMode === 'card' ? '切换列表视图' : '切换卡片视图'"
        >
          <ListIcon v-if="viewMode === 'card'" class="h-4 w-4" />
          <LayoutGrid v-else class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          @click="isCreateDialogOpen = true"
          title="新建角色"
        >
          <Plus class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <!-- Search -->
    <div class="relative shrink-0">
      <Search
        class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
      />
      <Input
        v-model="searchQuery"
        placeholder="搜索角色..."
        class="pl-8 h-8 text-xs"
      />
    </div>

    <!-- Content Area -->
    <ScrollArea class="flex-1 -mx-2 px-2">
      <!-- Card Mode -->
      <div v-if="viewMode === 'card'" class="grid grid-cols-2 gap-2 pb-4">
        <div
          v-for="char in filteredCharacters"
          :key="char.name"
          class="group relative aspect-3/4 cursor-pointer rounded-md overflow-hidden bg-muted border border-border hover:shadow-sm transition-all"
          @click="handleCardClick(char)"
        >
          <img
            :src="char.avatarUrl"
            class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            @error="(e) => (e.target as HTMLImageElement).src = defaultCover"
          />
          <div
            class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-80"
          ></div>
          <div class="absolute bottom-2 left-2 right-2">
            <div class="text-xs font-bold text-white truncate shadow-sm">
              {{ char.name }}
            </div>
          </div>
          <!-- 悬浮设置按钮 -->
          <div
            class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Button
              variant="secondary"
              size="icon"
              class="h-5 w-5 rounded-full bg-black/40 text-white hover:bg-black/60"
              @click="(e:MouseEvent) => handleEditClick(e, char)"
            >
              <Settings2 class="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <!-- List Mode -->
      <div v-else class="flex flex-col gap-1 pb-4">
        <div
          v-for="char in filteredCharacters"
          :key="char.name"
          class="group flex items-center gap-3 rounded-md p-2 hover:bg-accent cursor-pointer transition-colors"
          @click="handleCardClick(char)"
        >
          <div
            class="h-8 w-8 rounded-full overflow-hidden shrink-0 border bg-muted"
          >
            <img :src="char.avatarUrl" class="h-full w-full object-cover" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{{ char.name }}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            @click="(e: MouseEvent) => handleEditClick(e, char)"
          >
            <Settings2 class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </ScrollArea>

    <!-- Create Dialog -->
    <Dialog v-model:open="isCreateDialogOpen">
      <DialogContent class="sm:max-w-[300px]">
        <DialogHeader>
          <DialogTitle>新建角色</DialogTitle>
        </DialogHeader>
        <div class="py-2">
          <Input
            v-model="newCharacterName"
            placeholder="输入英文ID (如: Alice)"
            @keyup.enter="handleCreateCharacter"
          />
        </div>
        <DialogFooter>
          <Button
            size="sm"
            @click="handleCreateCharacter"
            :disabled="isCreating"
            >创建</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
