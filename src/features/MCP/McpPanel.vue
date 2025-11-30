<!-- src/features/MCP/McpPanel.vue -->
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useMcpManagerStore } from "./MCP.store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge"; // 新增 Badge
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  ServerIcon,
  Loader2Icon,
  TerminalSquareIcon,
  GlobeIcon,
} from "lucide-vue-next";
import { cn } from "@/lib/utils";

// 引入子组件
import McpServerForm from "./components/McpServerForm.vue";
import JsonImportDialog from "./components/JsonImportDialog.vue";

const store = useMcpManagerStore();

const isFormOpen = ref(false);
const isJsonImportOpen = ref(false);
const currentlyEditingKey = ref<string | null>(null);
const isLoading = ref(false);

onMounted(async () => {
  isLoading.value = true;
  await store.loadConfig();
  isLoading.value = false;
});

// 打开新建
const openNewForm = () => {
  currentlyEditingKey.value = null;
  isFormOpen.value = true;
};

// 打开编辑
const openEditForm = (key: string) => {
  currentlyEditingKey.value = key;
  isFormOpen.value = true;
};

// 处理保存
const handleFormSave = async (serverData: { key: string; config: any }) => {
  await store.saveServer(
    serverData.key,
    serverData.config,
    currentlyEditingKey.value
  );
  isFormOpen.value = false; // 确保关闭表单
};

// 处理删除
const handleDelete = async (key: string) => {
  // 实际项目中建议替换为 shadcn 的 AlertDialog
  if (confirm(`确定要删除 ${key} 吗?`)) {
    await store.deleteServer(key);
  }
};
</script>

<template>
  <div class="flex flex-col h-full bg-background text-foreground text-sm">
    <!-- Header -->
    <div
      class="p-3 border-b border-border flex justify-between items-center shrink-0"
    >
      <h2 class="font-semibold tracking-tight flex items-center gap-2 text-sm">
        <ServerIcon class="w-4 h-4 text-muted-foreground" />
        MCP Servers
      </h2>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" class="h-8 w-8">
            <PlusIcon class="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @click="openNewForm">
            <PlusIcon class="w-4 h-4 mr-2" />
            手动添加
          </DropdownMenuItem>
          <DropdownMenuItem @click="isJsonImportOpen = true">
            <TerminalSquareIcon class="w-4 h-4 mr-2" />
            从 JSON 导入
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-3 space-y-3 relative">
      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10"
      >
        <div class="flex flex-col items-center gap-2">
          <Loader2Icon class="w-6 h-6 animate-spin text-primary" />
          <span class="text-xs text-muted-foreground">加载配置中...</span>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="!isLoading && Object.keys(store.mcpServers).length === 0"
        class="flex flex-col items-center justify-center py-10 text-muted-foreground space-y-3"
      >
        <div class="p-3 bg-muted rounded-full">
          <ServerIcon class="w-6 h-6 opacity-50" />
        </div>
        <div class="text-center space-y-1">
          <p class="font-medium text-sm">暂无服务</p>
          <p class="text-xs opacity-70">点击右上角 + 号添加 MCP 服务</p>
        </div>
      </div>

      <!-- List -->
      <div
        v-for="(config, key) in store.mcpServers"
        :key="key"
        :class="
          cn(
            'group relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm',
            'transition-all hover:border-primary/50'
          )
        "
      >
        <!-- Card Header Row -->
        <div class="flex justify-between items-start gap-2">
          <div class="font-medium text-sm truncate flex-1" :title="String(key)">
            {{ key }}
          </div>

          <!-- Actions (Hover visible) -->
          <div
            class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-muted-foreground hover:text-foreground"
              @click="openEditForm(String(key))"
            >
              <PencilIcon class="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              @click="handleDelete(String(key))"
            >
              <Trash2Icon class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <!-- Configuration Block -->
        <div
          class="rounded-md bg-muted/50 border border-border/50 p-2 text-xs font-mono"
        >
          <!-- STDIO Mode -->
          <div
            v-if="!config.type || config.type === 'stdio'"
            class="space-y-1.5"
          >
            <div class="flex items-center gap-2">
              <Badge
                variant="secondary"
                class="h-4 px-1 text-[10px] tracking-wide"
              >
                <TerminalSquareIcon class="w-3 h-3 mr-1" /> STDIO
              </Badge>
            </div>
            <div
              class="truncate text-muted-foreground select-all"
              :title="config.command"
            >
              $ {{ config.command }}
            </div>
          </div>

          <!-- SSE / Other Mode -->
          <div v-else class="space-y-1.5">
            <div class="flex items-center gap-2">
              <Badge
                variant="outline"
                class="h-4 px-1 text-[10px] tracking-wide bg-background"
              >
                <GlobeIcon class="w-3 h-3 mr-1" />
                {{ config.type.toUpperCase() }}
              </Badge>
            </div>
            <div
              class="truncate text-muted-foreground select-all"
              :title="config.url"
            >
              {{ config.url }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <!-- 保持原有逻辑传递 -->
    <McpServerForm
      :is-open="isFormOpen"
      :server-key="currentlyEditingKey"
      :server-config="
        currentlyEditingKey ? store.mcpServers[currentlyEditingKey] : undefined
      "
      @update:is-open="isFormOpen = $event"
      @save="handleFormSave"
    />

    <JsonImportDialog
      :is-open="isJsonImportOpen"
      @update:is-open="isJsonImportOpen = $event"
      @import="store.importJson"
    />
  </div>
</template>
