// src/components/EnvironmentSidebar/manifest.ts
import type { ManifestContent } from "./manifest.types";

// --- Factory ---

export function newManifest(): ManifestContent {
  return {
    selection: {
      character: [],
      lorebook: [],
      preset: [],
    },
    // 内联组件 (标签 -> 路径)
    customComponents: {},
    // 渲染器覆盖 (类型 -> 路径)
    overrides: {},
    // 背景配置 (仅保留路径)
    backgroundPath: "",
  };
}
