<!-- src/schema/modelConfig/components/ProviderModelsTable.vue -->
<template>
  <div>
    <Card>
      <CardHeader>
        <CardTitle>可用模型</CardTitle>
        <CardDescription> 该提供商支持以下类型的模型。 </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs default-value="chat" class="w-full">
          <TabsList class="grid w-full grid-cols-5">
            <TabsTrigger
              v-for="(label, key) in modelTypeMap"
              :key="key"
              :value="key"
            >
              {{ label }}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            v-for="(_, typeKey) in modelTypeMap"
            :key="typeKey"
            :value="typeKey"
            class="mt-4"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-20">状态</TableHead>
                  <TableHead>模型名称</TableHead>
                  <TableHead v-if="typeKey === 'chat'">功能</TableHead>
                  <TableHead class="w-40 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template
                  v-if="
                    (models as any)[typeKey] &&
                    (models as any)[typeKey].length > 0
                  "
                >
                  <TableRow
                    v-for="model in (models as any)[typeKey]"
                    :key="`${typeKey}-${model.name}`"
                  >
                    <TableCell>
                      <Switch v-model="model.enabled" />
                    </TableCell>
                    <TableCell class="font-medium">
                      <TooltipProvider :delay-duration="100">
                        <Tooltip>
                          <TooltipTrigger>
                            <span class="block max-w-[200px] truncate">
                              {{ model.name }}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{{ model.name }}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell v-if="typeKey === 'chat'">
                      <div class="flex items-center gap-3">
                        <TooltipProvider
                          v-for="cap in allCapabilities"
                          :key="cap"
                        >
                          <Tooltip>
                            <TooltipTrigger>
                              <component
                                :is="capabilityIcons[cap]"
                                v-if="capabilityIcons[cap]"
                                class="h-4 w-4"
                                :class="
                                  (model as ChatModel).capabilities?.includes(
                                    cap,
                                  )
                                    ? 'text-foreground'
                                    : 'text-muted-foreground/30'
                                "
                              />
                            </TooltipTrigger>
                            <TooltipContent
                              ><p>
                                {{ cap }}
                              </p></TooltipContent
                            >
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                    <TableCell v-else>-</TableCell>
                    <TableCell class="text-right">
                      <div class="flex items-center justify-end gap-2">
                        <Button
                          v-if="typeKey === 'chat'"
                          variant="outline"
                          size="icon"
                          @click="handleTestModel(model.name)"
                        >
                          <Bot class="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          @click="
                            openEditDialog(
                              model,
                              typeKey as
                                | 'chat'
                                | 'embedding'
                                | 'image'
                                | 'speech'
                                | 'transcription'
                            )
                          "
                        >
                          <Pencil class="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </template>
                <TableRow v-else>
                  <TableCell
                    :colspan="typeKey === 'chat' ? 4 : 3"
                    class="h-24 text-center"
                  >
                    该类型下没有可用的模型。
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter>
        <Button @click="openAddDialog">添加新模型</Button>
      </CardFooter>
    </Card>

    <Dialog :open="isDialogOpen" @update:open="isDialogOpen = $event">
      <DialogContent class="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? "编辑模型" : "添加新模型" }}</DialogTitle>
          <DialogDescription>
            为该提供商配置一个新的模型或修改现有模型。
          </DialogDescription>
        </DialogHeader>

        <div v-if="editingModel" class="grid gap-6 py-4">
          <!-- Model Type Selector (only for new models) -->
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="model-type" class="text-right">模型类型</Label>
            <Select v-model="editingModel.typeKey" :disabled="isEditing">
              <SelectTrigger id="model-type" class="col-span-3">
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="(label, key) in modelTypeMap"
                  :key="key"
                  :value="key"
                >
                  {{ label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Model Name -->
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="model-name" class="text-right">模型名称</Label>
            <Input
              id="model-name"
              v-model="editingModel.name"
              class="col-span-3"
              placeholder="例如 gpt-4-turbo"
            />
          </div>

          <!-- Enabled Switch -->
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="model-enabled" class="text-right">状态</Label>
            <Switch id="model-enabled" v-model="editingModel.enabled" />
          </div>

          <!-- Capabilities (for Chat models only) -->
          <template v-if="editingModel.isChat">
            <Separator />
            <div class="grid grid-cols-4 items-start gap-4">
              <Label class="text-right pt-2">功能</Label>
              <div class="col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Button
                  v-for="cap in allCapabilities"
                  :key="cap"
                  :variant="
                    editingModel.capabilities.includes(cap)
                      ? 'secondary'
                      : 'outline'
                  "
                  @click="toggleCapability(cap)"
                  class="h-auto text-xs py-2"
                >
                  <component :is="capabilityIcons[cap]" class="h-4 w-4 mr-2" />
                  {{ cap }}
                </Button>
              </div>
            </div>
          </template>
        </div>

        <DialogFooter>
          <Button
            v-if="isEditing"
            variant="destructive"
            @click="handleDelete"
            class="mr-auto"
            >删除</Button
          >
          <Button type="button" variant="ghost" @click="isDialogOpen = false"
            >取消</Button
          >
          <Button
            type="submit"
            @click="handleSave"
            :disabled="!editingModel?.name"
            >保存</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup lang="ts">
import { ref, type Component, watch } from "vue";
import {
  Image as ImageIcon,
  Box,
  ToyBrick,
  Zap,
  BrainCircuit,
  Pencil,
  Bot,
} from "lucide-vue-next";
import type {
  ProviderData,
  Capability,
  ChatModel,
  GenericModel,
} from "@/schema/modelConfig/modelConfig.types";

import { generateText } from "@/ai";
import { push } from "notivue";

// --- UI Components ---
import { Button } from "@/components/ui/button";
import Switch from "@/components/ui/switch/Switch.vue";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Input from "@/components/ui/input/Input.vue";
import Label from "@/components/ui/label/Label.vue";
import Separator from "@/components/ui/separator/Separator.vue";

// --- Types ---
type ProviderModels = ProviderData["models"];
type ModelPayload = ChatModel | GenericModel;

type EditingModel = {
  name: string;
  typeKey: keyof ProviderModels;
  enabled: boolean;
  capabilities: Capability[];
  isChat: boolean;
  originalName?: string;
};

// --- Props and Emits ---
const props = defineProps<{
  models: ProviderModels;
  providerKey: string;
}>();
const emit = defineEmits<{
  (
    e: "add-model",
    payload: { newModel: ModelPayload; typeKey: keyof ProviderModels }
  ): void;
  (
    e: "update-model",
    payload: {
      updatedModel: ModelPayload;
      originalName: string;
      typeKey: keyof ProviderModels;
    }
  ): void;
  (
    e: "delete-model",
    payload: { name: string; typeKey: keyof ProviderModels }
  ): void;
}>();

// --- Dialog State ---
const isDialogOpen = ref(false);
const isEditing = ref(false);
const editingModel = ref<EditingModel | null>(null);

// --- Static Data ---
const allCapabilities: Capability[] = [
  "Image Input",
  "Object Generation",
  "Tool Usage",
  "Tool Streaming",
  "Reasoning",
];
const capabilityIcons: Record<Capability, Component> = {
  "Image Input": ImageIcon,
  "Object Generation": Box,
  "Tool Usage": ToyBrick,
  "Tool Streaming": Zap,
  Reasoning: BrainCircuit,
};
const modelTypeMap: Record<keyof ProviderModels, string> = {
  chat: "语言模型",
  embedding: "嵌入模型",
  image: "图片模型",
  speech: "语音模型",
  transcription: "转录模型",
};

// --- Event Handlers ---

async function handleTestModel(modelName: string) {
  const fullModelId = `${props.providerKey}/${modelName}`;

  const notification = push.promise({
    title: "正在测试模型...",
    message: `正在向 ${fullModelId} 发送请求...`,
  });

  try {
    const result = await generateText({
      model: fullModelId,
      prompt: "你好，请用一句话介绍一下你自己。",
    });

    notification.resolve({
      title: "测试成功!",
      message: result.text,
    });
  } catch (error) {
    console.error("模型测试失败:", error);
    notification.reject({
      title: "测试失败",
      message: (error as Error).message || "发生未知错误。",
    });
  }
}

function openEditDialog(model: ModelPayload, typeKey: keyof ProviderModels) {
  isEditing.value = true;
  const isChat = typeKey === "chat";
  editingModel.value = {
    name: model.name,
    originalName: model.name,
    typeKey: typeKey,
    enabled: model.enabled,
    capabilities: isChat ? [...((model as ChatModel).capabilities || [])] : [],
    isChat,
  };
  isDialogOpen.value = true;
}

function openAddDialog() {
  isEditing.value = false;
  editingModel.value = {
    name: "",
    typeKey: "chat",
    enabled: true,
    capabilities: [],
    isChat: true,
  };
  isDialogOpen.value = true;
}

function toggleCapability(cap: Capability) {
  if (!editingModel.value || !editingModel.value.isChat) return;
  const caps = editingModel.value.capabilities;
  const index = caps.indexOf(cap);
  if (index > -1) {
    caps.splice(index, 1);
  } else {
    caps.push(cap);
  }
}

function handleSave() {
  if (!editingModel.value || !editingModel.value.name) return;
  let modelPayload: ModelPayload;
  if (editingModel.value.isChat) {
    modelPayload = {
      name: editingModel.value.name.trim(),
      enabled: editingModel.value.enabled,
      capabilities: editingModel.value.capabilities,
    };
  } else {
    modelPayload = {
      name: editingModel.value.name.trim(),
      enabled: editingModel.value.enabled,
    };
  }
  if (isEditing.value) {
    emit("update-model", {
      updatedModel: modelPayload,
      originalName: editingModel.value.originalName!,
      typeKey: editingModel.value.typeKey,
    });
  } else {
    emit("add-model", {
      newModel: modelPayload,
      typeKey: editingModel.value.typeKey,
    });
  }
  isDialogOpen.value = false;
}

function handleDelete() {
  if (!editingModel.value || !editingModel.value.originalName) return;
  if (confirm(`确定要删除模型 "${editingModel.value.originalName}" 吗？`)) {
    emit("delete-model", {
      name: editingModel.value.originalName,
      typeKey: editingModel.value.typeKey,
    });
    isDialogOpen.value = false;
  }
}

watch(
  () => editingModel.value?.typeKey,
  (newType) => {
    if (editingModel.value && !isEditing.value) {
      editingModel.value.isChat = newType === "chat";
    }
  }
);
</script>
