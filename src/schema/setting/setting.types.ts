// src/schema/setting/setting.types.ts
import type { ChatMessageItem, messageId } from "../chat/chat.types";
import type { RegexRule } from "../shared.types";
import type { LorebookSetting } from "../lorebook/lorebook.types";

/**
 * 知识库相关的全局设置。
 * 已更新为新的 LorebookSetting 定义。
 */
export type GlobalLorebookSetting = LorebookSetting;

/**
 * 单个扩展的配置信息。
 */
export type ExtensionConfig = {
  name: string;
  autoLoad: boolean;
  shouldDeferLoad: boolean;
  description?: string;
  version?: string;
  author?: string;
};

export interface VectorizationSetting {
  enabled: boolean;
  chunkSize: number;
  delimiters: string[];
  similarityThreshold: number; // 相似度阈值 (0-1)
  queryMessageCount: number; // 使用最近 n 条消息作为查询上下文
  maxResultCount: number; // 最大返回结果数量
}

/**
 * 收藏的消息条目。
 * 已与新的 Chat-DAG 结构对齐。
 */
export interface FavoriteMessageItem {
  chatFilePath: string; // 收藏消息所在的聊天文件路径
  messageId: messageId; // 用于在聊天树中定位消息的唯一 ID
  renderedContent: string; // 用于快速预览的渲染后内容
  originalMessage: ChatMessageItem; // 原始消息对象的完整副本
  favoriteDate: string; // 收藏日期
}

/**
 * 备份相关的配置。
 */
export interface BackupSettings {
  interval: number;
  maxBackups: number;
  excludedPaths: string[];
}

/**
 * 定义默认使用的模型配置
 */
export interface DefaultModelSetting {
  chat: string | null; // 格式: "providerId/modelName"
  embedding: string | null; // 格式: "providerId/modelName"
  image?: string | null;
}

/**
 * 全局设置的核心数据结构。
 */
export type Setting = {
  REGEX: RegexRule[];
  lorebook: GlobalLorebookSetting;
  vectorization: VectorizationSetting;
  messageFavorites?: FavoriteMessageItem[];
  characterFavorites?: string[];
  hiddenLayouts?: string[];
  tools: string[];
  backup: BackupSettings;
  extensions: Record<string, ExtensionConfig>;
  defaultModels: DefaultModelSetting; // 新增字段
};
