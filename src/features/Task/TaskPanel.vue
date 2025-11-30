<!-- src/features/Task/TaskPanel.vue -->
<template>
  <div class="h-full flex flex-col bg-background text-foreground">
    <!-- 头部工具栏 -->
    <div
      class="p-3 border-b border-border flex justify-between items-center bg-muted/30"
    >
      <div class="flex items-center gap-2">
        <h2
          class="font-semibold text-sm uppercase tracking-wide text-foreground"
        >
          Tasks
        </h2>
        <Badge
          v-if="store.runningCount > 0"
          variant="secondary"
          class="px-1.5 py-0 h-5 text-[10px] font-mono"
        >
          {{ store.runningCount }} running
        </Badge>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        @click="store.clearCompleted"
        title="Clear finished tasks"
      >
        <span class="mr-1.5">Clear Done</span>
        <ListChecks class="w-3.5 h-3.5" />
      </Button>
    </div>

    <!-- 任务列表 -->
    <ScrollArea>
      <div class="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        <div
          v-if="store.tasks.length === 0"
          class="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm italic"
        >
          No active tasks
        </div>

        <transition-group name="list">
          <div
            v-for="task in store.tasks"
            :key="task.id"
            class="group relative flex flex-col gap-1 p-3 rounded-lg border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md"
            :class="['border-l-4', borderColor(task.status)]"
          >
            <!-- 任务标题行 -->
            <div class="flex justify-between items-start">
              <span
                class="font-medium text-sm truncate pr-2 leading-none mt-0.5"
              >
                {{ task.name }}
              </span>
              <div class="flex items-center gap-2">
                <!-- 耗时显示 -->
                <span class="text-[10px] font-mono text-muted-foreground">
                  {{ formatDuration(task) }}
                </span>
                <!-- 状态图标 -->
                <component
                  :is="statusIcon(task.status)"
                  class="w-4 h-4"
                  :class="statusTextColor(task.status)"
                />
              </div>
            </div>

            <!-- 消息/详情行 -->
            <div class="h-5 flex justify-between items-center mt-1">
              <span class="text-xs text-muted-foreground truncate w-full pr-8">
                {{ task.message || task.status }}
              </span>

              <!-- 悬浮操作按钮 (绝对定位在右下角或行内，这里采用行内覆盖模式) -->
              <div
                class="absolute right-2 bottom-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-card pl-2 shadow-[-10px_0_10px_-5px_hsl(var(--card))]"
              >
                <!-- 取消按钮 (仅运行时显示) -->
                <Button
                  v-if="task.status === 'running'"
                  variant="destructive"
                  size="icon"
                  class="h-6 w-6 rounded-md"
                  @click="store.cancelTask(task.id)"
                  title="Cancel Task"
                >
                  <X class="w-3.5 h-3.5" />
                </Button>

                <!-- 删除按钮 (仅非运行时显示) -->
                <Button
                  v-else
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 text-muted-foreground hover:text-destructive"
                  @click="store.removeTask(task.id)"
                  title="Remove Entry"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </transition-group>
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { useTaskStore, type TaskItem, type TaskStatus } from "./Task.store";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  ListChecks,
  X,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const store = useTaskStore();

// 样式辅助函数
// 这里保留了左侧边框的颜色逻辑，因为这是该组件的一个重要视觉特征
// 但我们将背景色和边框色适配了 shadcn 的主题
const borderColor = (status: TaskStatus) => {
  switch (status) {
    case "running":
      return "border-l-blue-500 dark:border-l-blue-400";
    case "success":
      return "border-l-green-500 dark:border-l-green-400";
    case "error":
      return "border-l-red-500 dark:border-l-red-400";
    case "cancelled":
      return "border-l-muted-foreground/50";
    default:
      return "border-l-border";
  }
};

const statusTextColor = (status: TaskStatus) => {
  switch (status) {
    case "running":
      return "text-blue-500 dark:text-blue-400 animate-spin";
    case "success":
      return "text-green-500 dark:text-green-400";
    case "error":
      return "text-destructive";
    case "cancelled":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
};

const statusIcon = (status: TaskStatus) => {
  switch (status) {
    case "running":
      return Loader2;
    case "success":
      return CheckCircle2;
    case "error":
      return XCircle;
    case "cancelled":
      return Ban;
    default:
      return Loader2;
  }
};

const formatDuration = (task: TaskItem) => {
  const end = task.endTime || Date.now();
  const ms = end - task.startTime;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};
</script>

<style scoped>
/* 列表过渡动画 */
.list-enter-active,
.list-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

/* 如果你想让滚动条也符合风格，可以添加这个 utility (或者在全局 css 中定义) */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.3);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.5);
}
</style>
