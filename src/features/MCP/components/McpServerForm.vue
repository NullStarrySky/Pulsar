<!-- src/features/MCP/components/McpServerForm.vue -->
<script setup lang="ts">
import { ref, watch, type PropType } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircleIcon, XCircleIcon } from "lucide-vue-next";

// --- 1. 定义组件的 Props 和 Emits ---

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  serverKey: {
    // 正在编辑的服务器的 key
    type: String as PropType<string | null>,
    default: null,
  },
  serverConfig: {
    // 正在编辑的服务器的配置
    type: Object as PropType<any>,
    default: () => ({}),
  },
});

const emit = defineEmits(["update:isOpen", "save"]);

// --- 2. 表单状态管理 ---

const name = ref("");
const type = ref<"stdio" | "sse" | "streamableHttp">("stdio");
const command = ref("");
const args = ref<string[]>([]);
const url = ref("");
const headers = ref<{ key: string; value: string }[]>([]);

// --- 3. 监听 Props 变化以填充表单 ---

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      if (props.serverKey && props.serverConfig) {
        // --- 编辑模式 ---
        name.value = props.serverKey;
        type.value = props.serverConfig.type || "stdio";

        if (type.value === "stdio") {
          command.value = props.serverConfig.command || "";
          args.value = [...(props.serverConfig.args || [])];
        } else {
          url.value = props.serverConfig.url || "";
          headers.value = Object.entries(props.serverConfig.headers || {}).map(
            ([key, value]) => ({ key, value: String(value) })
          );
        }
      } else {
        // --- 新建模式：重置表单 ---
        resetForm();
      }
    }
  }
);

// --- 4. 表单操作方法 ---

const resetForm = () => {
  name.value = "";
  type.value = "stdio";
  command.value = "";
  args.value = [];
  url.value = "";
  headers.value = [];
};

const addArg = () => args.value.push("");
const removeArg = (index: number) => args.value.splice(index, 1);

const addHeader = () => headers.value.push({ key: "", value: "" });
const removeHeader = (index: number) => headers.value.splice(index, 1);

const handleSave = () => {
  let config: any = {};

  if (type.value === "stdio") {
    config = { command: command.value, args: args.value.filter(Boolean) };
    // 如果 type 是默认的 stdio, manifest.json 中可以省略 type 字段
  } else {
    config = {
      type: type.value,
      url: url.value,
    };
    if (headers.value.length > 0) {
      config.headers = headers.value.reduce((acc, header) => {
        if (header.key) acc[header.key] = header.value;
        return acc;
      }, {} as Record<string, string>);
    }
  }

  emit("save", { key: name.value, config });
  closeDialog();
};

const closeDialog = () => {
  emit("update:isOpen", false);
};
</script>

<template>
  <Dialog :open="isOpen" @update:open="closeDialog">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ serverKey ? "编辑" : "新建" }} MCP 配置</DialogTitle>
        <DialogDescription> 填写服务器的详细信息。 </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- 名称和类型 -->
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="name" class="text-right">名称</Label>
          <Input id="name" v-model="name" class="col-span-3" />
        </div>
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="type" class="text-right">传输类型</Label>
          <Select v-model="type">
            <SelectTrigger class="col-span-3">
              <SelectValue placeholder="选择传输类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">STDIO</SelectItem>
              <SelectItem value="sse">SSE</SelectItem>
              <SelectItem value="streamableHttp">HTTP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- STDIO 特定字段 -->
        <template v-if="type === 'stdio'">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="command" class="text-right">命令</Label>
            <Input id="command" v-model="command" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-start gap-4">
            <Label class="text-right pt-2">参数</Label>
            <div class="col-span-3 space-y-2">
              <div
                v-for="(_, index) in args"
                :key="index"
                class="flex items-center gap-2"
              >
                <Input v-model="args[index]" />
                <Button variant="ghost" size="icon" @click="removeArg(index)">
                  <XCircleIcon class="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Button variant="outline" size="sm" @click="addArg">
                <PlusCircleIcon class="mr-2 h-4 w-4" />
                添加参数
              </Button>
            </div>
          </div>
        </template>

        <!-- SSE / HTTP 特定字段 -->
        <template v-else>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="url" class="text-right">服务器 URL</Label>
            <Input id="url" v-model="url" class="col-span-3" />
          </div>
          <!-- HTTP 特定字段 -->
          <div
            v-if="type === 'streamableHttp'"
            class="grid grid-cols-4 items-start gap-4"
          >
            <Label class="text-right pt-2">自定义 Headers</Label>
            <div class="col-span-3 space-y-2">
              <div
                v-for="(_, index) in headers"
                :key="index"
                class="flex items-center gap-2"
              >
                <Input v-model="headers[index].key" placeholder="Header 名称" />
                <Input v-model="headers[index].value" placeholder="Header 值" />
                <Button
                  variant="ghost"
                  size="icon"
                  @click="removeHeader(index)"
                >
                  <XCircleIcon class="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Button variant="outline" size="sm" @click="addHeader">
                <PlusCircleIcon class="mr-2 h-4 w-4" />
                添加 Header
              </Button>
            </div>
          </div>
        </template>
      </div>

      <DialogFooter>
        <Button variant="ghost" @click="closeDialog">取消</Button>
        <Button @click="handleSave">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
