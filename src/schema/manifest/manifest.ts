// src/schema/manifest/manifest.ts
import { v4 as uuidv4 } from "uuid";
import type { ManifestContent } from "./manifest.types";
import { SchemaDefinition } from "../SemanticType";
import ManifestEditor from "./ManifestEditor.vue";

// --- Factory ---

export function newManifest(): ManifestContent {
  return {
    id: uuidv4(),
    name: "Default Context",
    description: "自动生成的环境配置",
    selection: {
      character: [],
      lorebook: [],
      preset: [],
    },
    // 初始化新字段
    customComponents: {},
    background: {
      path: "",
      mode: "cover",
    },
    creation_date: Date.now(),
    last_modified: Date.now(),
  };
}

// --- Wrapper ---

export class ManifestWrapper {
  private resource: { path: string; content: ManifestContent };

  constructor(resource: { path: string; content: ManifestContent }) {
    this.resource = resource;
  }

  get selection() {
    return this.resource.content.selection;
  }

  get path() {
    return this.resource.path;
  }

  // 用于模板渲染（如果需要）
  toString() {
    return this.resource.content.name;
  }
}

// --- Definition ---

export const ManifestDefinition = {
  new: newManifest,

  wrapperFunction: (
    resources: { path: string; content: ManifestContent }[]
  ) => {
    // 通常 Manifest 不直接参与 Prompt 也就是不进入 ExecuteContext 的主要对象
    // 但如果需要在 Prompt 中引用环境名称，可以这样写
    return { MANIFEST: new ManifestWrapper(resources[0]) };
  },

  // 简单的渲染方法，或者指向一个组件
  renderingMethod: ManifestEditor,
} satisfies SchemaDefinition<ManifestContent>;
