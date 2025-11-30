// src/schema/chat/composables/useMessageEditor.ts
import { ref } from "vue";
import type { FlattenedChat } from "../chat.types"; // 调整路径

export function useMessageEditor(
  flattenedChat: FlattenedChat, // 或传递 Ref
  callbacks: {
    onSetContent: (index: number, content: string) => void;
    onNewMessage: (
      index: number,
      content: string,
      meta: any,
      active: boolean
    ) => void;
    onNewBranch: (index: number, content: string, active: boolean) => void;
  }
) {
  const editingIndex = ref<number | null>(null);
  const editingContent = ref("");

  function startEdit(index: number) {
    const message = flattenedChat.messages[index];
    const content = message?.content;
    if (content && content.type === "message") {
      editingIndex.value = index;
      editingContent.value = content.content;
    }
  }

  function cancelEdit() {
    editingIndex.value = null;
    editingContent.value = "";
  }

  function saveEdit() {
    if (editingIndex.value !== null) {
      callbacks.onSetContent(editingIndex.value, editingContent.value);
      cancelEdit();
    }
  }

  function saveAsNewMessage() {
    if (editingIndex.value !== null && editingContent.value) {
      callbacks.onNewMessage(
        editingIndex.value,
        editingContent.value,
        {},
        true
      );
      cancelEdit();
    }
  }

  function saveAsNewBranch() {
    if (editingIndex.value !== null && editingContent.value) {
      callbacks.onNewBranch(editingIndex.value, editingContent.value, true);
      cancelEdit();
    }
  }

  return {
    editingIndex,
    editingContent,
    startEdit,
    cancelEdit,
    saveEdit,
    saveAsNewMessage,
    saveAsNewBranch,
  };
}
