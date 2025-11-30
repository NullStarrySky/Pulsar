// src/schema/lorebook/lorebook.schema.ts
import { SlidersHorizontal, ListOrdered } from "lucide-vue-next";
import type { Schema } from "@/components/SchemaRenderer/SchemaRenderer.types";
import EntryEditor from "./components/EntryEditor.vue";
import ExecutableStringEditor from "./components/ExecutableStringEditor.vue";

/**
 * 定义知识库编辑器的 Schema。
 * 此 schema 描述了如何在 SchemaRenderer 中渲染知识库对象。
 */
export const lorebookSchema: Schema = {
  // 左侧边栏顶部的元信息
  groupMeta: {
    title: "知识库编辑器",
    description: "配置知识库的全局设置和知识条目。",
  },

  // 定义侧边栏导航和右侧要渲染的内容
  content: [
    // --- 组 1: 全局设置 ---
    {
      svg: SlidersHorizontal,
      title: "全局设置",
      content: {
        title: "知识库全局设置",
        content: [
          {
            title: "行为",
            content: [
              {
                title: "使用本书特定设置",
                description:
                  "如果启用，这本书将忽略全局设置并使用下面的自身设置。",
                component: "Switch",
                accessChain: "useLocalSetting",
              },
              {
                title: "扫描深度",
                description: "扫描以查找激活关键词的最近消息数量。",
                component: "Slider",
                accessChain: "setting.scan_depth",
                props: { min: 1, max: 100, step: 1 },
              },
              {
                title: "最大递归深度",
                description: "已激活的条目可以触发其他条目的最大次数。",
                component: "Slider",
                accessChain: "setting.max_recursion_count",
                props: { min: 0, max: 10, step: 1 },
              },
            ],
          },
          {
            title: "全局激活条件 (适用于所有条目)",
            content: [
              {
                title: "条件",
                description: "适用于本书中所有条目的全局条件。",
                component: "ExecutableStringEditor",
                accessChain: "setting.activationWhen",
              },
            ],
          },
        ],
      },
    },

    // --- 分隔符 ---
    "Separator",

    // --- 组 2: 条目编辑器 ---
    {
      svg: ListOrdered,
      title: "条目编辑器",
      content: {
        title: "知识库条目",
        content: [
          {
            content: [
              {
                title: "条目列表",
                description:
                  "管理此知识库的所有知识条目。在此处添加、删除和编辑它们。",
                component: "EntryEditor", // 使用自定义组件
                accessChain: "entries",
                useTopBottom: true, // 复杂组件使用自上而下的布局以获得最大空间
              },
            ],
          },
        ],
      },
    },
  ],

  // 注册 SchemaRenderer 中默认未包含的自定义组件
  components: {
    EntryEditor,
    ExecutableStringEditor,
  },
};
