<script lang="ts">
import { type InjectionKey, type Ref, inject } from "vue";
import type { FlatChatMessage } from "./chat.types";
export interface MessageContext {
  message: Ref<FlatChatMessage>;
  index: Ref<number>;
  updateContent: (newContent: string) => void;
  dispatchAction: (action: string) => void;
}
export const MessageContextKey: InjectionKey<MessageContext> =
  Symbol("MessageContext");
export function useMessageContext() {
  const context = inject(MessageContextKey);
  if (!context) throw new Error("useMessageContext missing");
  return context;
}
</script>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  type Component,
  ref,
  provide,
  toRef,
} from "vue";
import { type role } from "../shared.types";
import { isMobile } from "@/utils/platform"; // 导入

// UI Components
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  GitBranchPlus,
  Volume2,
  Check,
  Plus,
  Tag,
} from "lucide-vue-next";
import { useClipboard } from "@vueuse/core";

const MarkdownRender = defineAsyncComponent(() => import("markstream-vue"));

const props = defineProps<{
  message: FlatChatMessage;
  index: number;
  avatarSrc: string;
}>();

const emit = defineEmits<{
  (e: "update-content", content: string): void;
  (e: "switch-alt", altIndex: number): void;
  (e: "action", action: string): void;
  (e: "rename", name: string): void;
}>();

// --- Logic ---
const mobile = isMobile(); // 移动端判断
const isEditing = ref(false);
const editingContent = ref("");
const { copy, copied } = useClipboard({ legacy: true });

function startEdit() {
  const content = props.message.content;
  if (content.type === "message") {
    editingContent.value = content.content;
    isEditing.value = true;
  }
}

function saveEdit() {
  if (
    props.message.content.type === "message" &&
    editingContent.value !== props.message.content.content
  ) {
    emit("update-content", editingContent.value);
  }
  isEditing.value = false;
}

function handleCopy() {
  if (props.message.content.type === "message") {
    copy(props.message.content.content);
  }
}

// Provide Context (保持不变)
const messageRef = toRef(props, "message");
const indexRef = toRef(props, "index");
provide(MessageContextKey, {
  message: messageRef,
  index: indexRef,
  updateContent: (c) => emit("update-content", c),
  dispatchAction: (a) => emit("action", a),
});

const roleIcons: Record<role, Component> = {
  user: User,
  assistant: Bot,
  system: Cog,
};

const bubbleContainerClass = computed(() => {
  if (props.message.role === "user") return "flex-row-reverse";
  return "flex-row";
});

const contentContainerClass = computed(() => {
  if (props.message.role === "user")
    return "bg-secondary/50 text-secondary-foreground rounded-[20px] rounded-tr-md";
  return "bg-transparent px-0";
});

const hasBranches = computed(() => props.message.availableAlternativeCount > 1);
const isRenameOpen = ref(false);
const renameInput = ref("");

function openRenameDialog() {
  renameInput.value = props.message.content.name || "";
  isRenameOpen.value = true;
}

function saveRename() {
  emit("rename", renameInput.value);
  isRenameOpen.value = false;
}
</script>

<template>
  <!-- 适配：移动端减少 gap -->
  <div
    class="group flex w-full mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
    :class="[bubbleContainerClass, mobile ? 'gap-2' : 'gap-4']"
  >
    <!-- 1. 头像 -->
    <div class="shrink-0 mt-0.5">
      <!-- 适配：移动端头像缩小 -->
      <Avatar
        class="shadow-sm border bg-background/50 backdrop-blur-sm"
        :class="mobile ? 'h-7 w-7' : 'h-9 w-9'"
      >
        <AvatarImage v-if="message.role !== 'user'" :src="avatarSrc" />
        <AvatarFallback class="bg-muted">
          <component :is="roleIcons[message.role]" class="h-5 w-5 opacity-70" />
        </AvatarFallback>
      </Avatar>
    </div>

    <!-- 2. 内容区域 -->
    <!-- 适配：移动端最大宽度增加，保证阅读体验 -->
    <div
      class="flex flex-col relative"
      :class="
        mobile
          ? 'max-w-[95%] min-w-[120px]'
          : 'max-w-[90%] lg:max-w-[85%] min-w-[200px]'
      "
    >
      <!-- 消息头：角色名 -->
      <div
        v-if="message.role !== 'user'"
        class="flex items-center gap-2 mb-1.5 px-1"
      >
        <span class="text-sm font-semibold opacity-90">{{
          (message.content.type === "message" &&
            message.content.metaGenerateInfo?.renderInfo.characterName) ||
          "助手角色"
        }}</span>
        <span
          v-if="
            message.content.type === 'message' &&
            message.content.metaGenerateInfo?.modelName
          "
          class="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-sm border border-transparent"
        >
          {{ message.content.metaGenerateInfo.modelName }}
        </span>
      </div>

      <!-- 气泡本体 -->
      <div
        class="relative transition-all duration-200 group/bubble"
        :class="[
          contentContainerClass,
          isEditing ? 'ring-2 ring-ring ring-offset-2 rounded-lg' : '',
        ]"
      >
        <!-- A. 编辑模式 -->
        <div
          v-if="isEditing"
          class="p-3 bg-background border rounded-lg shadow-lg"
        >
          <Textarea
            v-model="editingContent"
            class="min-h-[100px] bg-transparent border-0 focus-visible:ring-0 p-0 leading-relaxed resize-none"
            auto-focus
            @keydown.ctrl.enter="saveEdit"
          />
          <div class="flex justify-end gap-2 mt-2 pt-2 border-t">
            <Button
              size="sm"
              variant="ghost"
              class="h-7 text-xs"
              @click="isEditing = false"
              >取消</Button
            >
            <Button size="sm" class="h-7 text-xs" @click="saveEdit"
              >保存</Button
            >
          </div>
        </div>

        <!-- B. 阅读模式 -->
        <div
          v-else
          :class="[
            message.role === 'user' ? 'px-4 py-2 user-bubble' : 'py-1',
            'h-fit',
          ]"
        >
          <div v-if="message.content.type === 'message'">
            <MarkdownRender
              :content="message.content.content || '...'"
              class="prose dark:prose-invert prose-neutral max-w-none text-[15px] leading-6 wrap-break-word"
            />
          </div>
          <div
            v-else
            class="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-dashed"
          >
            <GitBranchPlus class="w-4 h-4 text-muted-foreground" />
            <span class="text-sm text-muted-foreground"
              >分支节点: {{ message.content.name || "未命名" }}</span
            >
          </div>
        </div>
      </div>

      <!-- C. 底部/悬浮 操作栏 -->
      <!-- 适配：关键修改，mobile ? 'opacity-100' : 'group-hover:opacity-100' -->
      <div
        class="flex items-center gap-1 mt-1 transition-opacity duration-200"
        :class="[
          message.role === 'user' ? 'justify-end' : 'justify-start',
          mobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        ]"
      >
        <!-- 分支切换 -->
        <div
          v-if="hasBranches"
          class="flex items-center gap-0.5 h-6 select-none animate-in fade-in duration-300"
        >
          <button
            class="flex items-center justify-center h-8 w-6 sm:h-6 sm:w-5 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            :disabled="message.activeAlternative === 0"
            @click="$emit('switch-alt', message.activeAlternative - 1)"
          >
            <ChevronLeft class="w-3.5 h-3.5" />
          </button>

          <span
            class="text-xs font-mono text-muted-foreground/80 min-w-8 text-center leading-none pt-0.5"
          >
            {{ message.activeAlternative + 1 }}/{{
              message.availableAlternativeCount
            }}
          </span>

          <button
            class="flex items-center justify-center h-8 w-6 sm:h-6 sm:w-5 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            :disabled="
              message.activeAlternative >= message.availableAlternativeCount - 1
            "
            @click="$emit('switch-alt', message.activeAlternative + 1)"
          >
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- 快捷操作按钮 -->
        <div class="flex items-center gap-0.5">
          <!-- 移动端如果不方便点击，可以考虑隐藏部分不常用的，只保留更多菜单，这里保留全部但增大触摸区域 -->
          <TooltipProvider :disabled="mobile">
            <!-- 移动端禁用 tooltip 防止遮挡 -->
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 sm:h-6 sm:w-6 md:h-6 md:w-6 text-muted-foreground/60 hover:text-foreground"
                  @click="handleCopy"
                >
                  <Check v-if="copied" class="w-3.5 h-3.5 text-green-500" />
                  <Copy v-else class="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>复制</TooltipContent>
            </Tooltip>

            <Tooltip v-if="message.role === 'assistant'">
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                  @click="$emit('action', 'regenerate')"
                >
                  <RotateCcw class="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>重新生成</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                  @click="$emit('action', 'add-new')"
                >
                  <Plus class="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>新建版本</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                  @click="startEdit"
                >
                  <Edit2 class="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- 更多菜单 -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-6 w-6 text-muted-foreground/60 hover:text-foreground ml-1"
              >
                <MoreHorizontal class="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-48">
              <DropdownMenuItem @click="startEdit"
                ><Edit2 class="mr-2 h-4 w-4" /> 编辑</DropdownMenuItem
              >
              <DropdownMenuItem @click="openRenameDialog"
                ><Tag class="mr-2 h-4 w-4" /> 重命名</DropdownMenuItem
              >
              <DropdownMenuItem @click="handleCopy"
                ><Copy class="mr-2 h-4 w-4" /> 复制</DropdownMenuItem
              >
              <DropdownMenuItem
                ><Volume2 class="mr-2 h-4 w-4" /> 语音朗读</DropdownMenuItem
              >
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="$emit('action', 'regenerate')"
                ><RotateCcw class="mr-2 h-4 w-4" /> 重新生成</DropdownMenuItem
              >
              <DropdownMenuItem @click="$emit('action', 'branch')"
                ><GitBranchPlus class="mr-2 h-4 w-4" />
                创建分支</DropdownMenuItem
              >
              <DropdownMenuSeparator />
              <DropdownMenuItem
                class="text-destructive focus:text-destructive"
                @click="$emit('action', 'delete')"
                ><Trash2 class="mr-2 h-4 w-4" /> 删除</DropdownMenuItem
              >
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  </div>

  <!-- 重命名 Dialog 保持不变 -->
  <Dialog v-model:open="isRenameOpen">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>重命名节点</DialogTitle>
        <DialogDescription
          >为当前消息版本或分支设置一个名称。</DialogDescription
        >
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="name" class="text-right">名称</Label>
          <Input
            id="name"
            v-model="renameInput"
            class="col-span-3"
            placeholder="例如：正式版 V1"
            @keydown.enter="saveRename"
            auto-focus
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="isRenameOpen = false">取消</Button>
        <Button @click="saveRename">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
:deep(.prose > :first-child) {
  margin-top: 0 !important;
}
:deep(.prose > :last-child) {
  margin-bottom: 0 !important;
}
.user-bubble :deep(.prose p) {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
:deep(.prose ol) {
  list-style-type: decimal;
  padding-left: 1.2em;
}
:deep(.prose ul) {
  list-style-type: disc;
  padding-left: 1.2em;
}
</style>
