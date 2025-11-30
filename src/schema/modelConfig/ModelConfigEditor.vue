<!-- src/schema/modelConfig/ModelConfigEditor.vue -->
<template>
  <div v-if="localContent" class="flex h-full bg-background text-foreground">
    <!-- Left Sidebar: 提供商列表 -->
    <aside class="w-1/4 min-w-[280px] border-r p-4 flex flex-col h-full">
      <Separator class="my-4" />

      <div class="p-2 flex justify-between items-center">
        <div>
          <h2 class="text-lg font-semibold">AI 提供商</h2>
          <p class="text-sm text-muted-foreground">启用/禁用并配置提供商。</p>
        </div>
        <Button size="sm" @click="addNewProvider"> 添加 </Button>
      </div>

      <Separator class="my-4" />

      <!-- Navigation List -->
      <nav class="flex flex-col space-y-1 overflow-y-auto">
        <!-- Enabled Providers -->
        <div v-for="(provider, key) in enabledProviders" :key="key">
          <button
            @click="selectedProviderKey = key as string"
            :class="buttonClasses(key as string)"
          >
            <span class="capitalize font-medium grow text-left truncate">{{
              key
            }}</span>
            <Switch v-model="provider.enabled" @click.stop class="ml-auto" />
          </button>
        </div>

        <!-- Separator -->
        <div
          v-if="
            Object.keys(enabledProviders).length > 0 &&
            Object.keys(disabledProviders).length > 0
          "
          class="py-2"
        >
          <Separator />
        </div>

        <!-- Disabled Providers -->
        <div v-for="(provider, key) in disabledProviders" :key="key">
          <button
            @click="selectedProviderKey = key as string"
            :class="buttonClasses(key as string)"
          >
            <span
              class="capitalize font-medium grow text-left text-muted-foreground/80"
              >{{ key }}</span
            >
            <Switch v-model="provider.enabled" @click.stop class="ml-auto" />
          </button>
        </div>
      </nav>
    </aside>

    <!-- Right Content Panel: 配置详情 -->
    <ScrollArea class="w-3/4 p-8 h-full">
      <div
        v-if="!selectedProviderKey || !selectedProviderData"
        class="flex h-full items-center justify-center"
      >
        <p class="text-muted-foreground">请从左侧选择一个提供商进行配置。</p>
      </div>

      <div v-else class="max-w-4xl mx-auto space-y-8">
        <!-- Header & Renaming -->
        <div class="group flex items-start justify-between">
          <div class="grow">
            <!-- Built-in Provider Title -->
            <div v-if="selectedProviderData.builtIn">
              <Label class="text-sm text-muted-foreground">提供商 ID</Label>
              <h1 class="text-3xl font-bold capitalize">
                {{ selectedProviderKey }}
              </h1>
            </div>
            <!-- Custom Provider Title (with edit-on-hover) -->
            <div v-else>
              <Label
                for="provider-key-input"
                class="text-sm text-muted-foreground"
              >
                提供商 ID
              </Label>
              <div class="flex items-center gap-2">
                <Input
                  v-if="isEditingTitle"
                  id="provider-key-input"
                  ref="providerKeyInputRef"
                  v-model="providerKeyInput"
                  @blur="handleRenameProvider"
                  @keydown.enter="handleRenameProvider"
                  class="text-3xl font-bold h-auto p-0 border-none focus-visible:ring-0"
                />
                <h1 v-else class="text-3xl font-bold capitalize">
                  {{ selectedProviderKey }}
                </h1>
                <div
                  class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8"
                    @click="startEditingTitle"
                  >
                    <Pencil class="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8"
                    @click="deleteSelectedProvider"
                  >
                    <Trash2 class="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Separator />

        <!-- API Key Section -->
        <div>
          <h3 class="text-xl font-semibold mb-2">密钥配置</h3>
          <p class="text-muted-foreground mb-4">
            配置 API 密钥名称并写入密钥值。密钥值不会保存在此配置文件中。
          </p>
          <div class="space-y-4 max-w-lg">
            <div class="flex flex-col space-y-2">
              <div class="flex items-center justify-between">
                <Label for="api-key-name-input"
                  >API 密钥名称 (apiKeyName)</Label
                >
                <Badge :variant="keyIsAvailable ? 'secondary' : 'outline'">
                  {{ keyIsAvailable ? "密钥已设置" : "密钥未设置" }}
                </Badge>
              </div>
              <p
                v-if="selectedProviderData.builtIn"
                class="text-sm font-mono p-2 bg-muted rounded-md"
              >
                {{ selectedProviderData.apiKeyName }}
              </p>
              <Input
                v-else
                id="api-key-name-input"
                v-model="selectedProviderData.apiKeyName"
                @input="checkKeyStatus"
                placeholder="例如 OPENAI_API_KEY"
              />
            </div>
            <div class="flex flex-col space-y-2">
              <Label for="api-key-value-input">写入新密钥</Label>
              <div class="flex gap-2">
                <Input
                  id="api-key-value-input"
                  type="password"
                  v-model="apiKeyInputValue"
                  placeholder="粘贴您的 API 密钥"
                />
                <Button
                  @click="handleWriteKey"
                  :disabled="
                    !apiKeyInputValue || !selectedProviderData.apiKeyName
                  "
                  >保存密钥</Button
                >
              </div>
            </div>
            <div
              v-if="'url' in selectedProviderData"
              class="flex flex-col space-y-2"
            >
              <Label for="api-url-input">API 端点 (url, 可选)</Label>
              <Input
                id="api-url-input"
                v-model="selectedProviderData.url"
                placeholder="例如 https://api.openai.com/v1"
              />
            </div>
          </div>
        </div>

        <!-- Tab Content -->
        <div>
          <h3 class="text-xl font-semibold mb-4">模型配置</h3>
          <ProviderModelsTable
            v-if="selectedProviderData && selectedProviderData.models"
            :models="selectedProviderData.models"
            :provider-key="selectedProviderKey"
            :is-built-in="selectedProviderData.builtIn"
            :base-url="selectedProviderData.url"
            @add-model="handleAddModel"
            @update-model="handleUpdateModel"
            @delete-model="handleDeleteModel"
          />
        </div>
      </div>
    </ScrollArea>
  </div>
  <div v-else class="flex h-full w-full items-center justify-center">
    <p class="text-muted-foreground">正在加载编辑器...</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, computed, nextTick } from "vue";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import type {
  ModelConfig,
  ProviderData,
  ChatModel,
  GenericModel,
} from "./modelConfig.types";
import { useSecretsStore } from "@/features/Secrets/Secrets.store";
import { Pencil, Trash2 } from "lucide-vue-next";

// --- 子组件和UI组件导入 ---
import ProviderModelsTable from "./components/ProviderModelsTable.vue";
import Separator from "@/components/ui/separator/Separator.vue";
import Input from "@/components/ui/input/Input.vue";
import Label from "@/components/ui/label/Label.vue";
import Button from "@/components/ui/button/Button.vue";
import Switch from "@/components/ui/switch/Switch.vue";
import Badge from "@/components/ui/badge/Badge.vue";
import ScrollArea from "@/components/ui/scroll-area/ScrollArea.vue";

// --- 1. Props 定义 ---
const props = defineProps<{
  path: string;
}>();

// --- 2. 文件内容管理 ---
const { content: remoteContent, sync } = useFileContent<ModelConfig>(
  props.path
);
const localContent = ref<ModelConfig | null>(null);

const keyStore = useSecretsStore();
// --- 3. UI 状态管理 ---
const selectedProviderKey = ref<string | null>(null);
const providerKeyInput = ref("");
const providerKeyInputRef = ref<HTMLInputElement | null>(null);
const apiKeyInputValue = ref("");
const keyStatusMap = ref<Record<string, boolean>>({});
const isEditingTitle = ref(false);

const selectedProviderData = computed<ProviderData | null>({
  get() {
    if (selectedProviderKey.value && localContent.value) {
      return localContent.value[selectedProviderKey.value];
    }
    return null;
  },
  set(newValue) {
    if (selectedProviderKey.value && localContent.value && newValue) {
      localContent.value[selectedProviderKey.value] = newValue;
    }
  },
});

const enabledProviders = computed(() => {
  if (!localContent.value) return {};
  return Object.fromEntries(
    Object.entries(localContent.value).filter(([, p]) => p.enabled)
  );
});

const disabledProviders = computed(() => {
  if (!localContent.value) return {};
  return Object.fromEntries(
    Object.entries(localContent.value).filter(([, p]) => !p.enabled)
  );
});

const keyIsAvailable = computed(() => {
  if (!selectedProviderData.value?.apiKeyName) return false;
  return keyStatusMap.value[selectedProviderData.value.apiKeyName] ?? false;
});

const buttonClasses = (key: string) => [
  "flex items-center space-x-3 p-2 rounded-md text-left transition-colors w-full",
  selectedProviderKey.value === key
    ? "bg-secondary text-secondary-foreground"
    : "hover:bg-muted",
];

// --- 5. 方法 ---

async function startEditingTitle() {
  isEditingTitle.value = true;
  await nextTick();
  providerKeyInputRef.value?.focus();
}

async function checkKeyStatus() {
  if (!selectedProviderData.value?.apiKeyName) return;
  const keyName = selectedProviderData.value.apiKeyName.trim();
  if (keyName) {
    keyStatusMap.value[keyName] = await keyStore.isKeyAvailable(keyName);
  }
}

async function handleWriteKey() {
  if (!selectedProviderData.value?.apiKeyName || !apiKeyInputValue.value)
    return;
  const keyName = selectedProviderData.value.apiKeyName.trim();
  const keyValue = apiKeyInputValue.value;
  try {
    await keyStore.writeSecretKey(keyName, keyValue);
    apiKeyInputValue.value = "";
    await checkKeyStatus();
  } catch (error) {
    console.error("Failed to write secret key:", error);
  }
}

function addNewProvider() {
  if (!localContent.value) return;
  const newProviderKey = `new_provider_${Date.now()}`;
  localContent.value[newProviderKey] = {
    enabled: false,
    apiKeyName: "",
    url: "",
    models: {
      chat: [],
      embedding: [],
      image: [],
      speech: [],
      transcription: [],
    },
  };
  selectedProviderKey.value = newProviderKey;
}

function deleteSelectedProvider() {
  if (!selectedProviderKey.value || !localContent.value) return;
  if (
    confirm(
      `确定要删除提供商 "${selectedProviderKey.value}" 吗？此操作无法撤销。`
    )
  ) {
    delete localContent.value[selectedProviderKey.value];
    selectedProviderKey.value = Object.keys(localContent.value)[0] || null;
  }
}

function handleRenameProvider() {
  if (
    !localContent.value ||
    !selectedProviderKey.value ||
    !providerKeyInput.value
  ) {
    isEditingTitle.value = false;
    return;
  }
  const oldKey = selectedProviderKey.value;
  const newKey = providerKeyInput.value.trim();

  if (oldKey === newKey) {
    isEditingTitle.value = false;
    return;
  }

  if (localContent.value[newKey]) {
    alert(`提供商 ID "${newKey}" 已存在，请使用其他名称。`);
    providerKeyInput.value = oldKey;
    return;
  }

  const providerData = localContent.value[oldKey];
  const newProviders = { ...localContent.value };
  delete newProviders[oldKey];
  newProviders[newKey] = providerData;

  localContent.value = newProviders;

  selectedProviderKey.value = newKey;
  isEditingTitle.value = false;
}

function handleAddModel({
  newModel,
  typeKey,
}: {
  newModel: ChatModel | GenericModel;
  typeKey: keyof ProviderData["models"];
}) {
  if (
    !selectedProviderData.value ||
    !localContent.value ||
    !selectedProviderKey.value
  )
    return;
  const newModelsList = [
    ...(selectedProviderData.value.models[typeKey] || []),
    newModel,
  ];
  const updatedProvider = {
    ...selectedProviderData.value,
    models: {
      ...selectedProviderData.value.models,
      [typeKey]: newModelsList,
    },
  };
  localContent.value[selectedProviderKey.value] = updatedProvider;
}

function handleUpdateModel({
  updatedModel,
  originalName,
  typeKey,
}: {
  updatedModel: ChatModel | GenericModel;
  originalName: string;
  typeKey: keyof ProviderData["models"];
}) {
  if (
    !selectedProviderData.value ||
    !localContent.value ||
    !selectedProviderKey.value
  )
    return;
  const newModelsList = [
    ...(selectedProviderData.value.models[typeKey] || []),
  ] as (ChatModel | GenericModel)[];
  const modelIndex = newModelsList.findIndex((m) => m.name === originalName);
  if (modelIndex !== -1) {
    newModelsList[modelIndex] = updatedModel;
    const updatedProvider = {
      ...selectedProviderData.value,
      models: {
        ...selectedProviderData.value.models,
        [typeKey]: newModelsList,
      },
    };
    localContent.value[selectedProviderKey.value] = updatedProvider;
  }
}

function handleDeleteModel({
  name,
  typeKey,
}: {
  name: string;
  typeKey: keyof ProviderData["models"];
}) {
  if (
    !selectedProviderData.value ||
    !localContent.value ||
    !selectedProviderKey.value
  )
    return;
  const newModelsList = (
    (selectedProviderData.value.models[typeKey] || []) as (
      | ChatModel
      | GenericModel
    )[]
  ).filter((m) => m.name !== name);
  const updatedProvider = {
    ...selectedProviderData.value,
    models: {
      ...selectedProviderData.value.models,
      [typeKey]: newModelsList,
    },
  };
  localContent.value[selectedProviderKey.value] = updatedProvider;
}

// --- 6. 监听器 ---
watch(selectedProviderKey, (newKey) => {
  isEditingTitle.value = false;
  if (newKey) {
    providerKeyInput.value = newKey;
    apiKeyInputValue.value = "";
    checkKeyStatus();
  }
});

watch(
  localContent,
  (newContent, oldContent) => {
    if (
      newContent &&
      JSON.stringify(newContent) !== JSON.stringify(oldContent)
    ) {
      sync(newContent);
    }
  },
  { deep: true }
);

watch(
  remoteContent,
  (newRemoteContent) => {
    if (
      JSON.stringify(newRemoteContent) !== JSON.stringify(localContent.value)
    ) {
      localContent.value = newRemoteContent
        ? JSON.parse(JSON.stringify(newRemoteContent))
        : null;
      if (localContent.value) {
        const allKeyNames = Object.values(localContent.value)
          .map((p) => p.apiKeyName)
          .filter(Boolean);
        Promise.all(
          allKeyNames.map(async (keyName) => {
            keyStatusMap.value[keyName] = await keyStore.isKeyAvailable(
              keyName
            );
          })
        );
      }
      if (
        localContent.value &&
        (!selectedProviderKey.value ||
          !localContent.value[selectedProviderKey.value])
      ) {
        const keys = Object.keys(localContent.value);
        selectedProviderKey.value = keys.length > 0 ? keys[0] : null;
      }
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  sync.cancel();
});
</script>
