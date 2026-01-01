// src/schema/chat/chat.utils.ts
import { cloneDeep } from "lodash-es";
import type {
  ApiReadyContext,
  ApiReadyMessage,
  AttachedEndMarkerDef,
  AttachedIntervalDef,
  ChatMessageItem,
  FlatChatMessage,
  PathInfo,
  ResolvedInterval,
  RootChat,
  VariableChange,
} from "./chat.types";
import { EnhancedApiReadyContext } from "./EnhancedApiReadyContext/EnhancedApiReadyContext";

// ========== 变量与状态处理 ==========

// 获取 AsyncFunction 构造器用于动态执行
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/**
 * 动态执行用户提供的代码片段。
 * 期望代码中包含 `async main(arg) { ... }`，系统将调用它并返回结果。
 *
 * @param scriptCode 用户编写的代码字符串
 * @param inputArgument 传入 main 函数的参数 (oldValue)
 */
async function executeUserScript(scriptCode: string, inputArgument: any) {
  try {
    // 构造函数体：
    // 1. 注入用户的代码 (定义 main)
    // 2. 调用 main 并传入参数
    const body = `
      ${scriptCode}
      if (typeof main !== 'function') {
        throw new Error("User script must define an 'async main' function.");
      }
      return await main(inputArgument);
    `;

    // 创建异步函数 (inputArgument 是函数内部可访问的变量名)
    const fn = new AsyncFunction("inputArgument", body);

    // 执行
    const result = await fn(inputArgument);
    return result;
  } catch (err) {
    console.error("Failed to execute variable change script:", err);
    console.error("Script content:", scriptCode);
    // 出错时返回原值，避免整个链条崩溃，或者根据需求抛出异常
    return inputArgument;
  }
}

/**
 * [重写] 解析用户变量。
 * 1. 克隆初始 userValue
 * 2. (可选) 执行 valueWrapper 进行包装
 * 3. 收集路径上的所有 VariableChange
 * 4. 链式执行代码更新变量
 */
export async function resolveUserValue(
  root: RootChat,
  activeMessages: ChatMessageItem[]
): Promise<any> {
  // 1. 从贫血对象开始
  let currentValue = cloneDeep(root.userValue);

  // 2. 如果有包装器，先执行包装 (Transform raw object to rich object)
  if (root.valueWrapper && root.valueWrapper.trim()) {
    currentValue = await executeUserScript(root.valueWrapper, currentValue);
  }

  // 3. 收集激活路径上的所有变更
  const changes: VariableChange[] = [];
  activeMessages.forEach((msg) => {
    const activeContent = msg.alternatives[msg.activeAlternative];
    if (activeContent?.type === "message") {
      activeContent.metaGenerateInfo.variableChanges?.forEach((change) => {
        changes.push(change);
      });
    }
  });

  // 4. 链式执行变更
  for (const change of changes) {
    if (change.code && change.code.trim()) {
      currentValue = await executeUserScript(change.code, currentValue);
    }
  }

  return currentValue;
}

// ========== 树遍历与压平 ==========

export function getActiveMessagesFlat(
  branch: RootChat | { messages: ChatMessageItem[] } // 兼容 BranchAlternative
): ChatMessageItem[] {
  const activeMessages: ChatMessageItem[] = [];
  for (const msg of branch.messages) {
    activeMessages.push(msg);
    const activeAlt = msg.alternatives[msg.activeAlternative];
    if (activeAlt?.type === "branch") {
      activeMessages.push(...getActiveMessagesFlat(activeAlt));
      return activeMessages; // 分支决定了唯一路径，直接返回
    }
  }
  return activeMessages;
}

export function recursiveFlatten(
  messages: ChatMessageItem[],
  currentDepth: number,
  currentPath: PathInfo[]
): FlatChatMessage[] {
  const flatList: FlatChatMessage[] = [];

  for (let index = 0; index < messages.length; index++) {
    const msg = messages[index];

    const newPath = [
      ...currentPath,
      { containerIndex: index, branchId: undefined },
    ];

    const activeAlt = msg.alternatives[msg.activeAlternative];
    let content: FlatChatMessage["content"];

    if (activeAlt) {
      if (activeAlt.type === "message") {
        content = activeAlt;
      } else {
        const { messages: _, ...branchInfo } = activeAlt;
        content = branchInfo;
      }

      flatList.push({
        id: msg.id,
        role: msg.role,
        content,
        depth: currentDepth,
        availableAlternativeCount: msg.alternatives.length,
        activeAlternative: msg.activeAlternative,
        path: newPath,
      });

      if (activeAlt.type === "branch") {
        newPath[newPath.length - 1].branchId = activeAlt.id;
        flatList.push(
          ...recursiveFlatten(activeAlt.messages, currentDepth + 1, newPath)
        );

        // 关键修复：一旦进入分支，控制流被移交，不再处理当前层级的后续消息
        break;
      }
    }
  }

  return flatList;
}

/**
 * 查找逻辑：根据路径查找容器
 */
export function findContainerByPath(root: RootChat, path: PathInfo[]) {
  let currentMessages: ChatMessageItem[] = root.messages;
  let container: ChatMessageItem | null = null;
  let parentArray: ChatMessageItem[] = root.messages;
  let parentNode: { messages: ChatMessageItem[] } = root;

  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    const { containerIndex, branchId } = segment;

    if (containerIndex < 0 || containerIndex >= currentMessages.length) {
      console.error("Path is invalid: index out of bounds.", { path, root });
      return null;
    }

    container = currentMessages[containerIndex];
    parentArray = currentMessages;

    if (i < path.length - 1) {
      const activeAlt =
        container.activeAlternative >= 0
          ? container.alternatives[container.activeAlternative]
          : null;
      if (
        activeAlt?.type !== "branch" ||
        (branchId && activeAlt.id !== branchId)
      ) {
        console.error("Path is invalid: expected an active branch.", {
          path,
          container,
        });
        return null;
      }
      parentNode = activeAlt;
      currentMessages = activeAlt.messages;
    }
  }

  return { parentArray, container: container!, parentNode };
}

/**
 * 查找逻辑：查找当前激活路径的叶子节点容器
 */
export function findActiveLeafContainer(root: RootChat): {
  messages: ChatMessageItem[];
} {
  let parentContainer: { messages: ChatMessageItem[] } = root;

  while (true) {
    const messages = parentContainer.messages;
    if (!messages || messages.length === 0) {
      return parentContainer;
    }

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.activeAlternative < 0) {
      return parentContainer;
    }

    const activeAlt = lastMsg.alternatives[lastMsg.activeAlternative];
    if (activeAlt?.type === "branch") {
      parentContainer = activeAlt;
    } else {
      return parentContainer;
    }
  }
}

// ========== Context 生成与 Interval 处理 ==========

export function resolveIntervals(
  activeMessages: ChatMessageItem[]
): ResolvedInterval[] {
  const totalMessages = activeMessages.length;
  if (totalMessages === 0) return [];

  const resolvedIntervalStarts: Array<{
    globalStartIndex: number;
    def: Readonly<AttachedIntervalDef>;
  }> = [];
  const collectedEndMarkers: Array<{
    globalIndex: number;
    def: AttachedEndMarkerDef;
  }> = [];

  activeMessages.forEach((msg, globalIndex) => {
    const activeAlternative = msg.alternatives[msg.activeAlternative];
    if (activeAlternative?.type === "message") {
      const { attachedEndMarker, attachedIntervals } =
        activeAlternative.metaGenerateInfo;

      if (attachedEndMarker) {
        collectedEndMarkers.push({ globalIndex, def: attachedEndMarker });
      }

      if (attachedIntervals) {
        attachedIntervals.forEach((intervalDef) => {
          if (!intervalDef.activationCondition) {
            resolvedIntervalStarts.push({
              globalStartIndex: globalIndex,
              def: Object.freeze(cloneDeep(intervalDef)),
            });
          } else {
            let targetIndex = -1;
            const condition = intervalDef.activationCondition;
            switch (condition.type) {
              case "relative_index":
                targetIndex = globalIndex + condition.value;
                break;
              case "next_message_with_role":
                targetIndex = activeMessages.findIndex(
                  (m, idx) => idx > globalIndex && m.role === condition.role
                );
                break;
            }
            if (targetIndex >= 0 && targetIndex < totalMessages) {
              resolvedIntervalStarts.push({
                globalStartIndex: targetIndex,
                def: Object.freeze(cloneDeep(intervalDef)),
              });
            }
          }
        });
      }
    }
  });

  const resolvedIntervalsResult: ResolvedInterval[] = [];
  const openIntervalStack: Array<{
    globalStartIndex: number;
    def: Readonly<AttachedIntervalDef>;
    isClosed: boolean;
  }> = [];

  const allEvents = [
    ...resolvedIntervalStarts.map((s) => ({
      type: "start" as const,
      index: s.globalStartIndex,
      data: s,
    })),
    ...collectedEndMarkers.map((e) => ({
      type: "end" as const,
      index: e.globalIndex,
      data: e,
    })),
  ].sort((a, b) => a.index - b.index || (a.type === "end" ? -1 : 1));

  for (const event of allEvents) {
    if (event.type === "start") {
      openIntervalStack.push({
        globalStartIndex: event.data.globalStartIndex,
        def: event.data.def,
        isClosed: false,
      });
    } else {
      const marker = event.data;
      for (let i = openIntervalStack.length - 1; i >= 0; i--) {
        const openInterval = openIntervalStack[i];
        if (openInterval.isClosed) continue;
        if (
          marker.def.endsIntervalById?.includes(openInterval.def.id) ||
          marker.def.endsIntervalByType?.includes(openInterval.def.type)
        ) {
          openInterval.isClosed = true;
          resolvedIntervalsResult.push({
            def: openInterval.def,
            range: {
              start: openInterval.globalStartIndex,
              end: marker.globalIndex,
            },
          });
          break;
        }
      }
    }
  }

  openIntervalStack.forEach((openInterval) => {
    if (openInterval.isClosed) return;
    const { def, globalStartIndex } = openInterval;
    if (def.endCondition.type === "length") {
      let effectiveEnd: number | typeof Infinity = Infinity;
      if (def.endCondition.value !== Infinity) {
        effectiveEnd = globalStartIndex + def.endCondition.value - 1;
      } else {
        switch (def.onUnmatchedEnd) {
          case "truncate_at_leaf":
            effectiveEnd = totalMessages - 1;
            break;
          case "discard":
            return;
          case "leak":
          default:
            break;
        }
      }
      resolvedIntervalsResult.push({
        def,
        range: { start: globalStartIndex, end: effectiveEnd },
      });
    } else {
      resolvedIntervalsResult.push({ def, range: null });
    }
  });

  // 规范化范围方向
  return resolvedIntervalsResult
    .map((r) =>
      r.range &&
      r.range.end !== Infinity &&
      r.range.start > (r.range.end as number)
        ? {
            ...r,
            range: {
              ...r.range,
              start: r.range.end as number,
              end: r.range.start,
            },
          }
        : r
    )
    .filter((r) => r.range && r.range.end >= r.range.start);
}

export function transformMessagesForApi(
  activeMessages: readonly ChatMessageItem[]
): ApiReadyMessage[] {
  const apiReadyMessages: ApiReadyMessage[] = [];
  activeMessages.forEach((msg) => {
    if (
      msg.activeAlternative >= 0 &&
      msg.activeAlternative < msg.alternatives.length
    ) {
      const activeAlt = msg.alternatives[msg.activeAlternative];
      if (activeAlt.type === "message") {
        apiReadyMessages.push({
          role: msg.role,
          content: activeAlt.content,
          metaGenerateInfo: cloneDeep(activeAlt.metaGenerateInfo),
          id: activeAlt.id,
        });
      }
    }
  });
  return apiReadyMessages;
}

export async function createChatContext(
  root: RootChat,
  sliceEndIndex?: number
) {
  let activeMessages = getActiveMessagesFlat(root);

  if (sliceEndIndex !== undefined) {
    activeMessages = activeMessages.slice(0, sliceEndIndex + 1);
  }

  const resolvedIntervals = resolveIntervals(activeMessages);

  // 处理隐藏区间
  const hiddenIntervals = resolvedIntervals.filter(
    (r) => r.def.type === "hidden" && r.range
  );
  const indicesToHide = new Set<number>();
  if (hiddenIntervals.length > 0) {
    for (const interval of hiddenIntervals) {
      if (interval.range) {
        const end =
          interval.range.end === Infinity
            ? activeMessages.length - 1
            : (interval.range.end as number);
        for (let i = interval.range.start; i <= end; i++) {
          indicesToHide.add(i);
        }
      }
    }
  }

  const finalActiveMessages =
    indicesToHide.size > 0
      ? activeMessages.filter((_, index) => !indicesToHide.has(index))
      : activeMessages;

  const transformedMessages = transformMessagesForApi(finalActiveMessages);

  // [关键变更] 异步解析变量
  const resolvedUserValue = await resolveUserValue(root, finalActiveMessages);

  const apiReadyContext: ApiReadyContext = {
    activeMessages: transformedMessages,
    resolvedUserValue: resolvedUserValue, // 这里可能是一个富对象
    resolvedIntervals: resolvedIntervals,
    variableDocument: root.document,
  };

  const container = new EnhancedApiReadyContext(apiReadyContext);

  return {
    CHAT: container,
    rawContext: apiReadyContext,
    container: container,
  };
}
