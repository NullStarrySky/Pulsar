<!-- src/schema/Tester.vue  -->
<script setup lang="ts">
import Textarea from "@/components/ui/textarea/Textarea.vue";
import { MarkdownRender } from "markstream-vue";
import { ref } from "vue";
const rendererContent = ref("");
</script>

<template>
  <div>
    这是个专门用来测试的组件<br />
    <div class="flex">
      <Textarea v-model="rendererContent" class="w-[30%]"></Textarea>
      <MarkdownRender :content="rendererContent"></MarkdownRender>
    </div>
  </div>
</template>
