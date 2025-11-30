// src/schema/chat/chat.ts

import type { SchemaDefinition } from "../SemanticType";
import ChatEditor from "./ChatEditor.vue";
// 注意: 类型定义对于 newChat 函数和 SchemaDefinition 仍然是必需的
import { RootChat } from "./chat.types";

/**
 * 创建一个新的、空的聊天对象。
 */
function newChat(): RootChat {
  const now = new Date().toISOString();
  return {
    name: "新对话 (DAG)",
    messages: [],
    userValue: {},
    tools: [],
    create_date: now,
    modification_date: now,
  };
}

// ChatWrapper 类已被移除，其逻辑已迁移至 `chat_logic.ts`。

/**
 * 范式下的 ChatDefinition
 */
export const ChatDefinition: SchemaDefinition<RootChat> = {
  new: newChat,

  // 添加到ExecuteContext的CHAT部分，由ChatEditor负责生成，而非通过文件进行解析，这里仅作占位符以满足范式。
  wrapperFunction: (_: { path: string; content: RootChat }[]) => {
    return {
      CHAT: {}, // 任务要求：暂时返回空对象
    };
  },

  renderingMethod: ChatEditor,
};
