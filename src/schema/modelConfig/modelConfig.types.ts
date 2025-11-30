// src/schema/modelConfig/modelConfig.types.ts
/**
 * 定义了模型支持的各种功能。
 */
export type Capability =
  | "Image Input"
  | "Object Generation"
  | "Tool Usage"
  | "Tool Streaming"
  | "Reasoning";

/**
 * 定义了所有模型的基础结构。
 */
export type Model = {
  name: string;
  enabled: boolean;
};

/**
 * 描述一个聊天模型的结构，继承自基础模型。
 */
export type ChatModel = Model & {
  capabilities: Capability[];
};

/**
 * 描述一个通用模型（例如嵌入、图片等）。
 */
export type GenericModel = Model;

/**
 * 描述单个 AI 提供商的详细信息。
 */
export type ProviderData = {
  enabled: boolean;
  builtIn?: boolean; // 新增：标记是否为内置提供商
  models: {
    chat: ChatModel[];
    embedding: GenericModel[];
    image: GenericModel[];
    speech: GenericModel[];
    transcription: GenericModel[];
  };
  apiKeyName: string;
  url?: string; // 可选的 API 端点 URL
};

/**
 * 定义了所有提供商元数据的字典结构。
 * 键是提供商的唯一标识符 (例如 "openai", "google")。
 */
export type ProviderMetadata = Record<string, ProviderData>;

/**
 * ModelConfig 是此 schema 的核心类型，代表所有模型提供商的完整配置。
 * 它包含所有提供商的配置。
 */
export type ModelConfig = ProviderMetadata;
