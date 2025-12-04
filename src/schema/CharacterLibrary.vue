<script setup lang="ts">
import { ref, computed } from "vue";
import {
  useFileSystemStore,
  VirtualFolder,
  VirtualFile,
} from "@/features/FileSystem/FileSystem.store";
import { useUIStore } from "@/features/UI/UI.store";
// ... 其他 UI 组件导入保持不变 ...
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Plus, Settings2, User } from "lucide-vue-next";
import defaultCover from "@/assets/default.jpg";
import urlJoin from "url-join";

// 引入新封装的逻辑
import { createCharacterEnvironment } from "@/schema/SemanticType";

const fsStore = useFileSystemStore();
const uiStore = useUIStore();

// --- 数据模型 & 数据获取  ---
type CharacterItem = {
  name: string;
  path: string;
  avatarUrl: string;
};

const characters = computed<CharacterItem[]>(() => {
  // ... 原有的 computed 代码保持不变 ...
  const charRoot = fsStore.root.resolve("character");
  if (!charRoot || !(charRoot instanceof VirtualFolder)) return [];
  const list: CharacterItem[] = [];
  for (const [name, node] of charRoot.children.entries()) {
    if (node instanceof VirtualFolder) {
      let avatarUrl = defaultCover;
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

// --- 新建角色逻辑 ---
const isCreateDialogOpen = ref(false);
const newCharacterName = ref("");
const isCreating = ref(false);

const handleCreateCharacter = async () => {
  const name = newCharacterName.value.trim();
  if (!name) return;

  const charRoot = fsStore.root.resolve("character");
  // 类型检查
  if (!(charRoot instanceof VirtualFolder)) {
    console.error("Character root directory missing");
    return;
  }

  // 检查名称重复
  if (charRoot.children.has(name)) {
    alert("角色名称已存在");
    return;
  }

  isCreating.value = true;
  try {
    // --- 核心修改：调用 SemanticType 中定义的创建环境逻辑 ---
    // 这里的 charRoot 符合 IFileSystemFolder 接口
    await createCharacterEnvironment(charRoot, name);

    isCreateDialogOpen.value = false;
    newCharacterName.value = "";
  } catch (e) {
    console.error("创建角色失败", e);
    alert("创建失败: " + (e as Error).message);
  } finally {
    isCreating.value = false;
  }
};

// --- 交互逻辑 (handleCardClick, handleEditClick) 保持不变 ---
const handleCardClick = async (char: CharacterItem) => {
  // ... 原有逻辑 ...
  const charName = char.name;
  const charPath = char.path;

  const chatFolderPath = urlJoin(charPath, "chat");
  const chatNode = fsStore.resolvePath(chatFolderPath);

  let targetFile = "";

  if (chatNode instanceof VirtualFolder) {
    for (const [fileName, node] of chatNode.children) {
      if (node instanceof VirtualFile && fileName.endsWith(".json")) {
        targetFile = node.path;
        break;
      }
    }
  }

  if (!targetFile) {
    try {
      let charFolder = fsStore.resolvePath(charPath) as VirtualFolder;
      if (!charFolder) return;

      let chatFolder = charFolder.children.get("chat");
      if (!(chatFolder instanceof VirtualFolder)) {
        chatFolder = await charFolder.createDir("chat");
      }

      let templateFolder = charFolder.children.get("template");
      if (!(templateFolder instanceof VirtualFolder)) {
        templateFolder = await charFolder.createDir("template");
      }

      const newChatFile = await (chatFolder as VirtualFolder).createTypedFile(
        charName,
        "chat",
        true
      );
      await (templateFolder as VirtualFolder).createTypedFile(
        "template",
        "chat",
        true
      );

      targetFile = newChatFile.path;
    } catch (e) {
      console.error("自动创建对话资源失败", e);
      return;
    }
  }

  if (targetFile) {
    uiStore.openFile(targetFile);
  }
};

const handleEditClick = (e: Event, char: CharacterItem) => {
  // ... 原有逻辑 ...
  e.stopPropagation();
  const charFolder = fsStore.resolvePath(char.path);
  if (charFolder instanceof VirtualFolder) {
    let manifestPath = "";
    for (const [name, node] of charFolder.children) {
      if (name.includes("[manifest]") || name === "manifest.json") {
        manifestPath = node.path;
        break;
      }
    }
    if (manifestPath) {
      uiStore.setActiveFile(manifestPath);
    } else {
      uiStore.setActiveFile(urlJoin(char.path, "manifest.[manifest].json"));
    }
  }
  uiStore.toggleRightSidebar("manifest-config");
};
</script>

<template>
  <!-- Template 保持完全不变 -->
  <div class="h-full w-full overflow-y-auto bg-background p-6 md:p-8">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">角色库</h1>
        <p class="text-muted-foreground">管理你的角色卡片与对话环境</p>
      </div>
    </div>

    <div
      class="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
    >
      <Dialog v-model:open="isCreateDialogOpen">
        <DialogTrigger as-child>
          <div
            class="group relative flex aspect-3/4 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/10 transition-colors hover:border-muted-foreground/50 hover:bg-muted/50"
          >
            <div
              class="flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm transition-transform group-hover:scale-110"
            >
              <Plus class="h-6 w-6 text-foreground" />
            </div>
            <span class="mt-4 text-sm font-medium text-muted-foreground"
              >新建角色</span
            >
          </div>
        </DialogTrigger>
        <DialogContent class="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>创建新角色</DialogTitle>
            <DialogDescription>
              请输入角色的唯一名称，我们将为您初始化文件结构。
            </DialogDescription>
          </DialogHeader>
          <div class="grid gap-4 py-4">
            <div class="grid gap-2">
              <Input
                v-model="newCharacterName"
                class="col-span-3"
                placeholder="例如: Alice"
                @keyup.enter="handleCreateCharacter"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="isCreateDialogOpen = false"
              >取消</Button
            >
            <Button @click="handleCreateCharacter" :disabled="isCreating"
              >创建</Button
            >
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card
        v-for="char in characters"
        :key="char.name"
        class="group relative overflow-hidden rounded-xl border-border bg-card transition-all hover:shadow-md cursor-pointer"
        @click="handleCardClick(char)"
      >
        <CardContent class="p-0">
          <AspectRatio :ratio="3 / 4">
            <div class="h-full w-full overflow-hidden bg-muted">
              <img
                :src="char.avatarUrl"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                alt="Cover"
                @error="(e) => (e.target as HTMLImageElement).src = defaultCover"
              />
            </div>
            <div
              class="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent opacity-80"
            ></div>
            <div class="absolute inset-0 flex flex-col justify-end p-4">
              <div class="flex items-center gap-2">
                <User class="h-4 w-4 text-white/70" />
                <h3 class="truncate text-lg font-bold text-white shadow-sm">
                  {{ char.name }}
                </h3>
              </div>
            </div>
            <div
              class="absolute right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              <Button
                variant="secondary"
                size="icon"
                class="h-8 w-8 rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/40"
                @click="(e: MouseEvent) => handleEditClick(e, char)"
              >
                <Settings2 class="h-4 w-4" />
                <span class="sr-only">设置</span>
              </Button>
            </div>
          </AspectRatio>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
