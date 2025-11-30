// src-sidecar/model-hydration.ts

import { simulateReadableStream } from "ai";
import { MockLanguageModelV2 } from "ai/test";
import { openai } from "@ai-sdk/openai";
import { azure } from "@ai-sdk/azure";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { vertex } from "@ai-sdk/google-vertex";
import { deepseek } from "@ai-sdk/deepseek";
import { xai } from "@ai-sdk/xai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// 定义内置提供商及其对应的 SDK 对象
const providers: Record<string, any> = {
  openai,
  azure,
  anthropic,
  google,
  "google-vertex": vertex,
  deepseek,
  xai,
};

// 定义不同用途对应的提供商方法
const purposeMethodMap: Record<string, string[]> = {
  chat: ["chat", "languageModel"],
  embedding: ["embedding", "textEmbedding"],
  image: ["image", "imageModel"],
  speech: ["speech"],
  transcription: ["transcription"],
};

// =================================================================================
// 类型定义
// =================================================================================
type CustomProviderConfig = {
  name: string;
  baseURL: string;
  apiKeyName: string;
  url?: string;
};

export type ModelConfig = {
  customProviders?: CustomProviderConfig[];
};

// 新增：创建并返回一个配置好的 MockLanguageModelV2 实例
function createTestModel(modelId: string): MockLanguageModelV2 {
  const streamId = "test-stream-id-1"; // V2 规范通常需要一个 ID 来关联 start/delta/end

  switch (modelId) {
    case "mock-text":
      return new MockLanguageModelV2({
        doGenerate: async () => ({
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          content: [
            { type: "text", text: `Hello, this is a mock text response!` },
          ],
          warnings: [],
        }),
      });

    case "mock-stream-text":
      return new MockLanguageModelV2({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              // V2 规范：必须有 text-start
              { type: "text-start", id: streamId },
              // V2 规范：text-delta 需要包含 id
              { type: "text-delta", id: streamId, delta: "This " },
              { type: "text-delta", id: streamId, delta: "is a " },
              { type: "text-delta", id: streamId, delta: "mock " },
              { type: "text-delta", id: streamId, delta: "streaming " },
              { type: "text-delta", id: streamId, delta: "response." },
              // V2 规范：必须有 text-end
              { type: "text-end", id: streamId },
              {
                type: "finish",
                finishReason: "stop",
                logprobs: undefined,
                usage: { inputTokens: 5, outputTokens: 25, totalTokens: 30 },
              },
            ],
          }),
        }),
      });

    case "mock-object":
      return new MockLanguageModelV2({
        doGenerate: async () => ({
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          content: [
            { type: "text", text: `{"content":"This is a mock object."}` },
          ],
          warnings: [],
        }),
      });

    case "mock-stream-object":
      return new MockLanguageModelV2({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              // 对象流本质上也是文本流，只是内容是 JSON 片段
              { type: "text-start", id: streamId },
              { type: "text-delta", id: streamId, delta: "{ " },
              { type: "text-delta", id: streamId, delta: '"content": ' },
              { type: "text-delta", id: streamId, delta: `"This is ` },
              { type: "text-delta", id: streamId, delta: `a streaming ` },
              { type: "text-delta", id: streamId, delta: `object!"` },
              { type: "text-delta", id: streamId, delta: " }" },
              { type: "text-end", id: streamId },
              {
                type: "finish",
                finishReason: "stop",
                logprobs: undefined,
                usage: { inputTokens: 8, outputTokens: 35, totalTokens: 43 },
              },
            ],
          }),
        }),
      });

    case "mock-failing":
      return new MockLanguageModelV2({
        doGenerate: async () => {
          throw new Error("This is a simulated error from the mock model.");
        },
        doStream: async () => {
          throw new Error("This is a simulated error from the mock model.");
        },
      });

    default:
      throw new Error(
        `Unsupported test model: "${modelId}". Available test models are: mock-text, mock-stream-text, mock-object, mock-stream-object, mock-failing.`
      );
  }
}

/**
 * 根据字符串标识符和用途，水合为具体的模型实例。
 * 它首先检查是否为内置提供商，如果不是，则从传入的 modelConfig 查找自定义提供商配置。
 * @param identifier 模型标识符，格式为 "provider/modelId"。
 * @param purpose 模型的用途，例如 "chat", "embedding"。
 * @param modelConfig 从 modelConfig.[modelConfig].json 加载的配置对象。
 * @param secrets 从 AISecrets.json 加载的密钥对象。
 * @returns 初始化后的模型对象。
 * @throws 如果格式错误、提供商或用途不受支持，则抛出错误。
 */
export function hydrateModel(
  identifier: string,
  purpose: string,
  modelConfig: ModelConfig,
  secrets: Record<string, string>
): any {
  const [providerName, ...modelIdParts] = identifier.split("/");
  const modelId = modelIdParts.join("/");

  if (!providerName || !modelId) {
    throw new Error(
      `Invalid model identifier format: "${identifier}". Expected format is "provider/model-id".`
    );
  }

  const lowerCaseProviderName = providerName.toLowerCase();

  // --- 新增逻辑分支：处理测试提供商 ---
  if (lowerCaseProviderName === "test") {
    // 对于测试模型，我们只关心聊天用途
    if (purpose !== "chat") {
      throw new Error(`The "test" provider only supports the "chat" purpose.`);
    }
    return createTestModel(modelId);
  }

  const provider = providers[lowerCaseProviderName];

  // --- 逻辑分支 1: 处理内置提供商 ---
  if (provider) {
    const methods = purposeMethodMap[purpose];
    if (!methods) {
      throw new Error(`Unsupported purpose: "${purpose}"`);
    }

    for (const method of methods) {
      if (typeof provider[method] === "function") {
        return provider[method](modelId);
      }
    }

    throw new Error(
      `Built-in provider "${providerName}" does not support the purpose "${purpose}".`
    );
  }

  // --- 逻辑分支 2: 处理自定义提供商 ---
  const customProviderConfig = modelConfig.customProviders?.find(
    (p) => p.name.toLowerCase() === lowerCaseProviderName
  );

  if (!customProviderConfig) {
    throw new Error(
      `Custom provider "${providerName}" not found in modelConfig.[modelConfig].json.`
    );
  }

  const apiKey = secrets[customProviderConfig.apiKeyName];
  if (!apiKey) {
    throw new Error(
      `API key "${customProviderConfig.apiKeyName}" for custom provider "${providerName}" not found in AISecrets.json.`
    );
  }

  const customProvider = createOpenAICompatible({
    name: customProviderConfig.name,
    apiKey: apiKey,
    baseURL: customProviderConfig.baseURL,
  });

  const methods = purposeMethodMap[purpose];
  if (!methods) {
    throw new Error(`Unsupported purpose for custom provider: "${purpose}"`);
  }

  for (const method of methods) {
    if (typeof (customProvider as any)[method] === "function") {
      return (customProvider as any)[method](modelId);
    }
  }

  throw new Error(
    `Custom provider "${providerName}" does not support the purpose "${purpose}".`
  );
}
