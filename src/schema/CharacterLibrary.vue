<!-- src/schema/CharacterLibrary.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import {
  useFileSystemStore,
  VirtualFolder,
  VirtualFile,
} from "@/features/FileSystem/FileSystem.store";
import { useUIStore } from "@/features/UI/UI.store";
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
import { newManifest } from "@/schema/manifest/manifest.ts";
import urlJoin from "url-join";

const fsStore = useFileSystemStore();
const uiStore = useUIStore();

// --- 数据模型 ---
type CharacterItem = {
  name: string;
  path: string;
  avatarUrl: string;
};

// --- 数据获取 ---
const characters = computed<CharacterItem[]>(() => {
  // 1. 获取 character 根目录
  const charRoot = fsStore.root.resolve("character");
  if (!charRoot || !(charRoot instanceof VirtualFolder)) return [];

  const list: CharacterItem[] = [];

  // 2. 遍历子文件夹
  for (const [name, node] of charRoot.children.entries()) {
    if (node instanceof VirtualFolder) {
      let avatarUrl = defaultCover;

      // 3. 查找头像 (Avatar.*)
      // 注意：这里不使用 useInlineResources，因为在循环中使用 hook 开销较大且难以管理
      // 直接遍历子节点查找符合命名规则的文件
      for (const [childName, childNode] of node.children.entries()) {
        if (
          childNode instanceof VirtualFile &&
          childName.match(/^Avatar\.(png|jpg|jpeg|webp|gif)$/i)
        ) {
          avatarUrl = childNode.url; // 利用 VirtualNode 的 getter
          break;
        }
      }

      list.push({
        name,
        path: node.path,
        avatarUrl,
      });
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

  // 检查名称重复
  const charRoot = fsStore.root.resolve("character");
  if (charRoot instanceof VirtualFolder && charRoot.children.has(name)) {
    alert("角色名称已存在");
    return;
  }

  isCreating.value = true;
  try {
    if (!(charRoot instanceof VirtualFolder)) {
      throw new Error("Character root directory missing");
    }

    // 1. 创建角色文件夹
    const charFolder = await charRoot.createDir(name);

    // 2. 创建子文件夹结构
    const subFolders = ["chat", "template", "lorebook", "preset"];
    for (const folder of subFolders) {
      await charFolder.createDir(folder);
    }

    // 3. 创建角色定义文件 (typed file)
    // 根据 VirtualFolder.createTypedFile 签名: (baseName, semanticType, withTemplate)
    await charFolder.createTypedFile(name, "character", true);

    // 4. 创建 Manifest 文件
    // 直接写入内容
    await charFolder.createFile("manifest.[manifest].json", newManifest());

    isCreateDialogOpen.value = false;
    newCharacterName.value = "";
  } catch (e) {
    console.error("创建角色失败", e);
    alert("创建失败: " + (e as Error).message);
  } finally {
    isCreating.value = false;
  }
};

// --- 交互逻辑 ---

/**
 * 点击卡片：进入聊天界面
 */
const handleCardClick = async (char: CharacterItem) => {
  const charName = char.name;
  const charPath = char.path;

  // 1. 设置 UI 状态
  uiStore.setActiveCharacter(charName);

  // 2. 寻找最近的聊天记录或创建新的
  const chatFolderPath = urlJoin(charPath, "chat");
  const chatNode = fsStore.resolvePath(chatFolderPath);

  let targetFile = "";

  // 尝试在 chat 目录下找文件
  if (chatNode instanceof VirtualFolder) {
    // 寻找任意 .json 文件作为最近对话
    for (const [fileName, node] of chatNode.children) {
      if (node instanceof VirtualFile && fileName.endsWith(".json")) {
        targetFile = node.path;
        break;
      }
    }
  }

  // 如果没有找到对话文件，初始化默认环境
  if (!targetFile) {
    try {
      // 确保目录存在
      let charFolder = fsStore.resolvePath(charPath) as VirtualFolder;
      if (!charFolder) return; // 理论上不应该发生

      let chatFolder = charFolder.children.get("chat");
      if (!(chatFolder instanceof VirtualFolder)) {
        chatFolder = await charFolder.createDir("chat");
      }

      let templateFolder = charFolder.children.get("template");
      if (!(templateFolder instanceof VirtualFolder)) {
        templateFolder = await charFolder.createDir("template");
      }

      // 创建默认聊天文件和模板
      // 注意：VirtualFolder 实例方法调用
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

/**
 * 点击设置按钮：打开配置侧边栏
 */
const handleEditClick = (e: Event, char: CharacterItem) => {
  e.stopPropagation();

  // 1. 设置 activeCharacter，这样 ManifestPanel 里的 useResources 就能根据上下文工作
  uiStore.setActiveCharacter(char.name);

  // 2. 设置 activeFile。
  // 为了让 ManifestPanel 正确加载，我们需要 activeFile 指向角色目录下的某个文件，
  // 或者 ManifestPanel 的逻辑能处理目录。
  // 根据 useResources 的逻辑：
  // const parentDir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  // 所以我们可以将 activeFile 设置为该角色下的 manifest 文件，或者主角色卡文件。

  // 尝试寻找 manifest 文件
  const charFolder = fsStore.resolvePath(char.path);
  if (charFolder instanceof VirtualFolder) {
    let manifestPath = "";
    for (const [name, node] of charFolder.children) {
      if (name.includes("[manifest]") || name === "manifest.json") {
        manifestPath = node.path;
        break;
      }
    }

    // 如果找到了 manifest，将其设为 activeFile，这样 useResources 就能直接定位
    if (manifestPath) {
      uiStore.setActiveFile(manifestPath);
    } else {
      // 否则设为角色目录路径（依赖后续逻辑处理目录路径的情况，或者指向一个假文件）
      // 这里的妥协方案：指向角色目录，useResources 需要能处理 activeFilePath 是目录的情况，
      // 或者我们将 activeFile 指向角色卡文件
      uiStore.setActiveFile(urlJoin(char.path, "manifest.[manifest].json"));
    }
  }

  // 3. 打开侧边栏
  uiStore.toggleRightSidebar("manifest-config");
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
        :key="char.name"
        class="group relative overflow-hidden rounded-xl border-border bg-card transition-all hover:shadow-md cursor-pointer"
        @click="handleCardClick(char)"
      >
        <CardContent class="p-0">
          <AspectRatio :ratio="3 / 4">
            <!-- 图片层 -->
            <div class="h-full w-full overflow-hidden bg-muted">
              <img
                :src="char.avatarUrl"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                alt="Cover"
                @error="(e) => (e.target as HTMLImageElement).src = defaultCover"
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
                  {{ char.name }}
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
