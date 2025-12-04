<!-- src/schema/chat/MessageScope.vue -->
<script lang="ts">
import { type InjectionKey, type Ref, inject } from "vue";
import type { FlattenedMessage } from "./chat.types";

// 定义 Context 类型
export interface MessageContext {
  message: Ref<FlattenedMessage>;
  index: Ref<number>;
  updateContent: (newContent: string) => void;
  dispatchAction: (action: string) => void;
}

// 定义 InjectionKey
export const MessageContextKey: InjectionKey<MessageContext> =
  Symbol("MessageContext");

// 暴露一个 Composable 方便子组件调用
export function useMessageContext() {
  const context = inject(MessageContextKey);
  if (!context) {
    throw new Error("useMessageContext must be used within <MessageScope>");
  }
  return context;
}
</script>

<script setup lang="ts">
import { provide, toRef } from "vue";

const props = defineProps<{
  message: FlattenedMessage;
  index: number;
  // 传入回调函数，实现“修改”能力的下放
  onUpdateContent?: (content: string) => void;
  onAction?: (action: string) => void;
}>();

// 构造 Context
const messageRef = toRef(props, "message");
const indexRef = toRef(props, "index");

const context: MessageContext = {
  message: messageRef,
  index: indexRef,
  // 封装更新逻辑，深层组件调用 updateContent 时无需关心 index
  updateContent: (newContent: string) => {
    props.onUpdateContent?.(newContent);
  },
  dispatchAction: (action: string) => {
    props.onAction?.(action);
  },
};

provide(MessageContextKey, context);
</script>

<template>
  <!-- 渲染插槽，保持 DOM 结构由父级控制，或者仅作为一个透明的 div -->
  <slot />
</template>
