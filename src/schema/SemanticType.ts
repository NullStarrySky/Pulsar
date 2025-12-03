// src/schema/SemanticType.ts
import { Component } from "vue";
import { CharacterDefinition } from "./character/character";
import { ChatDefinition } from "./chat/chat";
import { LorebookDefinition } from "./lorebook/lorebook";
import { PresetDefinition } from "./preset/preset";
import { StatisticDefinition } from "./statistic/statistic";
import { SettingDefinition } from "./setting/setting";
import { ModelConfigDefinition } from "./modelConfig/modelConfig";
import { ManifestDefinition } from "./manifest/manifest";
import { UnknownDefinition } from "./unknown/unknown";

import { Schema } from "@/components/SchemaRenderer/SchemaRenderer.types";

export type SemanticType =
  // 1. 全局配置文件
  | "setting"
  | "modelConfig"
  // 2. 结构化实体类型
  | "chat"
  | "statistic"
  | "character"
  | "lorebook"
  | "preset"
  | "manifest"
  // 3. 回退类型，一律由unknownEditor处理。
  | "unknown";

export type SchemaDefinition<Type> = {
  // 此类型的创建函数
  new: (data?: any) => Type;
  // 类型在实际使用时候的包装器
  wrapperFunction:
    | ((resources: { path: string; content: Type }) => any)
    | ((resources: { path: string; content: Type }[]) => any);
  // 渲染方法，通过组件或者Schema
  renderingMethod: Component | Schema | (() => Schema);
};

export type SemanticTypeMap = {
  character: typeof CharacterDefinition;
  chat: typeof ChatDefinition;
  lorebook: typeof LorebookDefinition;
  preset: typeof PresetDefinition;
  statistic: typeof StatisticDefinition;
  setting: typeof SettingDefinition;
  modelConfig: typeof ModelConfigDefinition;
  manifest: typeof ManifestDefinition;
  unknown: typeof UnknownDefinition;
};

export const SemanticTypeMap: SemanticTypeMap = {
  character: CharacterDefinition,
  chat: ChatDefinition,
  lorebook: LorebookDefinition,
  preset: PresetDefinition,
  statistic: StatisticDefinition,
  setting: SettingDefinition,
  modelConfig: ModelConfigDefinition,
  manifest: ManifestDefinition,
  unknown: UnknownDefinition,
};

(window as any).SemanticTypeMap = SemanticTypeMap;
