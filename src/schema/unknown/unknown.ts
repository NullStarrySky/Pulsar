// src/schema/unknown/unknown.ts

import type { SchemaDefinition } from "../SemanticType";
import UnknownFileRenderer from "./UnknownFileRenderer.vue";

type Unknown = unknown;

/**
 * 工厂函数：创建一个默认的统计数据对象。
 * @returns {Unknown} 一个新的 Unknown 对象
 */
function newUnknown(): unknown {
  return {};
}

/**
 * UnknownWrapper 封装了统计数据及其相关操作。
 * 它既提供了用于模板渲染的派生数据，也包含了修改自身状态的功能性方法。
 */
class UnknownWrapper {
  resources: { path: string; content: Unknown }[];

  constructor(resources: { path: string; content: Unknown }[]) {
    this.resources = resources;
  }
}

/**
 * 范式下的 UnknownDefinition
 */
export const UnknownDefinition = {
  new: newUnknown,

  wrapperFunction: (resources: { path: string; content: Unknown }[]) => {
    return {
      Unknown: new UnknownWrapper(resources),
    };
  },

  renderingMethod: UnknownFileRenderer,
} satisfies SchemaDefinition<Unknown>;
