// src/schema/preset/preset.schema.ts
import { BookText, Bot, ListPlus, SlidersHorizontal } from "lucide-vue-next";
import type { Schema } from "@/components/SchemaRenderer/SchemaRenderer.types";

// --- 自定义组件导入 ---
// 请确保这些路径相对于您的 schema.ts 文件的位置是正确的。

import NeedToBakeRegexEditor from "./components/NeedToBakeRegexEditor.vue";
import PromptsPanel from "./components/PromptsPanel.vue";
/**
 * 定义了用于 Preset (预设) 的 Schema。
 * 该 Schema 描述了如何将 Preset 对象的属性渲染到 SchemaRenderer 组件中。
 */
export const presetSchema: Schema = {
  // 左侧边栏顶部的元信息
  groupMeta: {
    title: "预设编辑器",
    description: "配置模型参数、提示词注入和核心生成逻辑。",
  },

  // 定义侧边栏的导航项和右侧的渲染内容
  content: [
    // --- 分组 1: 核心逻辑与参数 ---
    {
      svg: Bot,
      title: "核心逻辑",
      content: {
        title: "核心逻辑与基本参数",
        content: [
          {
            content: [
              {
                title: "预设名称",
                description: "为此预设指定一个唯一的名称。",
                component: "Input",
                accessChain: "name",
                props: {
                  placeholder: "例如：创意写作助手",
                },
              },
              {
                title: "最大聊天历史令牌",
                description:
                  "在生成请求时，包含在上下文中的最大聊天历史记录令牌数。",
                component: "Slider",
                accessChain: "maxChatHistoryToken",
                props: {
                  min: 0,
                  max: 128000,
                  step: 1024,
                },
              },
              {
                title: "生成逻辑 (onGenerate)",
                description:
                  "定义核心生成逻辑的 JavaScript 函数体。您可以在此完全控制发送到模型的数据和流程。",
                component: "JSCodeEditor", // 使用自定义代码编辑器
                accessChain: "onGenerate",
                useTopBottom: true, // 对复杂组件使用上下布局
              },
            ],
          },
        ],
      },
    },

    // --- 分组 2: 模型微调 ---
    {
      svg: SlidersHorizontal,
      title: "模型微调",
      content: {
        title: "模型生成参数 (Generation Parameters)",
        content: [
          {
            title: "常用参数",
            content: [
              {
                title: "温度 (Temperature)",
                description:
                  "控制生成的随机性。值越高，输出越随机；值越低，输出越确定。",
                component: "Slider",
                accessChain: "generationParams.temperature",
                props: { min: 0, max: 2, step: 0.1 },
              },
              {
                title: "最大令牌数 (Max Tokens)",
                description: "单次生成中允许生成的最大令牌数量。",
                component: "Slider",
                accessChain: "generationParams.max_tokens",
                props: { min: 1, max: 16384, step: 128 },
              },
              {
                title: "Top P",
                description:
                  "一种替代温度采样的方法，称为核心采样。模型会考虑概率质量加起来等于 top_p 的令牌结果。",
                component: "Slider",
                accessChain: "generationParams.top_p",
                props: { min: 0, max: 1, step: 0.05 },
              },
              {
                title: "启用流式传输",
                description:
                  "是否以流的形式接收模型的响应。为了获得最佳体验，建议保持启用。",
                component: "Switch",
                accessChain: "generationParams.stream",
              },
            ],
          },
          {
            title: "惩罚与高级参数",
            content: [
              {
                title: "存在惩罚 (Presence Penalty)",
                description:
                  "对新出现的令牌进行惩罚，鼓励模型谈论新话题。正值会增加谈论新话题的可能性。",
                component: "Slider",
                accessChain: "generationParams.presence_penalty",
                props: { min: -2, max: 2, step: 0.1 },
              },
              {
                title: "频率惩罚 (Frequency Penalty)",
                description:
                  "降低模型重复相同行的可能性。正值会根据现有频率降低重复的可能性。",
                component: "Slider",
                accessChain: "generationParams.frequency_penalty",
                props: { min: -2, max: 2, step: 0.1 },
              },
              {
                title: "停止序列 (Stop)",
                description:
                  "指定一个或多个序列，当模型生成这些序列时将停止生成。使用换行符分隔多个序列。",
                component: "PopableTextarea",
                accessChain: "generationParams.stop",
                props: {
                  dialogTitle: "编辑停止序列",
                },
              },
              {
                title: "Logit Bias",
                description:
                  "修改特定令牌出现的可能性。请输入一个有效的 JSON 对象，键为令牌ID，值为偏置。",
                component: "PopableTextarea",
                accessChain: "generationParams.logit_bias",
                props: {
                  dialogTitle: "编辑 Logit Bias (JSON)",
                  placeholder: '{\n  "50256": -100\n}',
                },
              },
            ],
          },
        ],
      },
    },

    // --- 分组 3: 提示词注入 ---
    {
      svg: ListPlus,
      title: "提示词注入",
      content: {
        title: "提示词片段管理",
        content: [
          {
            content: [
              {
                title: "提示词配置",
                description:
                  "管理不同模型配置下的提示词片段。每个标签页代表一个独立的配置，可根据模型名称通过正则表达式自动匹配。",
                component: "PromptsPanel", // 使用自定义的 PromptsPanel 组件
                accessChain: "variants", // 指向新的 variants 数组
                useTopBottom: true,
              },
            ],
          },
        ],
      },
    },

    // --- 分组 4: 文本与数据处理 ---
    {
      svg: BookText,
      title: "文本与数据",
      content: {
        title: "文本与数据处理",
        content: [
          {
            content: [
              {
                title: "正则替换规则",
                description: "管理应用于此预设的正则表达式替换规则。",
                component: "RegexEditor",
                accessChain: "REGEX",
                useTopBottom: true,
              },
              {
                title: "烘焙正则规则",
                description: "管理将会被烘焙到消息的正则表达式替换规则。",
                component: "NeedToBakeRegexEditor",
                accessChain: "needToBakeRegex",
                useTopBottom: true,
              },
              {
                title: "用户自定义变量",
                description:
                  "定义可供 onGenerate 脚本通过 `variables` 对象访问的键值对。请输入有效的 JSON 对象。",
                component: "VariableEditor",
                accessChain: "userValue",
                props: {
                  dialogTitle: "编辑用户变量 (JSON)",
                  placeholder: '{\n  "my_variable": "some_value"\n}',
                },
                useTopBottom: true,
              },
            ],
          },
        ],
      },
    },
  ],

  // --- 注册自定义组件 ---
  // 在这里注册的组件可以在上面的 content 定义中通过名称来使用。
  components: {
    PromptsPanel,
    NeedToBakeRegexEditor,
  },
};
