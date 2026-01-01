// src/lib/ImportConverter/SillyTavernTypes/Lorebook.ts
/**
 * 世界书条目 (Lorebook Entry)
 * 对应 SillyTavern 的单个词条配置
 */
export interface WorldBookEntry {
  id: string;
  /** 主要触发关键词 */
  key: string[];
  /** 次要关键词 (配合 selective_logic 使用) */
  secondary_key: string[];
  /** 触发后插入的内容 */
  content: string;
  enabled: boolean;
  /** 始终激活 (忽略关键词) */
  constant: boolean;
  /** 扫描上下文的消息深度 */
  scan_depth: number;
  /** 插入优先级 (越小越优先) */
  order: number;
  /** 插入位置 */
  position: "before_char" | "after_char" | "at_depth";
  /** 当 position 为 'at_depth' 时的插入深度 */
  depth: number;
  /** 插入时的角色归属 */
  role: "system" | "user" | "assistant";
  /** 是否允许递归触发 (内容触发其他词条) */
  recursive: boolean;
  /** 互斥组名称 */
  inclusion_group: string;

  // --- SillyTavern 兼容字段 ---
  /** 大小写敏感 */
  case_sensitive: boolean;
  /** 全词匹配 */
  match_whole_words: boolean;
  /** 触发概率 (0-100) */
  probability: number;
  /** 是否启用概率检查 */
  use_probability: boolean;
  /** 次要关键词逻辑: AND / OR / NOT */
  selective_logic: "and" | "or" | "not";
  /** 备注/标题 */
  comment: string;
}

/**
 * 世界书 (Lorebook) 容器
 */
export interface WorldBook {
  id: string;
  name: string;
  description: string;
  entries: WorldBookEntry[];
  /** 全局默认扫描深度 */
  scan_depth: number;
  /** 全局递归扫描开关 */
  recursive_scanning: boolean;
  created_at: string; // ISO 8601 Date string
  updated_at: string; // ISO 8601 Date string
}
