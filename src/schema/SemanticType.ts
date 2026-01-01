// src/schema/SemanticType.ts
import type { Component } from "vue";
import { newManifest } from "@/components/EnvironmentSidebar/manifest";
import type { Schema } from "@/components/SchemaRenderer/SchemaRenderer.types";
import { CharacterDefinition } from "./character/character";
import { ChatDefinition } from "./chat/chat";
import { LorebookDefinition } from "./lorebook/lorebook";
import { ModelConfigDefinition } from "./modelConfig/modelConfig";
import { PresetDefinition } from "./preset/preset";
import { SettingDefinition } from "./setting/setting";
import { StatisticDefinition } from "./statistic/statistic";
import { UnknownDefinition } from "./unknown/unknown";

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
  unknown: UnknownDefinition,
};

/**
 * 创建特定类型的初始化数据工厂函数
 */
export function getNewTypedFile(type: SemanticType, data?: any) {
  const definition = SemanticTypeMap[type];
  if (!definition) throw new Error(`Unknown type: ${type}`);
  return definition.new(data);
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
      chat: {},
      lorebook: {},
      preset: {},
      background: {},
      components: {},
      // 角色定义文件
      character: {
        charName: {
          ["index.[character].json"]: () =>
            getNewTypedFile("character", { name: charName }),
        },
      },
      // Manifest 文件
      "manifest.json": () => {
        return newManifest();
      },
    },
  };

  // 递归创建结构
  await rootFolder.createStructure(structure);

  // 返回新创建的角色文件夹节点
  return rootFolder.resolve(charName);
}

(window as any).SemanticTypeMap = SemanticTypeMap;
