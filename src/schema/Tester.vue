<!-- src/schema/Tester.vue  -->
<script setup lang="ts">
defineProps<{ path: string }>();
// import TEST from "../TEST.vue";
import { useVueComponent } from "@/features/FileSystem";
const test = useVueComponent("global/components/TEST.vue");
</script>

<template>
  暂时空空如也
  <!-- <TEST></TEST> -->
  <component :is="test"></component>
</template>
