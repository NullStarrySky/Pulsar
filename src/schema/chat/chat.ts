// src/schema/chat/chat.ts

import { merge } from "lodash-es";
import { nanoid } from "nanoid";
import type { SchemaDefinition } from "../SemanticType";
import type { role } from "../shared.types.ts";
import ChatEditor from "./ChatEditor.vue";
// 注意: 类型定义对于 newChat 函数和 SchemaDefinition 仍然是必需的
import type {
  Alternative,
  BranchAlternative,
  ChatMessageItem,
  MessageAlternative,
  MetaGenerateInfo,
  RootChat,
} from "./chat.types";

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

/**
 * 创建默认的元数据信息
 */
export function createDefaultMetaInfo(
  overrides?: Partial<MetaGenerateInfo>
): MetaGenerateInfo {
  return merge(
    {
      modelName: "",
      steps: [],
      timeInfo: { start: new Date().toISOString() },
      renderInfo: {
        usedPresetName: "",
        characterFilePath: "", // 默认值逻辑可在此统一
        characterName: "",
        bakedRegexReplace: [],
      },
    },
    overrides
  );
}

/**
 * 创建一个文本消息 Alternative
 */
export function createMessageAlternative(
  content: string = "",
  metaConfig?: Partial<MetaGenerateInfo>
): MessageAlternative {
  return {
    type: "message",
    id: nanoid(),
    content: content,
    metaGenerateInfo: createDefaultMetaInfo(metaConfig),
  };
}

/**
 * 创建一个分支 Alternative
 * 默认包含一个空的 User 消息，这符合常见的 UI 交互需求
 */
export function createBranchAlternative(
  initialMessageContent: string = ""
): BranchAlternative {
  // 分支内部的一条初始消息
  const initialMessage = createMessageContainer(
    "user",
    [
      createMessageAlternative(initialMessageContent, {
        renderInfo: {
          characterFilePath: "User",
          characterName: "User",
          usedPresetName: "Default",
          bakedRegexReplace: [],
        }, // 可以在此固化分支内用户的默认配置
      }),
    ],
    0
  );

  return {
    type: "branch",
    id: nanoid(),
    messages: [initialMessage],
  };
}

/**
 * 创建一个消息容器 (ChatMessageItem)
 */
export function createMessageContainer(
  role: role,
  alternatives: Alternative[] = [],
  activeAlternative: number = 0
): ChatMessageItem {
  return {
    type: "message",
    id: nanoid(),
    role,
    alternatives,
    activeAlternative: alternatives.length > 0 ? activeAlternative : -1,
  };
}

/**
 * 通用工厂函数：创建一个新的 Alternative 并直接返回
 * 用于快速生成占位符
 */
export function createNewAlternative(
  type: "message" | "branch",
  content: string = "",
  config?: Partial<MetaGenerateInfo>
): Alternative {
  if (type === "branch") {
    return createBranchAlternative(content);
  }
  return createMessageAlternative(content, config);
}

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
