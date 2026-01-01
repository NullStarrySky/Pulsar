// src/schema/lorebook/lorebook.ts
import { cloneDeep } from "lodash-es";
import { ExpressionEngine } from "@/lib/ExpressionEngine";
import type {
	ApiReadyMessage,
	ResolvedInterval,
} from "@/schema/chat/chat.types";
import type { EnhancedApiReadyContext } from "@/schema/chat/EnhancedApiReadyContext";
import type { ExecuteContext, role } from "../shared.types";
import { lorebookSchema } from "./lorebook.schema";
import type {
	ActivationCondition,
	FinalLorebookResult,
	Lorebook,
	LorebookEntry,
	LorebookExecutionContext,
	LorebookSetting,
	StringOrRegex,
} from "./lorebook.types";

// --- 内部处理类型 ---
type ProcessedLorebookEntry = LorebookEntry & {
	// 增加来源书的引用，以便在上下文中访问
	sourceBook: Lorebook;
};

type ActivatedEntryDetail = {
	entry: ProcessedLorebookEntry;
	recursionDepth: number;
};

// --- 内部辅助函数 ---
const engine = new ExpressionEngine();

// 创建执行上下文
function createExecutionContext(
	dynamicState: {
		text: string;
		recursion_depth: number;
		history: EnhancedApiReadyContext;
		currentEntry: ProcessedLorebookEntry;
		activatedEntries: ProcessedLorebookEntry[];
	},
	baseContext: Record<string, any>,
): LorebookExecutionContext {
	const { text, recursion_depth, history, currentEntry, activatedEntries } =
		dynamicState;

	const helpers = {
		// 概率
		Probability: (chance: number): boolean => Math.random() * 100 < chance,
		// 递归
		isRecursing: (): boolean => recursion_depth > 0,
		// 匹配
		MatchAll: (keys: StringOrRegex[]): boolean => {
			if (!text) return false;
			return keys.every((key) => new RegExp(key, "u").test(text));
		},
		MatchAny: (keys: StringOrRegex[]): boolean => {
			if (!text) return false;
			return keys.some((key) => new RegExp(key, "u").test(text));
		},
		// 区间 (根据新需求简化或调整)
		IntervalsForLastMessage: (): ResolvedInterval[] => {
			// 实现: 使用 history (即 CHAT 对象) 的方法获取最后一个消息的区间信息
			if (history.length === 0) {
				return [];
			}
			const lastMessageIndex = history.length - 1;
			return history.getIntervalsForIndex(lastMessageIndex);
		},
		LastMessageinIntervalType: (type: string): boolean => {
			// 实现: 基于 IntervalsForLastMessage 的结果进行判断
			if (history.length === 0) {
				return false;
			}
			const lastMessageIndex = history.length - 1;
			const intervals: ResolvedInterval[] =
				history.getIntervalsForIndex(lastMessageIndex);
			return intervals.some((interval) => interval.def.type === type);
		},
		// 调试
		Log: (): boolean => {
			console.log("[Lorebook Log]:", {
				...baseContext,
				...dynamicState,
			});
			return true;
		},
	};

	return {
		...baseContext,
		...helpers,
		text,
		messages: history, // `messages` 字段现在指向 history
		recursion_depth,
		self: currentEntry,
		selfBook: currentEntry.sourceBook,
		activatedEntrys: activatedEntries,
		history,
	};
}

// 评估条件
async function evaluateConditions(
	condition: ActivationCondition,
	context: LorebookExecutionContext,
): Promise<boolean> {
	if (condition.alwaysActivation) return true;
	if (!condition.condition || condition.condition.length === 0) return false;

	const results = await Promise.all(
		condition.condition.map((expr) => {
			console.log("Evaluating condition:", expr);
			console.log("Context:", context);
			return engine.execute(expr, context);
		}),
	);
	return results.every((res) => res === true);
}

// --- Wrapper 定义 ---

export class LorebookWrapper {
	private resources: { path: string; content: Lorebook }[];

	constructor(
		resources:
			| { path: string; content: Lorebook }
			| { path: string; content: Lorebook }[],
	) {
		this.resources = Array.isArray(resources) ? resources : [resources];
	}

	/**
	 * 应用世界书规则的核心函数。
	 */
	async scan(
		CHAT: EnhancedApiReadyContext,
		globalSetting: LorebookSetting,
		baseContext: object = {},
	): Promise<FinalLorebookResult | null> {
		const mergedBaseContext = Object.assign(
			{},
			CHAT.resolvedUserValue,
			baseContext,
		);

		const activatedEntriesMap = new Map<string, ActivatedEntryDetail>();

		for (const bookResource of this.resources) {
			const book = bookResource.content;
			// 如果设定了useLocalSetting，则使用书籍的独立设定，否则使用全局设定
			const effectiveSetting = book.useLocalSetting
				? book.setting
				: globalSetting;

			const processableEntries: ProcessedLorebookEntry[] = (book.entries || [])
				.filter((entry) => entry.enabled)
				.map((entry) => ({ ...entry, sourceBook: book }));

			// 步骤 1: 处理“始终激活”的条目
			for (const entry of processableEntries) {
				if (entry.activationWhen.alwaysActivation) {
					activatedEntriesMap.set(entry.id, { entry, recursionDepth: 0 });
				}
			}

			const newlyActivatedInLoop = new Set<string>();

			// 步骤 2: 递归扫描
			for (
				let depth = 0;
				depth <= effectiveSetting.max_recursion_count;
				depth++
			) {
				let textToScan: string;
				const entriesForThisScan = processableEntries.filter(
					(e) => !activatedEntriesMap.has(e.id),
				);
				if (entriesForThisScan.length === 0) break;

				if (depth === 0) {
					// 初始扫描：基于扫描深度拼接历史消息作为`text`
					textToScan = CHAT.slice(-effectiveSetting.scan_depth)
						.map((msg: ApiReadyMessage) => msg.content)
						.join("\n\n");
				} else {
					// 递归扫描：拼接上一轮新激活的、且不逃逸扫描的条目内容
					if (newlyActivatedInLoop.size === 0) break;
					textToScan = Array.from(newlyActivatedInLoop)
						.map((id) => activatedEntriesMap.get(id)!)
						.filter((detail) => !detail.entry.escapeScanWhenRecursing)
						.map((detail) => detail.entry.activationEffect.content)
						.join("\n\n");
					if (!textToScan) break; // 如果可扫描内容为空，则停止递归
				}

				newlyActivatedInLoop.clear();

				const evaluationPromises = entriesForThisScan.map(async (entry) => {
					const executionContext = createExecutionContext(
						{
							text: textToScan,
							recursion_depth: depth,
							history: CHAT,
							currentEntry: entry,
							activatedEntries: Array.from(activatedEntriesMap.values()).map(
								(d) => d.entry,
							),
						},
						mergedBaseContext,
					);

					if (
						await evaluateConditions(
							{
								condition: [
									...effectiveSetting.activationWhen,
									...entry.activationWhen.condition,
								],
								alwaysActivation: entry.activationWhen.alwaysActivation,
							},
							// 合并全局和条目激活条件
							executionContext,
						)
					) {
						activatedEntriesMap.set(entry.id, {
							entry,
							recursionDepth: depth,
						});
						newlyActivatedInLoop.add(entry.id);
					}
				});

				await Promise.all(evaluationPromises);
			}
		}

		if (activatedEntriesMap.size === 0) return null;

		// 步骤 3: 排序和生成最终结果
		const sortedFinalDetails = Array.from(activatedEntriesMap.values()).sort(
			(a, b) =>
				a.entry.activationEffect.insertion_order -
				b.entry.activationEffect.insertion_order,
		);

		// 调整: 初始化 result 以匹配新的 Map<xxx, xxx[]> 结构
		const result: FinalLorebookResult = {
			DepthMessages: new Map<number, { role: role; content: string }[]>(),
			LocationMessages: new Map<string, { role: role; content: string }[]>(),
			intervalsToCreate: [],
		};

		for (const detail of sortedFinalDetails) {
			const { entry } = detail;
			const { position, role, content, intervalsToCreate } =
				entry.activationEffect;

			const messagePart = { role, content };

			// 调整: 实现追加逻辑，而不是合并内容
			if (typeof position === "number") {
				const existingArray = result.DepthMessages.get(position);
				if (existingArray) {
					// 如果该位置已有数组，则直接追加
					existingArray.push(messagePart);
				} else {
					// 否则，创建一个新数组并设置
					result.DepthMessages.set(position, [messagePart]);
				}
			} else if (typeof position === "string") {
				const existingArray = result.LocationMessages.get(position);
				if (existingArray) {
					// 如果该位置已有数组，则直接追加
					existingArray.push(messagePart);
				} else {
					// 否则，创建一个新数组并设置
					result.LocationMessages.set(position, [messagePart]);
				}
			}

			if (intervalsToCreate) {
				result.intervalsToCreate.push(cloneDeep(intervalsToCreate));
			}
		}

		return result;
	}
	/**
	 * 处理并合并世界书结果到执行上下文中。
	 * @param context - 包含 CHAT、SETTING 和 MiddleValue 的完整执行上下文。
	 */
	public async process(context: ExecuteContext): Promise<void> {
		// 全局设定存在于 context.SETTING.lorebook 中
		const globalSetting = context.SETTING?.lorebook as
			| LorebookSetting
			| undefined;
		if (!globalSetting) {
			console.warn(
				"[Lorebook.process] Global lorebook settings not found in context.SETTING.lorebook. Skipping scan.",
			);
			return;
		}

		// 调用 scan 获取处理结果，将整个上下文作为表达式的基础环境
		const result = await this.scan(context.CHAT, globalSetting, [context]);

		if (!result) {
			return; // 没有激活任何条目，直接返回
		}

		// --- 将结果释放并合并到 context (MiddleValue) ---

		// 1. 合并要创建的区间
		if (result.intervalsToCreate.length > 0) {
			context.intervalsToCreate.push(...result.intervalsToCreate);
		}

		// 2. 合并 DepthMessages
		for (const [depth, messages] of result.DepthMessages.entries()) {
			const existing = context.DepthMessages.get(depth) ?? [];
			existing.push(...messages);
			context.DepthMessages.set(depth, existing);
		}

		// 3. 合并 LocationMessages (作为上下文的顶层属性)
		for (const [location, messages] of result.LocationMessages.entries()) {
			if (
				!location ||
				typeof location !== "string" ||
				// 防止覆盖核心属性
				(Object.hasOwn(context, location) &&
					!Array.isArray((context as any)[location]))
			) {
				console.warn(
					`[Lorebook.process] Location name "${location}" is invalid or conflicts with a non-array core context property. Skipping.`,
				);
				continue;
			}

			const existing =
				((context as any)[location] as
					| { role: role; content: string }[]
					| undefined) ?? [];
			existing.push(...messages);
			(context as any)[location] = existing;
		}
	}
}

// --- 语义类型定义 ---

export const LorebookDefinition = {
	new: (): Lorebook => ({
		name: "New Lorebook",
		description: "",
		useLocalSetting: false,
		setting: {
			scan_depth: 20,
			max_recursion_count: 3,
			activationWhen: [],
		},
		entries: [],
		extension: {},
	}),

	wrapperFunction: (resources: { path: string; content: Lorebook }[]) => {
		return { LOREBOOK: new LorebookWrapper(resources) };
	},

	renderingMethod: lorebookSchema,
};
