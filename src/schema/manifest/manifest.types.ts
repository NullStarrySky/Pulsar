import { SemanticType } from "@/schema/SemanticType";

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

/**
 * 组件覆盖类型
 * Key: 语义类型 (如 'chat', 'statistic')
 * Value: .vue 文件路径
 */
export type ComponentOverride = Partial<Record<SemanticType, string>>;

// ManifestContent 现在是一个纯配置对象
export interface ManifestContent {
  // 核心：资源选择
  selection: ResourceSelection;

  // 扩展：内联组件注册 (TagName -> FilePath)
  // 用于消息流中的自定义标签，例如 <status-bar>
  customComponents: Record<string, string>;

  // 扩展：渲染器覆盖 (SemanticType -> FilePath)
  // 用于完全接管某种类型文件的渲染，例如接管 'chat' 类型的显示
  overrides: ComponentOverride;

  // 扩展：背景设置
  background: BackgroundConfig;

  // 元数据
  last_modified?: number;
  name?: string;
}
