// src/ai/model-hydration.ts

import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
// 引入前端项目中的类型定义
import type { ModelConfig } from "@/schema/modelConfig/modelConfig.types";
import { customFetch } from "@/utils/customFetch";

// 定义内置提供商及其对应的 SDK 对象
// 请确保此处密钥名称和modelConfig.models.ts一致
const providers: Record<string, any> = {
  openai: createOpenAI({
    apiKey: "{{OPENAI_API_KEY}}",
    fetch: customFetch,
  }),
  azure: createAzure({
    apiKey: "{{AZURE_API_KEY}}",
    fetch: customFetch,
  }),
  anthropic: createAnthropic({
    apiKey: "{{ANTHROPIC_API_KEY}}",
    fetch: customFetch,
  }),
  google: createGoogleGenerativeAI({
    apiKey: "{{GOOGLE_GENERATIVE_AI_API_KEY}}",
    fetch: customFetch,
  }),
  deepseek: createDeepSeek({
    apiKey: "{{DEEPSEEK_API_KEY}}",
    fetch: customFetch,
  }),
  xai: createXai({
    apiKey: "{{XAI_API_KEY}}",
    fetch: customFetch,
  }),
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

/**
 * 根据字符串标识符和用途，水合为具体的模型实例。
 * 它首先检查是否为内置提供商，如果不是，则从传入的 modelConfig 查找自定义提供商配置。
 * @param identifier 模型标识符，格式为 "provider/modelId"。
 * @param purpose 模型的用途，例如 "chat", "embedding"。
 * @param modelConfig 从 modelConfig.[modelConfig].json 加载的配置对象。
 * @param secrets 从 secrets.json 加载的密钥对象。
 * @returns 初始化后的模型对象。
 * @throws 如果格式错误、提供商或用途不受支持，则抛出错误。
 */
export function hydrateModel(
  identifier: string,
  purpose: string,
  modelConfig: ModelConfig
): any {
  const [providerName, ...modelIdParts] = identifier.split("/");
  const modelId = modelIdParts.join("/");

  if (!providerName || !modelId) {
    throw new Error(
      `Invalid model identifier format: "${identifier}". Expected format is "provider/model-id".`
    );
  }

  const lowerCaseProviderName = providerName.toLowerCase();

  const builtInProvider = providers[lowerCaseProviderName];

  if (builtInProvider) {
    const methods = purposeMethodMap[purpose];
    if (!methods) {
      throw new Error(`Unsupported purpose: "${purpose}"`);
    }

    for (const method of methods) {
      if (typeof builtInProvider[method] === "function") {
        return builtInProvider[method](modelId);
      }
    }

    throw new Error(
      `Built-in provider "${providerName}" does not support the purpose "${purpose}".`
    );
  }

  const providerData = Object.entries(modelConfig).find(
    ([name, data]) =>
      name.toLowerCase() === lowerCaseProviderName && !data.builtIn
  )?.[1];

  if (!providerData) {
    throw new Error(
      `Custom provider "${providerName}" not found or is a built-in provider in modelConfig.[modelConfig].json.`
    );
  }

  if (!providerData.url) {
    throw new Error(
      `Custom provider "${providerName}" is missing the required "url" field.`
    );
  }

  const customProvider = createOpenAICompatible({
    name: lowerCaseProviderName,
    apiKey: `{{${providerData.apiKeyName}}}`,
    baseURL: providerData.url,
    fetch: customFetch,
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
