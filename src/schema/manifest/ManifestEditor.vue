<!-- src/schema/manifest/ManifestEditor.vue -->
<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  ManifestContent,
  BackgroundMode,
} from "@/schema/manifest/manifest.types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  Box,
  Layers,
  BookOpen,
  Settings2,
} from "lucide-vue-next";

const props = defineProps<{
  manifest: ManifestContent;
  inlineResources: Record<string, string[]>;
  allResources: Record<string, any[]>; // 暂时未使用，可用于下拉选择
}>();

const emit = defineEmits<{
  (e: "toggle", type: "character" | "lorebook" | "preset", path: string): void;
  (e: "update", newManifest: ManifestContent): void;
}>();

const activeTab = ref("resources");

// --- 背景修改逻辑 ---
const bgModes: { value: BackgroundMode; label: string }[] = [
  { value: "cover", label: "填充 (Cover)" },
  { value: "contain", label: "适应 (Contain)" },
  { value: "tile", label: "平铺 (Tile)" },
  { value: "center", label: "居中 (Center)" },
  { value: "stretch", label: "拉伸 (Stretch)" },
];

const updateBackground = (key: "path" | "mode", value: string) => {
  const newManifest = { ...props.manifest };
  if (!newManifest.background) {
    newManifest.background = { path: "", mode: "cover" };
  }
  // @ts-ignore - 简单的类型规避，实际项目中建议定义更严谨的接口
  newManifest.background[key] = value;
  emit("update", newManifest);
};

// --- 组件修改逻辑 ---
const componentList = computed(() => {
  return Object.entries(props.manifest.customComponents || {}).map(
    ([tag, path]) => ({ tag, path })
  );
});

const addComponent = () => {
  const newManifest = { ...props.manifest };
  if (!newManifest.customComponents) newManifest.customComponents = {};
  const newKey = `new-tag-${Date.now()}`;
  newManifest.customComponents[newKey] = "";
  emit("update", newManifest);
};

const updateComponentKey = (oldKey: string, newKey: string) => {
  if (oldKey === newKey) return;
  const newManifest = { ...props.manifest };
  const components = { ...(newManifest.customComponents || {}) };
  const value = components[oldKey];
  delete components[oldKey];
  components[newKey] = value;
  newManifest.customComponents = components;
  emit("update", newManifest);
};

const updateComponentValue = (key: string, newValue: string) => {
  const newManifest = { ...props.manifest };
  if (!newManifest.customComponents) newManifest.customComponents = {};
  newManifest.customComponents[key] = newValue;
  emit("update", newManifest);
};

const removeComponent = (key: string) => {
  const newManifest = { ...props.manifest };
  if (newManifest.customComponents) {
    delete newManifest.customComponents[key];
    emit("update", newManifest);
  }
};

const resourceTypes = [
  { id: "character", label: "角色", icon: Layers },
  { id: "lorebook", label: "世界书", icon: BookOpen },
  { id: "preset", label: "预设", icon: Settings2 },
];
</script>

<template>
  <div class="flex flex-col h-full bg-background text-foreground">
    <!-- Header -->
    <div class="px-4 py-3 flex flex-col gap-1 border-b bg-card/50">
      <Label class="text-xs text-muted-foreground font-normal">当前环境</Label>
      <div class="text-sm font-semibold truncate" :title="manifest.name">
        {{ manifest.name }}
      </div>
    </div>

    <!-- Main Content -->
    <Tabs v-model="activeTab" class="flex-1 flex flex-col overflow-hidden">
      <div class="px-4 py-2 border-b">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="resources">资源管理</TabsTrigger>
          <TabsTrigger value="appearance">视觉扩展</TabsTrigger>
        </TabsList>
      </div>

      <ScrollArea class="flex-1">
        <div class="p-4 pb-10">
          <!-- Tab 1: 资源选择 -->
          <TabsContent
            value="resources"
            class="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div v-for="t in resourceTypes" :key="t.id" class="space-y-2">
              <div class="flex items-center gap-2 mb-2">
                <component :is="t.icon" class="w-4 h-4 text-muted-foreground" />
                <h4 class="text-sm font-medium">{{ t.label }}</h4>
              </div>

              <div class="space-y-1">
                <!-- Inline Resources (Read Only) -->
                <div
                  v-for="path in inlineResources[t.id]"
                  :key="path"
                  class="flex items-center space-x-2 px-2 py-1.5 rounded-md bg-muted/50 opacity-70 cursor-not-allowed"
                >
                  <Checkbox
                    :checked="true"
                    disabled
                    class="data-[state=checked]:bg-muted-foreground"
                  />
                  <span
                    class="text-xs truncate text-muted-foreground flex-1"
                    :title="path"
                  >
                    {{ path.split("/").pop() }}
                    <span class="text-[10px] ml-1">(内联)</span>
                  </span>
                </div>

                <!-- Selected Resources -->
                <div
                  v-for="path in manifest.selection[t.id as 'character']"
                  :key="path"
                  class="flex items-center space-x-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
                >
                  <Checkbox
                    :id="`${t.id}-${path}`"
                    :checked="true"
                    @update:checked="() => emit('toggle', t.id as any, path)"
                  />
                  <Label
                    :for="`${t.id}-${path}`"
                    class="text-xs truncate flex-1 cursor-pointer font-normal"
                  >
                    {{ path.split("/").pop() }}
                  </Label>
                </div>

                <!-- Add Button Placeholder -->
                <Button
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start h-8 px-2 text-muted-foreground hover:text-primary"
                >
                  <Plus class="w-3.5 h-3.5 mr-2" />
                  <span class="text-xs">添加{{ t.label }}</span>
                </Button>
              </div>
            </div>
          </TabsContent>

          <!-- Tab 2: 视觉与扩展 -->
          <TabsContent
            value="appearance"
            class="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <!-- 背景设置 -->
            <section class="space-y-3">
              <div class="flex items-center gap-2">
                <div class="p-1 rounded-md bg-muted">
                  <ImageIcon class="w-3.5 h-3.5 text-foreground" />
                </div>
                <h4 class="text-sm font-medium">背景设置</h4>
              </div>

              <div class="grid gap-3 p-3 border rounded-lg bg-card/30">
                <div class="grid gap-1.5">
                  <Label class="text-xs text-muted-foreground">资源路径</Label>
                  <div class="flex gap-2">
                    <Input
                      :model-value="manifest.background?.path || ''"
                      @update:model-value="
                        (v) => updateBackground('path', String(v))
                      "
                      placeholder="路径..."
                      class="h-8 text-xs bg-background"
                    />
                    <!-- 可选：文件选择按钮占位 -->
                    <!-- <Button size="icon" variant="outline" class="h-8 w-8 shrink-0"><FolderOpen class="w-3.5 h-3.5" /></Button> -->
                  </div>
                </div>

                <div class="grid gap-1.5">
                  <Label class="text-xs text-muted-foreground">显示模式</Label>
                  <Select
                    :model-value="manifest.background?.mode || 'cover'"
                    @update:model-value="
                      (v) => updateBackground('mode', String(v))
                    "
                  >
                    <SelectTrigger class="h-8 text-xs bg-background">
                      <SelectValue placeholder="选择模式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="m in bgModes"
                        :key="m.value"
                        :value="m.value"
                      >
                        {{ m.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <Separator />

            <!-- 自定义组件 -->
            <section class="space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="p-1 rounded-md bg-muted">
                    <Box class="w-3.5 h-3.5 text-foreground" />
                  </div>
                  <h4 class="text-sm font-medium">组件映射</h4>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  class="h-6 w-6"
                  @click="addComponent"
                  title="添加组件"
                >
                  <Plus class="w-4 h-4" />
                </Button>
              </div>

              <div class="space-y-2">
                <div
                  v-if="componentList.length === 0"
                  class="flex flex-col items-center justify-center py-6 border border-dashed rounded-lg text-muted-foreground bg-muted/20"
                >
                  <Box class="w-8 h-8 mb-2 opacity-50" />
                  <span class="text-xs">暂无注册组件</span>
                </div>

                <div
                  v-for="(comp, idx) in componentList"
                  :key="idx"
                  class="group flex gap-2 items-start"
                >
                  <div class="flex-1 grid gap-1.5">
                    <Input
                      :model-value="comp.tag"
                      @change="(e: Event) => updateComponentKey(comp.tag, (e.target as HTMLInputElement).value)"
                      placeholder="Tag"
                      class="h-7 text-xs font-mono bg-background"
                      title="标签名"
                    />
                    <Input
                      :model-value="comp.path"
                      @update:model-value="
                        (v) => updateComponentValue(comp.tag, String(v))
                      "
                      placeholder="Path"
                      class="h-7 text-xs bg-background"
                      title="组件路径"
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-7 w-7 mt-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    @click="removeComponent(comp.tag)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </section>
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  </div>
</template>
