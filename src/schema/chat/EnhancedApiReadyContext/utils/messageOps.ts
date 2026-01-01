// src/schema/chat/EnhancedApiReadyContext/utils/messageOps.ts
import type { ApiReadyMessage } from "@/schema/chat/chat.types";
import type { RegexRule } from "@/schema/shared.types";
import type {
  ContentReplacer,
  MultiDepthInjection,
  SquashConfig,
} from "../api.types";

/** 归一化消息输入 */
const normalizeMsg = (msg: ApiReadyMessage | string): ApiReadyMessage =>
  typeof msg === "string" ? { role: "system", content: msg } : msg;

export const MessageOps = {
  inject(
    current: ApiReadyMessage[],
    toInject: (ApiReadyMessage | string)[],
    depth: number
  ): ApiReadyMessage[] {
    const normalized = toInject.map(normalizeMsg);
    const insertIndex = Math.max(0, current.length - depth);
    return [
      ...current.slice(0, insertIndex),
      ...normalized,
      ...current.slice(insertIndex),
    ];
  },

  injectMany(
    current: ApiReadyMessage[],
    injectionArray: MultiDepthInjection[]
  ): ApiReadyMessage[] {
    if (!injectionArray.length) return [...current];

    const merged = new Map<number, ApiReadyMessage[]>();

    injectionArray.forEach((obj) => {
      Object.entries(obj).forEach(([depthStr, msgs]) => {
        const depth = parseInt(depthStr, 10);
        if (isNaN(depth) || depth < 0) return;

        const norm = msgs.map(normalizeMsg);
        if (merged.has(depth)) merged.get(depth)!.push(...norm);
        else merged.set(depth, norm);
      });
    });

    if (merged.size === 0) return [...current];

    const result = [...current];
    // 从深到浅插入，避免索引偏移问题
    Array.from(merged.keys())
      .sort((a, b) => a - b)
      .forEach((depth) => {
        const msgs = merged.get(depth)!;
        const idx = Math.max(0, result.length - depth);
        result.splice(idx, 0, ...msgs);
      });

    return result;
  },

  squash(
    messages: ApiReadyMessage[],
    start: number,
    count: number,
    config: SquashConfig
  ): ApiReadyMessage[] {
    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.min(messages.length, clampedStart + count);
    if (clampedStart >= clampedEnd) return [...messages];

    const segment = messages.slice(clampedStart, clampedEnd);
    const squashedContent = segment
      .map((msg) => {
        const p =
          msg.role === "user" ? config.userPrefix : config.assistantPrefix;
        const s =
          msg.role === "user" ? config.userSuffix : config.assistantSuffix;
        return `${p ?? ""}${msg.content}${s ?? ""}`;
      })
      .join(config.separator);

    const newNode: ApiReadyMessage = {
      role: config.newRole,
      content: squashedContent,
    };
    return [
      ...messages.slice(0, clampedStart),
      newNode,
      ...messages.slice(clampedEnd),
    ];
  },

  replaceContent(
    messages: ApiReadyMessage[],
    replacer: ContentReplacer
  ): ApiReadyMessage[] {
    return messages.map((msg) => {
      const newContent =
        typeof replacer === "function"
          ? replacer(msg.content, msg)
          : msg.content.replace(replacer.find, replacer.replace);
      return { ...msg, content: newContent };
    });
  },

  applyRegex(
    messages: ApiReadyMessage[],
    rules: RegexRule[]
  ): ApiReadyMessage[] {
    if (!rules?.length) return [...messages];

    return messages.map((msg, index) => {
      let content = msg.content;
      const depth = messages.length - 1 - index;

      rules.forEach((rule) => {
        if (!rule.enabled) return;
        if (depth < (rule.minDepth ?? 0) || depth > (rule.maxDepth ?? Infinity))
          return;
        try {
          content = content.replace(
            new RegExp(rule.find_regex, "g"),
            rule.replace_string
          );
        } catch (e) {
          /* ignore invalid regex */
        }
      });

      return { ...msg, content };
    });
  },
};
