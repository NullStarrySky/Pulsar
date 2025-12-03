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
        进程管理
      </h2>
      <Button
        variant="ghost"
        size="icon"
        class="h-6 w-6"
        @click="store.refresh()"
        title="刷新列表"
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </Button>
    </div>

    <ScrollArea class="flex-1 p-2">
      <div class="space-y-1.5">
        <Item
          v-for="proc in store.processList"
          :key="proc.id"
          size="sm"
          variant="outline"
          class="group relative transition-all duration-200 cursor-pointer hover:border-primary/50 hover:shadow-sm"
          :class="[
            selectedProcess?.id === proc.id
              ? 'border-primary ring-1 ring-primary/20'
              : 'border-border',
          ]"
          @click="openTerminal(proc)"
        >
          <!-- 左侧内容区域 -->
          <ItemContent>
            <ItemTitle class="truncate" :title="proc.name">
              {{ proc.name }}
            </ItemTitle>
            <ItemDescription class="flex items-center gap-2">
              <Badge
                variant="secondary"
                class="text-[10px] h-5 px-1.5 font-normal"
              >
                {{ proc.isBuiltin ? "System" : "Script" }}
              </Badge>
              <span
                v-if="proc.status === 'error'"
                class="text-[10px] text-destructive"
                >Start Failed</span
              >
            </ItemDescription>
          </ItemContent>

          <!-- 右侧动作与状态区域 -->
          <ItemActions
            class="flex flex-col justify-between items-end self-stretch py-1"
          >
            <!-- 状态指示灯 -->
            <span class="relative flex h-2.5 w-2.5" :title="proc.status">
              <span
                v-if="proc.status === 'running'"
                class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-green-500"
              ></span>
              <span
                class="relative inline-flex rounded-full h-2.5 w-2.5"
                :class="statusColor(proc.status)"
              ></span>
            </span>

            <!-- 操作按钮组 -->
            <div
              class="flex gap-1 transition-opacity duration-200"
              :class="'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'"
            >
              <Button
                v-if="proc.status !== 'running'"
                size="icon"
                variant="ghost"
                class="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                @click.stop="store.startScript(proc.id)"
                title="启动"
              >
                <Play class="w-3.5 h-3.5" />
              </Button>

              <Button
                v-else
                size="icon"
                variant="ghost"
                class="h-7 w-7 text-destructive hover:text-destructive hover:bg-red-100 dark:hover:bg-red-900/30"
                @click.stop="store.stopScript(proc.id)"
                title="停止"
              >
                <Square class="w-3.5 h-3.5 fill-current" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
                @click.stop="store.restartScript(proc.id)"
                title="重启"
              >
                <RotateCcw class="w-3.5 h-3.5" />
              </Button>
            </div>
          </ItemActions>
        </Item>
      </div>

      <!-- 空状态提示 -->
      <div
        v-if="store.processList.length <= 1"
        class="text-center text-xs text-muted-foreground py-8"
      >
        没有找到可执行脚本。<br />请在 executable 目录下创建子文件夹并放入
        start.bat/sh
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
import { ref, onMounted } from "vue";
import {
  useProcessManagerStore,
  type Process,
  type ProcessStatus,
} from "./ProcessManager.store";
import TerminalModal from "./components/TerminalModel.vue";

// Shadcn 组件
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// 图标
import { Play, Square, RotateCcw, Terminal } from "lucide-vue-next";

const store = useProcessManagerStore();
const selectedProcess = ref<Process | null>(null);

// 初始化监听器和扫描
onMounted(() => {
  store.initializeEventListeners();
});

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
