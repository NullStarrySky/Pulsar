// src/schema/chat/EnhancedApiReadyContext/api.types.ts

import type { FilePart, ImagePart, TextPart } from "ai";
import type { role } from "../../shared.types";
import type { ApiReadyMessage } from "../chat.types";

// ========== 配置接口 ==========

export interface SquashConfig {
  newRole: role;
  separator: string;
  userPrefix?: string;
  userSuffix?: string;
  assistantPrefix?: string;
  assistantSuffix?: string;
}

export interface SquashInterval {
  start: number;
  end: number;
}

export type MultiDepthInjection = {
  [depth: number]: (ApiReadyMessage | string)[];
};

export type ContentReplacer =
  | ((content: string, message: ApiReadyMessage) => string)
  | { find: RegExp | string; replace: string };

// ========== 向量相关 ==========

export interface VectorEntry {
  depth: number;
  index: number;
  vector: number[];
  content: string;
  role: role;
  modelId: string;
}

export interface VectorSearchResult extends VectorEntry {
  score: number;
  matchedWithDepth: number;
}

// ========== 最终输出格式 ==========

export type FinalUserMessagePart = TextPart | ImagePart | FilePart;
export type FinalAssistantMessagePart = TextPart | FilePart;

export type FinalApiMessage =
  | { role: "user"; content: string | FinalUserMessagePart[] }
  | { role: "system"; content: string }
  | { role: "assistant"; content: string | FinalAssistantMessagePart[] };
