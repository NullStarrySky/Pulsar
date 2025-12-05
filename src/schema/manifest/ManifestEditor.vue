<script setup lang="ts">
import { computed, toRef, ref } from "vue";
import type { BackgroundMode } from "@/schema/manifest/manifest.types";
import { useResources } from "@/schema/manifest/composables/useResources";
import {
  useFileSystemStore,
  VirtualFolder,
} from "@/features/FileSystem/FileSystem.store";
import { getNewTypedFile, type SemanticType } from "@/schema/SemanticType";

// UI Components
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import ResourceSelector from "@/features/FileSystem/ResourceSelector/ResourceSelector.vue";
import {
  RefreshCcw,
  ImageIcon,
  Box,
  Plus,
  Trash2,
  FileType,
  Globe,
  FolderOpen,
  FileJson,
  AppWindow,
} from "lucide-vue-next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const props = defineProps<{
  path: string;
}>();

const fsStore = useFileSystemStore();
const {
  manifestContent,
  updateManifest,
  updateSelection,
  localRootPath,
  globalRootPath,
  availableBackgrounds,
  availableComponents,
} = useResources(toRef(props, "path"));

const activeTab = ref("local");
const manifest = computed(() => manifestContent.value);

const fileName = computed(() => {
  const parts = props.path.split("/");
  return parts[parts.length - 1];
});

// --- Selection Helpers ---
const getSelection = (type: "character" | "lorebook" | "preset") => {
  return manifest.value?.selection?.[type] || [];
};

// --- Creation Logic ---
const createNewResource = async (
  type: SemanticType,
  scope: "local" | "global"
) => {
  const root = scope === "local" ? localRootPath.value : globalRootPath;
  if (!root) return;

  const targetDir = `${root}/${type}`;
  let dirNode = fsStore.resolvePath(targetDir);

  if (!dirNode) {
    const parent = fsStore.resolvePath(root);
    if (parent instanceof VirtualFolder) {
      await parent.createDir(type);
      dirNode = fsStore.resolvePath(targetDir);
    }
  }

  if (!(dirNode instanceof VirtualFolder)) {
    console.error(`Cannot create resource: folder ${targetDir} not found.`);
    return;
  }

  const content = getNewTypedFile(type);
  const name = `New ${
    type.charAt(0).toUpperCase() + type.slice(1)
  } ${Date.now()}.json`;

  try {
    await dirNode.createFile(name, content);
  } catch (e) {
    console.error("Failed to create file", e);
  }
};

// --- Background Logic ---
const bgModes: { value: BackgroundMode; label: string }[] = [
  { value: "cover", label: "填充 (Cover)" },
  { value: "contain", label: "适应 (Contain)" },
  { value: "tile", label: "平铺 (Tile)" },
];

const updateBackground = (key: "path" | "mode", value: string) => {
  if (!manifest.value) return;
  const newManifest = JSON.parse(JSON.stringify(manifest.value));
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
  const newManifest = JSON.parse(JSON.stringify(manifest.value));
  newManifest.customComponents[`new-tag-${Date.now()}`] = "";
  updateManifest(newManifest);
};

const updateComponent = (oldTag: string, newTag: string, newPath: string) => {
  if (!manifest.value) return;
  const newManifest = JSON.parse(JSON.stringify(manifest.value));
  const comps = newManifest.customComponents || {};

  if (oldTag !== newTag) {
    delete comps[oldTag];
  }
  comps[newTag] = newPath;

  newManifest.customComponents = comps;
  updateManifest(newManifest);
};

const removeComponent = (tag: string) => {
  if (!manifest.value) return;
  const newManifest = JSON.parse(JSON.stringify(manifest.value));
  delete newManifest.customComponents[tag];
  updateManifest(newManifest);
};

// --- Component Override Logic ---
const semanticTypes: SemanticType[] = [
  "chat",
  "statistic",
  "lorebook",
  "character",
  "setting",
  "modelConfig",
];

const overrideList = computed(() =>
  Object.entries(manifest.value?.overrides || {}).map(([type, path]) => ({
    type: type as SemanticType,
    path,
  }))
);

const addOverride = () => {
  if (!manifest.value) return;
  const newManifest = JSON.parse(JSON.stringify(manifest.value));
  const existingTypes = Object.keys(newManifest.overrides || {});
  const nextType =
    semanticTypes.find((t) => !existingTypes.includes(t)) || "chat";

  if (!newManifest.overrides) newManifest.overrides = {};
  newManifest.overrides[nextType] = "";
  updateManifest(newManifest);
};

const updateOverride = (
  oldType: SemanticType,
  newType: SemanticType,
  newPath: string
) => {
  if (!manifest.value) return;
  const newManifest = JSON.parse(JSON.stringify(manifest.value));
  const overs = newManifest.overrides || {};

  if (oldType !== newType) {
    delete overs[oldType];
  }
  overs[newType] = newPath;

  newManifest.overrides = overs;
  updateManifest(newManifest);
};

const removeOverride = (type: SemanticType) => {
  if (!manifest.value) return;
  const newManifest = JSON.parse(JSON.stringify(manifest.value));
  if (newManifest.overrides) {
    delete newManifest.overrides[type];
  }
  updateManifest(newManifest);
};
</script>

<template>
  <div
    class="flex flex-col h-full bg-background/50 text-foreground overflow-hidden"
  >
    <!-- Loading -->
    <div
      v-if="!manifest"
      class="flex-1 flex items-center justify-center text-muted-foreground"
    >
      <RefreshCcw class="w-5 h-5 animate-spin mr-2" />
      <span class="text-xs">加载配置中...</span>
    </div>

    <template v-else>
      <!-- Header (Fixed) -->
      <div
        class="px-4 py-3 border-b flex items-center justify-between bg-card/50 backdrop-blur-sm shrink-0"
      >
        <div class="flex items-center gap-2 overflow-hidden">
          <div class="p-1.5 bg-primary/10 rounded-md shrink-0">
            <FileJson class="w-4 h-4 text-primary" />
          </div>
          <div class="space-y-0.5 min-w-0">
            <h3 class="text-sm font-semibold truncate">{{ fileName }}</h3>
            <p class="text-[10px] text-muted-foreground truncate" :title="path">
              {{ path }}
            </p>
          </div>
        </div>
      </div>

      <!-- Main Content (Tabs) -->
      <!-- fix: 添加 min-h-0 防止 flex 子元素撑开父容器，造成原生滚动条 -->
      <Tabs
        v-model="activeTab"
        class="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        <!-- Tab Headers (Fixed) -->
        <div class="px-4 pt-2 shrink-0">
          <TabsList class="w-full grid grid-cols-3">
            <TabsTrigger value="local" class="gap-2">
              <FolderOpen class="w-3 h-3" /> 本地资源
            </TabsTrigger>
            <TabsTrigger value="global" class="gap-2">
              <Globe class="w-3 h-3" /> 全局资源
            </TabsTrigger>
            <TabsTrigger value="appearance" class="gap-2">
              <ImageIcon class="w-3 h-3" /> 视觉与组件
            </TabsTrigger>
          </TabsList>
        </div>

        <!-- Scrollable Area -->
        <div class="flex-1 overflow-hidden relative mt-2">
          <ScrollArea class="h-full w-full">
            <div class="p-4 space-y-6 pb-12">
              <!-- Tab: Local -->
              <TabsContent
                value="local"
                class="mt-0 space-y-4 focus-visible:outline-none"
              >
                <div
                  v-if="!localRootPath"
                  class="text-sm text-destructive bg-destructive/10 p-2 rounded"
                >
                  无法确定本地根目录。
                </div>
                <Accordion
                  v-else
                  type="multiple"
                  class="w-full"
                  :default-value="['character', 'lorebook', 'preset']"
                >
                  <template
                    v-for="type in (['character', 'lorebook', 'preset'] as const)"
                    :key="type"
                  >
                    <AccordionItem :value="type" class="border-b-0 mb-4">
                      <div class="flex items-center justify-between mb-2">
                        <AccordionTrigger
                          class="py-0 hover:no-underline text-sm font-medium capitalize"
                          >{{ type }}s</AccordionTrigger
                        >
                        <Button
                          size="default"
                          variant="ghost"
                          class="h-6 gap-1"
                          @click="createNewResource(type, 'local')"
                          ><Plus class="w-3 h-3" /> New</Button
                        >
                      </div>
                      <AccordionContent>
                        <div
                          class="h-[200px] border rounded-md overflow-hidden relative"
                        >
                          <ResourceSelector
                            :root-path="`${localRootPath}/${type}`"
                            :model-value="getSelection(type)"
                            @update:model-value="
                              (v) => updateSelection(type, v)
                            "
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </template>
                </Accordion>
              </TabsContent>

              <!-- Tab: Global -->
              <TabsContent
                value="global"
                class="mt-0 space-y-4 focus-visible:outline-none"
              >
                <Accordion
                  type="multiple"
                  class="w-full"
                  :default-value="['lorebook', 'preset']"
                >
                  <template
                    v-for="type in (['character', 'lorebook', 'preset'] as const)"
                    :key="type"
                  >
                    <AccordionItem :value="type" class="border-b-0 mb-4">
                      <div class="flex items-center justify-between mb-2">
                        <AccordionTrigger
                          class="py-0 hover:no-underline text-sm font-medium capitalize"
                          >Global {{ type }}s</AccordionTrigger
                        >
                        <Button
                          size="default"
                          variant="ghost"
                          class="h-6 gap-1"
                          @click="createNewResource(type, 'global')"
                          ><Plus class="w-3 h-3" /> New</Button
                        >
                      </div>
                      <AccordionContent>
                        <div
                          class="h-[200px] border rounded-md bg-muted/10 overflow-hidden relative"
                        >
                          <ResourceSelector
                            :root-path="`${globalRootPath}/${type}`"
                            :model-value="getSelection(type)"
                            @update:model-value="
                              (v) => updateSelection(type, v)
                            "
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </template>
                </Accordion>
              </TabsContent>

              <!-- Tab: Appearance -->
              <TabsContent
                value="appearance"
                class="mt-0 space-y-6 focus-visible:outline-none"
              >
                <section class="space-y-3">
                  <div class="flex items-center gap-2">
                    <div class="p-1.5 bg-primary/10 rounded-md">
                      <ImageIcon class="w-4 h-4 text-primary" />
                    </div>
                    <h4 class="text-sm font-medium">背景设置</h4>
                  </div>
                  <div class="p-3 bg-muted/30 rounded-lg border space-y-3">
                    <div class="space-y-1.5">
                      <Label class="text-xs">资源文件</Label>
                      <Select
                        :model-value="manifest.background?.path || '__NONE__'"
                        @update:model-value="
                          (v) =>
                            updateBackground(
                              'path',
                              v === '__NONE__' ? '' : String(v)
                            )
                        "
                      >
                        <SelectTrigger class="h-8 text-xs font-mono">
                          <SelectValue placeholder="选择背景图片..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">无背景</SelectItem>

                          <SelectGroup
                            v-for="group in availableBackgrounds"
                            :key="group.group"
                          >
                            <SelectLabel>{{ group.group }}</SelectLabel>
                            <SelectItem
                              v-for="opt in group.options"
                              :key="opt.value"
                              :value="opt.value"
                            >
                              {{ opt.label }}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>

                      <div
                        v-if="availableBackgrounds.length === 0"
                        class="text-[10px] text-muted-foreground mt-1"
                      >
                        提示: 请将图片放入本地或全局的 "background" 文件夹中。
                      </div>
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

                <!-- Renderer Overrides -->
                <section class="space-y-3">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div class="p-1.5 bg-blue-500/10 rounded-md">
                        <AppWindow class="w-4 h-4 text-blue-500" />
                      </div>
                      <div class="space-y-0.5">
                        <h4 class="text-sm font-medium">全局渲染覆盖</h4>
                        <p class="text-[10px] text-muted-foreground">
                          完全接管特定类型文件的界面渲染
                        </p>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      class="h-6 w-6"
                      @click="addOverride"
                    >
                      <Plus class="w-4 h-4" />
                    </Button>
                  </div>

                  <div class="space-y-2">
                    <div
                      v-if="!overrideList.length"
                      class="text-center py-4 text-xs text-muted-foreground bg-muted/20 border border-dashed rounded-lg"
                    >
                      未配置覆盖，将使用默认编辑器界面。
                    </div>

                    <div
                      v-for="ov in overrideList"
                      :key="ov.type"
                      class="flex gap-2 items-center p-2 rounded-md bg-card border group"
                    >
                      <Select
                        :model-value="ov.type"
                        @update:model-value="(v) => updateOverride(ov.type, v as SemanticType, ov.path)"
                      >
                        <SelectTrigger class="w-[100px] h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            v-for="t in semanticTypes"
                            :key="t"
                            :value="t"
                            >{{ t }}</SelectItem
                          >
                        </SelectContent>
                      </Select>

                      <Select
                        :model-value="ov.path || '__NONE__'"
                        @update:model-value="
                          (v) =>
                            updateOverride(
                              ov.type,
                              ov.type,
                              v === '__NONE__' ? '' : String(v)
                            )
                        "
                      >
                        <SelectTrigger class="h-7 text-xs flex-1">
                          <SelectValue placeholder="选择自定义组件..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">未选择</SelectItem>
                          <SelectGroup
                            v-for="group in availableComponents"
                            :key="group.group"
                          >
                            <SelectLabel>{{ group.group }}</SelectLabel>
                            <SelectItem
                              v-for="opt in group.options"
                              :key="opt.value"
                              :value="opt.value"
                            >
                              {{ opt.label }}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>

                      <Button
                        size="icon"
                        variant="ghost"
                        class="h-6 w-6 text-destructive opacity-50 hover:opacity-100"
                        @click="removeOverride(ov.type)"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </section>

                <Separator />

                <!-- Component Mappings -->
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
                    >
                      <Plus class="w-4 h-4" />
                    </Button>
                  </div>

                  <div class="space-y-2">
                    <div
                      v-if="!componentList.length"
                      class="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-lg bg-muted/20"
                    >
                      暂无自定义组件，点击右上角添加。
                    </div>

                    <div
                      v-for="comp in componentList"
                      :key="comp.tag"
                      class="flex gap-2 items-start p-2 rounded-md bg-card border group hover:shadow-sm transition-all"
                    >
                      <div class="grid gap-2 flex-1">
                        <div class="flex items-center gap-2">
                          <FileType class="w-3 h-3 text-muted-foreground" />
                          <Input
                            :model-value="comp.tag"
                            @change="(e: Event) => updateComponent(comp.tag, (e.target as any).value, comp.path)"
                            class="h-6 text-[10px] font-mono border-0 bg-muted/50 focus-visible:ring-0 px-1"
                            placeholder="tag-name"
                          />
                        </div>

                        <Select
                          :model-value="comp.path || '__NONE__'"
                          @update:model-value="
                            (v) =>
                              updateComponent(
                                comp.tag,
                                comp.tag,
                                v === '__NONE__' ? '' : String(v)
                              )
                          "
                        >
                          <SelectTrigger class="h-7 text-xs">
                            <SelectValue placeholder="选择组件文件 (.vue)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__NONE__">未选择</SelectItem>

                            <SelectGroup
                              v-for="group in availableComponents"
                              :key="group.group"
                            >
                              <SelectLabel>{{ group.group }}</SelectLabel>
                              <SelectItem
                                v-for="opt in group.options"
                                :key="opt.value"
                                :value="opt.value"
                              >
                                {{ opt.label }}
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                        @click="removeComponent(comp.tag)"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div
                      v-if="
                        componentList.length > 0 &&
                        availableComponents.length === 0
                      "
                      class="text-[10px] text-muted-foreground"
                    >
                      提示: 请将组件文件 (.vue) 放入本地或全局的 "components"
                      文件夹中。
                    </div>
                  </div>
                </section>
              </TabsContent>
            </div>
          </ScrollArea>
        </div>
      </Tabs>
    </template>
  </div>
</template>
