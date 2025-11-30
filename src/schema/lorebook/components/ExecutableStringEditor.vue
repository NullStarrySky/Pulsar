<!-- src/schema/lorebook/components/ExecutableStringEditor.vue -->
<!-- ExecutableStringEditor.vue -->
<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { cloneDeep } from "lodash-es";
import { VueTagsInput } from "@sipec/vue3-tags-input";

// --- 组件导入 ---
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Wand2 } from "lucide-vue-next";

// --- Props & Emits 定义 (v-model 支持) ---
const props = defineProps<{
  modelValue: string[];
}>();
const emit = defineEmits(["update:modelValue"]);

// --- 内部状态管理 ---
// 本地副本，避免直接修改 prop
const localConditions = ref<string[]>(cloneDeep(props.modelValue || []));
// 当外部 v-model 变化时，同步到内部
watch(
  () => props.modelValue,
  (newVal) => {
    localConditions.value = cloneDeep(newVal || []);
  },
  { deep: true }
);
// 当内部值变化时，通过 emit 更新外部 v-model
watch(
  localConditions,
  (newVal) => {
    emit("update:modelValue", newVal);
  },
  { deep: true }
);

// --- vue-tags-input 兼容性 ---
const newTagText = ref(""); // 用于 vue-tags-input 的 v-model
const conditionsAsTags = computed(() => {
  return (localConditions.value || []).map((text) => ({ text }));
});
const updateConditionsFromTags = (newTags: { text: string }[]) => {
  localConditions.value = newTags.map((tag) => tag.text);
};

// --- 表达式构建器逻辑 (从原 ExpressionBuilder.vue 移入) ---
const popoverOpen = ref(false);
const selectedFunction = ref<string>("");
const functions = [
  {
    value: "MatchAll",
    label: "MatchAll",
    argType: "tags",
    description: "所有关键词都必须存在",
  },
  {
    value: "MatchAny",
    label: "MatchAny",
    argType: "tags",
    description: "任意一个关键词存在即可",
  },
  {
    value: "Probability",
    label: "Probability",
    argType: "number",
    description: "x%的概率激活",
  },
  {
    value: "LastMessageinIntervalType",
    label: "LastMessageinIntervalType",
    argType: "text",
    description: "上一条消息处于指定区间类型",
  },
  {
    value: "isRecursing",
    label: "isRecursing",
    argType: "none",
    description: "正在递归时激活",
  },
  {
    value: "Log",
    label: "Log",
    argType: "none",
    description: "打印日志并激活",
  },
];
const currentArgType = computed(
  () =>
    functions.find((f) => f.value === selectedFunction.value)?.argType || "none"
);

// 不同参数类型的状态
const builderTag = ref("");
const builderTags = ref<{ text: string }[]>([]);
const numberArg = ref(50);
const textArg = ref("");

// 构建表达式并添加到 localConditions 中
const buildAndAddExpression = () => {
  if (!selectedFunction.value) return;
  let expression = "";
  switch (selectedFunction.value) {
    case "MatchAll":
    case "MatchAny":
      const formattedTags = builderTags.value
        .map((t) => `'${t.text.replace(/'/g, "\\'")}'`)
        .join(", ");
      expression = `${selectedFunction.value}([${formattedTags}])`;
      break;
    case "Probability":
      expression = `Probability(${numberArg.value})`;
      break;
    case "LastMessageinIntervalType":
      expression = `LastMessageinIntervalType('${textArg.value.replace(
        /'/g,
        "\\''"
      )}')`;
      break;
    case "isRecursing":
    case "Log":
      expression = `${selectedFunction.value}()`;
      break;
  }
  if (expression) {
    localConditions.value.push(expression);
  }
  popoverOpen.value = false; // 关闭并触发下面的 watch 来重置状态
};

// popover 关闭时重置构建器状态
watch(popoverOpen, (isOpen) => {
  if (!isOpen) {
    selectedFunction.value = "";
    builderTags.value = [];
    builderTag.value = "";
    numberArg.value = 50;
    textArg.value = "";
  }
});

// --- Tooltip 帮助函数 ---
const getExpressionTooltip = (expression: string): string | null => {
  const matchAllRegex = /MatchAll\(\s*\[(.*)\]\s*\)/;
  const matchAnyRegex = /MatchAny\(\s*\[(.*)\]\s*\)/;
  const probabilityRegex = /Probability\(\s*(.*)\s*\)/;
  let match;
  match = expression.match(matchAllRegex);
  if (match && typeof match[1] !== "undefined")
    return `匹配包含所有这些片段的文本: ${match[1]
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter(Boolean)
      .join(" | ")}`;
  match = expression.match(matchAnyRegex);
  if (match && typeof match[1] !== "undefined")
    return `匹配包含任一这些片段的文本: ${match[1]
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter(Boolean)
      .join(" | ")}`;
  match = expression.match(probabilityRegex);
  if (match && match[1]) return `有 ${match[1]}% 的几率激活。`;
  return null;
};
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div class="flex items-start gap-2 mt-2 w-full">
      <!-- 标签输入框 -->
      <vue-tags-input
        v-model="newTagText"
        :tags="conditionsAsTags"
        placeholder=""
        class="grow"
        @tags-changed="updateConditionsFromTags"
      >
        <template v-slot:tag-center="{ tag }">
          <Tooltip>
            <TooltipTrigger as-child>
              <span class="cursor-default">{{ tag.text }}</span>
            </TooltipTrigger>
            <TooltipContent v-if="getExpressionTooltip(tag.text)">
              <p>{{ getExpressionTooltip(tag.text) }}</p>
            </TooltipContent>
          </Tooltip>
        </template>
      </vue-tags-input>

      <!-- 表达式构建器 Popover -->
      <Popover v-model:open="popoverOpen">
        <PopoverTrigger as-child>
          <Button variant="outline" size="icon" aria-label="构建复杂表达式">
            <Wand2 class="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-80">
          <div class="grid gap-4">
            <div class="space-y-2">
              <h4 class="font-medium leading-none">表达式构建器</h4>
              <p class="text-sm text-muted-foreground">
                选择一个函数并填充参数来创建激活条件。
              </p>
            </div>
            <div class="grid gap-y-4">
              <div>
                <Label>函数</Label>
                <Select v-model="selectedFunction">
                  <SelectTrigger>
                    <SelectValue placeholder="选择一个函数..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="func in functions"
                      :key="func.value"
                      :value="func.value"
                    >
                      {{ func.label }} -
                      <span class="text-xs text-muted-foreground">{{
                        func.description
                      }}</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- 参数输入区域 -->
              <div v-if="currentArgType === 'tags'">
                <Label>关键词 (正则表达式)</Label>
                <vue-tags-input
                  v-model="builderTag"
                  :tags="builderTags"
                  placeholder="输入后按Enter添加"
                  class="mt-2"
                  @tags-changed="(newTags: any[]) => (builderTags = newTags)"
                />
              </div>
              <div v-else-if="currentArgType === 'number'">
                <Label>概率 (%)</Label>
                <Input
                  v-model.number="numberArg"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0-100"
                />
              </div>
              <div v-else-if="currentArgType === 'text'">
                <Label>参数</Label>
                <Input
                  v-model="textArg"
                  type="text"
                  placeholder="输入文本参数"
                />
              </div>

              <Button
                @click="buildAndAddExpression"
                :disabled="!selectedFunction"
              >
                添加表达式
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </TooltipProvider>
</template>

<style>
/* 将样式也一并移入，使其完全自包含 */
.vue-tags-input {
  max-width: 100% !important;
  background-color: oklch(var(--background)) !important;
}
.vue-tags-input .ti-input {
  border: 1px solid oklch(var(--border));
  border-radius: var(--radius);
  background-color: oklch(var(--card));
  transition: border-color 0.2s ease-in-out;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 0.375rem;
}
.vue-tags-input.ti-focus .ti-input {
  border-color: oklch(var(--ring));
}
.vue-tags-input .ti-new-tag-input-wrapper {
  flex-grow: 1;
  padding: 0.125rem;
}
.vue-tags-input .ti-new-tag-input {
  background: transparent;
  color: oklch(var(--foreground));
  outline: none;
  border: none;
  padding: 0;
  margin: 0;
  width: 100%;
}
.vue-tags-input .ti-tag {
  display: flex;
  align-items: center;
  background-color: oklch(var(--secondary)) !important;
  color: oklch(var(--secondary-foreground)) !important;
  border-radius: calc(var(--radius) - 4px) !important;
  padding: 0.25rem 0.5rem;
  margin: 0.125rem;
}
.vue-tags-input .ti-deletion-mark {
  background-color: oklch(var(--destructive)) !important;
  color: oklch(var(--destructive-foreground)) !important;
}
.vue-tags-input .ti-remove-tag {
  color: oklch(var(--secondary-foreground));
  margin-left: 0.25rem;
  font-size: 1.1em;
  line-height: 1;
}
.vue-tags-input ::-webkit-input-placeholder {
  color: oklch(var(--muted-foreground));
  opacity: 0.8;
}
.vue-tags-input ::-moz-placeholder {
  color: oklch(var(--muted-foreground));
  opacity: 0.8;
}
.vue-tags-input :-ms-input-placeholder {
  color: oklch(var(--muted-foreground));
  opacity: 0.8;
}
.vue-tags-input :-moz-placeholder {
  color: oklch(var(--muted-foreground));
  opacity: 0.8;
}
</style>
