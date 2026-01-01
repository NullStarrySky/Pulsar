// src/schema/shared.types.ts
import type { Row } from "@/components/SchemaRenderer/SchemaRenderer.types";
export type role = "user" | "assistant" | "system";
export type ExecutableString = string;

/**
提示词的插入位置。
*/
export type injectPosition =
	| "AFTER_CHAR"
	| "BEFORE_CHAR"
	| "PERSONALITY"
	| "SCENARIO"
	| number;

/**
  正则替换规则结构。
  */
export type RegexRule = {
	id: string;
	name: string;
	enabled: boolean;
	find_regex: string;
	replace_string: string;
	applyOnRendering: boolean;
	applyOnSending: boolean;
	minDepth: number;
	maxDepth: number;
};

export type UserValue = {
	initialValue: object; // 初始值对象
	schema: Row[]; // 描述该变量的 Schema
	value: any; // 变量的当前值，可以是任何类型
};

// TODO: 还原这玩意儿
export type ExecuteContext = any;

export type fromUseExecuteContext = any;
