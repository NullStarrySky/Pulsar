// src/schema/setting/setting.ts
import type { SchemaDefinition } from "@/schema/SemanticType";
import { getSettingSchema } from "./setting.schema";
import type { Setting } from "./setting.types";

/**
 * 为 setting.json 创建一个包含所有默认值的对象。
 * @returns {Setting} 一个完整的全局设置对象。
 */
export function newSetting(): Setting {
  return {
    REGEX: [],
    lorebook: {
      scan_depth: 20,
      max_recursion_count: 3,
      activationWhen: [],
    },
    vectorization: {
      enabled: false,
      chunkSize: 500,
      delimiters: ["\n\n", "\n", "。", "！", "？"],
      similarityThreshold: 0.75,
      queryMessageCount: 1,
      maxResultCount: 3,
    },
    messageFavorites: [],
    characterFavorites: [],
    backup: {
      excludedPaths: ["trashbin"],
      interval: 48,
      maxBackups: 5,
    },
    extensions: {},
    tools: [],
    defaultModels: {
      chat: null,
      embedding: null,
      image: null,
    },
    // 新增背景设置默认值
    background: {
      mode: "cover",
    },
  };
}

/**
 * SettingWrapper 用于在模板中访问全局设置。
 */
class SettingWrapper {
  [key: string]: any;

  private resource: { path: string; content: Setting };

  constructor(resources: { path: string; content: Setting }[]) {
    if (!resources || resources.length === 0) {
      console.warn("Setting resource not provided, using default settings.");
      this.resource = {
        path: "default/setting.[setting].json",
        content: newSetting(),
      };
    } else {
      if (resources.length > 1) {
        console.warn(
          `Expected 1 setting resource, but found ${resources.length}. Using the first one.`
        );
      }
      this.resource = resources[0];
    }

    // 确保 defaultModels 存在，防止旧配置报错
    if (!this.resource.content.defaultModels) {
      this.resource.content.defaultModels = {
        chat: null,
        embedding: null,
        image: null,
      };
    }

    // 确保 background 存在
    if (!this.resource.content.background) {
      this.resource.content.background = {
        mode: "cover",
      };
    }

    // 将 setting.json 的内容复制到 Wrapper 实例的顶层
    Object.assign(this, this.resource.content);
  }

  /**
   * 获取用户配置的默认对话模型 ID。
   */
  public getDefaultChatModel(): string | null {
    return this.resource.content.defaultModels?.chat ?? null;
  }

  /**
   * 获取用户配置的默认嵌入模型 ID。
   */
  public getDefaultEmbeddingModel(): string | null {
    return this.resource.content.defaultModels?.embedding ?? null;
  }

  /**
   * 获取用户配置的默认生图模型 ID。
   */
  public getDefaultImageModel(): string | null {
    return this.resource.content.defaultModels?.image ?? null;
  }

  toString(): string {
    return JSON.stringify(this.resource.content, null, 2);
  }
}

/**
 * 新范式下的 SettingDefinition
 */
export const SettingDefinition = {
  new: newSetting,
  wrapperFunction: (resources: { path: string; content: Setting }[]) => {
    const setting = new SettingWrapper(resources);
    return {
      SETTING: setting,
      defaultChatModel: setting.getDefaultChatModel(),
      defaultEmbeddingModel: setting.getDefaultEmbeddingModel(),
    };
  },
  renderingMethod: getSettingSchema,
} satisfies SchemaDefinition<Setting>;
