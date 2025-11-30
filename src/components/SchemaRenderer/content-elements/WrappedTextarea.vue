<!-- src/components/SchemaRenderer/content-elements/WrappedTextarea.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { Textarea } from "@/components/ui/textarea";

// --- Props 和 Emits ---

const props = defineProps<{
  // modelValue 可以是字符串、数字或可序列化的对象
  modelValue?: string | number | object;
  placeholder?: string;
  class?: string;
}>();

const emit = defineEmits(["update:modelValue"]);

// --- Computed ---

// 计算属性，用于向底层的 Textarea 提供要显示的值
const displayValue = computed(() => {
  const value = props.modelValue;
  // 如果 modelValue 是一个非 null 的对象，则将其格式化为 JSON 字符串
  if (typeof value === "object" && value !== null) {
    try {
      // JSON.stringify(value, null, 2) 会生成一个带缩进的、易于阅读的 JSON 字符串
      return JSON.stringify(value, null, 2);
    } catch (error) {
      console.error("Failed to stringify object:", error);
      return "Invalid Object"; // 出错时显示错误信息
    }
  }
  // 否则，直接转换为字符串（处理 null, undefined 等情况）
  return String(value ?? "");
});

// --- 方法 ---

// 处理来自底层 Textarea 的更新事件
function handleUpdate(newValue: string | number) {
  const valueStr = String(newValue);

  // 检查原始的 modelValue 是否是对象类型
  // 如果是，我们应该尝试将输入的新字符串解析回对象
  if (typeof props.modelValue === "object" && props.modelValue !== null) {
    try {
      // 尝试解析字符串为 JSON
      const parsedObject = JSON.parse(valueStr);
      // 解析成功，发出 update 事件，值为解析后的对象
      emit("update:modelValue", parsedObject);
    } catch (error) {
      // 如果 JSON 解析失败（例如，用户输入的格式不正确）
      // 则直接发出原始的、未解析的字符串
      // 这样父组件可以知道数据是无效的，并可以进行相应的处理（如显示错误提示）
      emit("update:modelValue", valueStr);
    }
  } else {
    // 如果原始值不是对象，则直接发出新字符串
    emit("update:modelValue", valueStr);
  }
}
</script>

<template>
  <Textarea
    :model-value="displayValue"
    @update:model-value="handleUpdate"
    :placeholder="props.placeholder"
    :class="props.class"
  />
</template>
