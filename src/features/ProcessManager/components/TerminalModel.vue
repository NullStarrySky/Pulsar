<!-- src/features/ProcessManager/components/TerminalModel.vue -->
<template>
  <Dialog :open="true" @update:open="handleOpenChange">
    <DialogContent
      class="p-0 gap-0 max-w-6xl h-[80vh] flex flex-col overflow-hidden outline-none [&>button]:hidden"
    >
      <!-- 头部：使用 shadcn 风格 -->
      <DialogHeader
        class="px-4 py-3 border-b border-border flex flex-row items-center justify-between space-y-0 bg-background"
      >
        <div class="flex items-center gap-2">
          <TerminalIcon class="w-4 h-4 text-muted-foreground" />
          <DialogTitle class="text-sm font-medium">
            进程: {{ process.name }}
          </DialogTitle>
        </div>

        <div class="flex items-center gap-2">
          <!-- 这里的按钮不会被上面的 hidden 样式影响，因为它在 header 内部 -->
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs gap-1.5"
            @click="copyContent"
          >
            <Copy class="w-3.5 h-3.5" />
            <span class="sr-only sm:not-sr-only">复制</span>
          </Button>

          <!-- 如果你需要显式的关闭按钮，可以在这里自己加一个 Button @click="emit('close')" -->
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
  await nextTick();

  requestAnimationFrame(() => {
    if (!terminalContainer.value) return;

    term = new Terminal({
      convertEol: true,
      disableStdin: true, // 只读
      cursorBlink: false,
      fontSize: 13,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      theme: {
        background: "#1a1b26",
        foreground: "#a9b1d6",
        cursor: "#c0caf5",
        selectionBackground: "#33467c",
      },
      // 允许 WebGL 渲染可能有助于性能，但基础 DOM 渲染对样式控制更稳
      allowProposedApi: true,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalContainer.value);
    fitAddon.fit();

    window.addEventListener("resize", handleResize);

    props.process.output.forEach((line) => term?.writeln(line));
    term.scrollToBottom();
  });
});

const handleResize = () => {
  fitAddon?.fit();
};

watch(
  () => props.process.output.length,
  (newLen, oldLen) => {
    if (term && newLen > oldLen) {
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
    // 简单的全选复制逻辑
    term?.selectAll();
    navigator.clipboard.writeText(term?.getSelection() || "");
    term?.clearSelection();
  }
};

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  term?.dispose();
});
</script>

<style scoped>
/*
  修复 xterm 滚动条样式
  xterm 动态生成的元素不在 Vue 模板中，需要使用 :deep() 穿透
*/
:deep(.xterm-viewport) {
  /* 确保在需要时显示滚动条 */
  overflow-y: auto !important;
}

/* 滚动条整体宽度 */
:deep(.xterm-viewport::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}

/* 滚动条轨道：透明或匹配背景色 */
:deep(.xterm-viewport::-webkit-scrollbar-track) {
  background-color: transparent;
}

/* 滚动条滑块：深蓝色，圆角 */
:deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background-color: #33467c;
  border-radius: 5px;
  border: 2px solid #1a1b26; /* 增加边框让滑块看起来更细 */
}

/* 滚动条滑块悬停 */
:deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background-color: #565f89;
}

/* 适配 Firefox */
:deep(.xterm-viewport) {
  scrollbar-width: thin;
  scrollbar-color: #33467c #1a1b26;
}
</style>
