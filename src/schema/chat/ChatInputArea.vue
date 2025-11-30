<!-- src/schema/chat/ChatInputArea.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import { type role } from "../shared.types.ts";
import {
  Paperclip,
  Send,
  X,
  User,
  Bot,
  Cog,
  Sparkles,
  PanelTopClose,
  PanelTopOpen,
  Wand2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

// 定义 Props 和 Emits，解耦具体业务
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
const isCollapsed = ref(false);

const roleIcons: Record<role, any> = {
  user: User,
  assistant: Bot,
  system: Cog,
};

const canSend = computed(
  () => newMessage.value.trim().length > 0 || attachedFiles.value.length > 0
);

function triggerFileInput() {
  fileInput.value?.click();
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files) {
    attachedFiles.value.push(...Array.from(target.files));
  }
}

function removeAttachment(index: number) {
  attachedFiles.value.splice(index, 1);
}

function handleSend(generate: boolean = false) {
  if (!canSend.value || props.disabled) return;

  emit(
    "send",
    newMessage.value,
    [...attachedFiles.value],
    newMessageRole.value,
    generate
  );

  // Reset
  newMessage.value = "";
  attachedFiles.value = [];
  if (fileInput.value) fileInput.value.value = "";
}
function handlePolish() {
  if (!newMessage.value.trim() || props.disabled) return;
  emit("polish", newMessage.value, newMessageRole.value);
}

// 暴露给父组件的方法
const setDraft = (text: string) => {
  newMessage.value = text;
};

defineExpose({
  setDraft,
});
</script>

<template>
  <div class="relative border-t p-4 pt-5">
    <TooltipProvider :delay-duration="200">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="outline"
            size="icon"
            class="absolute left-4 -top-[1.1rem] z-10 h-8 w-8 rounded-full bg-background"
            @click="isCollapsed = !isCollapsed"
          >
            <PanelTopClose v-if="!isCollapsed" class="size-4" />
            <PanelTopOpen v-else class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ isCollapsed ? "展开输入框" : "折叠输入框" }}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <div v-if="!isCollapsed" class="space-y-3">
      <!-- 文件展示区 -->
      <div v-if="attachedFiles.length > 0" class="flex flex-wrap gap-2">
        <Badge
          v-for="(file, index) in attachedFiles"
          :key="file.name + index"
          variant="secondary"
          class="flex items-center gap-1.5"
        >
          <span>{{ file.name }}</span>
          <button
            class="rounded-full hover:bg-muted-foreground/20"
            @click="removeAttachment(index)"
          >
            <X class="size-3" />
          </button>
        </Badge>
      </div>

      <!-- 输入框 -->
      <div class="relative">
        <Textarea
          v-model="newMessage"
          placeholder="输入消息..."
          class="w-full resize-none pr-10 min-h-10"
          rows="1"
          @keydown.enter.exact.prevent="() => handleSend(false)"
        />
        <Button
          size="icon"
          :disabled="!canSend || disabled"
          @click="() => handleSend(false)"
          class="absolute right-1.5 bottom-[5px] h-7 w-7"
        >
          <Send class="size-4" />
        </Button>
      </div>

      <!-- 工具栏 -->
      <div class="flex w-full items-center justify-between">
        <div class="flex items-center gap-1">
          <!-- 在 Role Selector 之前或之后添加润色按钮 -->
          <TooltipProvider :delay-duration="200">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-muted-foreground hover:text-primary"
                  :disabled="!newMessage.trim() || disabled"
                  @click="handlePolish"
                >
                  <Wand2 class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>润色当前输入 (Polish)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <input
            ref="fileInput"
            type="file"
            multiple
            class="hidden"
            @change="handleFileSelect"
          />
          <TooltipProvider :delay-duration="200">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click="triggerFileInput"
                >
                  <Paperclip class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>附加文件</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- 角色/发送选项 -->
          <Popover>
            <PopoverTrigger as-child>
              <Button variant="ghost" size="icon" class="h-8 w-8">
                <component :is="roleIcons[newMessageRole]" class="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-4">
              <div class="grid gap-4">
                <div class="space-y-2">
                  <h4 class="font-medium leading-none">发送选项</h4>
                  <p class="text-sm text-muted-foreground">
                    选择消息的角色或执行高级操作。
                  </p>
                </div>
                <RadioGroup v-model="newMessageRole" default-value="user">
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="r-user" value="user" />
                    <Label for="r-user" class="flex items-center gap-2"
                      ><User class="size-4" /> 用户</Label
                    >
                  </div>
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="r-assistant" value="assistant" />
                    <Label for="r-assistant" class="flex items-center gap-2"
                      ><Bot class="size-4" /> 助手</Label
                    >
                  </div>
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="r-system" value="system" />
                    <Label for="r-system" class="flex items-center gap-2"
                      ><Cog class="size-4" /> 系统</Label
                    >
                  </div>
                </RadioGroup>
                <Button
                  variant="secondary"
                  :disabled="!canSend || disabled"
                  @click="() => handleSend(true)"
                >
                  <Sparkles class="mr-2 size-4" /> 发送并生成
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  </div>
</template>
