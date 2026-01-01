// src/lib/ImportConverter/SillyTavernTypes/Preset.ts
/**
 * 提示词条目 (Prompt/Instruction)
 * 定义系统提示词、世界设定、聊天历史在 Context 中的位置
 */
export interface PromptEntry {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  /** 插入深度 */
  depth: number;
  /** 角色身份 */
  role: "system" | "user" | "assistant";
  /** 插入锚点位置 */
  position:
    | "normal"
    | "before_char"
    | "after_char"
    | "post_history"
    | "jailbreak"
    | "chat_history";
  /** 是否允许从预设中删除 (系统保留条目通常为 false) */
  deletable: boolean;
}

/**
 * 生成预设 (LLM Configuration)
 * 包含采样参数和提示词模板
 */
export interface Preset {
  id: string;
  name: string;

  // --- 基础参数 ---
  context_length: number;
  max_tokens: number;
  temperature: number;
  top_k: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;

  // --- 高级/SillyTavern 采样参数 ---
  min_p: number;
  repetition_penalty: number;
  /** 0: Disabled, 1: Mirostat, 2: Mirostat 2.0 */
  mirostat_mode: number;
  mirostat_tau: number;
  mirostat_eta: number;
  tail_free_sampling: number;
  typical_p: number;

  /** 是否启用思维链 (Chain of Thought) */
  enable_cot: boolean;

  /** 提示词序列 */
  prompt_entries: PromptEntry[];

  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}
