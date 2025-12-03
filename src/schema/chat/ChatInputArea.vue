<!-- src/schema/chat/ChatInputArea.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import { type role } from "../shared.types.ts";
import {
  Paperclip,
  Send,
  Sparkles,
  X,
  User,
  Bot,
  Cog,
  Wand2,
  ChevronDown,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const props = defineProps<{
  disabled?: boolean;
}>();

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

const newMessage = ref("");
const newMessageRole = ref<role>("user");
const attachedFiles = ref<File[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);

// 角色对应的样式和配置
const roleConfig = {
  user: {
    icon: User,
    label: "用户",
    colorClass: "ring-primary/20 focus-within:ring-primary/50",
  },
  assistant: {
    icon: Bot,
    label: "助手",
    colorClass: "ring-purple-500/20 focus-within:ring-purple-500/50",
  },
  system: {
    icon: Cog,
    label: "系统",
    colorClass: "ring-slate-500/20 focus-within:ring-slate-500/50",
  },
};

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

function handleSend(generate: boolean = false) {
  if (!canSend.value || props.disabled) return;

  // 如果是用户发送，默认触发生成；如果是替助手/系统发，默认不生成（除非强制）
  const shouldGenerate = generate || newMessageRole.value === "user";

  emit(
    "send",
    newMessage.value,
    [...attachedFiles.value],
    newMessageRole.value,
    shouldGenerate
  );

  newMessage.value = "";
  attachedFiles.value = [];
  if (fileInput.value) fileInput.value.value = "";
}

const setDraft = (text: string) => {
  newMessage.value = text;
};
defineExpose({ setDraft });
</script>

<template>
  <div class="relative w-full max-w-4xl mx-auto px-4 pb-6 pt-2 z-20">
    <!-- 悬浮岛容器 -->
    <div
      class="relative flex flex-col bg-background shadow-xl border rounded-2xl transition-all duration-300 ring-1"
      :class="[
        roleConfig[newMessageRole].colorClass,
        disabled ? 'opacity-60 pointer-events-none' : '',
      ]"
    >
      <!-- 文件预览区 -->
      <div
        v-if="attachedFiles.length > 0"
        class="flex flex-wrap gap-2 px-3 pt-3"
      >
        <Badge
          v-for="(file, i) in attachedFiles"
          :key="i"
          variant="secondary"
          class="pl-2 pr-1 h-7"
        >
          <span class="max-w-[120px] truncate text-xs">{{ file.name }}</span>
          <button
            class="ml-1 hover:text-destructive"
            @click="attachedFiles.splice(i, 1)"
          >
            <X class="w-3 h-3" />
          </button>
        </Badge>
      </div>

      <!-- 输入区域 -->
      <Textarea
        v-model="newMessage"
        placeholder="输入消息..."
        class="w-full resize-none border-0 bg-transparent focus-visible:ring-0 px-4 py-3 min-h-[52px] max-h-[200px] text-base"
        rows="1"
        @keydown.enter.exact.prevent="handleSend(false)"
      />

      <!-- 底部工具栏 -->
      <div class="flex items-center justify-between px-2 pb-2 mt-1">
        <!-- 左侧：功能区 -->
        <div class="flex items-center gap-1">
          <!-- 身份切换 -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="sm"
                class="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
              >
                <component
                  :is="roleConfig[newMessageRole].icon"
                  class="w-4 h-4"
                />
                <span class="text-xs font-medium">{{
                  roleConfig[newMessageRole].label
                }}</span>
                <ChevronDown class="w-3 h-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>发送身份</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                v-for="(cfg, r) in roleConfig"
                :key="r"
                @click="newMessageRole = r as role"
              >
                <component :is="cfg.icon" class="mr-2 h-4 w-4" />
                {{ cfg.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <!-- 附件按钮 -->
          <input
            ref="fileInput"
            type="file"
            multiple
            class="hidden"
            @change="handleFileSelect"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-muted-foreground"
                  @click="triggerFileInput"
                >
                  <Paperclip class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>上传文件</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- 润色按钮 -->
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-muted-foreground hover:text-purple-500"
                  :disabled="!newMessage.trim()"
                  @click="emit('polish', newMessage, newMessageRole)"
                >
                  <Wand2 class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI 润色</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <!-- 右侧：发送按钮 -->
        <Button
          size="sm"
          :disabled="!canSend"
          class="h-8 rounded-lg gap-2 transition-all duration-200"
          :class="newMessageRole === 'user' ? 'w-24' : 'w-auto px-3'"
          @click="handleSend(false)"
        >
          <span v-if="newMessageRole === 'user'">发送</span>
          <Send v-if="newMessageRole === 'user'" class="w-3.5 h-3.5" />
          <span v-else>插入</span>
          <Sparkles v-if="newMessageRole !== 'user'" class="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>

    <div class="text-center mt-2">
      <span class="text-[10px] text-muted-foreground/40"
        >Shift + Enter 换行</span
      >
    </div>
  </div>
</template>
