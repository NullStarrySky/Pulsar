<!-- src/schema/chat/ChatBubble.vue -->
<script setup lang="ts">
import { computed, type Component } from "vue";
import { type FlatChatMessage } from "./chat.types";
import { type role } from "../shared.types";

// Components
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import MarkdownRender from "markstream-vue";

// Icons
import {
  User,
  Bot,
  Cog,
  Edit2,
  RotateCcw,
  Copy,
  Trash2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Save,
  GitBranchPlus,
  Wand2,
  GitFork,
  MessageSquarePlus,
} from "lucide-vue-next";

const props = defineProps<{
  message: FlatChatMessage;
  index: number;
  isEditing: boolean;
  avatarSrc: string;
}>();

const emit = defineEmits<{
  (e: "edit-start", index: number): void;
  (e: "edit-cancel"): void;
  (e: "edit-save"): void;
  (e: "update:editingContent", content: string): void;
  (e: "switch-alt", index: number, altIndex: number): void;
  (e: "action", action: string, index: number): void;
}>();

const roleIcons: Record<role, Component> = {
  user: User,
  assistant: Bot,
  system: Cog,
};

// 样式映射
const bubbleVariants = {
  user: "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm",
  assistant:
    "bg-card text-card-foreground border shadow-sm rounded-2xl rounded-tl-sm",
  system: "bg-muted text-muted-foreground border-2 border-dashed rounded-xl",
};

// 本地编辑内容绑定
const localEditContent = computed({
  get: () =>
    props.message.content.type === "message"
      ? props.message.content.content
      : "", // 简化处理，实际应从父组件传入
  set: (val) => emit("update:editingContent", val),
});

// 分支导航逻辑
const hasBranches = computed(() => props.message.availableAlternativeCount > 1);
const currentBranchInfo = computed(
  () =>
    `${props.message.activeAlternative + 1} / ${
      props.message.availableAlternativeCount
    }`
);

function handleAction(action: string) {
  emit("action", action, props.index);
}
</script>

<template>
  <div
    class="group flex w-full mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 gap-3"
    :class="{
      'flex-row-reverse': message.role === 'user',
      'flex-row': message.role !== 'user',
    }"
  >
    <!-- 1. 头像 -->
    <div class="shrink-0 mt-1">
      <Avatar class="h-8 w-8 shadow-sm border bg-background">
        <AvatarImage v-if="message.role !== 'user'" :src="avatarSrc" />
        <AvatarFallback class="bg-muted">
          <component :is="roleIcons[message.role]" class="h-4 w-4 opacity-70" />
        </AvatarFallback>
      </Avatar>
    </div>

    <!-- 2. 内容区域 -->
    <div class="flex flex-col max-w-[85%] lg:max-w-[75%] min-w-[200px]">
      <!-- 消息元信息 (角色名) -->
      <div
        class="flex items-center gap-2 mb-1 px-1 text-xs text-muted-foreground opacity-70"
        :class="{ 'flex-row-reverse': message.role === 'user' }"
      >
        <span class="capitalize font-medium">{{ message.role }}</span>
        <span
          v-if="
            message.role === 'assistant' &&
            message.content.type === 'message' &&
            message.content.metaGenerateInfo?.modelName
          "
          class="text-[10px] border px-1 rounded bg-background/50"
        >
          {{ message.content.metaGenerateInfo.modelName }}
        </span>
      </div>

      <!-- 气泡本体 -->
      <div
        class="relative overflow-hidden transition-all duration-200"
        :class="[
          bubbleVariants[message.role],
          isEditing ? 'ring-2 ring-ring ring-offset-2' : '',
        ]"
      >
        <!-- A. 编辑模式 -->
        <div
          v-if="isEditing"
          class="p-3 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60"
        >
          <Textarea
            v-model="localEditContent"
            class="min-h-[150px] resize-y bg-transparent border-0 focus-visible:ring-0 p-0 leading-relaxed"
            placeholder="输入消息内容..."
          />
          <div
            class="flex justify-end gap-2 mt-3 pt-2 border-t border-border/10"
          >
            <Button
              size="sm"
              variant="ghost"
              class="h-7 px-3 text-xs"
              @click="$emit('edit-cancel')"
              >取消</Button
            >
            <Button
              size="sm"
              class="h-7 px-3 text-xs"
              @click="$emit('edit-save')"
            >
              <Save class="w-3 h-3 mr-1.5" />保存
            </Button>
          </div>
        </div>

        <!-- B. 阅读模式 -->
        <div v-else class="px-5 py-3.5">
          <div v-if="message.content.type === 'message'">
            <MarkdownRender
              :content="
                message.content.content ||
                '<span class=\'opacity-50 italic\'>（空消息）</span>'
              "
              class="prose dark:prose-invert prose-sm md:prose-base max-w-none wrap-break-word leading-relaxed"
              :class="{ 'prose-invert': message.role === 'user' }"
            />
          </div>
          <div
            v-else
            class="flex items-center gap-2 p-2 rounded bg-muted/20 border border-dashed border-white/20"
          >
            <GitBranchPlus class="w-4 h-4" />
            <span class="text-sm font-medium"
              >分支节点: {{ message.content.name || "未命名" }}</span
            >
          </div>
        </div>
      </div>

      <!-- 3. 底部工具栏 (分支 + 操作) -->
      <div
        class="flex items-center justify-between mt-1.5 px-1 h-6"
        :class="{ 'flex-row-reverse': message.role === 'user' }"
      >
        <!-- 分支切换器 -->
        <div
          class="flex items-center gap-1 transition-opacity duration-200"
          :class="
            hasBranches ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          "
        >
          <div
            v-if="hasBranches"
            class="flex items-center bg-background/80 border rounded-md shadow-sm h-6"
          >
            <button
              class="px-1 hover:bg-muted text-muted-foreground disabled:opacity-30 transition-colors h-full flex items-center"
              :disabled="message.activeAlternative === 0"
              @click="$emit('switch-alt', index, message.activeAlternative - 1)"
            >
              <ChevronLeft class="w-3 h-3" />
            </button>
            <span
              class="text-[10px] font-mono px-1.5 select-none min-w-[3ch] text-center text-foreground/80"
            >
              {{ currentBranchInfo }}
            </span>
            <button
              class="px-1 hover:bg-muted text-muted-foreground disabled:opacity-30 transition-colors h-full flex items-center"
              :disabled="
                message.activeAlternative >=
                message.availableAlternativeCount - 1
              "
              @click="$emit('switch-alt', index, message.activeAlternative + 1)"
            >
              <ChevronRight class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- 操作按钮组 -->
        <div
          class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <!-- 常用操作 -->
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 text-muted-foreground"
                  @click="$emit('edit-start', index)"
                >
                  <Edit2 class="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑</TooltipContent>
            </Tooltip>

            <Tooltip v-if="message.role === 'assistant'">
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 text-muted-foreground"
                  @click="handleAction('regenerate')"
                >
                  <RotateCcw class="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>重新生成</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- 更多操作下拉菜单 -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-6 w-6 text-muted-foreground"
              >
                <MoreHorizontal class="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-40">
              <DropdownMenuItem @click="handleAction('branch')">
                <GitBranchPlus class="mr-2 h-4 w-4" /> 创建分支
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleAction('polish')">
                <Wand2 class="mr-2 h-4 w-4" /> 润色内容
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleAction('fork')">
                <GitFork class="mr-2 h-4 w-4" /> 复刻版本
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleAction('insert')">
                <MessageSquarePlus class="mr-2 h-4 w-4" /> 插入消息
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleAction('copy')">
                <Copy class="mr-2 h-4 w-4" /> 复制内容
              </DropdownMenuItem>
              <DropdownMenuItem
                class="text-destructive focus:text-destructive"
                @click="handleAction('delete')"
              >
                <Trash2 class="mr-2 h-4 w-4" /> 删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  </div>
</template>
