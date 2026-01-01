// src/schema/setting/setting.schema.ts
import {
  Blocks,
  Bot,
  History,
  Image as ImageIcon, // 引入图标
  Library,
  ReplaceAll,
  ScanLine,
} from "lucide-vue-next";
import type { Schema } from "@/components/SchemaRenderer/SchemaRenderer.types";
import ExecutableStringEditor from "../lorebook/components/ExecutableStringEditor.vue";
import DefaultModelSelector from "./components/DefaultModelSelector.vue";

/**
 * 定义了用于全局设置 (Setting) 的 Schema。
 * @returns {Schema} 描述如何将 Setting 对象渲染到 SchemaRenderer 组件的 Schema 对象。
 */
export function getSettingSchema(): Schema {
  return {
    // 左侧边栏顶部的元信息
    groupMeta: {
      title: "全局设置",
      description: "配置应用程序的各项行为和功能。",
    },

    // 定义侧边栏的导航项和右侧的渲染内容
    content: [
      {
        svg: Bot,
        title: "默认模型",
        content: {
          title: "AI 模型首选项",
          content: [
            {
              content: [
                {
                  title: "模型选择",
                  description: "配置默认对话和嵌入模型。",
                  component: "DefaultModelSelector",
                  accessChain: "defaultModels",
                },
              ],
            },
          ],
        },
      },
      // --- 新增分组: 外观设置 ---
      {
        svg: ImageIcon,
        title: "外观设置",
        content: {
          title: "外观与显示",
          content: [
            {
              title: "背景设置",
              content: [
                {
                  title: "背景显示模式",
                  description: "设置背景图片的填充和对齐方式。",
                  component: "Select",
                  accessChain: "background.mode",
                  props: {
                    options: [
                      { label: "覆盖 (Cover)", value: "cover" },
                      { label: "包含 (Contain)", value: "contain" },
                      { label: "平铺 (Tile)", value: "tile" },
                      { label: "居中 (Center)", value: "center" },
                      { label: "拉伸 (Stretch)", value: "stretch" },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
      // --- 分组 1: 知识库  ---
      {
        svg: Library,
        title: "知识库",
        content: {
          title: "全局知识库（Lorebook）设置",
          content: [
            {
              title: "扫描与递归",
              content: [
                {
                  title: "扫描深度",
                  description:
                    "从最近的消息开始，向上扫描多少条历史消息以评估激活条件。",
                  component: "Slider",
                  accessChain: "lorebook.scan_depth",
                  props: { min: 1, max: 100, step: 1 },
                },
                {
                  title: "最大递归次数",
                  description:
                    "已激活条目的内容可触发其他条目的最大连续次数。设为 0 可禁用递归。",
                  component: "Slider",
                  accessChain: "lorebook.max_recursion_count",
                  props: { min: 0, max: 10, step: 1 },
                },
              ],
            },
            {
              title: "全局激活条件",
              content: [
                {
                  title: "条件列表",
                  description:
                    "应用于所有书籍的全局激活条件。请每行输入一个可执行条件。",
                  component: "ExecutableStringEditor",
                  accessChain: "lorebook.activationWhen",
                },
              ],
            },
          ],
        },
      },

      // --- 分隔符 ---
      "Separator",
      {
        svg: ScanLine,
        title: "向量化 (RAG)",
        content: {
          title: "RAG 向量化设置",
          content: [
            {
              title: "基础控制",
              content: [
                {
                  title: "启用聊天消息向量化",
                  description:
                    "是否在生成消息时自动计算并存储向量嵌入，并在生成前检索相关历史。",
                  component: "Switch",
                  accessChain: "vectorization.enabled",
                },
              ],
            },
            {
              title: "查询参数",
              content: [
                {
                  title: "相似度阈值",
                  description:
                    "只有相似度高于此值的记忆才会被检索。范围 0.0 - 1.0。",
                  component: "Slider",
                  accessChain: "vectorization.similarityThreshold",
                  props: { min: 0, max: 1, step: 0.01 },
                },
                {
                  title: "查询消息数",
                  description: "使用最近多少条消息的内容组合作为搜索关键词。",
                  component: "Slider",
                  accessChain: "vectorization.queryMessageCount",
                  props: { min: 1, max: 10, step: 1 },
                },
                {
                  title: "最大结果数量",
                  description: "单次检索最多注入多少条相关记忆。",
                  component: "Slider",
                  accessChain: "vectorization.maxResultCount",
                  props: { min: 1, max: 20, step: 1 },
                },
              ],
            },
            {
              title: "分块策略",
              content: [
                {
                  title: "分块大小 (Chunk Size)",
                  description: "向量化时文本切片的最大字符数。",
                  component: "Slider",
                  accessChain: "vectorization.chunkSize",
                  props: { min: 64, max: 2048, step: 64 },
                },
                {
                  title: "分隔符",
                  description:
                    "用于切分文本的字符列表，按优先级排序（每行一个）。",
                  component: "PopableTextarea",
                  accessChain: "vectorization.delimiters",
                  props: {
                    dialogTitle: "编辑分块分隔符",
                    placeholder: "\\n\\n\n\\n\n。",
                  },
                },
              ],
            },
          ],
        },
      },

      // --- 分组 2: 文本处理 ---
      {
        svg: ReplaceAll,
        title: "文本处理",
        content: {
          title: "文本处理规则",
          content: [
            {
              content: [
                {
                  title: "全局正则替换",
                  description: "管理应用于所有输入和输出的正则表达式替换规则。",
                  component: "RegexEditor",
                  accessChain: "REGEX",
                  useTopBottom: true,
                },
              ],
            },
          ],
        },
      },

      // --- 分组 3: 工具与扩展 ---
      {
        svg: Blocks,
        title: "工具与扩展",
        content: {
          title: "工具与扩展配置",
          content: [
            {
              content: [
                {
                  title: "可用工具",
                  description:
                    "定义全局可用的工具ID列表。请每行输入一个工具名称。",
                  component: "PopableTextarea",
                  accessChain: "tools",
                  props: {
                    dialogTitle: "编辑可用工具列表",
                    placeholder: "tool_id_1\ntool_id_2\n...",
                  },
                },
                {
                  title: "扩展配置",
                  description: "管理已安装扩展的配置。请输入有效的 JSON 对象。",
                  component: "PopableTextarea",
                  accessChain: "extensions",
                  props: {
                    dialogTitle: "编辑扩展配置 (JSON)",
                    placeholder:
                      '{\n  "extension_name": {\n    "autoLoad": true,\n    "shouldDeferLoad": false\n  }\n}',
                  },
                },
              ],
            },
          ],
        },
      },

      // --- 分组 4: 备份 ---
      {
        svg: History,
        title: "备份",
        content: {
          title: "自动备份设置",
          content: [
            {
              content: [
                {
                  title: "备份间隔（小时）",
                  description:
                    "每隔多少小时执行一次自动备份。设置为 0 可禁用自动备份。",
                  component: "Slider",
                  accessChain: "backup.interval",
                  props: { min: 0, max: 168, step: 1 },
                },
                {
                  title: "最大备份数量",
                  description:
                    "保留的最新备份文件的最大数量。旧的备份将被自动删除。",
                  component: "Slider",
                  accessChain: "backup.maxBackups",
                  props: { min: 1, max: 20, step: 1 },
                },
                {
                  title: "排除的路径",
                  description:
                    "在备份时需要排除的文件夹或路径列表。请每行输入一个路径。",
                  component: "PopableTextarea",
                  accessChain: "backup.excludedPaths",
                  props: {
                    dialogTitle: "编辑排除的路径",
                    placeholder: "trashbin\ntemp_files\n...",
                  },
                },
              ],
            },
          ],
        },
      },
    ],

    components: { ExecutableStringEditor, DefaultModelSelector },
  };
}
