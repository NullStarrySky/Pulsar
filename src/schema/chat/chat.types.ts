// src/schema/chat/chat.types.ts
import type { role } from "../shared.types.ts";

// ========== 基础类型 ==========
export type UniqueId = string;
export type messageId = UniqueId;

// ========== 变量 ==========
export interface VariableChange {
  accessChain: string[];
  updateMethod: ((oldValue: any) => any) | any;
}

// ========== 区间 ==========
export type IntervalEndCondition =
  | { type: "length"; value: number }
  | { type: "anchor"; anchor: messageId };

export type ActivationCondition =
  | { type: "relative_index"; value: number }
  | { type: "next_message_with_role"; role: "user" | "assistant" };

export interface AttachedIntervalDef {
  id: UniqueId;
  source: string;
  type: string; // A type of "hidden" will be used for the new mechanism
  content: Record<string, any>;
  endCondition: IntervalEndCondition;
  removeOnAnchorDeletion?: boolean;
  onUnmatchedEnd?: "leak" | "truncate_at_leaf" | "discard";
  activationCondition?: ActivationCondition;
}

export interface AttachedEndMarkerDef {
  endsIntervalById?: UniqueId[];
  endsIntervalByType?: string[];
}

// ========== 消息相关 ==========

export interface ToolCallResult {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  input: any;
  output: any;
}

// 为 steps 数组定义本地步骤类型
export interface LocalStep {
  name: string;
  message: string;
}

export interface MetaGenerateInfo {
  modelName: string;
  timeInfo: {
    start: string;
    timeUsed?: number;
  };
  renderInfo: {
    // preset自身name属性
    usedPresetName: string;
    /**
     * 角色的资源路径，用于获取头像
     * @example
     * import {useFileSystemStore} from "@/features/fileSystem";
     * const fs = useFileSystemStore()
     * fs.getAvatarUrl(message.content.metaGenerateInfo.renderInfo.characterFilePath)
     */
    characterFilePath: string;
    // ctx.CHARACTER.name
    characterName: string;
    // preset自身needToBakeregex属性
    bakedRegexReplace: {
      find_regex: string;
      replace_string: string;
      applyOn: "rendering" | "generating";
    }[];
  };
  // 存储该消息的向量化结果
  // 键是 modelId (例如 "openai/text-embedding-3-small")
  // 值是向量数组 (number[])
  embedding?: Record<string, number[]>;
  // 置空，之后多步骤生成使用
  steps: (LocalStep | ToolCallResult)[];

  // 置空，供之后使用
  /** 此版本触发的变量变更 */
  variableChanges?: VariableChange[];
  // 从中间值中提取并附加
  /** 锚定在此版本上的区间定义 */
  attachedIntervals?: AttachedIntervalDef[];
  // 置空，供之后使用
  /** 锚定在此版本上的结束标记 */
  attachedEndMarker?: AttachedEndMarkerDef;
  // 置空，供之后使用
  /** 附加内容部分 */
  additionalParts?: AdditionalParts[];
}

/**
 * 代表一个简单的文本消息替代方案。
 */
export interface MessageAlternative {
  type: "message";
  id: UniqueId;
  name?: string;

  content: string;
  /** 此版本的生成元信息 */
  metaGenerateInfo: MetaGenerateInfo;
}

/**
 * 代表一个分支替代方案。
 * 它现在是一个纯粹的结构容器，不包含额外的元数据。
 */
export interface BranchAlternative {
  type: "branch";
  id: UniqueId; // 为分支本身提供一个ID
  name?: string;

  messages: ChatMessageItem[];
}

/**
 * 替代方案的联合类型。
 */
export type Alternative = MessageAlternative | BranchAlternative;

// 消息附加内容的类型定义
type DataContent = string | Uint8Array | ArrayBuffer | Buffer;

interface TextPart {
  type: "text";
  text: string;
}
interface ImagePart {
  type: "image";
  image: DataContent | URL;
  mediaType?: string;
}
interface FilePart {
  type: "file";
  data: DataContent | URL;
  filename?: string;
  mediaType: string;
}

export type AdditionalParts = TextPart | ImagePart | FilePart;

/**
 * ChatMessageItem 现在包含替代方案 (alternatives) 而不是版本 (messages)。
 */
export interface ChatMessageItem {
  type: "message";
  id: messageId;
  role: role;
  alternatives: Alternative[];
  activeAlternative: number; // MODIFIED: No longer allows `inactive` (-1)
}

/**
 * 根聊天对象。
 */
export interface RootChat {
  name: string;
  messages: ChatMessageItem[];
  userValue: Record<string, any>;
  tools: string[];
  create_date: string;
  modification_date: string;
}

/**
 * 代表在API-Ready上下文中，一个被激活并转换后的消息。
 * id 和 metaGenerateInfo 已被设置为可选。
 */
export interface ApiReadyMessage {
  id?: UniqueId;
  role: role;
  content: string;
  metaGenerateInfo?: MetaGenerateInfo;
}

// ========== API 准备好的上下文类型 ==========

export type ApiReadyContext = {
  activeMessages: ApiReadyMessage[];
  resolvedUserValue: Record<string, any>;
  resolvedIntervals: ResolvedInterval[];
};

export type ResolvedInterval = {
  def: AttachedIntervalDef;
  range: {
    start: number;
    end: number | typeof Infinity;
  } | null;
};

// ========== 渲染/压平专用类型 ==========

/**
 * 描述一个消息在树状结构中的路径。
 * @property containerIndex - 消息容器在其父 messages 数组中的索引。
 * @property branchId - 如果是通过一个分支进入的，这里是该分支的 ID。
 */
export interface PathInfo {
  containerIndex: number;
  branchId?: UniqueId;
}

/**

 * 代表一个被压平用于渲染的 BranchAlternative 的信息部分。
 * (移除了 messages 属性)
 */
export type EnrichedBranchInfo = Omit<BranchAlternative, "messages">;

/**
 * 压平后，用于渲染的单个消息对象的统一结构。
 */
export interface FlatChatMessage {
  /** 原始 ChatMessageItem 的 ID */
  id: messageId;
  /** 消息的角色 */
  role: role;
  /**
   * 当前激活版本的内容。
   * - 如果是 MessageAlternative，则是其完整对象。
   * - 如果是 BranchAlternative，则是其信息部分 (不含 messages)。
   * - MODIFICATION: This is no longer `null`. An empty `alternatives` array would result in `undefined`, which the UI should handle as an error state.
   */
  content: MessageAlternative | EnrichedBranchInfo;
  /** 此消息项在树中的深度，用于可能的 UI 缩进 */
  depth: number;
  /** 此消息项可用的 alternative 总数 */
  availableAlternativeCount: number;
  /** 当前激活的 alternative 的索引 */
  activeAlternative: number;
  /** 到达此消息的路径，用于反向查找和修改 */
  path: PathInfo[];
}

/**
 * 压平后的根对象信息。
 */
export type FlatRootChat = Omit<RootChat, "messages">;

/**
 * 整个压平操作的返回结果结构。
 */
export interface FlattenedChat {
  rootInfo: FlatRootChat;
  messages: FlatChatMessage[];
}
