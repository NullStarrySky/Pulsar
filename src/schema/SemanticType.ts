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

// --- 接口定义 ---
// 更新接口以包含 createStructure 和 resolve
interface IFileSystemFolder {
  createDir(name: string): Promise<IFileSystemFolder>;
  createFile(name: string, content: any): Promise<any>;
  path: string;
  createStructure(
    structure: Record<string, any>,
    isForced?: boolean
  ): Promise<void>;
  resolve(path: string): any;
}

export type SemanticType =
  | "setting"
  | "modelConfig"
  | "chat"
  | "statistic"
  | "character"
  | "lorebook"
  | "preset"
  | "manifest"
  | "unknown";

export type SchemaDefinition<Type> = {
  new: (data?: any) => Type;
  wrapperFunction:
    | ((resources: { path: string; content: Type }) => any)
    | ((resources: { path: string; content: Type }[]) => any);
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

/**
 * 创建特定类型的初始化数据工厂函数
 */
export function createTypedFile(type: SemanticType) {
  return (data?: any) => {
    const definition = SemanticTypeMap[type];
    if (!definition) throw new Error(`Unknown type: ${type}`);
    return definition.new(data);
  };
}

/**
 * 初始化角色环境
 * 包含：目录结构、角色定义文件、Manifest 配置文件
 * @param rootFolder 角色根目录 (VirtualFolder)
 * @param charName 角色名称
 */
export async function createCharacterEnvironment(
  rootFolder: IFileSystemFolder,
  charName: string
) {
  // 使用新的 createStructure 方法定义角色结构
  const structure = {
    [charName]: {
      chat: {}, // 空文件夹
      template: {},
      lorebook: {},
      preset: {},
      background: {},
      components: {},
      // 角色定义文件
      [`${charName}.[character].json`]: () =>
        createTypedFile("character")({ name: charName }),
      // Manifest 文件
      "manifest.[manifest].json": () => {
        return createTypedFile("manifest")();
      },
    },
  };

  // 递归创建结构
  await rootFolder.createStructure(structure);

  // 返回新创建的角色文件夹节点
  return rootFolder.resolve(charName);
}

(window as any).SemanticTypeMap = SemanticTypeMap;
