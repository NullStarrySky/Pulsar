<!-- src/features/FileSystem/FileTree/components/FileOperationsDialog.vue -->
<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

defineProps<{
  trashOpen: boolean;
  permanentDeleteOpen: boolean;
  itemToDelete: { name: string } | null;
}>();

defineEmits<{
  (e: "update:trashOpen", v: boolean): void;
  (e: "update:permanentDeleteOpen", v: boolean): void;
  (e: "confirm-trash"): void;
  (e: "confirm-permanent-delete"): void;
}>();
</script>

<template>
  <AlertDialog
    :open="trashOpen"
    @update:open="$emit('update:trashOpen', $event)"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>确认移入垃圾桶</AlertDialogTitle>
        <AlertDialogDescription
          >确定将 "{{ itemToDelete?.name }}"
          移入垃圾桶吗？</AlertDialogDescription
        >
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="$emit('update:trashOpen', false)"
          >取消</AlertDialogCancel
        >
        <AlertDialogAction @click="$emit('confirm-trash')"
          >确认</AlertDialogAction
        >
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog
    :open="permanentDeleteOpen"
    @update:open="$emit('update:permanentDeleteOpen', $event)"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle class="text-red-600">危险操作</AlertDialogTitle>
        <AlertDialogDescription>
          确定要<span class="font-bold text-red-600">永久删除</span> "{{
            itemToDelete?.name
          }}" 吗？此操作无法撤销！
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="$emit('update:permanentDeleteOpen', false)"
          >取消</AlertDialogCancel
        >
        <AlertDialogAction
          @click="$emit('confirm-permanent-delete')"
          class="bg-red-600 hover:bg-red-700"
          >确认删除</AlertDialogAction
        >
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
