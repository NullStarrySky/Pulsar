// src/schema/chat/EnhancedApiReadyContext/EnhancedApiReadyContext.ts

import { applyExpressionsWithSplitting } from "@/lib/ExpressionEngine/ExpressionEngine";
import type { RegexRule } from "../../shared.types";
import type {
	ApiReadyContext,
	ApiReadyMessage,
	ResolvedInterval,
} from "../chat.types";
import type {
	ContentReplacer,
	FinalApiMessage,
	MultiDepthInjection,
	SquashConfig,
	SquashInterval,
} from "./api.types";
import { finalizeMessages } from "./utils/formatter";
import { MessageOps } from "./utils/messageOps";
// 引入拆分后的工具
import { VectorSearcher } from "./utils/vectorUtils";

export class EnhancedApiReadyContext extends Array<ApiReadyMessage> {
	public readonly fullContext: Readonly<ApiReadyContext>;

	// 必须显式声明，防止 map/filter 等方法返回 Array 而非 EnhancedApiReadyContext
	static get [Symbol.species]() {
		return Array;
	}

	constructor(context: ApiReadyContext) {
		super(...context.activeMessages);
		this.fullContext = context;
	}

	/**
	 * 内部工厂方法：用于在不可变操作后生成新实例
	 */
	private _factory(newMessages: ApiReadyMessage[]): EnhancedApiReadyContext {
		return new EnhancedApiReadyContext({
			...this.fullContext,
			activeMessages: newMessages,
		});
	}

	// ========== 标准数组方法重写 (保持类型安全) ==========

	// 这里的逻辑保持不变：我们需要 map 返回普通数组，而 filter/slice 返回增强实例

	map<U>(
		callback: (v: ApiReadyMessage, k: number, a: ApiReadyMessage[]) => U,
		thisArg?: any,
	): U[] {
		return Array.prototype.map.call(this, callback, thisArg) as U[];
	}

	filter(predicate: any, thisArg?: any): EnhancedApiReadyContext {
		const newMessages = Array.prototype.filter.call(this, predicate, thisArg);
		return this._factory(newMessages);
	}

	slice(start?: number, end?: number): EnhancedApiReadyContext {
		const newMessages = Array.prototype.slice.call(this, start, end);
		return this._factory(newMessages);
	}

	concat(...items: any[]): EnhancedApiReadyContext {
		const newMessages = Array.prototype.concat.apply(this, items);
		return this._factory(newMessages);
	}

	flatMap<U>(callback: any, thisArg?: any): U[] {
		return Array.prototype.flatMap.call(this, callback, thisArg) as U[];
	}

	// ========== 原地修改辅助方法 (链式调用) ==========

	pushReturn(...items: ApiReadyMessage[]): this {
		this.push(...items);
		return this;
	}
	popReturn(): this {
		this.pop();
		return this;
	}
	shiftReturn(): this {
		this.shift();
		return this;
	}
	unshiftReturn(...items: ApiReadyMessage[]): this {
		this.unshift(...items);
		return this;
	}

	// ========== 上下文查询方法 ==========

	public get resolvedUserValue() {
		return this.fullContext.resolvedUserValue;
	}
	public get resolvedIntervals() {
		return this.fullContext.resolvedIntervals;
	}

	public getIntervalsForIndex(index: number): ResolvedInterval[] {
		if (index < 0 || index >= this.length) return [];
		return this.fullContext.resolvedIntervals.filter(
			(iv) => iv.range && index >= iv.range.start && index <= iv.range.end,
		);
	}

	// ========== 核心逻辑 (委托给工具函数) ==========

	public inject(
		items: (ApiReadyMessage | string)[],
		depth: number,
	): EnhancedApiReadyContext {
		return this._factory(MessageOps.inject(this, items, depth));
	}

	public injectMany(
		injections: MultiDepthInjection[],
	): EnhancedApiReadyContext {
		return this._factory(MessageOps.injectMany(this, injections));
	}

	public squash(
		start: number,
		count: number,
		config: SquashConfig,
	): EnhancedApiReadyContext {
		return this._factory(MessageOps.squash(this, start, count, config));
	}

	public squashSelective(
		intervals: SquashInterval[],
		config: SquashConfig,
	): EnhancedApiReadyContext {
		// 复用 squash 逻辑，稍微处理一下 intervals 循环
		let current = [...this];
		// 从后往前处理以保持索引有效
		const sorted = [...intervals].sort((a, b) => b.start - a.start);

		for (const { start, end } of sorted) {
			current = MessageOps.squash(current, start, end - start, config);
		}
		return this._factory(current);
	}

	public replaceContent(replacer: ContentReplacer): EnhancedApiReadyContext {
		return this._factory(MessageOps.replaceContent(this, replacer));
	}

	public applyRegex(rules: RegexRule[]): EnhancedApiReadyContext {
		return this._factory(MessageOps.applyRegex(this, rules));
	}

	public async prune(
		maxTokens: number,
		tokenCounter: (c: string) => number | Promise<number>,
	): Promise<EnhancedApiReadyContext> {
		// Prune 逻辑比较简单且往往需要 await，可以保留在此或单独提取
		let total = 0;
		let cutIdx = 0;

		for (let i = this.length - 1; i >= 0; i--) {
			const tokens = await Promise.resolve(tokenCounter(this[i].content));
			if (total + tokens > maxTokens) {
				cutIdx = i + 1;
				break;
			}
			total += tokens;
		}
		return this.slice(cutIdx);
	}

	public async applyTemplate(
		template: ApiReadyMessage[],
		envObj: Record<string, any>,
	): Promise<EnhancedApiReadyContext> {
		const finalMessages: ApiReadyMessage[] = [];
		for (const msg of template) {
			const parts = await applyExpressionsWithSplitting(msg.content, envObj);
			for (const part of parts) {
				if (typeof part === "object" && part?.role) {
					finalMessages.push(part as ApiReadyMessage);
				} else {
					finalMessages.push({
						role: msg.role,
						content: typeof part === "string" ? part : JSON.stringify(part),
					});
				}
			}
		}
		return this._factory(finalMessages);
	}

	// ========== 向量搜索 ==========

	public createVectorSearch(targetModelId: string) {
		// 委托给专门的 Searcher 类
		return new VectorSearcher(this, targetModelId);
	}

	// ========== 最终输出 ==========

	public finalize(): FinalApiMessage[] {
		return finalizeMessages(this);
	}
}
