// src/schema/character/character.ts
import { v4 as uuidv4 } from "uuid";
import type { SchemaDefinition } from "../SemanticType.js";
import { characterSchema } from "./character.schema.js";
import type { Character } from "./character.types.ts";

/**
 * 创建一个新的、默认的 Character 对象.
 * @returns 一个新的 Character 对象。
 */
function newCharacter(): Character {
	return {
		id: uuidv4(),
		name: "新角色",
		description: "",
		creator: "Pulsar",
		character_version: "1.0",
		mes_example: "",
		system_prompt: "",
		REGEX: [],
		post_history_instructions: "",
		personality: "",
		scenario: "",
		creator_notes: "",
		source: [],
		creator_notes_multilingual: {},
		extensions: {},
		creation_date: Math.floor(Date.now() / 1000),
		tools: [],
	};
}

// --- Wrapper Class  ---

/**
 * CharacterWrapper 类用于在提示词模板中提供对角色数据的便捷访问。
 * 它将一个或多个角色资源包装成一个对象。
 */
class CharacterWrapper {
	private resources: { path: string; content: Character }[];

	constructor(resources: { path: string; content: Character }[]) {
		this.resources = resources;
	}

	/**
	 * 当直接在模板中使用 `{{CHARACTER}}` 时，默认返回第一个角色的结构化描述。
	 * 使用 XML 标签和换行符构建清晰的上下文结构。
	 * @returns {string} 结构化后的角色描述字符串。
	 */
	toString(): string {
		const character = this.resources[0]?.content;
		if (!character) {
			return "";
		}

		const sections: string[] = [];

		// 添加性格描述
		if (character.personality.trim()) {
			sections.push(
				`<personality>\n${character.personality.trim()}\n</personality>`,
			);
		}

		// 添加场景描述
		if (character.scenario.trim()) {
			sections.push(`<scenario>\n${character.scenario.trim()}\n</scenario>`);
		}

		// 添加对话示例
		if (character.mes_example.trim()) {
			sections.push(
				`<message_examples>\n${character.mes_example.trim()}\n</message_examples>`,
			);
		}

		// 使用双换行符连接各部分，确保清晰分隔
		return sections.join("\n\n");
	}

	/**
	 * 提供对第一个角色的 name 的直接访问。
	 * @returns {string} 第一个角色的昵称或名字。
	 */
	get name(): string {
		const character = this.resources[0]?.content;
		if (!character) {
			return "";
		}
		return character.name;
	}

	/**
	 * 提供对第一个角色的 system_prompt 的直接访问。
	 * @returns {string} 第一个角色的 system_prompt。
	 */
	get system_prompt(): string {
		return this.resources[0]?.content.system_prompt ?? "";
	}

	/**
	 * 提供对第一个角色的 mes_example 的直接访问。
	 * @returns {string} 第一个角色的 mes_example。
	 */
	get mes_example(): string {
		return this.resources[0]?.content.mes_example ?? "";
	}

	/**
	 * 提供对第一个角色的 post_history_instructions 的直接访问。
	 * @returns {string} 第一个角色的 post_history_instructions。
	 */
	get post_history_instructions(): string {
		return this.resources[0]?.content.post_history_instructions ?? "";
	}

	/**
	 * 提供对第一个角色的 personality 的直接访问。
	 * @returns {string} 第一个角色的 personality。
	 */
	get personality(): string {
		return this.resources[0]?.content.personality ?? "";
	}
	/**
	 * 提供对第一个角色的 路径 的直接访问。
	 * @returns {string} 第一个角色的 path。
	 */
	get path(): string {
		return this.resources[0].path;
	}

	/**
	 * 提供对第一个角色的 scenario 的直接访问。
	 * @returns {string} 第一个角色的 scenario。
	 */
	get scenario(): string {
		return this.resources[0]?.content.scenario ?? "";
	}

	/**
	 * 获取所有角色名字的拼接字符串。
	 * @returns {string} 所有角色名字，以 ", " 分隔。
	 */
	get allNames(): string {
		// 保持原样，或者可以根据需求调整为优先使用 nickname
		return this.resources.map((r) => r.content.name).join(", ");
	}

	/**
	 * 获取所有角色描述的拼接字符串。
	 * @param {string} separator - 描述之间的分隔符，默认为换行符。
	 * @returns {string} 拼接后的所有角色描述。
	 */
	allDescriptions(separator: string = "\n"): string {
		return this.resources.map((r) => r.content.description).join(separator);
	}

	/**
	 * 允许通过索引访问特定角色。
	 * @example {{CHARACTER.at(0).name}}
	 * @param {number} index - 角色在列表中的索引。
	 * @returns {Character | undefined} 对应索引的角色内容。
	 */
	at(index: number): Character | undefined {
		return this.resources[index]?.content;
	}
}

// --- 范式定义 ---

export const CharacterDefinition = {
	new: newCharacter,

	/**
	 * 包装函数，将一个或多个 Character 资源转换为一个统一的、可在模板中使用的对象。
	 */
	wrapperFunction: (resources: { path: string; content: Character }[]) => {
		// 确保处理的是一个数组
		const resourcesArray = Array.isArray(resources) ? resources : [resources];
		return { CHARACTER: new CharacterWrapper(resourcesArray) };
	},

	renderingMethod: characterSchema,
} satisfies SchemaDefinition<Character>;
