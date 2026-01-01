// src/lib/ImportConverter/SillyTavernTypes/Character.ts
/**
 * 角色核心数据 (V2 Spec Data)
 */
export interface CharacterData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  /** 第一条开场白 */
  first_mes: string;
  /** 对话示例 */
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
}

/**
 * 角色扩展字段
 * 包含关联的世界书 ID 或 TTS 设置
 */
export interface CharacterExtensions {
  worldbook_id?: string | null;
  tts_voice_id?: string | null;
  [key: string]: any; // 允许其他扩展字段
}

/**
 * 角色卡 (Character Card)
 */
export interface Character {
  id: string;
  /** 通常为 "chara_card_v2" */
  spec: string;
  /** 通常为 "2.0" */
  spec_version: string;

  data: CharacterData;
  extensions: CharacterExtensions;

  /** 头像图片的 API 路径 */
  avatar_url?: string | null;

  created_at: string;
  updated_at: string;

  // 导入时可能存在的临时字段
  imported_worldbook_id?: string;
  imported_regex_count?: number;
  linked_worldbook_name?: string;
}
