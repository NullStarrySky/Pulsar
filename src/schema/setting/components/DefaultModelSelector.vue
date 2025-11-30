<!-- src/schema/setting/components/DefaultModelSelector.vue -->
<template>
  <div class="space-y-6">
    <!-- Chat Model Selector -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <Label
          class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          默认对话模型 (Chat)
        </Label>
        <Badge
          variant="outline"
          class="text-xs font-normal text-muted-foreground"
        >
          {{ availableChatModels.length }} 个可用
        </Badge>
      </div>

      <Select
        :model-value="modelValue?.chat || ''"
        @update:model-value="(val) => updateModel('chat', val)"
      >
        <SelectTrigger class="w-full">
          <SelectValue placeholder="选择一个默认对话模型..." />
        </SelectTrigger>
        <SelectContent>
          <div
            v-if="availableChatModels.length === 0"
            class="p-2 text-sm text-center text-muted-foreground"
          >
            无可用模型 (请先在模型配置中启用)
          </div>
          <template v-else>
            <SelectItem
              v-for="model in availableChatModels"
              :key="model.id"
              :value="model.id"
            >
              <span class="font-medium mr-2">{{ model.name }}</span>
              <span class="text-xs text-muted-foreground"
                >({{ model.provider }})</span
              >
            </SelectItem>
          </template>
        </SelectContent>
      </Select>
    </div>

    <!-- Embedding Model Selector -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <Label
          class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          默认向量化模型 (Embedding)
        </Label>
        <Badge
          variant="outline"
          class="text-xs font-normal text-muted-foreground"
        >
          {{ availableEmbeddingModels.length }} 个可用
        </Badge>
      </div>

      <Select
        :model-value="modelValue?.embedding || ''"
        @update:model-value="(val) => updateModel('embedding', val)"
      >
        <SelectTrigger class="w-full">
          <SelectValue placeholder="选择一个默认向量模型..." />
        </SelectTrigger>
        <SelectContent>
          <div
            v-if="availableEmbeddingModels.length === 0"
            class="p-2 text-sm text-center text-muted-foreground"
          >
            无可用模型
          </div>
          <template v-else>
            <SelectItem
              v-for="model in availableEmbeddingModels"
              :key="model.id"
              :value="model.id"
            >
              <span class="font-medium mr-2">{{ model.name }}</span>
              <span class="text-xs text-muted-foreground"
                >({{ model.provider }})</span
              >
            </SelectItem>
          </template>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useFileSystemStore } from "@/features/FileSystem/FileSystem.store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// 引入类型定义
import type { ProviderMetadata } from "@/schema/modelConfig/modelConfig.types";
import type { DefaultModelSetting } from "../setting.types";
import { AcceptableValue } from "reka-ui";

const props = defineProps<{
  modelValue: DefaultModelSetting;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: DefaultModelSetting): void;
}>();

const fsStore = useFileSystemStore();

/**
 * 提取模型信息的接口定义
 */
interface ModelOption {
  id: string; // 唯一标识: "provider/modelName"
  name: string; // 模型显示名称
  provider: string; // 提供商标识
}

/**
 * 获取标准化的 ProviderMetadata (ModelConfig)
 * 处理 store 中可能存在的 Wrapper 类实例或直接对象的情况
 */
const providersConfig = computed<ProviderMetadata>(() => {
  const rawConfig = fsStore.modelConfig;
  if (!rawConfig) return {};

  // 如果是 ModelConfigWrapper 实例或包含 providers 属性的对象
  if (
    "providers" in rawConfig &&
    typeof (rawConfig as any).providers === "object"
  ) {
    return (rawConfig as any).providers as ProviderMetadata;
  }

  // 否则假设它本身就是 ProviderMetadata (Record<string, ProviderData>)
  return rawConfig as unknown as ProviderMetadata;
});

/**
 * 通用模型提取函数
 */
const getModelsByType = (type: "chat" | "embedding"): ModelOption[] => {
  const providers = providersConfig.value;
  const models: ModelOption[] = [];

  for (const [providerKey, provider] of Object.entries(providers)) {
    // 1. 检查提供商是否启用
    if (!provider.enabled) continue;

    // 2. 获取对应类型的模型列表
    const providerModels = provider.models?.[type];
    if (!providerModels) continue;

    // 3. 遍历模型并筛选已启用的
    providerModels.forEach((model) => {
      if (model.enabled) {
        models.push({
          id: `${providerKey}/${model.name}`,
          name: model.name,
          provider: providerKey,
        });
      }
    });
  }

  return models;
};

// 计算属性：缓存模型列表
const availableChatModels = computed(() => getModelsByType("chat"));
const availableEmbeddingModels = computed(() => getModelsByType("embedding"));

/**
 * 通用更新处理函数
 */
const updateModel = (type: "chat" | "embedding", val: AcceptableValue) => {
  emit("update:modelValue", {
    ...props.modelValue,
    [type]: String(val),
  });
};
</script>
