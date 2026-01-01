// src/lib/ImportConverter/SillyTavernTypes/Regex.ts
/**
 * 正则替换脚本
 * 用于在发送提示词前或显示内容前修改文本
 */
export interface RegexScript {
  id: string;
  name: string;
  enabled: boolean;
  /** 正则表达式模式 */
  find_regex: string;
  /** 替换内容 (可使用正则组 $1, $2 等) */
  replace_with: string;

  // --- 触发时机 ---
  run_on_user_input: boolean;
  run_on_ai_output: boolean;
  run_on_edit: boolean;

  // --- 作用范围 ---
  /** 仅修改显示效果 (Markdown渲染)，不影响实际 Prompt */
  only_format_display: boolean;
  /** 仅修改 Prompt，不影响 UI 显示 */
  only_format_prompt: boolean;

  // --- 深度限制 ---
  min_depth: number;
  max_depth: number; // -1 表示无限制

  /** 正则标志 (如 'g', 'i', 'm', 's') */
  flags: string;
  order_index: number;

  // --- 其他输出流控制 (SillyTavern 扩展功能) ---
  run_on_director_output: boolean;
  run_on_writer_output: boolean;
  run_on_paint_director_output: boolean;
}
