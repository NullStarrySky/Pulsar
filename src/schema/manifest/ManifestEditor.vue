<script setup lang="ts">
import { computed, ref, toRef } from "vue";
import type { BackgroundMode } from "@/schema/manifest/manifest.types";
import { useResources } from "@/schema/manifest/composables/useResources";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch"; // 使用 Switch 更直观
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCcw,
  Layers,
  BookOpen,
  Settings2,
  Image as ImageIcon,
  Box,
  Plus,
  Trash2,
  FileType,
  Globe,
  FolderOpen,
  Link as LinkIcon,
} from "lucide-vue-next";

const props = defineProps<{
  path: string;
}>();

const { manifestContent, availableResources, updateManifest, toggleSelection } =
  useResources(toRef(props, "path"));

const activeTab = ref("resources");
const manifest = computed(() => manifestContent.value);

// --- Background Logic ---
const bgModes: { value: BackgroundMode; label: string }[] = [
  { value: "cover", label: "填充 (Cover)" },
  { value: "contain", label: "适应 (Contain)" },
  { value: "tile", label: "平铺 (Tile)" },
];

const updateBackground = (key: "path" | "mode", value: string) => {
  if (!manifest.value) return;
  const newManifest = { ...manifest.value };
  if (!newManifest.background)
    newManifest.background = { path: "", mode: "cover" };
  // @ts-ignore
  newManifest.background[key] = value;
  updateManifest(newManifest);
};

// --- Component Logic ---
const componentList = computed(() =>
  Object.entries(manifest.value?.customComponents || {}).map(([tag, path]) => ({
    tag,
    path,
  }))
);

const addComponent = () => {
  if (!manifest.value) return;
  const newManifest = { ...manifest.value };
  if (!newManifest.customComponents) newManifest.customComponents = {};
  newManifest.customComponents[`new-tag-${Date.now()}`] = "";
  updateManifest(newManifest);
};

const updateComponent = (oldTag: string, newTag: string, newPath: string) => {
  if (!manifest.value) return;
  const newManifest = { ...manifest.value };
  const comps = { ...(newManifest.customComponents || {}) };
  if (oldTag !== newTag) delete comps[oldTag];
  comps[newTag] = newPath;
  newManifest.customComponents = comps;
  updateManifest(newManifest);
};

const removeComponent = (tag: string) => {
  if (!manifest.value) return;
  const newManifest = { ...manifest.value };
  if (newManifest.customComponents) {
    delete newManifest.customComponents[tag];
    updateManifest(newManifest);
  }
};

const tabs = [
  { id: "character", label: "角色", icon: Layers, color: "text-blue-500" },
  { id: "lorebook", label: "世界书", icon: BookOpen, color: "text-amber-500" },
  { id: "preset", label: "预设", icon: Settings2, color: "text-slate-500" },
];

const getSourceIcon = (source: string) => {
  switch (source) {
    case "global":
      return Globe;
    case "local":
      return FolderOpen;
    default:
      return LinkIcon;
  }
};

const getSourceLabel = (source: string) => {
  switch (source) {
    case "global":
      return "Global";
    case "local":
      return "Local";
    default:
      return "External";
  }
};
</script>

<template>
  <div class="flex flex-col h-full bg-background/50 text-foreground">
    <!-- Loading -->
    <div
      v-if="!manifest"
      class="flex-1 flex items-center justify-center text-muted-foreground"
    >
      <RefreshCcw class="w-5 h-5 animate-spin mr-2" />
      <span class="text-xs">加载配置中...</span>
    </div>

    <template v-else>
      <!-- Header -->
      <div
        class="px-4 py-3 border-b flex items-center justify-between bg-card/50 backdrop-blur-sm"
      >
        <div class="space-y-0.5">
          <h3 class="text-sm font-semibold">{{ manifest.name }}</h3>
          <p class="text-[10px] text-muted-foreground truncate max-w-[200px]">
            {{ manifest.id }}
          </p>
        </div>
        <Badge variant="outline" class="text-[10px]"
          >v{{ new Date(manifest.last_modified).toLocaleDateString() }}</Badge
        >
      </div>

      <Tabs v-model="activeTab" class="flex-1 flex flex-col overflow-hidden">
        <div class="px-4 pt-2">
          <TabsList class="w-full grid grid-cols-2">
            <TabsTrigger value="resources">资源管理</TabsTrigger>
            <TabsTrigger value="appearance">视觉 & 组件</TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea class="flex-1">
          <div class="p-4 space-y-6">
            <!-- Tab: Resources -->
            <TabsContent
              value="resources"
              class="mt-0 space-y-6 focus-visible:outline-none animate-in slide-in-from-bottom-2 duration-300"
            >
              <div v-for="tab in tabs" :key="tab.id" class="space-y-3">
                <div
                  class="flex items-center justify-between pb-1 border-b border-border/50"
                >
                  <div class="flex items-center gap-2">
                    <component :is="tab.icon" :class="['w-4 h-4', tab.color]" />
                    <span class="text-sm font-medium">{{ tab.label }}</span>
                  </div>
                  <span class="text-[10px] text-muted-foreground">
                    {{
                      availableResources[tab.id as "character"].filter(
                        (r) => r.selected
                      ).length
                    }}
                    启用
                  </span>
                </div>

                <div class="grid gap-2">
                  <div
                    v-if="availableResources[tab.id as 'character'].length === 0"
                    class="text-center py-4 text-xs text-muted-foreground bg-muted/20 rounded-md border border-dashed"
                  >
                    未发现相关资源
                  </div>

                  <div
                    v-for="item in availableResources[tab.id as 'character']"
                    :key="item.path"
                    class="flex items-center gap-3 p-2.5 rounded-md border transition-all"
                    :class="
                      item.selected
                        ? 'bg-accent/40 border-accent/50'
                        : 'bg-card border-transparent hover:bg-muted/50'
                    "
                  >
                    <!-- Icon based on source -->
                    <div
                      class="shrink-0 text-muted-foreground"
                      :title="getSourceLabel(item.source)"
                    >
                      <component
                        :is="getSourceIcon(item.source)"
                        class="w-3.5 h-3.5"
                      />
                    </div>

                    <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span
                        class="text-xs font-medium truncate"
                        :class="{
                          'text-foreground': item.selected,
                          'text-muted-foreground': !item.selected,
                        }"
                      >
                        {{ item.name }}
                      </span>
                      <span
                        class="text-[9px] text-muted-foreground/60 truncate font-mono"
                        :title="item.path"
                      >
                        {{ item.source === "local" ? "./" : ""
                        }}{{ item.path.split("/").pop() }}
                      </span>
                    </div>

                    <Switch
                      :modelValue="item.selected"
                      @update:modelValue="(v) => toggleSelection(tab.id as any, item.path, v)"
                      class="scale-75 origin-right"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <!-- Tab: Appearance (Keeping existing logic for Avatar/BG) -->
            <TabsContent
              value="appearance"
              class="mt-0 space-y-6 focus-visible:outline-none animate-in slide-in-from-bottom-2 duration-300"
            >
              <!-- Same as before -->
              <section class="space-y-3">
                <div class="flex items-center gap-2">
                  <div class="p-1.5 bg-primary/10 rounded-md">
                    <ImageIcon class="w-4 h-4 text-primary" />
                  </div>
                  <h4 class="text-sm font-medium">背景设置</h4>
                </div>
                <div class="p-3 bg-muted/30 rounded-lg border space-y-3">
                  <div class="space-y-1.5">
                    <Label class="text-xs">资源路径</Label>
                    <Input
                      :model-value="manifest.background?.path"
                      @update:model-value="
                        (v) => updateBackground('path', String(v))
                      "
                      class="h-8 text-xs font-mono"
                      placeholder="assets/background.jpg"
                    />
                  </div>
                  <div class="space-y-1.5">
                    <Label class="text-xs">填充模式</Label>
                    <Select
                      :model-value="manifest.background?.mode || 'cover'"
                      @update:model-value="
                        (v) => updateBackground('mode', String(v))
                      "
                    >
                      <SelectTrigger class="h-8 text-xs"
                        ><SelectValue
                      /></SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="m in bgModes"
                          :key="m.value"
                          :value="m.value"
                          >{{ m.label }}</SelectItem
                        >
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
              <Separator />
              <section class="space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="p-1.5 bg-purple-500/10 rounded-md">
                      <Box class="w-4 h-4 text-purple-500" />
                    </div>
                    <h4 class="text-sm font-medium">组件映射</h4>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-6 w-6"
                    @click="addComponent"
                    ><Plus class="w-4 h-4"
                  /></Button>
                </div>
                <div class="space-y-2">
                  <div
                    v-if="!componentList.length"
                    class="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-lg bg-muted/20"
                  >
                    暂无自定义组件
                  </div>
                  <div
                    v-for="(comp, idx) in componentList"
                    :key="idx"
                    class="flex gap-2 items-start p-2 rounded-md bg-card border group hover:shadow-sm transition-all"
                  >
                    <div class="grid gap-2 flex-1">
                      <div class="flex items-center gap-2">
                        <FileType class="w-3 h-3 text-muted-foreground" />
                        <Input
                          :model-value="comp.tag"
                          @change="(e: Event) => updateComponent(comp.tag, (e.target as any).value, comp.path)"
                          class="h-6 text-[10px] font-mono border-0 bg-muted/50 focus-visible:ring-0 px-1"
                        />
                      </div>
                      <Input
                        :model-value="comp.path"
                        @change="(e: Event) => updateComponent(comp.tag, comp.tag, (e.target as any).value)"
                        class="h-7 text-xs"
                        placeholder="Path to .vue / .js"
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      class="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
    </template>
  </div>
</template>
