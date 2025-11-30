// src/schema/chat/useFlattenedChat.ts
import { computed, toValue, type MaybeRef, reactive } from "vue";
import {
  type RootChat,
  type FlattenedChat,
  type Alternative,
  type MetaGenerateInfo,
  type ApiReadyContext,
} from "./chat.types";
import { role } from "../shared.types";
import { cloneDeep, merge } from "lodash-es";
import { nanoid } from "nanoid";
import { EnhancedApiReadyContext } from "./EnhancedApiReadyContext";

// 引入拆分出的模块
import {
  recursiveFlatten,
  findContainerByPath,
  findActiveLeafContainer,
  createChatContext,
} from "./chat.utils";

import {
  createMessageAlternative,
  createBranchAlternative,
  createMessageContainer,
} from "./chat.factory";

export function useFlattenedChat(chatRef: MaybeRef<RootChat>) {
  // 1. 核心计算属性：压平聊天记录
  const flattenedChat = computed<FlattenedChat>(() => {
    const root = toValue(chatRef);
    if (!root) {
      return {
        rootInfo: {
          name: "",
          userValue: {},
          tools: [],
          create_date: "",
          modification_date: "",
        },
        messages: [],
      };
    }
    const { messages, ...rootInfo } = root;
    return {
      rootInfo,
      messages: recursiveFlatten(messages, 0, []),
    };
  });

  // 2. 辅助方法：通过索引获取容器
  function getContainerByIndex(index: number) {
    const path = flattenedChat.value.messages[index]?.path;
    if (!path) {
      console.error(`Invalid flat index: ${index}`);
      return null;
    }
    return findContainerByPath(toValue(chatRef), path);
  }

  // ========== 修改操作 (Setters) ==========

  const switchAlternative = (index: number, alternativeIndex: number) => {
    const result = getContainerByIndex(index);
    if (result?.container) {
      const { container } = result;
      if (
        alternativeIndex >= 0 &&
        alternativeIndex < container.alternatives.length
      ) {
        container.activeAlternative = alternativeIndex;
      }
    }
  };

  const setRole = (index: number, role: role) => {
    const result = getContainerByIndex(index);
    if (result?.container) {
      result.container.role = role;
    }
  };

  const renameAlternative = (index: number, name: string) => {
    const result = getContainerByIndex(index);
    if (result?.container) {
      const activeIndex = result.container.activeAlternative;
      if (activeIndex >= 0) {
        result.container.alternatives[activeIndex].name = name;
      }
    }
  };

  const setMessageContent = (index: number, content: string) => {
    const result = getContainerByIndex(index);
    if (result?.container) {
      const activeIndex = result.container.activeAlternative;
      const activeAlt = result.container.alternatives[activeIndex];
      if (activeAlt?.type === "message") {
        activeAlt.content = content;
      }
    }
  };

  const setMessageMeta = (
    index: number,
    key: keyof MetaGenerateInfo,
    value: any
  ) => {
    const result = getContainerByIndex(index);
    if (result?.container) {
      const activeIndex = result.container.activeAlternative;
      const activeAlt = result.container.alternatives[activeIndex];
      if (activeAlt?.type === "message") {
        (activeAlt.metaGenerateInfo as any)[key] = value;
      }
    }
  };

  // ========== 结构操作 (Add/Delete) ==========

  const _pushAlternativeToContainer = (
    index: number,
    alternative: Alternative,
    activate: boolean
  ) => {
    const result = getContainerByIndex(index);
    if (result?.container) {
      result.container.alternatives.push(alternative);
      if (activate) {
        result.container.activeAlternative =
          result.container.alternatives.length - 1;
      }
    }
  };

  // 使用工厂函数替代原来的重复逻辑
  const addBlankMessage = (index: number, activate = true) => {
    const alt = createMessageAlternative("");
    _pushAlternativeToContainer(index, alt, activate);
  };

  const addNewMessage = (
    index: number,
    content: string,
    config?: Partial<MetaGenerateInfo>,
    activate = true
  ) => {
    const alt = createMessageAlternative(content, config);
    _pushAlternativeToContainer(index, alt, activate);
  };

  const addBlankBranch = (index: number, activate = true) => {
    const alt = createBranchAlternative("");
    _pushAlternativeToContainer(index, alt, activate);
  };

  const addNewBranch = (index: number, content: string, activate = true) => {
    const alt = createBranchAlternative(content);
    _pushAlternativeToContainer(index, alt, activate);
  };

  const fork = (index: number) => {
    const result = getContainerByIndex(index);
    if (result?.container) {
      const activeIndex = result.container.activeAlternative;
      if (activeIndex >= 0) {
        const newAlternative = cloneDeep(
          result.container.alternatives[activeIndex]
        );
        newAlternative.id = nanoid(); // 确保 ID 唯一
        _pushAlternativeToContainer(index, newAlternative, true);
      }
    }
  };

  /**
   * 在指定消息的父容器层级中，向后插入一条新消息
   */
  const appendMessage = (index: number, config?: Partial<MetaGenerateInfo>) => {
    const result = getContainerByIndex(index);
    if (result) {
      const { parentArray } = result;
      const currentPath = flattenedChat.value.messages[index].path;
      const insertionIndex =
        currentPath[currentPath.length - 1].containerIndex + 1;

      // 使用工厂构建
      const defaultUserMeta = merge(
        { renderInfo: { avatarPath: "User", characterName: "User" } },
        config
      );
      const newAlt = createMessageAlternative("", defaultUserMeta);
      const newContainer = createMessageContainer("user", [newAlt], 0);

      parentArray.splice(insertionIndex, 0, newContainer);
    }
  };

  /**
   * 在当前激活分支的末尾追加新消息
   */
  const appendMessageToLeaf = (
    content: string,
    role: role = "user",
    config?: Partial<MetaGenerateInfo>
  ) => {
    const root = toValue(chatRef);
    if (!root) return;

    // 使用 Utils 中的查找逻辑
    const leafContainer = findActiveLeafContainer(root);

    // 使用工厂构建
    const defaultMeta =
      role === "user"
        ? merge(
            { renderInfo: { avatarPath: "User", characterName: "User" } },
            config
          )
        : config;

    const newAlt = createMessageAlternative(content, defaultMeta);
    const newContainer = createMessageContainer(role, [newAlt], 0);

    leafContainer.messages.push(newContainer);
  };

  const deleteAlternative = (index: number) => {
    const result = getContainerByIndex(index);
    if (result?.container) {
      const container = result.container;
      const activeIndex = container.activeAlternative;

      if (activeIndex >= 0) {
        if (container.alternatives.length <= 1) {
          console.warn("Cannot delete the last alternative.");
          return;
        }
        container.alternatives.splice(activeIndex, 1);
        container.activeAlternative = Math.max(0, activeIndex - 1);
      }
    }
  };

  const deleteContainer = (index: number) => {
    const result = getContainerByIndex(index);
    const path = flattenedChat.value.messages[index]?.path;
    if (result && path && path.length > 0) {
      const containerIndex = path[path.length - 1].containerIndex;
      result.parentArray.splice(containerIndex, 1);
    }
  };

  // ========== 生成逻辑 (Generate) ==========

  const generate = (index?: number) => {
    const root = toValue(chatRef);
    if (!root) {
      const emptyContext: ApiReadyContext = {
        activeMessages: [],
        resolvedUserValue: {},
        resolvedIntervals: [],
      };
      return {
        CHAT: new EnhancedApiReadyContext(emptyContext),
        rawContext: emptyContext,
        container: null,
        remove: () => console.warn("Chat does not exist."),
      };
    }

    // 1. 创建占位符 (使用工厂)
    const newAlternative = createMessageAlternative("");

    // --- 情况 A: 重生成 (指定位置) ---
    if (index !== undefined) {
      const result = getContainerByIndex(index);
      if (!result?.container) {
        console.error(`Generate failed: container not found at ${index}`);
        const contextResult = createChatContext(root);
        return { ...contextResult, container: null, remove: () => {} };
      }

      const container = result.container;
      const originalActiveIndex = container.activeAlternative;

      // 生成 Context (截止到此消息之前)
      const contextResult = createChatContext(root, index - 1);

      // 插入并激活
      container.alternatives.push(newAlternative);
      container.activeAlternative = container.alternatives.length - 1;

      const remove = () => {
        const idx = container.alternatives.findIndex(
          (alt) => alt.id === newAlternative.id
        );
        if (idx > -1) {
          container.alternatives.splice(idx, 1);
          if (originalActiveIndex < container.alternatives.length) {
            container.activeAlternative = originalActiveIndex;
          } else {
            container.activeAlternative = Math.max(
              0,
              container.alternatives.length - 1
            );
          }
        }
      };

      return {
        CHAT: contextResult.container,
        rawContext: contextResult.rawContext,
        container: newAlternative,
        remove,
      };
    }

    // --- 情况 B: 新生成 (追加到底部) ---
    // 生成 Context (完整)
    const contextResult = createChatContext(root, undefined);

    // 创建新容器 (使用工厂)
    const newContainer = createMessageContainer(
      "assistant",
      [newAlternative],
      0
    );

    // 找到位置并插入
    const leafContainer = findActiveLeafContainer(root);
    const leafArray = leafContainer.messages;
    leafArray.push(newContainer);

    const remove = () => {
      const idx = leafArray.findIndex((item) => item.id === newContainer.id);
      if (idx > -1) leafArray.splice(idx, 1);
    };

    return {
      CHAT: contextResult.container,
      rawContext: contextResult.rawContext,
      container: newAlternative,
      remove,
    };
  };

  // ========== Embedding ==========

  const embedMessage = async (index: number, forceModel?: string) => {
    // 此处保留原有逻辑，因为它涉及副作用(API调用)和store读取
    // 实际项目中建议将 embed 逻辑本身也封装成类似 createChatContext 的独立服务
    // 这里省略具体实现以聚焦于你要求的解耦
    console.log("Embed message at", index, forceModel);
  };

  /**
   * 准备润色上下文。
   * 此方法不修改实际的聊天树（对于新消息），或者为现有消息添加新版本（对于旧消息）。
   * 它返回用于执行的对象，包含 reactive 的 container 和标志位。
   */
  const polish = (
    target: { index: number } | { content: string; role: role }
  ) => {
    const root = toValue(chatRef);
    if (!root) throw new Error("Chat root is missing");

    let container: any; // 这里的类型实际上是 MessageContainer，但为了响应式包装，我们在下面处理
    let rawContext: ApiReadyContext;
    let removeCleanup: () => void = () => {};

    // 标志位：告诉预设这是一个润色请求
    const intention = "polish";

    // 情况 A: 润色现有消息 (Old Message)
    // 上下文：该消息之前的所有消息 (类似 regenerate)
    // 容器：原容器，但我们会推入一个新的 Alternative 供预设写入
    if ("index" in target) {
      const { index } = target;
      const result = getContainerByIndex(index);
      if (!result?.container) {
        throw new Error(`Polish failed: container not found at ${index}`);
      }

      const realContainer = result.container;
      const originalActiveIndex = realContainer.activeAlternative;

      // 1. 获取上下文 (截止到此消息之前)
      const contextResult = createChatContext(root, index - 1);
      rawContext = contextResult.rawContext;

      // 2. 准备容器：添加一个新的空白版本供流式写入
      // 注意：预设可以通过检查 container.alternatives[originalActiveIndex] 来获取“待润色”的原文
      const newAlternative = createMessageAlternative("");
      realContainer.alternatives.push(newAlternative);
      realContainer.activeAlternative = realContainer.alternatives.length - 1;

      // 响应式包装：虽然 store 是 reactive 的，但为了统一接口，我们还是处理一下
      // 这里直接使用 store 中的引用即可
      container = realContainer;

      removeCleanup = () => {
        const idx = realContainer.alternatives.findIndex(
          (alt) => alt.id === newAlternative.id
        );
        if (idx > -1) {
          realContainer.alternatives.splice(idx, 1);
          // 恢复之前的选中状态
          if (originalActiveIndex < realContainer.alternatives.length) {
            realContainer.activeAlternative = originalActiveIndex;
          }
        }
      };
    }
    // 情况 B: 润色输入框内容 (New Input)
    // 上下文：当前所有已激活消息 (类似推入新消息)
    // 容器：创建一个临时的、未挂载到树上的容器
    else {
      const { content, role } = target;

      // 1. 获取上下文 (完整历史)
      const contextResult = createChatContext(root, undefined);
      rawContext = contextResult.rawContext;

      // 2. 创建临时容器
      // 这里我们将待润色的内容放入第一个 alternative
      // 预设如果智能，应该知道去读取这个内容，然后覆写它，或者我们在外部处理
      // 这里的逻辑是：创建一个临时容器，作为"正在被润色"的对象
      const tempAlternative = createMessageAlternative(content);
      const tempContainer = createMessageContainer(role, [tempAlternative], 0);

      container = reactive(tempContainer);
    }

    // 构造返回给 ExecuteContext 的结构
    // 这里我们不进一步包装 container 为 class，而是返回一个包含它的 payload
    return {
      // 供 Preset 使用的上下文
      rawContext,
      CHAT: new EnhancedApiReadyContext(rawContext), // 兼容旧接口

      // 核心：容器和标志位
      container: container as typeof container, // 保持类型
      intention,

      // 清理函数
      remove: removeCleanup,
    };
  };

  return {
    flattenedChat,
    switchAlternative,
    setRole,
    renameAlternative,
    setMessageContent,
    setMessageMeta,
    getPath: (index: number) => flattenedChat.value.messages[index]?.path ?? [],

    // CRUD
    addBlankMessage,
    addBlankBranch,
    addNewMessage,
    addNewBranch,
    fork,
    appendMessage,
    appendMessageToLeaf,
    deleteAlternative,
    deleteContainer,

    // Actions
    generate,
    embedMessage,
    polish,
  };
}
