<!-- src/features/MCP/components/JsonImportDialog.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// --- 1. 定义 Props 和 Emits ---

defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(["update:isOpen", "import"]);

// --- 2. 状态管理 ---

const jsonContent = ref("");
const errorMessage = ref("");

const placeholderJson = `{
  "mcpServers": {
    "my-server-example": {
      "command": "npx",
      "args": ["-y", "mcp-server-example"]
    }
  }
}`;

// --- 3. 事件处理 ---

const handleImport = () => {
  errorMessage.value = "";
  if (!jsonContent.value.trim()) {
    errorMessage.value = "内容不能为空。";
    return;
  }
  try {
    const parsed = JSON.parse(jsonContent.value);
    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      emit("import", parsed.mcpServers);
      closeDialog();
    } else {
      errorMessage.value = 'JSON 格式无效，必须包含一个 "mcpServers" 对象。';
    }
  } catch (error) {
    errorMessage.value = "JSON 解析失败，请检查格式。";
  }
};

const closeDialog = () => {
  jsonContent.value = "";
  errorMessage.value = "";
  emit("update:isOpen", false);
};
</script>

<template>
  <Dialog :open="isOpen" @update:open="closeDialog">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>从 JSON 导入</DialogTitle>
        <DialogDescription>
          将包含 "mcpServers" 键的 JSON 对象粘贴到下方。
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <Label for="json-input">JSON 内容</Label>
        <Textarea
          id="json-input"
          v-model="jsonContent"
          class="min-h-[200px] font-mono"
          :placeholder="placeholderJson"
        />
        <p v-if="errorMessage" class="text-sm text-destructive">
          {{ errorMessage }}
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" @click="closeDialog">取消</Button>
        <Button @click="handleImport">导入</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
