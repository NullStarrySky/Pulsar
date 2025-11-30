<!-- src/schema/lorebook/components/EntryEditor.vue -->
<!-- ParentComponent.vue (例如 LorebookEditor) -->
<script setup lang="ts">
import { ref, watch } from "vue";
import type { LorebookEntry } from "@/schema/lorebook/lorebook.types";
import { cloneDeep } from "lodash-es";
import {
  Plus,
  Zap,
  ZapOff,
  SkipForward,
  Power,
  PowerOff,
} from "lucide-vue-next";

// --- 自定义组件 ---
// 导入新的自包含组件
import ExecutableStringEditor from "./ExecutableStringEditor.vue";

// --- Shadcn UI 组件 ---
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PopableTextarea from "@/components/SchemaRenderer/content-elements/PopableTextarea.vue";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- 组件定义 ---
interface Props {
  modelValue: LorebookEntry[];
}
const props = defineProps<Props>();
const emit = defineEmits(["update:modelValue"]);

const localEntries = ref<LorebookEntry[]>(cloneDeep(props.modelValue || []));
watch(
  localEntries,
  (newVal) => {
    emit("update:modelValue", newVal);
  },
  { deep: true }
);

const roleOptions = [
  {
    label: "角色",
    items: [
      { value: "system", label: "system" },
      { value: "user", label: "user" },
      { value: "assistant", label: "assistant" },
      { value: "tool", label: "tool" },
    ],
  },
];

// 移除了所有与 tags-input 和 expression-builder 相关的逻辑
// newTagText, addExpression, entryConditionsAsTags, updateEntryConditions, getExpressionTooltip 等都已删除

const addEntry = () => {
  const newEntry: LorebookEntry = {
    id: crypto.randomUUID(),
    name: "新条目",
    description: "",
    groupName: "",
    enabled: true,
    escapeScanWhenRecursing: false,
    activationWhen: { alwaysActivation: false, condition: [] },
    activationEffect: {
      role: "system",
      position: 0,
      content: "",
      insertion_order: 100,
      intervalsToCreate: { type: "", length: "", content: {} },
    },
  };
  localEntries.value.push(newEntry);
};
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div>
      <div
        v-if="!localEntries.length"
        class="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg text-center"
      >
        <h3 class="text-lg font-semibold">没有条目</h3>
        <p class="text-muted-foreground mt-2">
          点击下方的按钮来创建您的第一个世界书条目。
        </p>
      </div>
      <Accordion v-else type="multiple" class="w-full">
        <AccordionItem
          v-for="entry in localEntries"
          :key="entry.id"
          :value="entry.id"
        >
          <AccordionTrigger>
            <div class="flex items-center gap-4 w-full pr-4">
              <Input
                v-model="entry.name"
                placeholder="条目名称"
                class="w-full text-base"
                @click.stop
              />
            </div>
          </AccordionTrigger>
          <AccordionContent class="p-2 space-y-4">
            <!-- 顶部工具栏  -->
            <div
              class="flex items-center justify-end p-2 bg-muted rounded-md gap-1"
            >
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    @click.stop="
                      entry.activationWhen.alwaysActivation =
                        !entry.activationWhen.alwaysActivation
                    "
                  >
                    <Zap
                      v-if="entry.activationWhen.alwaysActivation"
                      class="h-4 w-4 text-yellow-500"
                    />
                    <ZapOff v-else class="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  ><p>
                    {{
                      entry.activationWhen.alwaysActivation
                        ? "禁用始终激活"
                        : "启用始终激活"
                    }}
                  </p></TooltipContent
                >
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    @click.stop="
                      entry.escapeScanWhenRecursing =
                        !entry.escapeScanWhenRecursing
                    "
                  >
                    <SkipForward
                      :class="[
                        'h-4 w-4',
                        entry.escapeScanWhenRecursing
                          ? 'text-blue-500'
                          : 'text-muted-foreground',
                      ]"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  ><p>
                    {{
                      entry.escapeScanWhenRecursing
                        ? "取消递归时跳过扫描"
                        : "递归时跳过扫描"
                    }}
                  </p></TooltipContent
                >
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    @click.stop="entry.enabled = !entry.enabled"
                  >
                    <Power
                      v-if="entry.enabled"
                      class="h-4 w-4 text-green-500"
                    />
                    <PowerOff v-else class="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  ><p>
                    {{ entry.enabled ? "禁用条目" : "启用条目" }}
                  </p></TooltipContent
                >
              </Tooltip>
            </div>

            <div class="space-y-4">
              <Card>
                <CardContent class="pt-6">
                  <Label>激活条件</Label>
                  <ExecutableStringEditor
                    v-model="entry.activationWhen.condition"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent class="pt-6 space-y-4">
                  <div class="grid grid-cols-3 gap-4">
                    <div>
                      <Label>插入顺序</Label>
                      <Input
                        v-model.number="entry.activationEffect.insertion_order"
                        type="number"
                        placeholder="例如, 100"
                      />
                    </div>
                    <div>
                      <Label>角色</Label>
                      <Select v-model="entry.activationEffect.role">
                        <SelectTrigger
                          ><SelectValue placeholder="选择一个角色"
                        /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup
                            v-for="group in roleOptions"
                            :key="group.label"
                          >
                            <SelectLabel>{{ group.label }}</SelectLabel>
                            <SelectItem
                              v-for="item in group.items"
                              :key="item.value"
                              :value="item.value"
                              >{{ item.label }}</SelectItem
                            >
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>位置</Label>
                      <Input
                        v-model="entry.activationEffect.position"
                        placeholder="例如, BEFORE_CHAR 或 -1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>内容</Label>
                    <PopableTextarea
                      v-model="entry.activationEffect.content"
                      placeholder="输入要注入的内容..."
                      dialogTitle="编辑条目内容"
                      class="mt-2 min-h-[150px]"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div class="mt-4 flex justify-end">
        <Button @click="addEntry"><Plus class="mr-2 h-4 w-4" />添加条目</Button>
      </div>
    </div>
  </TooltipProvider>
</template>
