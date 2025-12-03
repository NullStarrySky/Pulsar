<!-- src/schema/preset/components/PromptsPanel.vue -->
<script setup lang="ts">
import { ref, watchEffect } from "vue";
import type { Prompt, PresetVariant } from "../preset.types";
import { v4 as uuidv4 } from "uuid";
import draggable from "vuedraggable";

// UI Components
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

// Icons
import {
  Plus,
  Trash2,
  Terminal,
  User,
  MessageSquare,
  Map,
  ScanFace,
  ArrowUpToLine,
  ArrowDownToLine,
  MoreHorizontal,
  GripVertical,
  Settings,
  XCircle,
} from "lucide-vue-next";

// --- Props & Model ---
const variants = defineModel<PresetVariant[]>({ required: true });
const activeTab = ref("");

// 确保 activeTab 始终有效
watchEffect(() => {
  if (
    variants.value?.length > 0 &&
    !variants.value.find((v) => v.id === activeTab.value)
  ) {
    activeTab.value = variants.value[0].id;
  }
});

// --- 辅助函数：自动高度 Textarea ---
const autoResize = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  target.style.height = "auto";
  target.style.height = target.scrollHeight + "px";
};

// 初始化时或内容变化时调整高度 (用于 v-for 中的 ref 处理比较麻烦，这里使用简单的 focus/input 事件结合 mounted 钩子思路，或者使用指令)
const vAutoHeight = {
  mounted: (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  },
  updated: (el: HTMLTextAreaElement) => {
    // 只有当用户没有正在输入时才强制调整，避免跳动，或者在内容显著变化时调整
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  },
};

// --- 配置管理 ---
const createDefaultVariant = (): PresetVariant => ({
  id: uuidv4(),
  name: "新模型配置",
  modelRegex: ".*",
  prompts: [createDefaultPrompt()],
});

const onAddVariant = () => {
  const newVariant = createDefaultVariant();
  variants.value = [...variants.value, newVariant];
  activeTab.value = newVariant.id;
};

const onDeleteVariant = (variantId: string) => {
  const variant = variants.value.find((v) => v.id === variantId);
  if (!variant) return;
  if (
    confirm(
      `确定要删除配置 "${variant.name}" 吗？此操作将删除其下的所有提示词。`
    )
  ) {
    variants.value = variants.value.filter((v) => v.id !== variantId);
  }
};

// --- 提示词管理 ---
const createDefaultPrompt = (): Prompt => ({
  id: uuidv4(),
  name: "New Context Block",
  enabled: true,
  role: "system",
  injectPosition: "none",
  content: "",
});

const onAddPrompt = (variant: PresetVariant) => {
  variant.prompts.push(createDefaultPrompt());
};

const onDeletePrompt = (variant: PresetVariant, promptId: string) => {
  variant.prompts = variant.prompts.filter((p) => p.id !== promptId);
};

const togglePromptEnabled = (prompt: Prompt) => {
  prompt.enabled = !prompt.enabled;
};

// --- 样式辅助 ---
const getRoleConfig = (role: string) => {
  switch (role) {
    case "system":
      return {
        bg: "bg-zinc-100 dark:bg-zinc-800",
        text: "text-zinc-600 dark:text-zinc-400",
        border: "border-zinc-400",
        bar: "bg-zinc-400",
        icon: Terminal,
      };
    case "user":
      return {
        bg: "bg-blue-50 dark:bg-blue-950/30",
        text: "text-blue-600 dark:text-blue-400",
        border: "border-blue-400",
        bar: "bg-blue-500",
        icon: User,
      };
    case "assistant":
      return {
        bg: "bg-green-50 dark:bg-green-950/30",
        text: "text-green-600 dark:text-green-400",
        border: "border-green-400",
        bar: "bg-green-500",
        icon: MessageSquare,
      };
    default:
      return {
        bg: "bg-zinc-50",
        text: "text-zinc-500",
        border: "border-zinc-300",
        bar: "bg-zinc-300",
        icon: Terminal,
      };
  }
};

const getPosConfig = (pos: string) => {
  switch (pos) {
    case "SCENARIO":
      return { label: "场景", icon: Map };
    case "PERSONALITY":
      return { label: "个性", icon: ScanFace };
    case "BEFORE_CHAR":
      return { label: "前置", icon: ArrowUpToLine };
    case "AFTER_CHAR":
      return { label: "后置", icon: ArrowDownToLine };
    default:
      return { label: "无位置", icon: XCircle };
  }
};
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <!-- 顶部操作栏 -->
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-muted-foreground">Prompt Stream</h3>
      <Button size="sm" variant="outline" @click="onAddVariant">
        <Plus class="mr-2 h-3.5 w-3.5" />
        添加变体
      </Button>
    </div>

    <Tabs v-if="variants.length" v-model="activeTab" class="w-full">
      <TabsList class="w-full justify-start overflow-x-auto">
        <TabsTrigger
          v-for="variant in variants"
          :key="variant.id"
          :value="variant.id"
          class="min-w-[100px]"
        >
          {{ variant.name }}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        v-for="variant in variants"
        :key="variant.id"
        :value="variant.id"
        class="mt-2 space-y-4"
      >
        <!-- 变体配置头 (类似文件头信息) -->
        <div
          class="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4 md:flex-row md:items-end"
        >
          <div class="grid flex-1 gap-2">
            <Label class="text-xs font-semibold uppercase text-muted-foreground"
              >Config Name</Label
            >
            <Input v-model="variant.name" class="bg-background h-8" />
          </div>
          <div class="grid flex-1 gap-2">
            <Label class="text-xs font-semibold uppercase text-muted-foreground"
              >Model Regex</Label
            >
            <Input
              v-model="variant.modelRegex"
              class="bg-background h-8 font-mono text-xs"
              placeholder="e.g. gpt-4.*"
            />
          </div>
          <Button
            v-if="variants.length > 1"
            variant="ghost"
            size="icon"
            class="text-muted-foreground hover:text-destructive"
            @click="onDeleteVariant(variant.id)"
          >
            <Trash2 class="h-4 w-4" />
          </Button>
        </div>

        <!-- Prompt 列表区域 -->
        <div class="rounded-lg border bg-background shadow-sm min-h-[300px]">
          <!-- 头部统计 -->
          <div
            class="flex items-center justify-between border-b px-4 py-2 bg-muted/10"
          >
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <Settings class="h-3.5 w-3.5" />
              <span>Context Blocks</span>
            </div>
            <span
              class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {{ variant.prompts.filter((p) => p.enabled).length }} Active
            </span>
          </div>

          <div class="p-2 pb-8">
            <draggable
              v-model="variant.prompts"
              item-key="id"
              handle=".drag-handle"
              class="flex flex-col gap-0"
              :animation="200"
              ghost-class="opacity-50"
            >
              <template #item="{ element: prompt }">
                <div
                  class="group relative flex py-2 transition-all duration-200"
                  :class="prompt.enabled ? 'opacity-100' : 'opacity-60'"
                >
                  <!-- 1. 左侧槽 (Gutter): 开关与连接线 -->
                  <div
                    class="relative flex w-12 shrink-0 select-none flex-col items-center pt-6"
                  >
                    <!-- 启用开关 (断点风格) -->
                    <button
                      @click="togglePromptEnabled(prompt)"
                      class="z-10 mb-2 h-3 w-3 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1"
                      :class="
                        prompt.enabled
                          ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
                          : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                      "
                      :title="prompt.enabled ? 'Enabled' : 'Disabled'"
                    ></button>

                    <!-- 竖线 -->
                    <div
                      class="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-border/80"
                    ></div>

                    <!-- 拖拽手柄 (Hover 显示) -->
                    <div
                      class="drag-handle absolute top-2 left-1 cursor-grab opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    >
                      <GripVertical class="h-3.5 w-3.5" />
                    </div>
                  </div>

                  <!-- 2. 主体内容 -->
                  <div class="flex-1 min-w-0 pr-2">
                    <!-- 元数据行 (Code Lens) -->
                    <div
                      class="mb-1.5 flex select-none items-center gap-2 text-xs"
                    >
                      <!-- 注入位置 Dropdown -->
                      <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                          <button
                            class="flex items-center gap-1.5 rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-purple-100 dark:hover:bg-purple-900/30"
                            :class="
                              prompt.injectPosition === 'none'
                                ? 'text-muted-foreground'
                                : 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
                            "
                          >
                            <component
                              :is="getPosConfig(prompt.injectPosition).icon"
                              class="h-3 w-3"
                            />
                            <span>{{
                              getPosConfig(prompt.injectPosition).label
                            }}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>注入位置</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuRadioGroup
                            v-model="prompt.injectPosition"
                          >
                            <DropdownMenuRadioItem value="SCENARIO"
                              >场景设定 (Scenario)</DropdownMenuRadioItem
                            >
                            <DropdownMenuRadioItem value="PERSONALITY"
                              >人格设定 (Personality)</DropdownMenuRadioItem
                            >
                            <DropdownMenuRadioItem value="BEFORE_CHAR"
                              >前置 (Before Char)</DropdownMenuRadioItem
                            >
                            <DropdownMenuRadioItem value="AFTER_CHAR"
                              >后置 (After Char)</DropdownMenuRadioItem
                            >
                            <DropdownMenuRadioItem value="none"
                              >无 (None)</DropdownMenuRadioItem
                            >
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <!-- 名字 (点击编辑) -->
                      <div class="group/name flex items-center gap-2">
                        <span
                          class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70"
                        >
                          #{{ prompt.id.slice(0, 4) }}
                        </span>
                        <input
                          v-model="prompt.name"
                          class="bg-transparent text-xs font-medium text-muted-foreground placeholder:text-muted-foreground/30 focus:text-foreground focus:outline-none"
                          placeholder="BLOCK NAME"
                        />
                      </div>

                      <!-- 角色 Dropdown -->
                      <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                          <button
                            class="ml-2 flex items-center gap-1 rounded px-1.5 py-0.5 transition-opacity hover:opacity-80"
                            :class="getRoleConfig(prompt.role).bg"
                          >
                            <component
                              :is="getRoleConfig(prompt.role).icon"
                              class="h-3 w-3"
                              :class="getRoleConfig(prompt.role).text"
                            />
                            <span
                              class="text-[10px] font-bold uppercase"
                              :class="getRoleConfig(prompt.role).text"
                            >
                              {{ prompt.role }}
                            </span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel>角色 (Role)</DropdownMenuLabel>
                          <DropdownMenuRadioGroup v-model="prompt.role">
                            <DropdownMenuRadioItem value="system"
                              >System</DropdownMenuRadioItem
                            >
                            <DropdownMenuRadioItem value="user"
                              >User</DropdownMenuRadioItem
                            >
                            <DropdownMenuRadioItem value="assistant"
                              >Assistant</DropdownMenuRadioItem
                            >
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <!-- 更多操作 -->
                      <div
                        class="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger as-child>
                            <Button
                              variant="ghost"
                              size="icon"
                              class="h-5 w-5 p-0"
                            >
                              <MoreHorizontal class="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              @click="onDeletePrompt(variant, prompt.id)"
                              class="text-destructive focus:text-destructive"
                            >
                              <Trash2 class="mr-2 h-4 w-4" /> 删除块
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <!-- 内容编辑器 -->
                    <div
                      class="relative flex overflow-hidden rounded-md border transition-all duration-200"
                      :class="[
                        prompt.enabled
                          ? 'border-transparent bg-muted/30 hover:border-border hover:bg-background hover:shadow-sm'
                          : 'border-transparent bg-transparent',
                      ]"
                    >
                      <!-- 左侧颜色条 -->
                      <div
                        class="w-1 shrink-0"
                        :class="
                          prompt.enabled
                            ? getRoleConfig(prompt.role).bar
                            : 'bg-muted'
                        "
                      ></div>

                      <textarea
                        v-model="prompt.content"
                        v-auto-height
                        @input="autoResize"
                        rows="1"
                        placeholder="// 空提示词块..."
                        :disabled="!prompt.enabled"
                        class="w-full resize-none border-none bg-transparent p-3 font-mono text-sm leading-relaxed focus:ring-0 focus-visible:ring-0 focus-visible:outline-none"
                        :class="
                          prompt.enabled
                            ? 'text-foreground placeholder:text-muted-foreground/40'
                            : 'text-muted-foreground line-through decoration-border decoration-2 cursor-not-allowed'
                        "
                      ></textarea>
                    </div>
                  </div>
                </div>
              </template>
            </draggable>

            <!-- 底部添加按钮 -->
            <div class="mt-4 px-14">
              <button
                @click="onAddPrompt(variant)"
                class="flex h-10 w-full items-center justify-center rounded-lg border-2 border-dashed border-muted text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Plus class="mr-2 h-4 w-4" /> 添加提示词块
              </button>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <div
      v-else
      class="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/10 text-muted-foreground"
    >
      <p>暂无配置</p>
      <Button variant="secondary" size="sm" @click="onAddVariant">
        创建第一个预设变体
      </Button>
    </div>
  </div>
</template>

<style scoped>
/* 隐藏滚动条但保留功能 (针对 Tabs) */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
