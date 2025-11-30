// src/lib/ExpressionEngine/BasicEnv.ts
// 这里放一些基本的环境变量或者工具函数来使用
import dayjs from "dayjs";

export const BasicEnv = {
  newline: "\n",
  space: " ",
  currentTime: () => dayjs().format("YYYY-MM-DD HH:mm:ss"),
} as const;
