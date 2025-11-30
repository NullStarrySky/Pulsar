// src/schema/preset/preset.ts

import { v4 as uuidv4 } from "uuid";
import { SchemaDefinition } from "../SemanticType";
import { executeCode } from "@/lib/ExpressionEngine";
import { MultiDepthInjection } from "../chat/EnhancedApiReadyContext";
import { ApiReadyMessage, MessageAlternative } from "../chat/chat.types";
import { ExecuteContext } from "../shared.types";
import { presetSchema } from "./preset.schema";
import { Prompt, Preset } from "./preset.types.ts";

/**
 * 分离提示词模版，生成可注入的消息组。
 *
 */
export function separatePrompts(prompts: Prompt[]): {
  numericInjectGroup: MultiDepthInjection;
  stringInjectGroup: Record<string, ApiReadyMessage[]>;
  unspecifiedInjectGroup: ApiReadyMessage[];
} {
  const numericInjectGroup: MultiDepthInjection = {};
  const stringInjectGroup: Record<string, ApiReadyMessage[]> = {};
  const unspecifiedInjectGroup: ApiReadyMessage[] = [];

  for (const prompt of prompts) {
    if (!prompt.enabled) {
      continue;
    }
    const apiReadyMessage: ApiReadyMessage = {
      role: prompt.role,
      content: prompt.content,
    };
    const position = prompt.injectPosition;
    if (typeof position === "number") {
      if (!numericInjectGroup[position]) {
        numericInjectGroup[position] = [];
      }
      numericInjectGroup[position].push(apiReadyMessage);
    } else if (typeof position === "string" && position !== "none") {
      if (!stringInjectGroup[position]) {
        stringInjectGroup[position] = [];
      }
      stringInjectGroup[position].push(apiReadyMessage);
    } else {
      unspecifiedInjectGroup.push(apiReadyMessage);
    }
  }

  return { numericInjectGroup, stringInjectGroup, unspecifiedInjectGroup };
}

// ===============================================================
// 范式核心：Wrapper
// ===============================================================

class PresetWrapper {
  private resource: { path: string; content: Preset }[];
  public preset: Preset;
  private _activePrompts: Prompt[] = []; // 内部状态，保存当前激活的提示词

  constructor(resources: { path: string; content: Preset }[]) {
    if (!resources || resources.length === 0) {
      throw new Error("PresetWrapper requires at least one preset resource.");
    }
    this.resource = resources;
    this.preset = this.resource[0].content;

    // 构造时，默认使用第一个变体的提示词
    if (this.preset.variants && this.preset.variants.length > 0) {
      this._activePrompts = this.preset.variants[0].prompts;
    }
  }

  // ============== 为模板和脚本暴露预设属性 ==============
  get name() {
    return this.preset.name;
  }
  get generationParams() {
    return this.preset.generationParams;
  }
  get REGEX() {
    return this.preset.REGEX;
  }
  get needToBakeRegex() {
    return this.preset.needToBakeRegex;
  }
  get maxChatHistoryToken() {
    return this.preset.maxChatHistoryToken;
  }
  // 'prompts' getter 现在返回当前激活的提示词数组
  get prompts() {
    return this._activePrompts;
  }
  get userValue() {
    return this.preset.userValue.value;
  }
  get onGenerate() {
    return this.preset.onGenerate;
  }

  /**
   * 根据名称切换当前的主要预设文件。
   */
  public switchPreset(name: string) {
    const newPresetResource = this.resource.find(
      (r) => r.content.name === name
    );

    if (newPresetResource) {
      this.preset = newPresetResource.content;
      // 切换预设后，重置激活的提示词为新预设的第一个变体
      if (this.preset.variants && this.preset.variants.length > 0) {
        this._activePrompts = this.preset.variants[0].prompts;
      } else {
        this._activePrompts = [];
      }
    } else {
      throw new Error(`Preset with name "${name}" not found.`);
    }
  }

  /**
   * 根据模型名称选择激活的提示词变体。
   * 此方法会查找第一个 modelRegex 匹配给定模型名称的变体。
   * @param modelName - 用于匹配的模型名称，例如 "gpt-4-turbo"。
   */
  public selectVariantByModel(modelName: string) {
    if (!this.preset.variants || this.preset.variants.length === 0) {
      this._activePrompts = [];
      return;
    }

    const matchingVariant = this.preset.variants.find((variant) => {
      try {
        // 使用 'i' 标志进行不区分大小写的匹配
        return new RegExp(variant.modelRegex, "i").test(modelName);
      } catch (e) {
        console.error(
          `预设变体 "${variant.name}" 中的正则表达式无效: ${variant.modelRegex}`,
          e
        );
        return false;
      }
    });

    if (matchingVariant) {
      this._activePrompts = matchingVariant.prompts;
    } else {
      // 如果没有找到匹配项，则回退到使用第一个变体作为默认值
      this._activePrompts = this.preset.variants[0].prompts;
    }
  }
  /**
   * 根据给定的上下文和逻辑流程，执行完整的文本生成过程。
   * 逻辑已重构为基于 ctx.tools 的流水线调用。
   * @param ctx - 包含了所有运行时数据和方法的执行上下文。
   * @param container - 用于接收和存储生成结果的消息对象。
   */
  public async process(
    ctx: ExecuteContext,
    container: MessageAlternative
  ): Promise<void> {
    // 步骤 0: 初始化状态
    // 必须确保 processingState 存在并将 container 挂载上去，
    // 以便后续无参工具函数能够访问到目标容器。
    ctx.processingState = ctx.processingState || {};
    ctx.processingState.container = container;

    // 步骤 1: 初始化预设与环境
    // - 处理世界书
    // - 根据模型名选择预设变体
    await ctx.tools.initPreset(ctx);

    // 步骤 2: 应用正则表达式
    // - 应用角色和全局正则
    // - 应用预设正则
    // - 生成 workingChat
    await ctx.tools.applyRegex(ctx);

    // 步骤 3: 准备深度注入
    // - 分离预设提示词 (Separate Prompts)
    await ctx.tools.getPresetDepthMessage(ctx);

    // 步骤 4: 合并深度信息
    // - 合并世界书深度注入和预设数字注入
    // - 注入到 workingChat
    await ctx.tools.mergeDepth(ctx);

    // 步骤 5: 应用模板
    // - 构建模板环境 (templateEnv)
    // - 处理 stringInjectGroup
    // - 处理 unspecifiedInjectGroup
    await ctx.tools.usePresetMessageTemplate(ctx);

    // 步骤 6: 准备参数
    // - finalize() 生成最终消息数组
    // - 填充 metaGenerateInfo
    // - 准备 generationCallParams
    await ctx.tools.writeMessageParams(ctx);

    // 步骤 7: 执行生成
    // - 调用 AI 接口
    // - 写入 container.content
    // - 记录耗时
    await ctx.tools.writeMessageContent(ctx);

    // 步骤 8: 自动向量化
    // 生成结束后，检查设置并为新消息生成向量
    await ctx.tools.saveVector(ctx);
  }

  /**
   * 动态执行预设中的 onGenerate 脚本。
   * @param ctx - 完整的执行上下文对象。
   * @param container - 响应消息的目标容器。
   */
  async generate(ctx: ExecuteContext): Promise<void> {
    try {
      // 执行脚本
      (window as any).lc = ctx;
      await executeCode(this.onGenerate, ctx);
    } catch (error) {
      console.error("执行预设生成逻辑时发生错误:", error);
      throw error;
    }
  }
}

/**
 * wrapperFunction 用于将原始数据资源包装成可用于上下文的对象。
 * @param resources - 一个或多个 Preset 资源对象。
 * @returns 返回一个对象，其中 PRESET 键指向一个新的 PresetWrapper 实例。
 */
function wrapperFunction(
  resources:
    | { path: string; content: Preset }
    | { path: string; content: Preset }[]
) {
  const resourcesArray = Array.isArray(resources) ? resources : [resources];

  if (resourcesArray.length === 0) {
    return { PRESET: null };
  }

  return {
    PRESET: new PresetWrapper(resourcesArray),
  };
}

// ===============================================================
// 实体创建与定义
// ===============================================================
/**
 * 创建一个包含默认值的全新 Preset 对象。
 */
function createDefaultPreset(): Preset {
  return {
    name: "新预设",
    generationParams: {
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
      top_k: 40,
    },
    maxChatHistoryToken: 40960,
    variants: [
      {
        id: uuidv4(),
        name: "默认配置",
        modelRegex: ".*", // 默认匹配任何模型
        prompts: [
          {
            id: uuidv4(),
            name: "主系统提示词",
            enabled: true,
            role: "system",
            injectPosition: "BEFORE_CHAR",
            content: "你是 {{character.name}}。\n{{character.description}}",
          },
        ],
      },
    ],
    userValue: { initialValue: {}, schema: [], value: {} },
    REGEX: [],
    needToBakeRegex: [],
    onGenerate: `
   // ===============================================================
   // 预设 (Preset) 生成逻辑
   // ===============================================================
   // 此脚本在 AI 生成时执行。在范式下，大部分复杂的处理逻辑
   // 已经被封装在 PRESET.process 方法中。

   // 通常情况下，您只需要调用此方法即可完成生成：
   await PRESET.process(CTX, container);

   // ===============================================================
   // 可用变量和高级用法
   // ===============================================================
   //
   // - CTX:              完整的执行上下文 (ExecuteContext)，包含所有数据和包装器。
   //   - CTX.CHAT:       功能强大的消息数组处理器 (EnhancedApiReadyContext)。
   //   - CTX.LOREBOOK:   世界书包装器。
   //   - CTX.CHARACTER:  角色包装器。
   //   - CTX.PRESET:     当前的预设包装器实例 (与全局的 PRESET 相同)。
   //   - CTX.REGEX:      正则表达式处理器。
   //   - CTX.chatModelName: 当前选择的模型名称 (字符串)。
   //
   // - container:        响应式消息容器。AI的响应内容应写入 container.content。
   //
   // - PRESET:           当前预设包装器的快捷方式，同 CTX.PRESET。
   //
   // ---------------------------------------------------------------
   //
   // **自定义流程**:
   // 如果您想完全覆盖默认的生成流程，可以不调用 PRESET.process，
   // 而是像下面这样编写自己的逻辑:
   /*
   // 1. 手动准备消息数组
   const myMessages = CTX.CHAT
     .slice(-10) // 例如只取最近10条消息
     .inject(["这是我的自定义系统提示词！"], 0)
     .finalize();

   // 2. 准备模型参数 (可以覆盖预设中的默认值)
   const myParams = {
     ...PRESET.generationParams,
     temperature: 0.5,
     model: CTX.chatModelName,
     messages: myMessages,
   };

   // 3. 调用 AI 模型 (ai 全局单例来自 Pinia store)
   const { textStream } = await ai.streamText(myParams);

   // 4. 将结果流式写入容器
   for await (const textPart of textStream) {
     container.content += textPart;
   }
   */
   `.trim(),
  };
}

/**
 * 导出 Preset 的语义类型定义。
 * - `new`: 用于创建新实例的函数。
 * - `wrapperFunction`: 将原始数据转换为带方法的上下文对象的函数。
 * - `renderingMethod`: 用于在UI中渲染和编辑此类型数据的组件或Schema。
 */
export const PresetDefinition = {
  new: createDefaultPreset,
  wrapperFunction: wrapperFunction,
  renderingMethod: presetSchema,
} satisfies SchemaDefinition<Preset>;
