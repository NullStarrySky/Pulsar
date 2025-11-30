<!-- src/components/SchemaRenderer/content-elements/RegexEditor.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import draggable from "vuedraggable";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  GripVertical,
  Trash2,
  ChevronDown,
  ArrowRight,
  PlusCircle,
} from "lucide-vue-next";
import { RegexRule } from "@/schema/shared.types";
import { v4 as uuidv4 } from "uuid"; // 用于生成唯一ID

type RegexGroup = RegexRule[];

const props = defineProps<{
  modelValue: RegexGroup;
}>();

const emit = defineEmits(["update:modelValue"]);

const internalRules = ref(props.modelValue);

const updateRules = (newRules: RegexGroup) => {
  internalRules.value = newRules;
  emit("update:modelValue", newRules);
};

const removeRule = (id: string) => {
  const newRules = internalRules.value.filter((rule) => rule.id !== id);
  updateRules(newRules);
};

// 新增：添加新规则的方法
const addNewRule = () => {
  const newRule: RegexRule = {
    id: uuidv4(), // 为新规则生成一个唯一的ID
    name: "New Rule",
    enabled: true,
    find_regex: "",
    replace_string: "",
    applyOnRendering: false,
    applyOnSending: false,
    minDepth: 0,
    maxDepth: -1,
  };
  const newRules = [...internalRules.value, newRule];
  updateRules(newRules);
};

// 计算属性，用于判断列表是否为空
const isEmpty = computed(() => internalRules.value.length === 0);
</script>

<template>
  <div class="w-full space-y-2">
    <draggable
      v-model="internalRules"
      item-key="id"
      handle=".handle"
      @end="updateRules(internalRules)"
    >
      <template #item="{ element: rule }">
        <div class="mb-2">
          <Accordion type="single" collapsible>
            <AccordionItem :value="rule.id">
              <AccordionTrigger
                class="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 rounded-md"
              >
                <div class="flex items-center gap-4 grow">
                  <GripVertical class="handle cursor-move text-gray-500" />
                  <span class="font-semibold">{{ rule.name }}</span>
                </div>
                <div class="flex items-center gap-4">
                  <Switch v-model="rule.enabled" />
                  <Button
                    variant="ghost"
                    size="icon"
                    @click.stop="removeRule(rule.id)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                  <ChevronDown
                    class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200"
                  />
                </div>
              </AccordionTrigger>
              <AccordionContent class="p-4 border rounded-b-md">
                <div class="space-y-4">
                  <div class="flex items-center gap-4">
                    <Input
                      v-model="rule.find_regex"
                      placeholder="查找正则表达式"
                      class="flex-1"
                    />
                    <ArrowRight class="h-5 w-5 text-gray-500" />
                    <Input
                      v-model="rule.replace_string"
                      placeholder="替换为"
                      class="flex-1"
                    />
                  </div>
                  <div class="flex items-center gap-8">
                    <div class="flex items-center gap-2">
                      <Checkbox
                        :id="`apply-rendering-${rule.id}`"
                        v-model="rule.applyOnRendering"
                      />
                      <Label :for="`apply-rendering-${rule.id}`"
                        >渲染时应用</Label
                      >
                    </div>
                    <div class="flex items-center gap-2">
                      <Checkbox
                        :id="`apply-sending-${rule.id}`"
                        v-model="rule.applyOnSending"
                      />
                      <Label :for="`apply-sending-${rule.id}`"
                        >发送时应用</Label
                      >
                    </div>
                  </div>
                  <div class="flex items-center gap-4">
                    <div class="flex-1 space-y-2">
                      <Label :for="`min-depth-${rule.id}`">最小深度</Label>
                      <Input
                        :id="`min-depth-${rule.id}`"
                        type="number"
                        v-model.number="rule.minDepth"
                        placeholder="Min Depth"
                      />
                    </div>
                    <div class="flex-1 space-y-2">
                      <Label :for="`max-depth-${rule.id}`">最大深度</Label>
                      <Input
                        :id="`max-depth-${rule.id}`"
                        type="number"
                        v-model.number="rule.maxDepth"
                        placeholder="Max Depth"
                      />
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </template>
    </draggable>

    <!-- 新增：当列表为空时，显示添加按钮 -->
    <div v-if="isEmpty" class="text-center py-8">
      <p class="text-gray-500 dark:text-gray-400 mb-4">还没有正则规则</p>
      <Button @click="addNewRule">
        <PlusCircle class="mr-2 h-4 w-4" />
        添加新规则
      </Button>
    </div>

    <!-- 新增：当列表不为空时，在列表底部也显示一个添加按钮 -->
    <div v-else class="mt-4">
      <Button @click="addNewRule" variant="outline" class="w-full">
        <PlusCircle class="mr-2 h-4 w-4" />
        添加新规则
      </Button>
    </div>
  </div>
</template>

<style scoped>
.handle {
  cursor: grab;
}
.handle:active {
  cursor: grabbing;
}
</style>
