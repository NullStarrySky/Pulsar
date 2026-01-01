// src/components/EnvironmentSidebar/composables/useExecuteContext.ts

import { SemanticTypeMap } from "@/schema/SemanticType";
import type { Resource } from "./useResources";
import { SettingDefinition } from "@/schema/setting/setting";
import { ModelConfigDefinition } from "@/schema/modelConfig/modelConfig";
import { separatePrompts } from "@/schema/preset/preset";
import { streamText, generateText, embed } from "@/ai";
import type {
  ExecuteContext,
  fromUseExecuteContext,
  RegexRule,
} from "@/schema/shared.types";
import { EnhancedApiReadyContext } from "@/schema/chat/EnhancedApiReadyContext/EnhancedApiReadyContext";
import type { ApiReadyMessage } from "@/schema/chat/chat.types";
import { push } from "notivue";

// 定义处理状态接口
export interface ProcessingState {
  workingChat?: EnhancedApiReadyContext;
  numericInjectGroup?: Record<number, ApiReadyMessage[]>;
  stringInjectGroup?: Record<string, ApiReadyMessage[]>;
  unspecifiedInjectGroup?: ApiReadyMessage[];
  finalChatContext?: EnhancedApiReadyContext;
  finalMessages?: any[];
  generationCallParams?: any;
}

// RegexWrapper 类
class RegexWrapper {
  private rules: RegexRule[];
  constructor(rules: RegexRule[]) {
    this.rules = rules.filter((rule) => rule && rule.enabled);
  }
  public process(chat: EnhancedApiReadyContext): EnhancedApiReadyContext {
    return chat.applyRegex(this.rules);
  }
}

/**
 * 创建一个执行上下文切片 (Plain Object)
 * 所有输入参数应当在传入前已经 unref，或者是原始对象
 */
export function createExecuteContext(
  customContext: Record<string, any>,
  resourceSnapshot: Resource,
  settingSnapshot: any,
  modelConfigSnapshot: any
): fromUseExecuteContext {
  // 1. 初始化上下文容器
  const context: Partial<fromUseExecuteContext> = {};

  // 2. 加载资源 (Character, Lorebook, Preset)
  if (resourceSnapshot) {
    for (const [type, resources] of Object.entries(resourceSnapshot)) {
      if (resources.length === 0) continue;
      const definition = SemanticTypeMap[type as keyof typeof SemanticTypeMap];
      if (definition && "wrapperFunction" in definition) {
        // @ts-ignore - 这里的类型推断可能比较复杂，假设 wrapperFunction 能够处理
        Object.assign(context, definition.wrapperFunction(resources));
      }
    }
  }

  // 3. 加载设置与模型配置
  if (!settingSnapshot || !modelConfigSnapshot) {
    console.error(
      "Critical: Setting or ModelConfig is missing during context creation."
    );
  } else {
    Object.assign(
      context,
      SettingDefinition.wrapperFunction([
        { path: "setting.[setting].json", content: settingSnapshot },
      ])
    );
    Object.assign(
      context,
      ModelConfigDefinition.wrapperFunction([
        {
          path: "modelConfig.[modelConfig].json",
          content: modelConfigSnapshot,
        },
      ])
    );
  }

  // 4. 初始化向量结果容器
  context.VECTOR_RESULT = { chat: [] };

  // 5. 执行向量搜索 (如果有 Chat 上下文)
  const vectorSetting = settingSnapshot?.vectorization;
  const embeddingModelName = context.embeddingModelName;

  if (
    vectorSetting?.enabled &&
    embeddingModelName &&
    context.CHAT // 确保通过 Resource 加载了 Character/History 从而初始化了 CHAT
  ) {
    try {
      const searcher = context.CHAT.createVectorSearch(embeddingModelName);
      const results = searcher.find(
        vectorSetting.similarityThreshold,
        vectorSetting.queryMessageCount,
        vectorSetting.maxResultCount
      );
      context.VECTOR_RESULT.chat = results;
    } catch (e) {
      console.warn("[Vector] Search failed during context initialization:", e);
    }
  }

  // 6. 构建正则处理器 (Regex Wrapper)
  const combinedRegexRules: RegexRule[] = [];
  // 收集角色正则
  if (resourceSnapshot && resourceSnapshot.character) {
    resourceSnapshot.character.forEach((res: any) => {
      if (res.content.REGEX && Array.isArray(res.content.REGEX)) {
        combinedRegexRules.push(...res.content.REGEX);
      }
    });
  }
  // 收集全局设置正则
  if (settingSnapshot?.REGEX && Array.isArray(settingSnapshot.REGEX)) {
    combinedRegexRules.push(...settingSnapshot.REGEX);
  }
  context.REGEX = new RegexWrapper(combinedRegexRules);

  // 7. 合并自定义上下文 (如临时变量)
  Object.assign(context, customContext);

  // 8. 初始化运行时状态
  context.DepthMessages = new Map();
  context.intervalsToCreate = [];
  context.processingState = {};

  // 9. 注入工具函数 (Tools)
  // 这些函数在执行过程中被调用，它们操作的是上面创建的 context 闭包
  context.tools = {
    initPreset: (ctx: ExecuteContext) => {
      if (ctx.LOREBOOK) ctx.LOREBOOK.process(ctx);
      if (ctx.PRESET) ctx.PRESET.selectVariantByModel(ctx.defaultChatModel);
    },

    applyRegex: (ctx: ExecuteContext) => {
      let chat = ctx.REGEX.process(ctx.CHAT);
      if (ctx.PRESET) {
        chat = chat.applyRegex(ctx.PRESET.REGEX);
      }
      ctx.processingState.workingChat = chat;
    },

    getPresetDepthMessage: (ctx: ExecuteContext) => {
      if (!ctx.PRESET) return;
      const { numericInjectGroup, stringInjectGroup, unspecifiedInjectGroup } =
        separatePrompts(ctx.PRESET.prompts);

      ctx.processingState.numericInjectGroup = numericInjectGroup;
      ctx.processingState.stringInjectGroup = stringInjectGroup;
      ctx.processingState.unspecifiedInjectGroup = unspecifiedInjectGroup;
    },

    mergeDepth: (ctx: ExecuteContext) => {
      const lorebookDepthInjections: Record<number, any[]> = {};
      if (ctx.DepthMessages) {
        for (const [depth, messages] of ctx.DepthMessages.entries()) {
          lorebookDepthInjections[depth] = messages;
        }
      }
      const workingChat = ctx.processingState.workingChat;
      const numericInjectGroup = ctx.processingState.numericInjectGroup || {};

      if (workingChat) {
        ctx.processingState.workingChat = workingChat.injectMany([
          numericInjectGroup,
          lorebookDepthInjections,
        ]);
      }
    },

    usePresetMessageTemplate: async (ctx: ExecuteContext) => {
      const workingChat = ctx.processingState.workingChat;
      if (!workingChat) return;

      const templateEnv = {
        ...ctx,
        ...(ctx.processingState.stringInjectGroup || {}),
        CHAT: workingChat,
      };

      const finalChatContext = await workingChat.applyTemplate(
        ctx.processingState.unspecifiedInjectGroup || [],
        templateEnv
      );
      ctx.processingState.finalChatContext = finalChatContext;
    },

    writeMessageParams: (ctx: ExecuteContext) => {
      if (!ctx.defaultChatModel) {
        throw new Error("未指定默认对话模型，请在设置中指定");
      }
      const finalChatContext = ctx.processingState.finalChatContext;
      const container = ctx.getContainer();
      if (!finalChatContext || !container) return;

      const finalMessages = finalChatContext.finalize();
      ctx.processingState.finalMessages = finalMessages;

      container.metaGenerateInfo.timeInfo.start = new Date().toISOString();
      container.metaGenerateInfo.modelName = ctx.defaultChatModel;
      container.metaGenerateInfo.renderInfo = {
        usedPresetName: ctx.PRESET?.name || "Unknown",
        characterFilePath: ctx.CHARACTER?.path ?? "",
        characterName: ctx.CHARACTER?.name ?? "Assistant",
        bakedRegexReplace: ctx.PRESET?.needToBakeRegex || [],
      };

      ctx.processingState.generationCallParams = {
        ...(ctx.PRESET?.generationParams || {}),
        model: ctx.defaultChatModel,
        prompt: finalMessages,
      };
    },

    writeMessageContent: async (ctx: ExecuteContext) => {
      console.log("generateEnter with:", ctx.processingState.finalMessages);
      const container = ctx.getContainer();
      const params = ctx.processingState.generationCallParams;
      const finalMessages = ctx.processingState.finalMessages;

      if (!container || !params) return;

      if (finalMessages && finalMessages.length !== 0) {
        if (params.stream) {
          const { textStream } = streamText(params);
          for await (const textPart of textStream) {
            container.content += textPart;
          }
        } else {
          const { text } = await generateText(params);
          container.content += text;
        }
      } else {
        container.content = "Error: Empty message array. check your preset";
      }

      const startTime = Date.parse(container.metaGenerateInfo.timeInfo.start);
      container.metaGenerateInfo.timeInfo.timeUsed = Date.now() - startTime;
    },

    saveVector: async (ctx: ExecuteContext) => {
      const container = ctx.getContainer();
      if (
        !container ||
        !vectorSetting?.enabled ||
        !embeddingModelName ||
        !container.content
      ) {
        return;
      }
      if (!ctx.defaultEmbeddingModel) {
        console.log("未指定默认向量化模型，跳过向量化过程");
        return;
      }

      try {
        const { embedding } = await embed({
          model: ctx.defaultEmbeddingModel,
          value: container.content,
        });
        container.metaGenerateInfo.embedding[embeddingModelName] = embedding;
        console.log(`[Vector] Simulated save for ${embeddingModelName}`);
      } catch (error) {
        console.error("[Vector] Failed:", error);
      }
    },
  };

  return context as fromUseExecuteContext;
}
