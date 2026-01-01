// src/ai/index.ts

import {
  cosineSimilarity,
  jsonSchema,
  tool,
  embed as vercel_embed,
  embedMany as vercel_embedMany,
  experimental_generateImage as vercel_generateImage,
  generateObject as vercel_generateObject,
  experimental_generateSpeech as vercel_generateSpeech,
  generateText as vercel_generateText,
  streamObject as vercel_streamObject,
  streamText as vercel_streamText,
} from "ai";
//
import { useFileSystemStore } from "@/features/FileSystem";
import { hydrateModel } from "./model-hydration";

// =================================================================================
// 辅助函数
// =================================================================================

/**
 * 根据调用的 API 名称确定模型的用途。
 * @param apiName AI SDK 函数的名称, e.g., 'generateText'.
 * @returns 模型的用途字符串, e.g., 'chat'.
 */
const determinePurpose = (apiName: string): string => {
  const lowerCaseApi = apiName.toLowerCase();
  if (
    lowerCaseApi.includes("text") ||
    lowerCaseApi.includes("object") ||
    lowerCaseApi.includes("chat")
  )
    return "chat";
  if (lowerCaseApi.includes("embed")) return "embedding";
  if (lowerCaseApi.includes("image")) return "image";
  if (lowerCaseApi.includes("speech")) return "speech";
  if (lowerCaseApi.includes("transcription")) return "transcription";
  console.warn(`Could not determine purpose for API: ${apiName}`);
  return "chat"; // 默认为 chat
};

/**
 * 这是一个核心的预处理函数。
 * 它检查传入的 options 对象中的 model 字段。如果它是一个字符串 (e.g., "openai/gpt-4o"),
 * 它会使用文件系统中的 modelConfig 和 secrets 来“水合”这个字符串，
 * 将其转换成一个 Vercel AI SDK 可以直接使用的具体模型实例。
 * @param options 从用户代码传入的 options 对象.
 * @param apiName 调用此函数的 API 名称.
 * @returns 一个新的 options 对象，其中的 model 字段可能已被替换为模型实例.
 */
function prepareOptions<T extends { model: any }>(
  options: T,
  apiName: string
): T {
  // 如果 model 字段不是字符串，说明它已经是一个模型实例或不需要水合，直接返回。
  if (typeof options.model !== "string") {
    return options;
  }
  const fs = useFileSystemStore();

  const modelConfig = fs.modelConfig;

  if (!modelConfig) {
    throw new Error(
      "modelConfig is not available. Please check if modelConfig.[modelConfig].json exists and is loaded."
    );
  }

  const purpose = determinePurpose(apiName);
  const hydratedModel = hydrateModel(options.model, purpose, modelConfig);

  // 返回一个新的 options 对象，其中 model 字段已被替换。
  return { ...options, model: hydratedModel };
}

// =================================================================================
// 导出的 AI SDK 函数 (包装层)
// =================================================================================

export const generateText: typeof vercel_generateText = (options) => {
  const hydratedOptions = prepareOptions(options, "generateText");
  return vercel_generateText(hydratedOptions);
};

export const streamText: typeof vercel_streamText = (options) => {
  const hydratedOptions = prepareOptions(options, "streamText");
  return vercel_streamText(hydratedOptions);
};

export const generateObject: typeof vercel_generateObject = (options) => {
  const hydratedOptions = prepareOptions(options, "generateObject");
  return vercel_generateObject(hydratedOptions);
};

export const streamObject: typeof vercel_streamObject = (options) => {
  const hydratedOptions = prepareOptions(options, "streamObject");
  return vercel_streamObject(hydratedOptions);
};

export const embed: typeof vercel_embed = (options) => {
  const hydratedOptions = prepareOptions(options, "embed");
  return vercel_embed(hydratedOptions);
};

export const embedMany: typeof vercel_embedMany = (options) => {
  const hydratedOptions = prepareOptions(options, "embedMany");
  return vercel_embedMany(hydratedOptions);
};

export const experimental_generateImage: typeof vercel_generateImage = (
  options
) => {
  const hydratedOptions = prepareOptions(options, "generateImage");
  return vercel_generateImage(hydratedOptions);
};

export const experimental_generateSpeech: typeof vercel_generateSpeech = (
  options
) => {
  const hydratedOptions = prepareOptions(options, "generateSpeech");
  return vercel_generateSpeech(hydratedOptions);
};

// 调试用
if (typeof window !== "undefined") {
  (window as any).ai = {
    generateText,
    streamText,
    generateObject,
    streamObject,
    embed,
    embedMany,
    experimental_generateImage,
    experimental_generateSpeech,
    tool,
    jsonSchema,
    cosineSimilarity,
  };
}
