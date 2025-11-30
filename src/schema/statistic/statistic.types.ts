// src/schema/statistic/statistic.types.ts
/**
 * 定义了 statistic.json 文件的原始数据结构。
 */
export interface Statistic {
  userMessageCount: number;
  modelMessageCount: number;
  /**
   * 键为 "YYYY-MM-DD" 格式的日期字符串。
   * 值为当天所有聊天时间段的数组，时间为 "HH:mm" 格式。
   */
  timeIntervals: {
    [dateKey: string]: { start: string; end: string }[];
  };
}
