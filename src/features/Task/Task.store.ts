// src/features/Task/Task.store.ts
import { defineStore } from "pinia";
import { computed, ref } from "vue";

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
  message?: string;
  abortController?: AbortController;
}

export const useTaskStore = defineStore("task", () => {
  const tasks = ref<TaskItem[]>([]);

  const sortedTasks = computed(() => {
    return [...tasks.value].sort((a, b) => b.startTime - a.startTime);
  });

  const runningCount = computed(
    () => tasks.value.filter((t) => t.status === "running").length
  );

  /**
   * 分发一个任务
   * @param name 任务名称
   * @param taskFn 任务逻辑，接收 signal
   * @returns Promise<T> 返回任务结果，如果被取消或失败会抛出异常
   */
  async function dispatchTask<T>(
    name: string,
    taskFn: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const controller = new AbortController();

    const task: TaskItem = {
      id,
      name,
      status: "running",
      startTime: Date.now(),
      abortController: controller,
    };

    tasks.value.unshift(task);

    try {
      if (controller.signal.aborted) {
        throw new DOMException("Task started as cancelled", "AbortError");
      }

      const result = await taskFn(controller.signal);

      // 再次检查，防止在 await 期间被取消
      if (controller.signal.aborted) {
        throw new DOMException("Task cancelled during execution", "AbortError");
      }

      if (task.status === "running") {
        task.status = "success";
        task.message = typeof result === "string" ? result : "完成";
      }
      return result;
    } catch (error: any) {
      if (error.name === "AbortError" || controller.signal.aborted) {
        task.status = "cancelled";
        task.message = "已取消";
      } else {
        task.status = "error";
        task.message = error.message || "未知错误";
      }
      throw error; // 继续抛出，以便调用者知道失败了
    } finally {
      if (!task.endTime) task.endTime = Date.now();
      task.abortController = undefined;
    }
  }

  function cancelTask(id: string) {
    const task = tasks.value.find((t) => t.id === id);
    if (task && task.status === "running" && task.abortController) {
      task.message = "正在取消...";
      task.abortController.abort(); // 触发 Signal
      // 状态修改由 dispatchTask 的 catch 块最终确认，但为了 UI 即时响应可先标记
      task.status = "cancelled";
    }
  }

  function removeTask(id: string) {
    const index = tasks.value.findIndex((t) => t.id === id);
    if (index !== -1) tasks.value.splice(index, 1);
  }

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
