<!-- src/schema/chat/ChatEditor.vue -->
<script setup lang="ts">
import {
  computed,
  onMounted,
  type CSSProperties,
  type Reactive,
  nextTick,
  ref,
} from "vue";
import { push } from "notivue";

// Features & Composables
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import { useResources } from "@/schema/manifest/composables/useResources.ts";
import { useFlattenedChat } from "./useFlattenedChat";
import { useChatScroll } from "./composables/useChatScroll";
import { useMessageEditor } from "./composables/useMessageEditor";

// Types
import { type RootChat, type AdditionalParts } from "./chat.types";
import { type role } from "../shared.types";

// Components
import { ScrollArea } from "@/components/ui/scroll-area";
import ChatInputArea from "./ChatInputArea.vue";
import ChatBubble from "./ChatBubble.vue";
import MessageScope from "./MessageScope.vue"; // [NEW] 引入包装组件
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-vue-next";

const props = defineProps<{ path: string }>();

// --- State & Logic ---
const pathRef = computed(() => props.path);
const chatReactive = useFileContent<RootChat>(pathRef);

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
  addNewBranch,
  addBlankBranch,
  polish,
} = useFlattenedChat(chatReactive);

const {
  avatar: resourceAvatar,
  getExecuteContextSnapshot,
  background,
} = useResources(pathRef);

// --- Editor Logic ---
const { editingIndex, editingContent, startEdit, cancelEdit, saveEdit } =
  useMessageEditor(flattenedChat.value, {
    onSetContent: setMessageContent,
    onNewMessage: addNewMessage,
    onNewBranch: addNewBranch,
  });

// --- Scroll Logic ---
const messageCount = computed(() => flattenedChat.value.messages.length);
const { messageListRef, isAtBottom, scrollToBottom, handleScroll } =
  useChatScroll(messageCount);

onMounted(() => scrollToBottom("auto"));

// --- Actions Handlers ---
const inputAreaRef = ref();

// 通用动作分发器
function handleMessageAction(action: string, index: number) {
  switch (action) {
    case "regenerate":
      handleGenerate(index);
      break;
    case "delete":
      deleteContainer(index);
      break;
    case "branch":
      addBlankBranch(index, true);
      break;
    case "polish":
      handlePolishAction({ index });
      break;
    case "fork":
      fork(index);
      break;
    case "insert":
      appendMessage(index);
      break;
    case "copy":
      const content = flattenedChat.value.messages[index]?.content;
      if (content?.type === "message")
        navigator.clipboard.writeText(content.content);
      push.success("已复制到剪贴板");
      break;
  }
}

// 润色逻辑
async function handlePolishAction(
  target: { index: number } | { content: string; role: role }
) {
  if (!chatReactive.value) return;
  try {
    const { CHAT, container, intention, remove } = polish(target);
    const finalContext = {
      ...getExecuteContextSnapshot(),
      CHAT,
      intention,
      container,
      remove,
      CTX: null as any,
    };
    finalContext.CTX = finalContext;

    if (finalContext.PRESET?.generate) {
      if (!("index" in target)) {
        // 如果是输入框润色，监听变化回填
        const { watch } = await import("vue");
        const unwatch = watch(
          () => container.alternatives[container.activeAlternative].content,
          (val) => inputAreaRef.value?.setDraft(val)
        );
        await finalContext.PRESET.generate(finalContext);
        unwatch();
      } else {
        await finalContext.PRESET.generate(finalContext);
      }
      push.success({ title: "润色完成" });
    }
  } catch (err) {
    console.error(err);
    push.error({ title: "润色失败", message: (err as Error).message });
  }
}

// 生成逻辑
async function handleGenerate(index?: number) {
  if (!chatReactive.value) return;
  const ctx = { ...getExecuteContextSnapshot(), ...generate(index) };
  // @ts-ignore
  ctx.CTX = ctx;

  try {
    if (ctx.PRESET?.generate) {
      await ctx.PRESET.generate(ctx);
    } else {
      push.error("当前预设不支持生成");
    }
  } catch (e) {
    push.error({ title: "生成错误", message: (e as Error).message });
  }
}

// 发送逻辑
async function onSend(
  content: string,
  files: File[],
  role: role,
  shouldGenerate: boolean
) {
  const parts: AdditionalParts[] = [];
  for (const f of files) {
    const buffer = await f.arrayBuffer();
    parts.push({
      type: f.type.startsWith("image/") ? "image" : "file",
      [f.type.startsWith("image/") ? "image" : "data"]: buffer,
      mediaType: f.type,
      filename: f.name,
    } as any);
  }
  appendMessageToLeaf(content, role, {
    additionalParts: parts.length ? parts : undefined,
  });
  if (shouldGenerate) {
    await nextTick();
    handleGenerate();
  }
}

// 背景样式
const backgroundStyle = computed<CSSProperties>(() => {
  const bg = background.value;
  if (!bg || bg.type === "video") return {};
  return {
    backgroundImage: `url("${bg.src}")`,
    backgroundSize:
      bg.mode === "cover"
        ? "cover"
        : bg.mode === "contain"
        ? "contain"
        : "auto",
    backgroundRepeat: bg.mode === "tile" ? "repeat" : "no-repeat",
    backgroundPosition: "center",
    position: "absolute",
    inset: 0,
    opacity: 0.4,
    pointerEvents: "none",
  };
});
</script>

<template>
  <div
    v-if="chatReactive"
    class="flex h-full flex-col bg-background/50 relative overflow-hidden rounded-xl border shadow-sm group/editor"
  >
    <!-- 背景层 -->
    <div
      v-if="background"
      class="absolute inset-0 z-0 select-none pointer-events-none"
    >
      <video
        v-if="background.type === 'video'"
        :src="background.src"
        autoplay
        loop
        muted
        class="w-full h-full object-cover opacity-20"
      ></video>
      <div v-else :style="backgroundStyle"></div>
    </div>

    <!-- 消息列表 -->
    <div class="relative z-10 flex-1 min-h-0 flex flex-col">
      <ScrollArea ref="messageListRef" class="h-full" @scroll="handleScroll">
        <div
          class="flex flex-col px-4 py-6 max-w-5xl mx-auto w-full min-h-full"
        >
          <!--
            [NEW] 使用 MessageScope 进行隔离包装
            将 index 和修改方法闭包进去，内部组件无需再传递 index
          -->
          <MessageScope
            v-for="(msg, i) in flattenedChat.messages"
            :key="msg.id"
            :message="msg"
            :index="i"
            :on-update-content="(content) => setMessageContent(i, content)"
            :on-action="(action) => handleMessageAction(action, i)"
          >
            <ChatBubble
              :message="msg"
              :index="i"
              :is-editing="editingIndex === i"
              :avatar-src="resourceAvatar.src.value"
              v-model:editingContent="editingContent"
              @edit-start="startEdit"
              @edit-cancel="cancelEdit"
              @edit-save="saveEdit"
              @switch-alt="switchAlternative"
              @action="handleMessageAction"
            />
          </MessageScope>

          <!-- 底部垫高，防止最后一条消息被输入框遮挡 -->
          <div class="h-4"></div>
        </div>
      </ScrollArea>

      <!-- 回到底部悬浮按钮 -->
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-10 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-10 opacity-0"
      >
        <Button
          v-if="!isAtBottom"
          size="icon"
          variant="secondary"
          class="absolute bottom-4 right-6 rounded-full shadow-lg z-30 opacity-90 hover:opacity-100"
          @click="scrollToBottom('smooth')"
        >
          <ArrowDown class="h-5 w-5" />
        </Button>
      </transition>
    </div>

    <!-- 底部输入框 -->
    <ChatInputArea
      ref="inputAreaRef"
      :disabled="!chatReactive"
      @send="onSend"
      @polish="(c, r) => handlePolishAction({ content: c, role: r })"
    />
  </div>

  <!-- Loading State -->
  <div
    v-else
    class="flex h-full items-center justify-center text-muted-foreground"
  >
    <div class="flex flex-col items-center gap-2">
      <div
        class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
      ></div>
      <span class="text-sm">载入对话中...</span>
    </div>
  </div>
</template>
