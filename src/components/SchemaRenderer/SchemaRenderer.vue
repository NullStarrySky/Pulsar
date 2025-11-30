<!-- src/components/SchemaRenderer/SchemaRenderer.vue -->
<script setup lang="ts">
import { ref, computed, type Component } from "vue";
import { get, set } from "lodash-es";

// --- Shadcn UI 组件导入 ---

// 导入 Item 相关的组件
import Item from "@/components/ui/item/Item.vue";
import ItemActions from "@/components/ui/item/ItemActions.vue";
import ItemContent from "@/components/ui/item/ItemContent.vue";
import ItemDescription from "@/components/ui/item/ItemDescription.vue";
import ItemTitle from "@/components/ui/item/ItemTitle.vue";
import Separator from "@/components/ui/separator/Separator.vue";
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import Checkbox from "@/components/ui/checkbox/Checkbox.vue";
import Switch from "@/components/ui/switch/Switch.vue";
import Textarea from "@/components/ui/textarea/Textarea.vue";
import { ScrollArea } from "@/components/ui/scroll-area";

// 导入自定义封装的组件
import WrappedSelect from "./content-elements/WrappedSelect.vue";
import EnhancedSlider from "./content-elements/EnhancedSlider.vue";
import PopableTextarea from "./content-elements/PopableTextarea.vue";
import RegexEditor from "./content-elements/RegexEditor.vue";
import JSCodeEditor from "./content-elements/JSCodeEditor.vue";
import VariableEditor from "./content-elements/VariableEditor.vue";

import { Group, Schema, ComponentName } from "./SchemaRenderer.types";

const defaultComponents: Record<string, Component> = {
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
  VariableEditor,
};

// --- Props 和 Emits ---
const props = defineProps<{
  schema: Schema;
  data: Record<string, any>;
}>();

const emit = defineEmits(["update:data"]);

// --- 状态管理 ---
const activeGroupIndex = ref(0);

// --- 计算属性 ---

// 创建一个合并后的组件映射。优先使用 schema 中提供的组件。
const availableComponents = computed(() => {
  return { ...defaultComponents, ...props.schema.components };
});

// 过滤掉分隔符，只保留可点击的 Group，用于索引计算
const clickableGroups = computed(() =>
  props.schema.content.filter((item): item is Group => typeof item === "object")
);

// 当前激活的 Group
const activeGroup = computed<Group | undefined>(() => {
  return clickableGroups.value[activeGroupIndex.value];
});

// --- 方法 ---

function handleGroupClick(group: Group) {
  const index = clickableGroups.value.indexOf(group);
  if (index !== -1) {
    activeGroupIndex.value = index;
  }
}

// 数据更新函数，使用 lodash.set 安全地更新深层嵌套数据
function updateData(path: string, value: any) {
  // 创建一个新对象以确保 Vue 的响应式系统能够检测到变化
  const newData = JSON.parse(JSON.stringify(props.data));
  set(newData, path, value);
  emit("update:data", newData);
}

// 解析组件的函数
function resolveComponent(name: ComponentName): Component | string {
  const component = availableComponents.value[name];
  if (component) {
    return component;
  }
  // 作为一个兜底，警告并返回字符串，让 Vue 尝试解析全局组件
  console.warn(
    `Component "${name}" not found. Please ensure it's defined in the schema or pre-defined components.`
  );
  return name;
}
</script>

<template>
  <!-- [MODIFIED] h-screen -> h-full: 使组件高度适应父容器，而不是固定为视口高度 -->
  <div class="flex h-full bg-background text-foreground">
    <!-- Left Sidebar -->
    <!-- `min-h-0` 确保在 flex 布局下，即使内容溢出，侧边栏也不会撑开父容器高度 -->
    <aside class="w-1/4 min-w-[250px] border-r p-4 flex flex-col min-h-0">
      <!-- Group Meta -->
      <div
        v-if="
          typeof schema.groupMeta === 'object' && 'title' in schema.groupMeta
        "
        class="p-2"
      >
        <h2 class="text-lg font-semibold">
          {{ schema.groupMeta.title }}
        </h2>
        <p
          v-if="schema.groupMeta.description"
          class="text-sm text-muted-foreground"
        >
          {{ schema.groupMeta.description }}
        </p>
      </div>
      <component :is="schema.groupMeta" v-else />

      <!-- Separator -->
      <Separator
        class="my-4"
        v-if="schema.content.length > 0 && schema.content[0] !== 'Separator'"
      />

      <!-- Navigation List -->
      <!-- 如果左侧导航项过多，它将在此区域内被截断，但不会产生滚动条（符合“不可滑动”的要求），也不会影响整体布局 -->
      <nav class="flex flex-col space-y-1">
        <template v-for="(item, index) in schema.content" :key="index">
          <template v-if="typeof item === 'object'">
            <button
              @click="handleGroupClick(item)"
              :class="[
                'flex items-center space-x-2 p-2 rounded-md text-left transition-colors w-full',
                clickableGroups.indexOf(item) === activeGroupIndex
                  ? 'bg-secondary text-secondary-foreground'
                  : 'hover:bg-muted',
              ]"
            >
              <span
                v-if="typeof item.svg === 'string'"
                v-html="item.svg"
                class="w-5 h-5 shrink-0"
              ></span>
              <component :is="item.svg" v-else class="w-5 h-5 shrink-0" />
              <span>{{ item.title }}</span>
            </button>
          </template>
          <template v-else-if="item === 'Separator'">
            <Separator class="my-2" />
          </template>
        </template>
      </nav>
    </aside>

    <!-- Right Content Panel -->
    <!-- `min-h-0` 同样确保右侧面板高度受控 -->
    <main v-if="activeGroup" class="w-3/4 min-h-0">
      <!-- ScrollArea 设置为 h-full，它将填满 <main> 元素的可用高度，并为其内部内容提供滚动条 -->
      <ScrollArea class="h-full">
        <div class="max-w-4xl mx-auto pl-8 pr-8 pt-8 pb-24">
          <!-- Header -->
          <h1 class="text-3xl font-bold">
            {{ activeGroup.content.title }}
          </h1>
          <Separator class="my-6" />

          <!-- Content Rows -->
          <div class="space-y-4">
            <div
              v-for="(rowGroup, rgIndex) in activeGroup.content.content"
              :key="rgIndex"
            >
              <h3 v-if="rowGroup.title" class="text-xl font-semibold mb-4">
                {{ rowGroup.title }}
              </h3>
              <div class="space-y-2">
                <div
                  v-for="(row, rIndex) in rowGroup.content"
                  :key="`${rgIndex}-${rIndex}`"
                >
                  <!-- 布局: Top-Bottom -->
                  <div
                    v-if="row.useTopBottom"
                    class="flex flex-col space-y-2 p-4"
                  >
                    <label class="font-medium">{{ row.title }}</label>
                    <component
                      :is="resolveComponent(row.component)"
                      v-bind="row.props"
                      :modelValue="get(data, row.accessChain)"
                      @update:modelValue="updateData(row.accessChain, $event)"
                    />
                    <p
                      v-if="row.description"
                      class="text-sm text-muted-foreground"
                    >
                      {{ row.description }}
                    </p>
                  </div>

                  <!-- 默认布局: Left-Right -->
                  <Item v-else>
                    <ItemContent>
                      <ItemTitle
                        class="text-base font-medium text-foreground"
                        >{{ row.title }}</ItemTitle
                      >
                      <ItemDescription
                        v-if="row.description"
                        class="text-sm text-muted-foreground"
                      >
                        {{ row.description }}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <div class="w-72 flex justify-end">
                        <component
                          :is="resolveComponent(row.component)"
                          v-bind="row.props"
                          :modelValue="get(data, row.accessChain)"
                          @update:modelValue="
                            updateData(row.accessChain, $event)
                          "
                        />
                      </div>
                    </ItemActions>
                  </Item>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </main>
  </div>
</template>

<style>
:root {
  font-size: clamp(12px, 1vw + 0.1rem, 14px);
}

textarea:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}
</style>
