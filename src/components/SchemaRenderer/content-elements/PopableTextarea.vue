<!-- src/components/SchemaRenderer/content-elements/PopableTextarea.vue -->
<script setup lang="ts">
import WrappedTextarea from "./WrappedTextarea.vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Expand } from "lucide-vue-next";

// --- Props 和 Emits ---

const props = withDefaults(
  defineProps<{
    modelValue?: string | object;
    placeholder?: string;
    dialogTitle?: string;
    class?: string;
  }>(),
  {
    modelValue: "",
    placeholder: undefined,
    dialogTitle: "编辑内容",
    class: "",
  }
);

const emit = defineEmits(["update:modelValue"]);

// --- 方法 ---

function handleUpdate(value: any) {
  emit("update:modelValue", value);
}
</script>

<template>
  <div :class="['relative group w-full', props.class]">
    <WrappedTextarea
      :modelValue="props.modelValue"
      @update:modelValue="handleUpdate"
      :placeholder="props.placeholder"
      class="pr-8 resize-none"
    />

    <Dialog>
      <!-- 触发器：悬浮时显示的展开按钮 -->
      <DialogTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Expand class="h-4 w-4" />
          <span class="sr-only">展开</span>
        </Button>
      </DialogTrigger>

      <!-- 弹窗内容 -->
      <DialogContent class="sm:max-w-2xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{{ props.dialogTitle }}</DialogTitle>
        </DialogHeader>
        <div class="grow h-full">
          <WrappedTextarea
            :modelValue="props.modelValue"
            @update:modelValue="handleUpdate"
            :placeholder="props.placeholder"
            class="h-full w-full resize-none focus-visible:ring-0 focus-visible:ring-offset-0 border-0"
          />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
