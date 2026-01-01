// src/schema/modelConfig/modelConfig.models.ts
import type {
  ChatModel,
  GenericModel,
  ProviderMetadata,
} from "./modelConfig.types";

// Helper function to convert string arrays to GenericModel arrays
function toGenericModels(modelNames: string[]): GenericModel[] {
  return modelNames.map((name) => ({ name, enabled: true }));
}

// Helper function to add 'enabled' to ChatModel arrays
function toEnabledChatModels(
  models: Omit<ChatModel, "enabled">[]
): ChatModel[] {
  return models.map((model) => ({ ...model, enabled: true }));
}

function getOpenAIModels(): ProviderMetadata {
  return {
    openai: {
      enabled: false, // MODIFIED
      builtIn: true,
      models: {
        chat: toEnabledChatModels([
          {
            name: "gpt-5-pro",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-5",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-5-mini",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-5-nano",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-5-codex",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          { name: "gpt-5-chat-latest", capabilities: ["Image Input"] },
          {
            name: "gpt-4.1",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-4.1-mini",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-4.1-nano",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-4o",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-4o-mini",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
        ]),
        embedding: toGenericModels([
          "text-embedding-3-large",
          "text-embedding-3-small",
          "text-embedding-ada-002",
        ]),
        image: toGenericModels([
          "gpt-image-1-mini",
          "gpt-image-1",
          "dall-e-3",
          "dall-e-2",
        ]),
        speech: toGenericModels(["tts-1", "tts-1-hd", "gpt-4o-mini-tts"]),
        transcription: toGenericModels([
          "whisper-1",
          "gpt-4o-mini-transcribe",
          "gpt-4o-transcribe",
        ]),
      },
      apiKeyName: "OPENAI_API_KEY",
    },
  };
}

function getAzureModels(): ProviderMetadata {
  return {
    azure: {
      enabled: false, // MODIFIED
      builtIn: true,
      models: {
        chat: toEnabledChatModels([
          {
            name: "gpt-5 (deployment)",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-4o (deployment)",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "gpt-35-turbo-instruct (deployment)",
            capabilities: ["Object Generation", "Tool Usage"],
          },
        ]),
        embedding: toGenericModels(["text-embedding (deployment)"]),
        image: toGenericModels([
          "dall-e-3 (deployment)",
          "dall-e-2 (deployment)",
        ]),
        speech: [],
        transcription: toGenericModels(["whisper-1 (deployment)"]),
      },
      apiKeyName: "AZURE_API_KEY",
    },
  };
}

function getAnthropicModels(): ProviderMetadata {
  return {
    anthropic: {
      enabled: false, // MODIFIED
      builtIn: true,
      models: {
        chat: toEnabledChatModels([
          {
            name: "claude-haiku-4-5",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "claude-sonnet-4-5",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "claude-opus-4-1",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "claude-opus-4-0",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "claude-sonnet-4-0",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "claude-3-7-sonnet-latest",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
          {
            name: "claude-3-5-haiku-latest",
            capabilities: ["Image Input", "Object Generation", "Tool Usage"],
          },
        ]),
        embedding: [],
        image: [],
        speech: [],
        transcription: [],
      },
      apiKeyName: "ANTHROPIC_API_KEY",
    },
  };
}

function getGoogleModels(): ProviderMetadata {
  return {
    google: {
      enabled: false, // MODIFIED
      builtIn: true,
      models: {
        chat: toEnabledChatModels([
          {
            name: "gemini-2.5-pro",
            capabilities: [
              "Image Input",
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
            ],
          },
          {
            name: "gemini-2.5-flash",
            capabilities: [
              "Image Input",
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
            ],
          },
          {
            name: "gemini-2.5-flash-lite",
            capabilities: [
              "Image Input",
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
            ],
          },
          {
            name: "gemini-2.0-flash",
            capabilities: [
              "Image Input",
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
            ],
          },
          {
            name: "gemini-1.5-pro",
            capabilities: [
              "Image Input",
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
            ],
          },
          {
            name: "gemini-1.5-flash",
            capabilities: [
              "Image Input",
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
            ],
          },
        ]),
        embedding: toGenericModels([
          "gemini-embedding-001",
          "text-embedding-004",
        ]),
        image: toGenericModels(["imagen-3.0-generate-002"]),
        speech: [],
        transcription: [],
      },
      apiKeyName: "GOOGLE_GENERATIVE_AI_API_KEY",
    },
  };
}

function getDeepseekModels(): ProviderMetadata {
  return {
    deepseek: {
      enabled: false, // MODIFIED
      builtIn: true,
      models: {
        chat: toEnabledChatModels([
          {
            name: "deepseek-chat",
            capabilities: ["Object Generation", "Tool Usage", "Tool Streaming"],
          },
          { name: "deepseek-reasoner", capabilities: ["Reasoning"] },
        ]),
        embedding: [],
        image: [],
        speech: [],
        transcription: [],
      },
      apiKeyName: "DEEPSEEK_API_KEY",
    },
  };
}

function getXAIModels(): ProviderMetadata {
  return {
    xai: {
      enabled: false, // MODIFIED
      builtIn: true,
      models: {
        chat: toEnabledChatModels([
          {
            name: "grok-4-fast-non-reasoning",
            capabilities: [
              "Image Input",
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
            ],
          },
          {
            name: "grok-4-fast-reasoning",
            capabilities: [
              "Image Input",
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
              "Reasoning",
            ],
          },
          {
            name: "grok-code-fast-1",
            capabilities: [
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
              "Reasoning",
            ],
          },
          {
            name: "grok-4",
            capabilities: ["Object Generation", "Tool Usage", "Tool Streaming"],
          },
          {
            name: "grok-3",
            capabilities: ["Object Generation", "Tool Usage", "Tool Streaming"],
          },
          {
            name: "grok-3-mini",
            capabilities: [
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
              "Reasoning",
            ],
          },
          {
            name: "grok-2-vision",
            capabilities: [
              "Image Input",
              "Object Generation",
              "Tool Usage",
              "Tool Streaming",
            ],
          },
          { name: "grok-vision-beta", capabilities: ["Image Input"] },
        ]),
        embedding: [],
        image: toGenericModels(["grok-2-image"]),
        speech: [],
        transcription: [],
      },
      apiKeyName: "XAI_API_KEY",
    },
  };
}

/**
 * 统合函数，调用所有 get<Provider>Models 函数并返回一个完整的JSON对象
 * @returns {ProviderMetadata} 包含所有提供商模型信息的完整JSON对象
 */
export function getAllProviderModels(): ProviderMetadata {
  return {
    ...getOpenAIModels(),
    ...getAzureModels(),
    ...getAnthropicModels(),
    ...getGoogleModels(),
    ...getDeepseekModels(),
    ...getXAIModels(),
  };
}
