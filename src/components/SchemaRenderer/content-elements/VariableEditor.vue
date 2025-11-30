<!-- src/components/SchemaRenderer/content-elements/VariableEditor.vue -->
<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { get, set } from "lodash-es";
import draggable from "vuedraggable";

// --- 类型定义 ---
import type { UserValue } from "@/schema/shared.types";
import type { ComponentName } from "../SchemaRenderer.types.ts";

// --- Shadcn UI 及自定义组件导入 ---
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import Checkbox from "@/components/ui/checkbox/Checkbox.vue";
import Switch from "@/components/ui/switch/Switch.vue";
import Textarea from "@/components/ui/textarea/Textarea.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import Item from "@/components/ui/item/Item.vue";
import ItemActions from "@/components/ui/item/ItemActions.vue";
import ItemContent from "@/components/ui/item/ItemContent.vue";
import ItemDescription from "@/components/ui/item/ItemDescription.vue";
import ItemTitle from "@/components/ui/item/ItemTitle.vue";

// 导入父组件中使用的自定义封装组件
import WrappedSelect from "./WrappedSelect.vue";
import EnhancedSlider from "./EnhancedSlider.vue";
import PopableTextarea from "./PopableTextarea.vue";
import RegexEditor from "./RegexEditor.vue";
import JSCodeEditor from "./JSCodeEditor.vue";

// --- 组件定义 ---

// 定义 schema 编辑器中可用的组件列表，与父组件保持一致，但不包含 VariableEditor 自身
const availableComponents: Record<string, Component> = {
  Button,
  Input,
  Checkbox,
  Switch,
  Textarea,
  Select: WrappedSelect,
  Slider: EnhancedSlider,
  PopableTextarea,
  RegexEditor,
  JSCodeEditor,
};

// 为组件选择器提供选项
const componentOptions = Object.keys(availableComponents).map((name) => ({
  label: name,
  value: name,
}));

// --- Props 和 Emits ---
const props = defineProps<{
  modelValue: UserValue;
}>();

const emit = defineEmits(["update:modelValue"]);

// --- 状态管理 ---

// 通过计算属性代理 v-model，确保任何变更都通过事件发出
const localValue = computed({
  get: () => props.modelValue,
  set: (value) => {
    emit("update:modelValue", value);
  },
});

// "Value" 标签页中渲染表单的内部数据状态
const formData = ref<Record<string, any>>({});

// 监听 initialValue 的变化，以同步 formData
watch(
  () => props.modelValue.initialValue,
  (newInitialValue) => {
    try {
      // 深拷贝以避免直接修改 props
      formData.value = JSON.parse(JSON.stringify(newInitialValue || {}));
    } catch (e) {
      console.error("解析 initialValue 失败:", e);
      formData.value = {};
    }
  },
  { immediate: true, deep: true }
);

// 计算属性，用于在 TextArea 中安全地编辑 initialValue 的 JSON 字符串
const initialValueAsString = computed({
  get: () => JSON.stringify(localValue.value.initialValue, null, 2),
  set: (val) => {
    try {
      const parsed = val ? JSON.parse(val) : {};
      // 创建新对象以触发更新
      const newValue = { ...localValue.value, initialValue: parsed };
      localValue.value = newValue; // 通过 localValue 的 setter 发出 update 事件
    } catch (e) {
      console.error("无效的 JSON 格式。");
      // 当JSON无效时，不更新模型
    }
  },
});

// --- 方法 ---

// 将组件名称解析为其实际组件对象
function resolveComponent(name: ComponentName): Component | string {
  const component = availableComponents[name];
  if (component) {
    return component;
  }
  console.warn(`组件 "${name}" 未找到。`);
  return name; // Fallback
}

// 更新 "Value" 标签页中的表单数据
function updateFormData(path: string, value: any) {
  const newData = JSON.parse(JSON.stringify(formData.value));
  set(newData, path, value);
  formData.value = newData;
}

// 为 schema 添加一个新的 Row
function addRow() {
  const newSchema = [...localValue.value.schema];
  newSchema.push({
    title: "New Field",
    accessChain: `newField${Date.now()}`, // 使用时间戳确保 key 唯一
    component: "Input",
    props: {},
    description: "",
    useTopBottom: false,
  });
  localValue.value = { ...localValue.value, schema: newSchema };
}

// 从 schema 中移除一个 Row
function removeRow(index: number) {
  const newSchema = [...localValue.value.schema];
  newSchema.splice(index, 1);
  localValue.value = { ...localValue.value, schema: newSchema };
}

// 安全地更新一个 Row 的 props 属性
function updateRowProps(index: number, newProps: string | number) {
  try {
    const parsedProps = newProps ? JSON.parse(String(newProps)) : {};
    const newSchema = JSON.parse(JSON.stringify(localValue.value.schema));
    newSchema[index].props = parsedProps;
    localValue.value = { ...localValue.value, schema: newSchema };
  } catch (e) {
    console.error("无效的 props JSON 格式。");
  }
}
</script>

<template>
  <div class="p-4 border rounded-md bg-muted/30">
    <Tabs default-value="value" class="w-full">
      <TabsList class="grid w-full grid-cols-3">
        <TabsTrigger value="value"> 值 </TabsTrigger>
        <TabsTrigger value="initialValue"> 初始值 </TabsTrigger>
        <TabsTrigger value="schema"> 范式 </TabsTrigger>
      </TabsList>

      <!-- Value Tab: 基于 schema 渲染表单 -->
      <TabsContent value="value" class="pt-2">
        <ScrollArea class="h-[400px] p-1">
          <div class="space-y-4 pt-2">
            <div
              v-if="!localValue.schema || localValue.schema.length === 0"
              class="text-center text-muted-foreground py-8"
            >
              Schema 为空，请在 "Schema" 标签页中添加字段。
            </div>
            <div
              v-else
              v-for="(row, rIndex) in localValue.schema"
              :key="row.accessChain + rIndex"
            >
              <!-- 上下布局 -->
              <div v-if="row.useTopBottom" class="flex flex-col space-y-2">
                <label class="font-medium text-sm">{{ row.title }}</label>
                <component
                  :is="resolveComponent(row.component)"
                  v-bind="row.props"
                  :modelValue="get(formData, row.accessChain)"
                  @update:modelValue="updateFormData(row.accessChain, $event)"
                />
                <p v-if="row.description" class="text-xs text-muted-foreground">
                  {{ row.description }}
                </p>
              </div>

              <!-- 左右布局  -->
              <Item v-else>
                <ItemContent>
                  <ItemTitle class="text-sm font-medium text-foreground">{{
                    row.title
                  }}</ItemTitle>
                  <ItemDescription
                    v-if="row.description"
                    class="text-xs text-muted-foreground"
                  >
                    {{ row.description }}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <div class="w-56 flex justify-end">
                    <component
                      :is="resolveComponent(row.component)"
                      v-bind="row.props"
                      :modelValue="get(formData, row.accessChain)"
                      @update:modelValue="
                        updateFormData(row.accessChain, $event)
                      "
                    />
                  </div>
                </ItemActions>
              </Item>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>

      <!-- Initial Value Tab: 原始 JSON 编辑器 -->
      <TabsContent value="initialValue" class="pt-2">
        <Textarea
          v-model="initialValueAsString"
          class="font-mono h-[400px] text-xs"
          placeholder="以 JSON 对象格式输入初始数据..."
        />
      </TabsContent>

      <!-- Schema Tab: 可拖拽的表单构建器 -->
      <TabsContent value="schema" class="pt-2">
        <ScrollArea class="h-[400px] p-1">
          <div class="flex justify-end mb-4">
            <Button @click="addRow">添加字段</Button>
          </div>
          <draggable
            v-model="localValue.schema"
            item-key="accessChain"
            handle=".drag-handle"
            class="space-y-4"
          >
            <template #item="{ element: row, index }">
              <div class="p-4 border rounded-md bg-background relative group">
                <div
                  class="absolute top-2 right-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    class="drag-handle cursor-move h-8 w-8"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="9" cy="12" r="1" />
                      <circle cx="9" cy="5" r="1" />
                      <circle cx="9" cy="19" r="1" />
                      <circle cx="15" cy="12" r="1" />
                      <circle cx="15" cy="5" r="1" />
                      <circle cx="15" cy="19" r="1" />
                    </svg>
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    @click="removeRow(index)"
                    class="h-8 w-8"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path
                        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      />
                      <line x1="10" x2="10" y1="11" y2="17" />
                      <line x1="14" x2="14" y1="11" y2="17" />
                    </svg>
                  </Button>
                </div>

                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="text-sm font-medium">标题</label>
                      <Input v-model="row.title" />
                    </div>
                    <div>
                      <label class="text-sm font-medium">访问链</label>
                      <Input
                        v-model="row.accessChain"
                        placeholder="e.g., user.name"
                      />
                    </div>
                    <div class="col-span-2">
                      <label class="text-sm font-medium">描述</label>
                      <Input v-model="row.description" />
                    </div>
                    <div>
                      <label class="text-sm font-medium">组件</label>
                      <WrappedSelect
                        v-model="row.component"
                        :options="componentOptions"
                      />
                    </div>
                    <div class="flex items-center space-x-2 self-end">
                      <Checkbox
                        :id="`top-bottom-${index}`"
                        v-model:checked="row.useTopBottom"
                      />
                      <label
                        :for="`top-bottom-${index}`"
                        class="text-sm font-medium"
                        >上下布局</label
                      >
                    </div>
                  </div>
                  <div>
                    <label class="text-sm font-medium">组件 Props (JSON)</label>
                    <Textarea
                      :modelValue="JSON.stringify(row.props || {}, null, 2)"
                      @update:modelValue="updateRowProps(index, $event)"
                      class="font-mono h-24 text-xs"
                      placeholder='{ "placeholder": "输入文本..." }'
                    />
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  </div>
</template>
