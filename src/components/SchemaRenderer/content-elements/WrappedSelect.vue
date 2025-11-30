<!-- src/components/SchemaRenderer/content-elements/WrappedSelect.vue -->
<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AcceptableValue } from "reka-ui";

defineProps<{
  modelValue?: string | number;
  placeholder?: string;
  options: { value: string | number; label: string }[];
  disabled?: boolean;
}>();

const emit = defineEmits(["update:modelValue"]);

function handleUpdate(value: AcceptableValue) {
  emit("update:modelValue", String(value));
}
</script>

<template>
  <Select
    :model-value="modelValue?.toString()"
    :disabled="disabled"
    @update:model-value="handleUpdate"
  >
    <SelectTrigger>
      <SelectValue :placeholder="placeholder" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem
          v-for="option in options"
          :key="option.value"
          :value="option.value.toString()"
        >
          {{ option.label }}
        </SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
</template>
