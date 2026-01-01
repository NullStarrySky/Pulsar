<!-- src/schema/chat/ChatEditor.vue -->
<script setup lang="ts">
import { ArrowDown } from "lucide-vue-next";
import { push } from "notivue";
import { type CSSProperties, computed, nextTick, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
// Components
import { ScrollArea } from "@/components/ui/scroll-area";
// Features & Composables
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import { useResources } from "@/schema/manifest/composables/useResources.ts";
import { isMobile } from "@/utils/platform";
import { type role } from "../shared.types";
import ChatBubble from "./ChatBubble.vue";
import ChatInputArea from "./ChatInputArea.vue";
// Types
import {
	type AdditionalParts,
	type FlatChatMessage,
	type RootChat,
} from "./chat.types";
import { useChatScroll } from "./composables/useChatScroll";
import { useFlattenedChat } from "./useFlattenedChat";

const mobile = isMobile(); // 获取移动端状态

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
	appendMessageToLeaf, // 重点使用这个
	addBlankMessage,
	setMessageContent,
	generate,
	addBlankBranch,
	polish,
	renameAlternative,
} = useFlattenedChat(chatReactive);

const { isAtBottom, scrollToBottom, handleScroll } = useChatScroll(
	computed(() => flattenedChat.value.messages.length),
);
onMounted(() => scrollToBottom("auto"));
const inputAreaRef = ref();

const {
	avatar: resourceAvatar,
	getExecuteContextSnapshot,
	background,
} = useResources(pathRef);

// --- Scroll Logic ---

onMounted(() => scrollToBottom("auto"));

// --- Actions Handlers ---

// 通用动作分发器
function handleMessageAction(action: string, msg: FlatChatMessage) {
	switch (action) {
		case "regenerate":
			handleGenerate(msg);
			break;
		case "delete":
			deleteContainer(msg);
			break;
		case "branch":
			addBlankBranch(msg, true);
			break;
		case "add-new":
			addBlankMessage(msg, true);
			break;
		case "polish":
			handlePolishAction({ item: msg });
			break;
		case "fork":
			fork(msg);
			break;
		case "insert":
			appendMessage(msg);
			break;
		case "copy": {
			const content = msg.content;
			if (content?.type === "message")
				navigator.clipboard.writeText(content.content);
			push.success("已复制到剪贴板");
			break;
		}
	}
}

// 润色逻辑
async function handlePolishAction(
	target: { item: FlatChatMessage } | { content: string; role: role },
) {
	if (!chatReactive.value) return;
	try {
		const { CHAT, container, intention, remove } = await polish(target);
		const finalContext = {
			...getExecuteContextSnapshot(),
			CHAT,
			intention,
			container,
			remove,
			CTX: null as any,
		};
		finalContext.CTX = finalContext;
		await nextTick();

		if (finalContext.PRESET?.generate) {
			if (!("item" in target)) {
				// 如果是输入框润色，监听变化回填
				const { watch } = await import("vue");
				const unwatch = watch(
					() => container.alternatives[container.activeAlternative].content,
					(val) => inputAreaRef.value?.setDraft(val),
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
async function handleGenerate(msg?: FlatChatMessage) {
	if (!chatReactive.value) return;
	const ctx = { ...getExecuteContextSnapshot(), ...(await generate(msg)) };
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

// 修改 onSend 逻辑以支持 generate 参数
async function onSend(
	content: string,
	files: File[],
	role: role,
	shouldGenerate: boolean,
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

	// 核心修改：支持不同角色插入
	appendMessageToLeaf(content, role, {
		additionalParts: parts.length ? parts : undefined,
	});

	if (shouldGenerate) {
		await nextTick();
		// 只有当需要生成时才调用
		if (role === "user") {
			handleGenerate();
		} else {
			// 如果插入的是 assistant 且要求生成，则触发生成
		}
	} else {
		await nextTick();
		scrollToBottom("smooth");
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
    <!-- 背景层 (保持不变) -->
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
        <!-- 适配：移动端 px-2, 桌面端 px-4 -->
        <div
          class="flex flex-col py-6 max-w-4xl mx-auto w-full min-h-full transition-all duration-300"
          :class="mobile ? 'px-2' : 'px-4'"
        >
          <!-- 这里 key 仍然使用 id，但传递给事件的是 msg 对象 -->
          <ChatBubble
            v-for="(msg, i) in flattenedChat.messages"
            :key="msg.id"
            :message="msg"
            :index="i"
            :avatar-src="resourceAvatar.src.value"
            @update-content="(content) => setMessageContent(msg, content)"
            @switch-alt="(altIndex) => switchAlternative(msg, altIndex)"
            @action="(action) => handleMessageAction(action, msg)"
            @rename="(name) => renameAlternative(msg, name)"
          />

          <!-- 底部垫高：Input Area 移动端高度可能不同，稍微调小一点 -->
          <div :class="mobile ? 'h-36' : 'h-48'"></div>
        </div>
      </ScrollArea>

      <!-- 回到底部悬浮按钮 -->
      <transition
        enter-active-class="transition ease-out duration-300"
        enter-from-class="opacity-0 translate-y-4"
        leave-active-class="transition ease-in duration-200"
        leave-to-class="opacity-0 translate-y-4"
      >
        <Button
          v-if="!isAtBottom"
          size="icon"
          variant="secondary"
          class="absolute rounded-full shadow-lg z-30 opacity-90 hover:opacity-100"
          :class="mobile ? 'bottom-20 right-4' : 'bottom-28 right-8'"
          @click="scrollToBottom('smooth')"
        >
          <ArrowDown class="h-5 w-5" />
        </Button>
      </transition>
    </div>

    <!-- 底部输入框容器 -->
    <div
      class="absolute bottom-0 left-0 right-0 z-40 bg-linear-to-t from-background via-background/90 to-transparent"
      :class="mobile ? 'pb-2 pt-6 px-1' : 'pb-4 pt-10 px-4'"
    >
      <ChatInputArea
        ref="inputAreaRef"
        :disabled="!chatReactive"
        @send="onSend"
        @polish="(c, r) => handlePolishAction({ content: c, role: r })"
      />
    </div>
  </div>
  <!-- Loading State (保持不变) -->
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
