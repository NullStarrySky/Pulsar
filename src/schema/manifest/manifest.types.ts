// src/schema/manifest/manifest.types.ts
export type ResourceSelection = {
  character?: string[];
  lorebook?: string[];
  preset?: string[];
};

export type BackgroundMode =
  | "cover"
  | "contain"
  | "tile"
  | "center"
  | "stretch";

export type BackgroundConfig = {
  path: string;
  mode: BackgroundMode;
};

export type MetaFileContent = {
  selection: ResourceSelection;
  customComponents?: Record<string, string>;
  background?: BackgroundConfig;
};

export interface ManifestContent {
  id: string;
  name: string;
  description: string;

  // 核心：资源选择
  selection: ResourceSelection;

  // 扩展：组件注册 (TagName -> FilePath)
  customComponents?: Record<string, string>;

  // 扩展：背景设置
  background?: BackgroundConfig;

  // 元数据
  creation_date: number;
  last_modified: number;
}
