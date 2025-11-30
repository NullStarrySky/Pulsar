// src/features/Task/Task.store.ts
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type TaskStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "cancelled";

export interface TaskItem {
  id: string;
  name: string;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  message?: string; // 成功消息或错误报错
  abortController?: AbortController; // 用于取消任务的控制器
}

export const useTaskStore = defineStore("task", () => {
  const tasks = ref<TaskItem[]>([]);

  // 计算属性：按时间倒序排列
  const sortedTasks = computed(() => {
    return [...tasks.value].sort((a, b) => b.startTime - a.startTime);
  });

  // 获取正在运行的任务数量（用于在底栏显示角标等）
  const runningCount = computed(
    () => tasks.value.filter((t) => t.status === "running").length
  );

  // --- Actions ---

  /**
   * 推入并执行一个任务
   * @param name 任务名称
   * @param taskFn 任务函数，接收一个 signal 用于处理取消逻辑
   */
  async function dispatchTask<T>(
    name: string,
    taskFn: (signal: AbortSignal) => Promise<T>
  ) {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const controller = new AbortController();

    const task: TaskItem = {
      id,
      name,
      status: "running",
      startTime: Date.now(),
      abortController: controller,
    };

    tasks.value.unshift(task); // 添加到列表头部

    try {
      // 执行传入的 Promise 逻辑
      const result = await taskFn(controller.signal);

      // 如果还没被取消，标记为成功
      if (task.status === "running") {
        task.status = "success";
        task.message = typeof result === "string" ? result : "Completed";
      }
    } catch (error: any) {
      if (task.status === "cancelled") return; // 已经被标记取消则忽略错误

      // 检查是否是 AbortError
      if (error.name === "AbortError" || controller.signal.aborted) {
        task.status = "cancelled";
        task.message = "Manually Cancelled";
      } else {
        task.status = "error";
        task.message = error.message || "Unknown Error";
      }
    } finally {
      task.endTime = Date.now();
      task.abortController = undefined; // 清理引用
    }
  }

  // 取消任务
  function cancelTask(id: string) {
    const task = tasks.value.find((t) => t.id === id);
    if (task && task.status === "running" && task.abortController) {
      task.abortController.abort(); // 触发 AbortSignal
      task.status = "cancelled";
      task.endTime = Date.now();
      task.message = "Cancelling...";
    }
  }

  // 移除单个任务记录
  function removeTask(id: string) {
    const index = tasks.value.findIndex((t) => t.id === id);
    if (index !== -1) {
      tasks.value.splice(index, 1);
    }
  }

  // 清理所有非运行状态的任务
  function clearCompleted() {
    tasks.value = tasks.value.filter((t) => t.status === "running");
  }

  return {
    tasks: sortedTasks,
    runningCount,
    dispatchTask,
    cancelTask,
    removeTask,
    clearCompleted,
  };
});
