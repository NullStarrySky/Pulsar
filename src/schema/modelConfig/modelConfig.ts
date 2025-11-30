// src/schema/modelConfig/modelConfig.ts
import type { SchemaDefinition } from "@/schema/SemanticType";
import type {
  ModelConfig,
  ProviderData,
  ProviderMetadata,
} from "./modelConfig.types";

import { getAllProviderModels } from "./modelConfig.models";
import ModelConfigEditor from "./ModelConfigEditor.vue";

/**
 * 创建一个空的 modelConfig 对象。
 */
export function newModelConfig(): ModelConfig {
  return getAllProviderModels();
}

/**
 * ModelConfigWrapper 用于在模板或应用逻辑中访问模型配置。
 */
class ModelConfigWrapper {
  [key: string]: any;

  private resource: { path: string; content: ModelConfig };
  public providers: ProviderMetadata;

  constructor(resources: { path: string; content: ModelConfig }[]) {
    if (!resources || resources.length === 0) {
      console.warn(
        "ModelConfig resource not provided, using default empty config."
      );
      this.resource = {
        path: "default/model_config.json",
        content: newModelConfig(),
      };
    } else {
      if (resources.length > 1) {
        console.warn(
          `Expected 1 ModelConfig resource, but found ${resources.length}. Using the first one.`
        );
      }
      this.resource = resources[0];
    }

    this.providers = this.resource.content;
    // 为了可能的向后兼容性，将提供商直接赋值给 this
    Object.assign(this, this.providers);
  }

  /**
   * 私有辅助函数，用于获取指定类型的所有可用模型名称。
   */
  private getAvailableModels(
    modelType: keyof ProviderData["models"]
  ): string[] {
    const availableModels: string[] = [];
    const providers = this.resource.content;

    for (const providerKey in providers) {
      const provider = providers[providerKey];
      // 只遍历启用的提供商
      if (provider.enabled && provider.models && provider.models[modelType]) {
        const models = provider.models[modelType];
        models.forEach((model) => {
          // 只添加启用的模型
          if (model.enabled) {
            availableModels.push(model.name);
          }
        });
      }
    }
    return availableModels;
  }

  /**
   * 获取所有可用的（已启用）嵌入模型名称数组。
   * @returns {string[]}
   */
  public getAvailableEmbeddingModels(): string[] {
    return this.getAvailableModels("embedding");
  }

  /**
   * 获取所有可用的（已启用）对话模型名称数组。
   * @returns {string[]}
   */
  public getAvailableChatModels(): string[] {
    return this.getAvailableModels("chat");
  }

  /**
   * 获取所有可用的（已启用）图片生成模型名称数组。
   * @returns {string[]}
   */
  public getAvailableImageModels(): string[] {
    return this.getAvailableModels("image");
  }

  /**
   * 以格式化的 JSON 字符串形式返回所有模型配置。
   * @returns {string}
   */
  toString(): string {
    return JSON.stringify(this.resource.content, null, 2);
  }
}

/**
 * 范式下的 ModelConfigDefinition
 */
export const ModelConfigDefinition = {
  new: newModelConfig,
  wrapperFunction: (resources: { path: string; content: ModelConfig }[]) => {
    const modelConfig = new ModelConfigWrapper(resources);
    return {
      MODEL_CONFIG: modelConfig,
    };
  },
  renderingMethod: ModelConfigEditor,
} satisfies SchemaDefinition<ModelConfig>;
