// src/schema/statistic/statistic.ts

import type { SchemaDefinition } from "../SemanticType";
import StatisticEditor from "./StatisticEditor.vue";
import type { Statistic } from "./statistic.types";

/**
 * 工厂函数：创建一个默认的统计数据对象。
 * @returns {Statistic} 一个新的 Statistic 对象
 */
function newStatistic(): Statistic {
  return {
    userMessageCount: 0,
    modelMessageCount: 0,
    timeIntervals: {},
  };
}

/**
 * StatisticWrapper 封装了统计数据及其相关操作。
 * 它既提供了用于模板渲染的派生数据，也包含了修改自身状态的功能性方法。
 */
class StatisticWrapper {
  private resource: { path: string; content: Statistic };

  constructor(resources: { path: string; content: Statistic }[]) {
    // 统计数据通常是全局唯一的
    if (!resources || resources.length === 0) {
      console.warn(
        "Statistic resource not provided, using default statistics."
      );
      this.resource = {
        path: "default/statistic.json",
        content: newStatistic(),
      };
    } else {
      if (resources.length > 1) {
        console.warn(
          `Expected 1 statistic resource, but found ${resources.length}. Using the first one.`
        );
      }
      this.resource = resources[0];
    }
  }

  // --- 功能性方法 (从旧 'method' 迁移) ---

  incrementUserMessageCount(): void {
    this.resource.content.userMessageCount++;
  }

  incrementModelMessageCount(): void {
    this.resource.content.modelMessageCount++;
  }

  attachTimeInterval(startIso: string, endIso: string): void {
    const statistic = this.resource.content;
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn(`[StatisticWrapper] 无效的日期格式`, { startIso, endIso });
      return;
    }

    const intervalMinutes =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60);
    if (intervalMinutes < 1) {
      console.log(`[StatisticWrapper] 时间间隔小于1分钟，已拒绝。`);
      return;
    }

    const dateKey = startDate.toISOString().slice(0, 10);
    const formatTime = (date: Date) =>
      `${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes()
      ).padStart(2, "0")}`;

    const newInterval = {
      start: formatTime(startDate),
      end: formatTime(endDate),
    };

    if (!statistic.timeIntervals[dateKey]) {
      statistic.timeIntervals[dateKey] = [];
    }
    statistic.timeIntervals[dateKey].push(newInterval);
  }

  // --- 派生数据方法 (从旧 'data' 迁移) ---

  /**
   * 计算总消息数。
   */
  totalMessageCount(): number {
    const statistic = this.resource.content;
    return statistic.userMessageCount + statistic.modelMessageCount;
  }

  /**
   * 将会话时间段格式化为更易于渲染的数组，并按日期降序排序。
   */
  formattedIntervals(): {
    date: string;
    intervals: { start: string; end: string }[];
  }[] {
    const statistic = this.resource.content;
    return Object.entries(statistic.timeIntervals)
      .map(([date, intervals]) => ({ date, intervals }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * 以格式化的 JSON 字符串形式返回统计内容，主要用于调试。
   * @returns {string}
   */
  toString(): string {
    return JSON.stringify(this.resource.content, null, 2);
  }
}

/**
 * 范式下的 StatisticDefinition
 */
export const StatisticDefinition = {
  new: newStatistic,

  wrapperFunction: (resources: { path: string; content: Statistic }[]) => {
    return {
      STATISTIC: new StatisticWrapper(resources),
    };
  },

  renderingMethod: StatisticEditor,
} satisfies SchemaDefinition<Statistic>;
