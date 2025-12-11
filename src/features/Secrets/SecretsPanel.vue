<!-- src/features/Secrets/SecretsPanel.vue -->
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { push } from "notivue";
import { useSecretsStore } from "./Secrets.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KeyIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-vue-next";
import { cn } from "@/lib/utils";
import { AcceptableValue } from "reka-ui";

const store = useSecretsStore();
const isCreating = ref(false);

// 表单状态
const newKeyName = ref("");
const newKeyValue = ref("");
const selectedPreset = ref("");

// 加载状态，用于删除按钮的 loading 效果（可选）
const processingKey = ref<string | null>(null);

const PRESET_KEYS = [
  { label: "自定义", value: "CUSTOM" },
  { label: "Exa Search", value: "EXA_API_KEY" },
  { label: "Firecrawl", value: "FIRECRAWL_API_KEY" },
  { label: "OpenAI", value: "OPENAI_API_KEY" },
];

onMounted(() => {
  store.loadKeys();
});

function handlePresetChange(value: AcceptableValue) {
  selectedPreset.value = String(value);
  newKeyName.value = value === "CUSTOM" ? "" : String(value);
}

async function handleSave() {
  if (!newKeyName.value || !newKeyValue.value) {
    push.warning({ title: "警告", message: "请填写完整信息" });
    return;
  }
  try {
    await store.writeSecretKey(newKeyName.value, newKeyValue.value);
    push.success({ message: "密钥保存成功" });
    isCreating.value = false;
    newKeyName.value = "";
    newKeyValue.value = "";
    selectedPreset.value = "";
  } catch (e) {
    push.error({ message: "保存失败" });
  }
}

// [新增] 删除处理函数
async function handleDelete(keyName: string) {
  // 简单的确认逻辑，也可以换成 Dialog 组件
  if (!confirm(`确定要删除密钥 "${keyName}" 吗？此操作不可恢复。`)) {
    return;
  }

  processingKey.value = keyName;
  try {
    await store.deleteSecretKey(keyName);
    push.success({ message: "密钥已删除" });
  } catch (e) {
    push.error({ message: "删除失败" });
  } finally {
    processingKey.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-background text-foreground text-sm">
    <!-- Header -->
    <div
      class="p-3 border-b border-border flex justify-between items-center shrink-0"
    >
      <h2 class="font-semibold tracking-tight flex items-center gap-2 text-sm">
        <KeyIcon class="w-4 h-4 text-muted-foreground" />
        密钥管理
      </h2>
      <Button
        variant="ghost"
        size="icon"
        @click="isCreating = !isCreating"
        :class="cn('h-8 w-8', isCreating && 'bg-accent text-accent-foreground')"
      >
        <PlusIcon class="w-4 h-4" />
      </Button>
    </div>

    <!-- Create Form Area -->
    <div
      v-if="isCreating"
      class="p-3 bg-muted/40 border-b border-border animate-in slide-in-from-top-2 fade-in-20 duration-200"
    >
      <div class="space-y-3">
        <div class="space-y-1.5">
          <Label class="text-xs text-muted-foreground">类型</Label>
          <Select
            v-model="selectedPreset"
            @update:modelValue="handlePresetChange"
          >
            <SelectTrigger class="h-8 text-xs bg-background">
              <SelectValue placeholder="选择预设" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="item in PRESET_KEYS"
                :key="item.value"
                :value="item.value"
                class="text-xs"
              >
                {{ item.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-1.5">
          <Label class="text-xs text-muted-foreground">键名</Label>
          <Input
            v-model="newKeyName"
            class="h-8 text-xs bg-background font-mono"
            :disabled="!!selectedPreset && selectedPreset !== 'CUSTOM'"
            placeholder="MY_API_KEY"
          />
        </div>

        <div class="space-y-1.5">
          <Label class="text-xs text-muted-foreground">键值</Label>
          <Input
            v-model="newKeyValue"
            type="password"
            class="h-8 text-xs bg-background font-mono"
            placeholder="sk-..."
          />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs px-3"
            @click="isCreating = false"
          >
            取消
          </Button>
          <Button size="sm" class="h-7 text-xs px-3" @click="handleSave">
            保存
          </Button>
        </div>
      </div>
    </div>

    <!-- Key List -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <div
        v-if="store.keyList.length === 0"
        class="flex flex-col items-center justify-center py-10 text-muted-foreground space-y-2"
      >
        <div class="p-2 bg-muted rounded-full">
          <ShieldCheckIcon class="w-6 h-6 opacity-50" />
        </div>
        <span class="text-xs">暂无已配置的密钥</span>
      </div>

      <div
        v-for="keyName in store.keyList"
        :key="keyName"
        :class="
          cn(
            'flex items-center justify-between p-2 pl-3 rounded-md',
            'border border-border/50 bg-card',
            // 移除 hover:text-accent-foreground，防止文字颜色在 hover 时变化太大影响阅读
            'hover:bg-accent/50 transition-colors group'
          )
        "
      >
        <!-- 左侧：图标 + 键名 -->
        <div class="flex items-center gap-2.5 overflow-hidden">
          <ShieldCheckIcon
            class="w-4 h-4 text-emerald-600 dark:text-emerald-500 shrink-0"
          />
          <span
            class="truncate font-medium font-mono text-xs text-foreground"
            :title="keyName"
          >
            {{ keyName }}
          </span>
        </div>

        <!-- 右侧：Badge + 删除按钮 -->
        <div class="flex items-center gap-2 shrink-0">
          <Badge
            v-if="['EXA_API_KEY', 'FIRECRAWL_API_KEY'].includes(keyName)"
            variant="secondary"
            class="text-[10px] px-1.5 py-0 h-5 font-normal tracking-wide"
          >
            WEB
          </Badge>

          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
            :disabled="processingKey === keyName"
            @click="handleDelete(keyName)"
            title="删除密钥"
          >
            <Trash2Icon class="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
