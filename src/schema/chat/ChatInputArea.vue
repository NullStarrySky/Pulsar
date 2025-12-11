<script setup lang="ts">
import { ref, computed } from "vue";
import { type role } from "../shared.types.ts";
import { useLocalStorage } from "@vueuse/core";
import { isMobile } from "@/utils/platform"; // 导入
import {
  Paperclip,
  Sparkles,
  X,
  Globe,
  CornerDownLeft,
  ChevronDown,
  Bot,
  User,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{
  (
    e: "send",
    content: string,
    files: File[],
    role: role,
    generate: boolean
  ): void;
  (e: "polish", content: string, role: role): void;
}>();

const mobile = isMobile(); // 移动端状态
const newMessage = ref("");
const attachedFiles = ref<File[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);

type SendKeyMode = "enter" | "ctrl-enter";
const sendKeyMode = useLocalStorage<SendKeyMode>("chat-send-key-mode", "enter");

const canSend = computed(
  () => newMessage.value.trim().length > 0 || attachedFiles.value.length > 0
);

function triggerFileInput() {
  fileInput.value?.click();
}
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files) attachedFiles.value.push(...Array.from(target.files));
}

function handleSendAction(
  targetRole: role = "user",
  shouldGenerate: boolean = true
) {
  if (!canSend.value || props.disabled) return;
  emit(
    "send",
    newMessage.value,
    [...attachedFiles.value],
    targetRole,
    shouldGenerate
  );
  newMessage.value = "";
  attachedFiles.value = [];
  if (fileInput.value) fileInput.value.value = "";
}

function handleKeydown(e: KeyboardEvent) {
  if (mobile) return; // 移动端通常不使用键盘快捷键发送，依赖软键盘回车或点击按钮
  if (e.key === "Enter") {
    if (
      sendKeyMode.value === "enter" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      e.preventDefault();
      handleSendAction("user", true);
    } else if (sendKeyMode.value === "ctrl-enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendAction("user", true);
    }
  }
}

// 适配 Placeholder
const placeholderText = computed(() => {
  if (mobile) return "输入消息...";
  return sendKeyMode.value === "enter"
    ? "输入消息，按 Enter 发送..."
    : "输入消息，按 Ctrl + Enter 发送...";
});

const setDraft = (text: string) => {
  newMessage.value = text;
};
defineExpose({ setDraft });
</script>

<template>
  <!-- 适配：移动端 px-0, 桌面端 px-4 -->
  <div
    class="relative w-full max-w-4xl mx-auto z-20"
    :class="mobile ? 'px-0' : 'px-4 pb-6 pt-2'"
  >
    <!-- 悬浮岛容器 -->
    <!-- 适配：移动端减小圆角，去除边框使其与键盘融合更好，或保留微边框 -->
    <div
      class="relative flex flex-col overflow-hidden bg-background/80 backdrop-blur-sm shadow-xl transition-all duration-300 ring-1 ring-border/50 focus-within:ring-primary/30 focus-within:border-primary/50"
      :class="mobile ? 'rounded-2xl border-t' : 'border rounded-3xl'"
    >
      <!-- 文件预览区 -->
      <div
        v-if="attachedFiles.length > 0"
        class="flex flex-wrap gap-2 px-4 pt-4"
      >
        <Badge
          v-for="(file, i) in attachedFiles"
          :key="i"
          variant="secondary"
          class="pl-2 pr-1 h-7 animate-in fade-in zoom-in duration-200"
        >
          <span class="max-w-[120px] truncate text-xs">{{ file.name }}</span>
          <button
            class="ml-1 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground transition-colors"
            @click="attachedFiles.splice(i, 1)"
          >
            <X class="w-3 h-3" />
          </button>
        </Badge>
      </div>

      <!-- 输入区域 -->
      <Textarea
        v-model="newMessage"
        :placeholder="placeholderText"
        class="w-full resize-none border-0 bg-transparent focus-visible:ring-0 px-5 py-4 min-h-[50px] max-h-[200px] text-base leading-relaxed placeholder:text-muted-foreground/40 scrollbar-hide"
        rows="1"
        @keydown="handleKeydown"
      />

      <!-- 底部工具栏 -->
      <div class="flex items-center justify-between px-3 pb-3 mt-1 select-none">
        <!-- 左侧：工具与模型 -->
        <div class="flex items-center gap-1">
          <!-- 移动端可以隐藏非必要的分隔符以节省空间 -->
          <!-- <Separator v-if="!mobile" orientation="vertical" class="h-4 mx-1" /> -->

          <!-- 功能按钮组 -->
          <TooltipProvider :delay-duration="300" :disabled="mobile">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
                >
                  <Globe class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>联网搜索</TooltipContent>
            </Tooltip>

            <input
              ref="fileInput"
              type="file"
              multiple
              class="hidden"
              @change="handleFileSelect"
            />
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
                  @click="triggerFileInput"
                >
                  <Paperclip class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>上传附件</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 rounded-full text-muted-foreground hover:text-purple-500"
                  :disabled="!newMessage.trim()"
                  @click="emit('polish', newMessage, 'user')"
                >
                  <Sparkles class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI 润色</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <!-- 右侧：发送组合按钮 -->
        <div class="flex items-center gap-2">
          <!-- 字符计数 -->
          <span
            v-if="newMessage.length > 0"
            class="text-[10px] text-muted-foreground animate-in fade-in"
          >
            {{ newMessage.length }}
          </span>

          <!-- 分裂按钮 -->
          <div
            class="flex items-center bg-primary text-primary-foreground rounded-[14px] p-0.5 pl-1 shadow-md hover:shadow-lg transition-all duration-200"
          >
            <!-- 主按钮 -->
            <Button
              variant="ghost"
              size="sm"
              :disabled="!canSend"
              class="h-8 rounded-l-[12px] rounded-r-none px-3 hover:bg-primary-foreground/10 text-primary-foreground disabled:text-primary-foreground/50"
              @click="handleSendAction('user', true)"
            >
              <!-- 移动端只显示图标或精简文字 -->
              <CornerDownLeft
                v-if="!mobile && sendKeyMode === 'enter'"
                class="w-4 h-4 mr-2"
              />
              <span>发送</span>
            </Button>

            <Separator
              orientation="vertical"
              class="h-4 bg-primary-foreground/20"
            />

            <!-- 下拉菜单触发器 -->
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-7 rounded-r-[12px] rounded-l-none hover:bg-primary-foreground/10 text-primary-foreground"
                >
                  <ChevronDown class="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-56 p-1">
                <DropdownMenuLabel
                  class="text-xs text-muted-foreground px-2 py-1.5"
                  >发送设置</DropdownMenuLabel
                >
                <DropdownMenuRadioGroup v-if="!mobile" v-model="sendKeyMode">
                  <DropdownMenuRadioItem value="enter" class="text-xs"
                    >按 Enter 键发送</DropdownMenuRadioItem
                  >
                  <DropdownMenuRadioItem value="ctrl-enter" class="text-xs"
                    >按 Ctrl + Enter 键发送</DropdownMenuRadioItem
                  >
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator v-if="!mobile" />

                <DropdownMenuLabel
                  class="text-xs text-muted-foreground px-2 py-1.5"
                  >高级操作</DropdownMenuLabel
                >
                <DropdownMenuItem @click="handleSendAction('assistant', false)">
                  <Bot class="w-3.5 h-3.5 mr-2 text-purple-500" />
                  <span>添加 AI 消息</span>
                  <span
                    class="ml-auto text-[10px] text-muted-foreground border px-1 rounded"
                    >不生成</span
                  >
                </DropdownMenuItem>
                <DropdownMenuItem @click="handleSendAction('user', false)">
                  <User class="w-3.5 h-3.5 mr-2 text-blue-500" />
                  <span>添加用户消息</span>
                  <span
                    class="ml-auto text-[10px] text-muted-foreground border px-1 rounded"
                    >不生成</span
                  >
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
