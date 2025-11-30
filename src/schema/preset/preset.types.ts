// src/schema/preset/preset.types.ts

import type {
  injectPosition,
  RegexRule,
  role,
  UserValue,
} from "../shared.types.ts";

/**
 * 预设: 模型生成参数。
 * 这些参数将直接传递给 Vercel AI SDK。
 */
export type PresetGenerationParams = {
  temperature: number;
  max_tokens: number;
  stream: boolean;
  presence_penalty: number;
  frequency_penalty: number;
  top_p: number;
  top_k: number;
  stop?: string | string[];
  logit_bias?: Record<string, number>;
};

/**
 * 单个提示词注入项的配置。
 */
export type Prompt = {
  id: string;
  name: string;
  enabled: boolean;
  role: role;
  injectPosition: injectPosition | "none";
  content: string;
};

/**
 * 预设变体 (PresetVariant)
 * 将模型匹配规则与一组特定的提示词绑定在一起。
 */
export type PresetVariant = {
  id: string;
  name: string;
  /**
   * 用于匹配模型名称的正则表达式。
   * 例如: "gpt-4.*" 或 "claude-3-opus.*"
   */
  modelRegex: string;
  /**
   * 此变体专用的提示词片段数组。
   */
  prompts: Prompt[];
};

/**
 * Preset (预设) 的核心数据结构。
 * 它包含了模型参数、多个提示词配置变体以及核心的生成逻辑。
 */
export type Preset = {
  name: string;
  generationParams: PresetGenerationParams;
  REGEX: RegexRule[];
  // 这些正则会直接附加到消息并始终生效，从而在切换预设时维持消息结构稳定性。
  needToBakeRegex: {
    find_regex: string;
    replace_string: string;
    applyOn: "rendering" | "generating";
  }[];
  maxChatHistoryToken: number;

  /**
   * 包含多个配置变体，每个变体都有一套自己的提示词和模型匹配规则，从而允许对应多种模型的预设存在。
   */
  variants: PresetVariant[];

  /**
   * 预设级别的变量，可在生成逻辑中通过 `preset.userValue.varName` 访问。
   */
  userValue: UserValue;

  /**
   * 核心生成逻辑。
   * 这是一个将被动态执行的函数体字符串。
   * 在执行时，它会接收到两个参数：
   * - `ai`: Pinia 的 `useAiStore()` 实例，用于调用 AI 功能。
   * - `ctx`: 包含所有上下文信息的对象 (例如 `messages`, `character` 等)。
   * 这个函数应该返回一个 Vercel AI SDK 的响应对象，例如 `await ai.streamText(...)` 的结果。
   */
  onGenerate: string;
};
