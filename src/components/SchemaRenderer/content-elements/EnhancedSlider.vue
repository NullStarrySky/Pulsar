<!-- src/components/SchemaRenderer/content-elements/EnhancedSlider.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// --- Props 和 Emits ---

const props = withDefaults(
  defineProps<{
    modelValue?: number;
    min?: number;
    max?: number;
    step?: number;
    showInput?: boolean;
    allowExceedMax?: boolean;
    class?: string;
  }>(),
  {
    modelValue: 0,
    min: 0,
    max: 100,
    step: 1,
    showInput: true,
    allowExceedMax: false,
    class: "",
  }
);

const emit = defineEmits(["update:modelValue"]);

// --- 计算属性 ---

// 为 Slider 组件创建一个计算属性，因为它需要一个数组作为 modelValue
const sliderValue = computed({
  get: () => [props.modelValue],
  set: (val: number[]) => {
    emit("update:modelValue", val[0]);
  },
});

// 为 Input 组件创建一个计算属性，用于处理值更新和边界限制
const inputValue = computed({
  get: () => props.modelValue,
  set: (val: string | number) => {
    let newValue = Number(val);

    if (isNaN(newValue)) {
      // 如果输入无效，则不发出更新，输入框将在下一次渲染时恢复
      return;
    }

    // 除非 allowExceedMax 为 true，否则将值限制在最大值以内
    if (!props.allowExceedMax && newValue > props.max) {
      newValue = props.max;
    }

    // 始终确保值不小于最小值
    if (newValue < props.min) {
      newValue = props.min;
    }

    // 仅当最终值与当前值不同时才发出更新，以防止无限循环
    if (newValue !== props.modelValue) {
      emit("update:modelValue", newValue);
    }
  },
});
</script>

<template>
  <div :class="cn('flex items-center gap-4 w-full', props.class)">
    <Slider
      v-model="sliderValue"
      :min="min"
      :max="max"
      :step="step"
      class="grow"
    />
    <Input
      v-if="showInput"
      type="number"
      v-model="inputValue"
      :min="min"
      :max="allowExceedMax ? undefined : max"
      :step="step"
      class="w-20"
    />
  </div>
</template>
