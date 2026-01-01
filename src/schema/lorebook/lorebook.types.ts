// src/schema/lorebook/lorebook.types.ts

import type { ResolvedInterval } from "@/schema/chat/chat.types";
import type { EnhancedApiReadyContext } from "@/schema/chat/EnhancedApiReadyContext";
import type { ExecutableString, role } from "../shared.types";

// ================= 通用共享类型 =================

/**
 * 提示词的插入位置。
 */
export type injectPosition =
	| "AFTER_CHAR"
	| "BEFORE_CHAR"
	| "PERSONALITY"
	| "SCENARIO"
	| string
	| number;

// --- Lorebook 核心数据结构 ---

export type StringOrRegex = string;

export type ActivationCondition = {
	alwaysActivation: boolean;
	condition: ExecutableString[];
};

export type LorebookSetting = {
	// 扫描涵盖的消息数量
	scan_depth: number;
	// 最大递归扫描次数
	max_recursion_count: number;
	// 激活条件
	activationWhen: ExecutableString[];
};

/**
 * 世界书数据结构。
 */
export type Lorebook = {
	name: string;
	description: string;

	useLocalSetting: boolean;
	setting: LorebookSetting;

	entries: Array<LorebookEntry>;
	extension: Record<string, any>;
};

/**
 * 世界书条目数据结构。
 */
export type LorebookEntry = {
	enabled: boolean;

	id: string;
	name: string;
	description: string;
	groupName: string;

	activationWhen: ActivationCondition;
	escapeScanWhenRecursing: boolean;

	activationEffect: LorebookEffect;
};

/**
 * 定义了 Lorebook 条目被成功激活后产生的效果。
 */
export type LorebookEffect = {
	role: role;
	position: injectPosition;
	content: string;

	insertion_order: number;

	/**
	 * 附加的区间定义。
	 */
	intervalsToCreate: {
		type: string;
		length: string;
		content: Record<string, any>;
	};
};

// --- 上下文与返回值 ---

/**
 * 为 Lorebook 表达式执行提供的动态上下文。
 */
export type LorebookExecutionContext = {
	// 单次上下文：
	text: string;
	messages: EnhancedApiReadyContext | null;
	recursion_depth: number;
	self: LorebookEntry;
	selfBook: Lorebook;
	// 增量上下文
	activatedEntrys: LorebookEntry[];
	history: EnhancedApiReadyContext;
	// 方法
	// 概率激活
	Probability: (chance: number) => boolean;
	// 递归
	isRecursing: () => boolean;
	// 匹配
	MatchAll: (keys: StringOrRegex[]) => boolean;
	MatchAny: (keys: StringOrRegex[]) => boolean;
	// 区间
	IntervalsForLastMessage: () => ResolvedInterval[];
	LastMessageinIntervalType: (type: string) => boolean;

	// 特殊：
	Log: () => boolean; //永远返回true，并且在控制台打印上下文对象
} & Record<string, any>;

/**
 * 世界书应用函数的最终返回结构。
 */
export type FinalLorebookResult = {
	DepthMessages: Map<number, { role: role; content: string }[]>;
	LocationMessages: Map<string, { role: role; content: string }[]>;
	intervalsToCreate: {
		type: string;
		length: string;
		content: Record<string, any>;
	}[];
};
