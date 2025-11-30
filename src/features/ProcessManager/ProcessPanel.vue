<!-- src/features/ProcessManager/ProcessPanel.vue -->
<template>
  <div class="h-full flex flex-col bg-background text-foreground">
    <!-- 头部 -->
    <div
      class="p-3 border-b border-border flex justify-between items-center bg-muted/40"
    >
      <h2
        class="font-semibold text-sm tracking-wide text-muted-foreground flex items-center gap-2"
      >
        <Terminal class="w-4 h-4" />
        Processes
      </h2>
    </div>

    <!-- 列表区域：使用 ScrollArea 获得更好看的滚动条 -->
    <ScrollArea class="flex-1 p-2">
      <div class="space-y-2">
        <Card
          v-for="proc in store.processList"
          :key="proc.id"
          class="group relative transition-all duration-200 cursor-pointer hover:border-primary/50 hover:shadow-sm"
          :class="[
            'border bg-card text-card-foreground',
            selectedProcess?.id === proc.id
              ? 'border-primary ring-1 ring-primary/20'
              : 'border-border',
          ]"
          @click="openTerminal(proc)"
        >
          <div class="p-3">
            <!-- 标题行 -->
            <div class="flex items-center justify-between mb-2">
              <span
                class="font-medium text-sm truncate flex items-center gap-2"
                :title="proc.name"
              >
                {{ proc.name }}
              </span>
              <!-- 状态指示灯 -->
              <span class="relative flex h-2.5 w-2.5">
                <span
                  v-if="proc.status === 'running'"
                  class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-green-500"
                ></span>
                <span
                  class="relative inline-flex rounded-full h-2.5 w-2.5"
                  :class="statusColor(proc.status)"
                ></span>
              </span>
            </div>

            <!-- 信息与操作行 -->
            <div class="flex items-center justify-between h-7">
              <Badge
                variant="secondary"
                class="text-[10px] h-5 px-1.5 font-normal text-muted-foreground"
              >
                {{ proc.isBuiltin ? "System" : "Script" }}
              </Badge>

              <!-- 操作按钮组 -->
              <div
                class="flex gap-1 transition-opacity duration-200"
                :class="
                  proc.isBuiltin
                    ? 'hidden'
                    : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                "
                v-if="!proc.isBuiltin"
              >
                <Button
                  size="icon"
                  variant="ghost"
                  class="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                  :disabled="proc.status === 'running'"
                  @click.stop="store.startScript(proc.id)"
                  title="Start"
                >
                  <Play class="w-3.5 h-3.5" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  class="h-7 w-7 text-destructive hover:text-destructive hover:bg-red-100 dark:hover:bg-red-900/30"
                  :disabled="proc.status !== 'running'"
                  @click.stop="store.stopScript(proc.id)"
                  title="Stop"
                >
                  <Square class="w-3.5 h-3.5 fill-current" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  class="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
                  @click.stop="store.restartScript(proc.id)"
                  title="Restart"
                >
                  <RotateCcw class="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </ScrollArea>

    <Teleport to="body">
      <TerminalModal
        v-if="selectedProcess"
        :process="selectedProcess"
        @close="selectedProcess = null"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  useProcessManagerStore,
  type Process,
  type ProcessStatus,
} from "./ProcessManager.store";
import TerminalModal from "./components/TerminalModel.vue";

// Shadcn 组件
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// 图标 (推荐安装 lucide-vue-next)
import { Play, Square, RotateCcw, Terminal } from "lucide-vue-next";

const store = useProcessManagerStore();
const selectedProcess = ref<Process | null>(null);

const statusColor = (status: ProcessStatus) => {
  switch (status) {
    case "running":
      return "bg-green-500";
    case "stopped":
      return "bg-muted-foreground/30"; // 灰色
    case "error":
      return "bg-destructive"; // 红色
    default:
      return "bg-gray-400";
  }
};

const openTerminal = (proc: Process) => {
  selectedProcess.value = proc;
};
</script>
