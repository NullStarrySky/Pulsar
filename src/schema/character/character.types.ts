// src/schema/character/character.types.ts
import type { RegexRule } from "../shared.types";

// --- Character 核心类型定义 ---

export interface Character {
  id: string;
  name: string;

  description: string;

  REGEX: RegexRule[];

  // Function Calling
  tools: string[];

  // 来源元信息
  creator: string;
  character_version: string;
  creator_notes: string;
  creator_notes_multilingual: Record<string, string>;
  source: string[];

  // 结构元信息
  mes_example: string;
  system_prompt: string;
  post_history_instructions: string;
  personality: string;
  scenario: string;

  // 修改元信息
  creation_date: number;

  // 扩展
  extensions: Record<string, any>;
}
