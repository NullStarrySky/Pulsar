<!-- src/schema/CharacterLibrary.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import {
  useFileSystemStore,
  isFolderNode,
} from "@/features/FileSystem/FileSystem.store";
import { DEFAULT, EMPTY_FOLDER } from "@/features/FileSystem/commands";
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
import { useUIStore } from "@/features/UI/UI.store";
import { useInlineResources } from "@/schema/manifest/composables/useInlineResources";
import { newManifest } from "@/schema/manifest/manifest.ts";

const fsStore = useFileSystemStore();
const uiStore = useUIStore();

// --- 数据获取 ---
const characters = computed(() => {
  const charRoot = fsStore.fileStructure["character"];
  if (!charRoot || !isFolderNode(charRoot)) return [];
  return Object.keys(charRoot).filter((key) => isFolderNode(charRoot[key]));
});

// --- 新建角色逻辑 ---
const isCreateDialogOpen = ref(false);
const newCharacterName = ref("");
const isCreating = ref(false);

const handleCreateCharacter = async () => {
  const name = newCharacterName.value.trim();
  if (!name) return;
  if (characters.value.includes(name)) {
    alert("角色名称已存在");
    return;
  }

  isCreating.value = true;
  try {
    const charRootProxy = fsStore.fs["character"] as any;
    charRootProxy[name] = new DEFAULT(EMPTY_FOLDER);
    await Promise.all(fsStore.tasks);
    fsStore.tasks = [];

    const charProxy = charRootProxy[name] as any;
    const folders = ["character", "chat", "template", "lorebook", "preset"];
    for (const folder of folders) {
      charProxy[folder] = new DEFAULT(EMPTY_FOLDER);
    }
    await Promise.all(fsStore.tasks);
    fsStore.tasks = [];

    await charProxy["character"].createTypedFile(name, "character", false);
    charProxy["manifest.[manifest].json"] = newManifest();

    isCreateDialogOpen.value = false;
    newCharacterName.value = "";
  } catch (e) {
    console.error("创建角色失败", e);
  } finally {
    isCreating.value = false;
  }
};

// --- 交互逻辑 ---
const handleCardClick = async (charName: string) => {
  const charPath = `character/${charName}`;
  const chatPath = `${charPath}/chat`;
  const templatePath = `${charPath}/template`;

  // 设置选中的角色
  uiStore.setActiveCharacter(charName);

  const chatNode = fsStore.getNodeByPath(fsStore.fileStructure, chatPath);
  let targetFile = "";

  if (chatNode && isFolderNode(chatNode)) {
    const files = Object.keys(chatNode).filter((f) => f.endsWith(".json"));
    if (files.length > 0) {
      targetFile = `${chatPath}/${files[0]}`;
    }
  }

  if (!targetFile) {
    try {
      const charProxy = fsStore.fs["character"][charName] as any;
      if (
        !isFolderNode(fsStore.getNodeByPath(fsStore.fileStructure, chatPath))
      ) {
        charProxy["chat"] = new DEFAULT(EMPTY_FOLDER);
      }
      if (
        !isFolderNode(
          fsStore.getNodeByPath(fsStore.fileStructure, templatePath)
        )
      ) {
        charProxy["template"] = new DEFAULT(EMPTY_FOLDER);
      }
      await Promise.all(fsStore.tasks);
      fsStore.tasks = [];

      const chatProxy = charProxy["chat"];
      await chatProxy.createTypedFile(charName, "chat", false);
      const tplProxy = charProxy["template"];
      await tplProxy.createTypedFile("template", "chat", false);
      await Promise.all(fsStore.tasks);

      targetFile = `${chatPath}/${charName}.[chat].json`;
    } catch (e) {
      console.error("自动创建对话资源失败", e);
      return;
    }
  }

  if (targetFile) {
    uiStore.openFile(targetFile);
  }
};

const handleEditClick = (e: Event, charName: string) => {
  e.stopPropagation();
  const charPath = `character/${charName}`;

  // 1. 设置被选中的角色到 uiStore
  uiStore.setActiveCharacter(charName);
  // 2. 将 activeFile 指向角色目录（可选，取决于 ManifestPanel 的降级策略，但这里主要是为了语义正确）
  uiStore.setActiveFile(charPath);

  // 3. 打开指定的侧栏面板
  uiStore.toggleRightSidebar("manifest-config");
};

const getCoverUrl = (charName: string) => {
  const path = ref<string>(`character/${charName}`);
  const url = useInlineResources(path).avatar.src;
  return url;
};
</script>

<template>
  <div class="h-full w-full overflow-y-auto bg-background p-6 md:p-8">
    <!-- 标题区域 -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">角色库</h1>
        <p class="text-muted-foreground">管理你的角色卡片与对话环境</p>
      </div>
    </div>

    <!-- Grid 布局 -->
    <div
      class="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
    >
      <!-- 新建角色卡片 -->
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

      <!-- 角色卡片列表 -->
      <Card
        v-for="char in characters"
        :key="char"
        class="group relative overflow-hidden rounded-xl border-border bg-card transition-all hover:shadow-md cursor-pointer"
        @click="handleCardClick(char)"
      >
        <CardContent class="p-0">
          <AspectRatio :ratio="3 / 4">
            <!-- 图片层 -->
            <div class="h-full w-full overflow-hidden bg-muted">
              <img
                :src="getCoverUrl(char).value"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                alt="Cover"
                @error="
                  (e) => (e.target as HTMLImageElement).src = defaultCover
                "
              />
            </div>

            <!-- 渐变遮罩层 -->
            <div
              class="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent opacity-80"
            ></div>

            <!-- 内容层 -->
            <div class="absolute inset-0 flex flex-col justify-end p-4">
              <div class="flex items-center gap-2">
                <User class="h-4 w-4 text-white/70" />
                <h3 class="truncate text-lg font-bold text-white shadow-sm">
                  {{ char }}
                </h3>
              </div>
            </div>

            <!-- 悬浮操作栏 -->
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
