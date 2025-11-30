<!-- src/schema/chat/ChatEditor.vue -->
<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onUnmounted,
  onMounted,
  nextTick,
  type Ref,
  type Component,
  CSSProperties,
} from "vue";
import { push } from "notivue";

// --- Markstream Vue ---
import MarkdownRender from "markstream-vue";

// Features & Composables
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import { useResources } from "@/schema/manifest/composables/useResources.ts";
import { useFlattenedChat } from "./useFlattenedChat";
import { useChatScroll } from "./composables/useChatScroll";
import { useMessageEditor } from "./composables/useMessageEditor";

// Types
import {
  type RootChat,
  type FlatChatMessage,
  type AdditionalParts,
} from "./chat.types";
import { type role, type ExecuteContext } from "../shared.types";

// Components
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-elements/message";
// Response 组件已被移除，由 MarkdownRender 接管
// import { Response } from "@/components/ai-elements/response";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ChatInputArea from "./ChatInputArea.vue";

// Icons
import {
  Edit,
  GitFork,
  Trash2,
  PlusCircle,
  Sparkles,
  User,
  Bot,
  Cog,
  ChevronLeft,
  ChevronRight,
  Save,
  CopyPlus,
  GitBranchPlus,
  MessageSquarePlus,
  ChevronDown,
  Wand2,
} from "lucide-vue-next";

const props = defineProps<{
  path: string;
}>();

// --- 1. 数据同步逻辑 ---
const pathRef = computed(() => props.path);
const { content: remoteContent, sync } = useFileContent<RootChat>(pathRef);
const chatRef = ref<RootChat | null>(null);

watch(
  chatRef,
  (newContent) => {
    if (newContent) sync(newContent);
  },
  { deep: true }
);

watch(
  remoteContent,
  (newRemote) => {
    if (JSON.stringify(newRemote) !== JSON.stringify(chatRef.value)) {
      chatRef.value = newRemote ? JSON.parse(JSON.stringify(newRemote)) : null;
    }
  },
  { immediate: true, deep: true }
);

onUnmounted(() => sync.cancel());

// --- 2. 核心聊天逻辑 ---
const {
  flattenedChat,
  switchAlternative,
  deleteContainer,
  fork,
  appendMessage,
  appendMessageToLeaf,
  setMessageContent,
  generate,
  addNewMessage,
  addBlankMessage,
  addBlankBranch,
  addNewBranch,
  polish,
} = useFlattenedChat(chatRef as Ref<RootChat>);

// --- 3. 资源与上下文环境 ---
const {
  avatar: resourceAvatar,
  getExecuteContextSnapshot,
  background,
} = useResources(pathRef);

const defaultAvatarUrl = "";

const getAvatarSrc = (message: FlatChatMessage) => {
  if (message.role === "user") {
    return defaultAvatarUrl;
  }
  return resourceAvatar.src.value;
};

// 1. 处理润色逻辑的核心函数
async function handlePolishAction(
  target: { index: number } | { content: string; role: role }
) {
  if (!chatRef.value) return;

  try {
    const { CHAT, container, intention, remove } = polish(target);
    const baseContext = getExecuteContextSnapshot();

    const finalContext: ExecuteContext = Object.assign({}, baseContext, {
      CHAT,
      intention,
      container,
      remove,
      CTX: null as any,
    });
    finalContext.CTX = finalContext;

    if (
      finalContext.PRESET &&
      typeof finalContext.PRESET.generate === "function"
    ) {
      let unwatch: (() => void) | null = null;
      if (!("index" in target)) {
        const { watch } = await import("vue");
        unwatch = watch(
          () => container.alternatives[container.activeAlternative].content,
          (newContent) => {
            if (inputAreaRef.value) {
              inputAreaRef.value.setDraft(newContent);
            }
          }
        );
      }

      await finalContext.PRESET.generate(finalContext);

      if (unwatch) unwatch();
      push.success({ title: "润色完成" });
    } else {
      throw new Error("Preset does not support generation");
    }
  } catch (error) {
    console.error("Polish error:", error);
    push.error({ title: "润色失败", message: (error as Error).message });
  }
}

// 2. 绑定到 UI 事件
const inputAreaRef = ref();

function onPolishInput(content: string, role: role) {
  handlePolishAction({ content, role });
}

// --- 4. 生成逻辑 ---
async function handleGenerate(index?: number) {
  if (!chatRef.value) return;

  const selfContext = generate(index);
  const baseContext = getExecuteContextSnapshot();
  const finalContext: ExecuteContext = Object.assign(
    {},
    baseContext,
    selfContext
  );

  finalContext.CTX = finalContext as ExecuteContext;

  try {
    if (
      finalContext.PRESET &&
      typeof finalContext.PRESET.generate === "function"
    ) {
      const result = await finalContext.PRESET.generate(finalContext);
      if (result) {
        push.success({
          title: index === undefined ? "操作成功" : "重新生成成功",
          message:
            typeof result === "string"
              ? result
              : JSON.stringify(result, null, 2),
        });
      }
    } else {
      throw new Error("无有效生成函数 (PRESET.generate)");
    }
  } catch (error) {
    console.error(error);
    push.error({ title: "生成错误", message: (error as Error).message });
  }
}

// --- 5. UI 交互逻辑 (滚动 & 编辑) ---
const messageCount = computed(() => flattenedChat.value.messages.length);
const { messageListRef, isAtBottom, scrollToBottom, handleScroll } =
  useChatScroll(messageCount);

onMounted(() => scrollToBottom("auto"));

const {
  editingIndex,
  editingContent,
  startEdit,
  cancelEdit,
  saveEdit,
  saveAsNewMessage,
  saveAsNewBranch,
} = useMessageEditor(flattenedChat.value, {
  onSetContent: setMessageContent,
  onNewMessage: addNewMessage,
  onNewBranch: addNewBranch,
});

// --- 6. 消息操作定义 ---
const roleIcons: Record<role, Component> = {
  user: User,
  assistant: Bot,
  system: Cog,
};

interface MessageAction {
  label: string;
  icon: Component;
  action: (index: number, message: FlatChatMessage) => void;
  show: (message: FlatChatMessage) => boolean;
}

const messageActions: MessageAction[] = [
  {
    label: "编辑",
    icon: Edit,
    action: (i) => startEdit(i),
    show: (msg) => msg.content?.type === "message",
  },
  {
    label: "生成新版本",
    icon: Sparkles,
    action: (i) => handleGenerate(i),
    show: (msg) => msg.role === "assistant",
  },
  {
    label: "复刻为新版本",
    icon: GitFork,
    action: (i) => fork(i),
    show: () => true,
  },
  {
    label: "添加空白版本",
    icon: MessageSquarePlus,
    action: (i) => addBlankMessage(i, true),
    show: () => true,
  },
  {
    label: "润色此消息",
    icon: Wand2,
    action: (i) => handlePolishAction({ index: i }),
    show: () => true,
  },
  {
    label: "添加空分支",
    icon: GitBranchPlus,
    action: (i) => addBlankBranch(i, true),
    show: () => true,
  },
  {
    label: "在下方插入新消息",
    icon: PlusCircle,
    action: (i) => appendMessage(i),
    show: () => true,
  },
  {
    label: "删除",
    icon: Trash2,
    action: (i) => deleteContainer(i),
    show: () => true,
  },
];

// --- 7. 发送处理 ---
async function onSend(
  content: string,
  files: File[],
  role: role,
  shouldGenerate: boolean
) {
  const additionalParts: AdditionalParts[] = [];
  if (files.length > 0) {
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      additionalParts.push({
        type: file.type.startsWith("image/") ? "image" : "file",
        [file.type.startsWith("image/") ? "image" : "data"]: buffer,
        mediaType: file.type,
        filename: file.name,
      } as any);
    }
  }

  appendMessageToLeaf(content, role, {
    additionalParts: additionalParts.length > 0 ? additionalParts : undefined,
  });

  if (shouldGenerate) {
    await nextTick();
    handleGenerate();
  }
}

// 计算背景样式
const backgroundStyle = computed<CSSProperties>(() => {
  const bg = background.value;
  if (!bg || bg.type === "video") return {};

  const common: CSSProperties = {
    backgroundImage: `url("${bg.src}")`,
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 0,
    pointerEvents: "none",
  };

  switch (bg.mode) {
    case "contain":
      return {
        ...common,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      };
    case "cover":
      return {
        ...common,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      };
    case "tile":
      return { ...common, backgroundRepeat: "repeat" };
    case "center":
      return {
        ...common,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      };
    case "stretch":
      return { ...common, backgroundSize: "100% 100%" };
    default:
      return common;
  }
});
</script>

<template>
  <div
    v-if="chatRef"
    class="flex h-full flex-col rounded-xl border relative overflow-hidden"
  >
    <!-- 背景层 -->
    <div
      v-if="background"
      class="absolute inset-0 z-0 select-none pointer-events-none opacity-50 dark:opacity-30 bg-background/80"
    >
      <video
        v-if="background.type === 'video'"
        :src="background.src"
        autoplay
        loop
        muted
        playsinline
        class="w-full h-full"
        :class="{
          'object-cover': background.mode === 'cover',
          'object-contain': background.mode === 'contain',
          'object-fill': background.mode === 'stretch',
          'object-none': background.mode === 'center',
        }"
      ></video>

      <div v-else :style="backgroundStyle"></div>
    </div>

    <!-- 主体内容 -->
    <div class="relative z-10 flex-1 min-h-0 flex flex-col">
      <ScrollArea
        ref="messageListRef"
        class="h-full bg-transparent"
        @scroll="handleScroll"
      >
        <div class="p-4">
          <div
            v-for="(message, index) in flattenedChat.messages"
            :key="message.id"
            class="group mb-4 flex flex-col"
            :class="{
              'items-end': message.role === 'user',
              'items-start': message.role !== 'user',
            }"
          >
            <!-- 消息渲染主体 -->
            <div class="flex w-full max-w-[85%] items-start gap-3">
              <MessageAvatar
                v-if="message.role !== 'user'"
                :src="getAvatarSrc(message)"
              >
                <component :is="roleIcons[message.role]" class="size-5" />
              </MessageAvatar>

              <div class="grow">
                <Message
                  :from="message.role === 'system' ? 'assistant' : message.role"
                  class="w-full"
                >
                  <MessageContent>
                    <!-- 编辑模式 -->
                    <div v-if="editingIndex === index" class="space-y-2">
                      <Textarea
                        v-model="editingContent"
                        class="min-h-[120px]"
                      />
                      <div class="flex flex-wrap gap-2">
                        <Button size="sm" @click="saveEdit"
                          ><Save class="mr-2 size-4" />保存</Button
                        >
                        <Button
                          size="sm"
                          variant="secondary"
                          @click="saveAsNewMessage"
                          ><CopyPlus class="mr-2 size-4" />另存为消息</Button
                        >
                        <Button
                          size="sm"
                          variant="secondary"
                          @click="saveAsNewBranch"
                          ><GitBranchPlus
                            class="mr-2 size-4"
                          />另存为分支</Button
                        >
                        <Button size="sm" variant="ghost" @click="cancelEdit"
                          >取消</Button
                        >
                      </div>
                    </div>
                    <!-- 阅读模式：使用 markstream-vue 渲染 -->
                    <template v-else>
                      <div v-if="message.content">
                        <!-- 核心替换区域 -->
                        <MarkdownRender
                          v-if="message.content.type === 'message'"
                          :content="message.content.content"
                          class="max-w-none prose dark:prose-invert wrap-break-word text-sm leading-relaxed"
                        />

                        <div
                          v-else-if="message.content.type === 'branch'"
                          class="p-0 text-sm font-semibold flex items-center gap-2"
                        >
                          <GitFork class="size-4 text-muted-foreground" /> 分支:
                          {{ message.content.name || "未命名" }}
                        </div>
                      </div>
                      <div v-else class="italic text-muted-foreground">
                        (此消息未激活)
                      </div>
                    </template>
                  </MessageContent>
                </Message>
              </div>

              <MessageAvatar
                v-if="message.role === 'user'"
                :src="getAvatarSrc(message)"
              >
                <component :is="roleIcons.user" class="size-5" />
              </MessageAvatar>
            </div>

            <!-- 消息操作栏 -->
            <div
              class="mt-1 flex h-8 items-center justify-start opacity-0 transition-opacity group-hover:opacity-100"
              :class="{
                'pr-12': message.role === 'user',
                'pl-12': message.role !== 'user',
              }"
            >
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 rounded-full"
                  :disabled="message.activeAlternative === 0"
                  @click="
                    switchAlternative(index, message.activeAlternative - 1)
                  "
                >
                  <ChevronLeft class="size-4" />
                </Button>
                <span class="text-xs font-medium text-muted-foreground">
                  {{ message.activeAlternative + 1 }} /
                  {{ message.availableAlternativeCount }}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 rounded-full"
                  :disabled="
                    message.activeAlternative >=
                    message.availableAlternativeCount - 1
                  "
                  @click="
                    switchAlternative(index, message.activeAlternative + 1)
                  "
                >
                  <ChevronRight class="size-4" />
                </Button>
              </div>
              <div class="ml-2 flex items-center gap-1 border-l pl-2">
                <TooltipProvider :delay-duration="200">
                  <template
                    v-for="act in messageActions.filter((a) => a.show(message))"
                    :key="act.label"
                  >
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                          @click="act.action(index, message)"
                        >
                          <component :is="act.icon" class="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        ><p>{{ act.label }}</p></TooltipContent
                      >
                    </Tooltip>
                  </template>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>

      <Transition name="fade">
        <div v-if="!isAtBottom" class="absolute bottom-6 right-6 z-10">
          <Button
            variant="outline"
            size="icon"
            class="h-10 w-10 rounded-full shadow-lg"
            @click="scrollToBottom('smooth')"
          >
            <ChevronDown class="h-5 w-5" />
          </Button>
        </div>
      </Transition>
    </div>

    <!-- 底部输入组件 -->
    <ChatInputArea
      ref="inputAreaRef"
      @send="onSend"
      :disabled="!chatRef"
      @polish="onPolishInput"
    />
  </div>
  <div v-else class="flex h-full w-full items-center justify-center">
    <p class="text-muted-foreground">Loading Chat...</p>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
