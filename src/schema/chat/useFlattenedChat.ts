// src/schema/chat/useFlattenedChat.ts

import { cloneDeep, merge } from "lodash-es";
import { nanoid } from "nanoid";
import { computed, type MaybeRef, reactive, toValue } from "vue";
import type { role } from "../shared.types";
import {
  createBranchAlternative,
  createMessageAlternative,
  createMessageContainer,
} from "./chat";
import type {
  Alternative,
  ApiReadyContext,
  FlatChatMessage, // 导入此类型
  FlattenedChat,
  MetaGenerateInfo,
  RootChat,
} from "./chat.types";

// 引入拆分出的模块
import {
  createChatContext,
  findActiveLeafContainer,
  findContainerByPath,
  recursiveFlatten,
} from "./chat.utils";
import { EnhancedApiReadyContext } from "./EnhancedApiReadyContext";

export function useFlattenedChat(chatRef: MaybeRef<RootChat | null>) {
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

  // 2. 辅助方法：通过实例获取容器
  // 直接利用 FlatChatMessage 中携带的 path 信息回溯原始对象
  function resolvePathTarget(item: FlatChatMessage) {
    const path = item.path;
    if (!path) {
      console.error(`Item has no path:`, item);
      return null;
    }
    const root = toValue(chatRef);
    if (!root) return null;

    return findContainerByPath(root, path);
  }

  // 辅助方法：获取实例在当前扁平化数组中的索引（主要用于上下文生成的截断）
  function getIndexOfItem(item: FlatChatMessage): number {
    return flattenedChat.value.messages.indexOf(item);
  }

  // ========== 修改操作 (Setters) ==========

  const switchAlternative = (
    item: FlatChatMessage,
    alternativeIndex: number
  ) => {
    const result = resolvePathTarget(item);
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

  const setRole = (item: FlatChatMessage, role: role) => {
    const result = resolvePathTarget(item);
    if (result?.container) {
      result.container.role = role;
    }
  };

  const renameAlternative = (item: FlatChatMessage, name: string) => {
    const result = resolvePathTarget(item);
    if (result?.container) {
      const activeIndex = result.container.activeAlternative;
      if (activeIndex >= 0) {
        result.container.alternatives[activeIndex].name = name;
      }
    }
  };

  const setMessageContent = (item: FlatChatMessage, content: string) => {
    const result = resolvePathTarget(item);
    if (result?.container) {
      const activeIndex = result.container.activeAlternative;
      const activeAlt = result.container.alternatives[activeIndex];
      if (activeAlt?.type === "message") {
        activeAlt.content = content;
      }
    }
  };

  const setMessageMeta = (
    item: FlatChatMessage,
    key: keyof MetaGenerateInfo,
    value: any
  ) => {
    const result = resolvePathTarget(item);
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
    item: FlatChatMessage,
    alternative: Alternative,
    activate: boolean
  ) => {
    const result = resolvePathTarget(item);
    if (result?.container) {
      result.container.alternatives.push(alternative);
      if (activate) {
        result.container.activeAlternative =
          result.container.alternatives.length - 1;
      }
    }
  };

  const addBlankMessage = (item: FlatChatMessage, activate = true) => {
    const alt = createMessageAlternative("");
    _pushAlternativeToContainer(item, alt, activate);
  };

  const addNewMessage = (
    item: FlatChatMessage,
    content: string,
    config?: Partial<MetaGenerateInfo>,
    activate = true
  ) => {
    const alt = createMessageAlternative(content, config);
    _pushAlternativeToContainer(item, alt, activate);
  };

  const addBlankBranch = (item: FlatChatMessage, activate = true) => {
    const alt = createBranchAlternative("");
    _pushAlternativeToContainer(item, alt, activate);
  };

  const addNewBranch = (
    item: FlatChatMessage,
    content: string,
    activate = true
  ) => {
    const alt = createBranchAlternative(content);
    _pushAlternativeToContainer(item, alt, activate);
  };

  const fork = (item: FlatChatMessage) => {
    const result = resolvePathTarget(item);
    if (result?.container) {
      const activeIndex = result.container.activeAlternative;
      if (activeIndex >= 0) {
        const newAlternative = cloneDeep(
          result.container.alternatives[activeIndex]
        );
        newAlternative.id = nanoid(); // 确保 ID 唯一
        _pushAlternativeToContainer(item, newAlternative, true);
      }
    }
  };

  /**
   * 在指定消息的父容器层级中，向后插入一条新消息
   */
  const appendMessage = (
    item: FlatChatMessage,
    config?: Partial<MetaGenerateInfo>
  ) => {
    const result = resolvePathTarget(item);
    if (result) {
      const { parentArray } = result;
      // 从 item.path 中获取当前容器在父数组中的位置
      const currentPath = item.path;
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
   * 在当前激活分支的末尾追加新消息 (保持不变，因为它不依赖特定节点)
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

  const deleteAlternative = (item: FlatChatMessage) => {
    const result = resolvePathTarget(item);
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

  const deleteContainer = (item: FlatChatMessage) => {
    const result = resolvePathTarget(item);
    const path = item.path;
    if (result && path && path.length > 0) {
      const containerIndex = path[path.length - 1].containerIndex;
      result.parentArray.splice(containerIndex, 1);
    }
  };

  // ========== 生成逻辑 (Generate) ==========
  const generate = async (item?: FlatChatMessage) => {
    // 1. 获取当前的 Root，用于初始检查
    const root = toValue(chatRef);

    if (!root) {
      return {
        CHAT: new EnhancedApiReadyContext({
          activeMessages: [],
          resolvedUserValue: {},
          resolvedIntervals: [],
        }),
        rawContext: {
          activeMessages: [],
          resolvedUserValue: {},
          resolvedIntervals: [],
        },
        getContainer: () => {
          throw new Error("Root lost");
        },
        remove: () => {},
      };
    }

    // 2. 准备 ID 和 纯对象
    const newAltId = nanoid();
    const newAlternative = createMessageAlternative("");
    newAlternative.id = newAltId; // 显式赋值 ID

    // 用于闭包的寻址器
    let getLatestContainer: () => any;
    let removeCleanup: () => void;

    // --- 情况 A: 重生成 (指定位置) ---
    if (item) {
      // 1. 获取路径信息 (这是静态的坐标，不会变)
      // 我们需要保留 path 副本，不要保留引用
      const originalPath = cloneDeep(item.path);

      if (!originalPath) throw new Error(`Invalid generate item path`);

      // 2. 初始插入 (还是需要找到一次容器来 push)
      // 这里使用工具函数找到容器
      const lookup = resolvePathTarget(item);
      if (!lookup) throw new Error("Container not found for insertion");

      const { container: parentContainer } = lookup;
      const originalActiveIndex = parentContainer.activeAlternative;

      // 3. 插入纯对象
      parentContainer.alternatives.push(newAlternative);
      parentContainer.activeAlternative =
        parentContainer.alternatives.length - 1;

      // 4. 生成上下文
      // 需要找到 item 在列表中的 index 以传递给 legacy 的 createChatContext
      const index = getIndexOfItem(item);
      const contextResult = await createChatContext(root, index - 1);

      // 5. 【核心】：构建实时寻址函数
      getLatestContainer = () => {
        // A. 重新获取最新的 Root
        const currentRoot = toValue(chatRef);
        if (!currentRoot)
          throw new Error("Chat root became null during generation");

        // B. 根据路径重新找到容器
        const result = findContainerByPath(currentRoot, originalPath);
        if (!result || !result.container) {
          // 容错：如果路径失效（极少见），尝试回退机制或抛出
          throw new Error("Container path invalid during generation");
        }

        // C. 在容器中找到我们的 Alternative
        const target = result.container.alternatives.find(
          (a: any) => a.id === newAltId
        );
        if (!target) throw new Error("Alternative lost from container");

        return target;
      };

      removeCleanup = () => {
        // 同样需要实时查找才能删除正确
        try {
          const currentRoot = toValue(chatRef);
          if (!currentRoot) return;
          const result = findContainerByPath(currentRoot, originalPath);
          if (result?.container) {
            const idx = result.container.alternatives.findIndex(
              (a: any) => a.id === newAltId
            );
            if (idx > -1) {
              result.container.alternatives.splice(idx, 1);
              // 恢复索引
              if (originalActiveIndex < result.container.alternatives.length) {
                result.container.activeAlternative = originalActiveIndex;
              }
            }
          }
        } catch (e) {
          console.error("Cleanup failed", e);
        }
      };

      return {
        CHAT: contextResult.container,
        rawContext: contextResult.rawContext,
        getContainer: getLatestContainer,
        remove: removeCleanup,
      };
    }

    // --- 情况 B: 新生成 (追加到底部) ---
    // (代码与之前相同，因为不涉及 item 操作)

    // 1. 准备新容器 ID
    const newContainerId = nanoid();
    const newContainer = createMessageContainer(
      "assistant",
      [newAlternative],
      0
    );
    newContainer.id = newContainerId;

    // 2. 初始插入
    const initialLeaf = findActiveLeafContainer(root);
    initialLeaf.messages.push(newContainer);

    // 3. 生成上下文
    const contextResult = await createChatContext(root, undefined);

    // 4. 【核心】：构建实时寻址函数
    getLatestContainer = () => {
      // A. 重新获取 Root
      const currentRoot = toValue(chatRef);
      if (!currentRoot) throw new Error("Chat root lost");

      // B. 重新找到当前的活动叶子节点
      const currentLeaf = findActiveLeafContainer(currentRoot);

      // C. 在叶子节点的消息列表中查找我们的容器 ID
      const containerFound = currentLeaf.messages.find(
        (m) => m.id === newContainerId
      );

      if (!containerFound) {
        throw new Error("Generated container lost (branch switched?)");
      }

      return containerFound.alternatives[0];
    };

    removeCleanup = () => {
      try {
        const currentRoot = toValue(chatRef);
        if (!currentRoot) return;
        const currentLeaf = findActiveLeafContainer(currentRoot);
        const idx = currentLeaf.messages.findIndex(
          (m) => m.id === newContainerId
        );
        if (idx > -1) currentLeaf.messages.splice(idx, 1);
      } catch (e) {
        console.error("Cleanup failed", e);
      }
    };

    return {
      CHAT: contextResult.container,
      rawContext: contextResult.rawContext,
      getContainer: getLatestContainer,
      remove: removeCleanup,
    };
  };

  // ========== Embedding ==========

  const embedMessage = async (item: FlatChatMessage, forceModel?: string) => {
    // 此处保留原有逻辑
    const index = getIndexOfItem(item);
    console.log("Embed message at", index, forceModel);
  };

  /**
   * 准备润色上下文。
   */
  const polish = async (
    target: { item: FlatChatMessage } | { content: string; role: role }
  ) => {
    const root = toValue(chatRef);
    if (!root) throw new Error("Chat root is missing");

    let container: any;
    let rawContext: ApiReadyContext;
    let removeCleanup: () => void = () => {};

    const intention = "polish";

    // 情况 A: 润色现有消息
    if ("item" in target) {
      const { item } = target;
      const result = resolvePathTarget(item);
      if (!result?.container) {
        throw new Error(`Polish failed: container not found for item`);
      }

      const realContainer = result.container;
      const originalActiveIndex = realContainer.activeAlternative;

      // 1. 获取上下文 (需要 index)
      const index = getIndexOfItem(item);
      const contextResult = await createChatContext(root, index - 1);
      rawContext = contextResult.rawContext;

      // 2. 准备容器
      const newAlternative = createMessageAlternative("");
      realContainer.alternatives.push(newAlternative);
      realContainer.activeAlternative = realContainer.alternatives.length - 1;

      // result.container 已经是 store 中的响应式对象，所以这里是安全的
      container = realContainer;

      removeCleanup = () => {
        const idx = realContainer.alternatives.findIndex(
          (alt) => alt.id === newAlternative.id
        );
        if (idx > -1) {
          realContainer.alternatives.splice(idx, 1);
          if (originalActiveIndex < realContainer.alternatives.length) {
            realContainer.activeAlternative = originalActiveIndex;
          }
        }
      };
    }
    // 情况 B: 润色输入框内容 (未挂载到树上)
    else {
      const { content, role } = target;
      const contextResult = await createChatContext(root, undefined);
      rawContext = contextResult.rawContext;

      // 这里的容器是临时的，使用 reactive 显式包装，以支持界面更新
      const tempAlternative = createMessageAlternative(content);
      const tempContainer = createMessageContainer(role, [tempAlternative], 0);

      container = reactive(tempContainer);
    }

    return {
      rawContext,
      CHAT: new EnhancedApiReadyContext(rawContext),
      container: container as typeof container,
      intention,
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
    findActiveLeafContainer,
    getPath: (item: FlatChatMessage) => item.path ?? [],

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
