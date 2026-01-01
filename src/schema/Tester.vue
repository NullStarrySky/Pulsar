<!-- src/schema/Tester.vue -->
<script setup lang="ts">
// import MarkdownRenderer from "markstream-vue";
import { ref } from "vue";
import Textarea from "@/components/ui/textarea/Textarea.vue";

const rendererContent = ref("");
</script>

<template>
  <div>
    这是个专门用来测试的组件<br />
    <div class="flex">
      <Textarea v-model="rendererContent" class="w-[30%]"></Textarea>
      <!-- <MarkdownRenderer
        :content="rendererContent"
        class="w-[70%]"
      ></MarkdownRenderer> -->
    </div>
  </div>
</template>
