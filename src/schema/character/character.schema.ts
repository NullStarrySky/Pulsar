// src/schema/character/character.schema.ts
import {
  User,
  Bot,
  SlidersHorizontal,
  ReplaceAll,
  FunctionSquare,
  FileText,
  Blocks,
} from "lucide-vue-next";
import type { Schema } from "@/components/SchemaRenderer/SchemaRenderer.types";

/**
 * 定义了用于 Character Editor 的 Schema。
 * 该 Schema 描述了如何将 Character 对象的属性渲染到 SchemaRenderer 组件中。
 */
export const characterSchema: Schema = {
  // 左侧边栏顶部的元信息
  groupMeta: {
    title: "角色编辑器",
    description: "在此处编辑和配置您的角色卡的详细信息。",
  },

  // 定义侧边栏的导航项和右侧的渲染内容
  content: [
    // --- 分组 1: 基本信息 ---
    {
      svg: User,
      title: "基本信息",
      content: {
        title: "角色基本信息",
        content: [
          {
            // 此 RowGroup 没有标题，直接渲染内容
            content: [
              {
                title: "角色名称",
                description: "角色的主要名称，这是必填项。",
                component: "Input",
                accessChain: "name",
                props: {
                  placeholder: "例如：爱丽丝",
                },
              },
              {
                title: "角色描述",
                description: "对角色的简短介绍，会显示在角色选择界面。",
                component: "Textarea",
                accessChain: "description",

                props: {
                  placeholder: "一个活泼开朗、充满好奇心的探险家。",
                  rows: 3,
                },
              },
            ],
          },
        ],
      },
    },

    // --- 分组 2: 核心设定 ---
    {
      svg: Bot,
      title: "核心设定",
      content: {
        title: "角色核心设定",
        content: [
          {
            content: [
              {
                title: "性格",
                description: "详细描述角色的性格特征、价值观、习惯和怪癖。",
                component: "PopableTextarea",
                accessChain: "personality",
                useTopBottom: true,
                props: {
                  dialogTitle: "编辑角色性格",
                },
              },
              {
                title: "场景",
                description: "描述角色当前所处的环境或情景。",
                component: "PopableTextarea",
                accessChain: "scenario",
                props: {
                  dialogTitle: "编辑场景",
                },
              },
              {
                title: "示例对话",
                description:
                  "提供角色可能进行的对话示例，以展示其语言风格和个性。",
                component: "PopableTextarea",
                accessChain: "mes_example",
                props: {
                  dialogTitle: "编辑示例对话",
                },
              },
            ],
          },
        ],
      },
    },

    // --- 分组 3: 高级设定 ---
    {
      svg: SlidersHorizontal,
      title: "高级设定",
      content: {
        title: "高级文本生成设定",
        content: [
          {
            content: [
              {
                title: "系统提示",
                description:
                  "在对话历史的最顶端插入的指令，用于引导模型的行为。",
                component: "PopableTextarea",
                accessChain: "system_prompt",
                props: {
                  dialogTitle: "编辑系统提示",
                },
              },
              {
                title: "后历史指令",
                description:
                  "在对话历史的末尾插入的指令，用于在生成回复前最后引导模型。",
                component: "PopableTextarea",
                accessChain: "post_history_instructions",
                props: {
                  dialogTitle: "编辑后历史指令",
                },
              },
            ],
          },
        ],
      },
    },

    // --- 分隔符 ---
    "Separator",

    // --- 分组 4: 正则替换 ---
    {
      svg: ReplaceAll,
      title: "正则替换",
      content: {
        title: "正则表达式替换规则",
        content: [
          {
            content: [
              {
                title: "规则列表",
                description:
                  "管理在不同阶段应用于文本的正则表达式替换规则。可拖拽排序。",
                component: "RegexEditor",
                accessChain: "REGEX",
                useTopBottom: true, // 对复杂组件使用上下布局
              },
            ],
          },
        ],
      },
    },

    // --- 分组 5: 函数调用 ---
    {
      svg: FunctionSquare,
      title: "函数调用",
      content: {
        title: "函数调用 (Tools)",
        content: [
          {
            content: [
              {
                title: "可用工具",
                description:
                  "指定此角色可以使用的工具ID列表。请每行输入一个工具名称。",
                component: "PopableTextarea",
                accessChain: "tools",
                props: {
                  dialogTitle: "编辑可用工具",
                  placeholder: "tool_id_1\ntool_id_2\n...",
                },
              },
            ],
          },
        ],
      },
    },

    // --- 分隔符 ---
    "Separator",

    // --- 分组 6: 元数据 ---
    {
      svg: FileText,
      title: "元数据",
      content: {
        title: "角色元数据",
        content: [
          {
            content: [
              {
                title: "创建者",
                description: "此角色卡的作者。",
                component: "Input",
                accessChain: "creator",
              },
              {
                title: "角色版本",
                description: "角色卡的版本号，建议遵循语义化版本规范。",
                component: "Input",
                accessChain: "character_version",
              },
              {
                title: "创建者笔记",
                description: "作者留下的关于角色创作的笔记、评论或致谢。",
                component: "PopableTextarea",
                accessChain: "creator_notes",
                props: {
                  dialogTitle: "编辑创建者笔记",
                },
              },
              {
                title: "来源",
                description:
                  "角色的来源，例如书籍、电影或游戏。请每行输入一个来源。",
                component: "PopableTextarea",
                accessChain: "source",
                props: {
                  dialogTitle: "编辑来源",
                },
              },
            ],
          },
        ],
      },
    },

    // --- 分组 7: 扩展数据 ---
    {
      svg: Blocks,
      title: "扩展数据",
      content: {
        title: "扩展数据",
        content: [
          {
            content: [
              {
                title: "扩展属性",
                description:
                  "用于存储非标准数据的JSON对象，供插件或其他应用程序使用。请确保输入有效的JSON格式。",
                component: "PopableTextarea",
                accessChain: "extensions",
                props: {
                  dialogTitle: "编辑扩展数据 (JSON)",
                  placeholder: '{\n  "key": "value"\n}',
                },
              },
              {
                title: "多语言创作者笔记",
                description:
                  '以JSON格式存储不同语言的创作者笔记，键为语言代码（如 "en", "zh"）。',
                component: "PopableTextarea",
                accessChain: "creator_notes_multilingual",
                props: {
                  dialogTitle: "编辑多语言创作者笔记 (JSON)",
                  placeholder:
                    '{\n  "en": "Notes in English",\n  "zh": "中文笔记"\n}',
                },
              },
            ],
          },
        ],
      },
    },
  ],

  // 该 Schema 未提供自定义组件，将完全使用 SchemaRenderer 中的默认组件
  components: {},
};
