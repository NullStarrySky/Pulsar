<!-- src/features/ProcessManager/components/TerminalModel.vue -->
<template>
  <Dialog :open="true" @update:open="handleOpenChange">
    <DialogContent
      class="p-0 gap-0 max-w-4xl h-[80vh] flex flex-col overflow-hidden outline-none"
    >
      <!-- 头部：使用 shadcn 风格 -->
      <DialogHeader
        class="px-4 py-3 border-b border-border flex flex-row items-center justify-between space-y-0 bg-background"
      >
        <div class="flex items-center gap-2">
          <TerminalIcon class="w-4 h-4 text-muted-foreground" />
          <DialogTitle class="text-sm font-medium">
            Process: {{ process.name }}
          </DialogTitle>
        </div>

        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs gap-1.5"
            @click="copyContent"
          >
            <Copy class="w-3.5 h-3.5" />
            <span class="sr-only sm:not-sr-only">Copy</span>
          </Button>
          <!-- Dialog 内置的关闭按钮通常在右上角，这里我们可以保留一个显式的关闭按钮，或者依赖右上角的 X -->
        </div>
      </DialogHeader>

      <!-- 终端容器：黑色背景，填满剩余空间 -->
      <div class="flex-1 bg-[#1a1b26] p-2 overflow-hidden relative min-h-0">
        <div ref="terminalContainer" class="h-full w-full"></div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import type { PropType } from "vue";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import type { Process } from "@/features/ProcessManager/ProcessManager.store";

// Shadcn 组件
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
// 图标
import { Copy, Terminal as TerminalIcon } from "lucide-vue-next";

const props = defineProps({
  process: {
    type: Object as PropType<Process>,
    required: true,
  },
});

const emit = defineEmits(["close"]);

const terminalContainer = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;

// 处理 Dialog 关闭事件（点击遮罩层或按 ESC）
const handleOpenChange = (isOpen: boolean) => {
  if (!isOpen) {
    emit("close");
  }
};

onMounted(async () => {
  // 确保 DOM 已渲染，且 Dialog 动画已开始，容器有了尺寸
  await nextTick();

  // 使用 requestAnimationFrame 稍微延迟，确保容器在这个 tick 中已经有了确切的宽高
  requestAnimationFrame(() => {
    if (!terminalContainer.value) return;

    term = new Terminal({
      convertEol: true,
      disableStdin: true, // 只读
      cursorBlink: false,
      fontSize: 13, // 稍微调小一点字体使其看起来更精致
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      theme: {
        background: "#1a1b26", // Tokyo Night Dark 风格背景
        foreground: "#a9b1d6",
        cursor: "#c0caf5",
        selectionBackground: "#33467c",
      },
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalContainer.value);
    fitAddon.fit();

    // 监听窗口大小变化以重新适应终端尺寸
    window.addEventListener("resize", handleResize);

    // 加载历史输出
    // 建议：如果 process.output 非常大，这里可能需要优化（比如只显示最后1000行）
    props.process.output.forEach((line) => term?.writeln(line));

    // 滚动到底部
    term.scrollToBottom();
  });
});

const handleResize = () => {
  fitAddon?.fit();
};

// 监听输出变化，实时更新终端
watch(
  () => props.process.output.length,
  (newLen, oldLen) => {
    if (term && newLen > oldLen) {
      // 写入新增的行
      for (let i = oldLen; i < newLen; i++) {
        term.writeln(props.process.output[i]);
      }
      term.scrollToBottom();
    }
  }
);

const copyContent = () => {
  if (term?.hasSelection()) {
    navigator.clipboard.writeText(term.getSelection());
  } else {
    // 如果没有选中内容，可选：复制全部内容
    // term.selectAll();
    // navigator.clipboard.writeText(term.getSelection());
    // term.clearSelection();
  }
};

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  term?.dispose();
});
</script>
