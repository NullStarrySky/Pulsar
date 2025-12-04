import type { ManifestContent } from "./manifest.types";
import { SchemaDefinition } from "../SemanticType";
import ManifestEditor from "./ManifestEditor.vue";

// --- Factory ---

export function newManifest(): ManifestContent {
  return {
    selection: {
      character: [],
      lorebook: ["global/lorebook"],
      preset: [],
    },
    // 内联组件 (标签 -> 路径)
    customComponents: {},
    // 渲染器覆盖 (类型 -> 路径)
    overrides: {},
    // 背景配置
    background: {
      path: "",
      mode: "cover",
    },
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

  toString() {
    const parts = this.resource.path.split("/");
    return parts[parts.length - 1].replace(/\.[^/.]+$/, "");
  }
}

// --- Definition ---

export const ManifestDefinition = {
  new: newManifest,

  wrapperFunction: (
    resources: { path: string; content: ManifestContent }[]
  ) => {
    return { MANIFEST: new ManifestWrapper(resources[0]) };
  },

  renderingMethod: ManifestEditor,
} satisfies SchemaDefinition<ManifestContent>;
