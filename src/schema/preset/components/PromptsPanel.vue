<!-- src/schema/preset/components/PromptsPanel.vue -->
<script setup lang="ts">
import type { Prompt, PresetVariant } from "../preset.types";
import { v4 as uuidv4 } from "uuid";
import draggable from "vuedraggable";
import { ref, watchEffect } from "vue";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronsUpDown, Plus, Trash2, GripVertical } from "lucide-vue-next";
import { injectPosition } from "../../shared.types";

const variants = defineModel<PresetVariant[]>({ required: true });
const activeTab = ref("");

// 确保 activeTab 始终有效
watchEffect(() => {
  if (
    variants.value?.length > 0 &&
    !variants.value.find((v) => v.id === activeTab.value)
  ) {
    activeTab.value = variants.value[0].id;
  }
});

// --- 变体管理 ---
const createDefaultVariant = (): PresetVariant => ({
  id: uuidv4(),
  name: "新模型配置",
  modelRegex: ".*",
  prompts: [createDefaultPrompt()],
});

const onAddVariant = () => {
  const newVariant = createDefaultVariant();
  variants.value = [...variants.value, newVariant];
  activeTab.value = newVariant.id; // 自动切换到新创建的标签页
};

const onDeleteVariant = (variantToDelete: PresetVariant) => {
  if (
    confirm(
      `确定要删除配置 "${variantToDelete.name}" 吗？此操作将删除其下的所有提示词。`,
    )
  ) {
    variants.value = variants.value.filter((v) => v.id !== variantToDelete.id);
  }
};

// --- 提示词管理 (在变体内) ---
const createDefaultPrompt = (): Prompt => ({
  id: uuidv4(),
  name: "新提示词",
  enabled: true,
  role: "system",
  injectPosition: "BEFORE_CHAR",
  content: "",
});

const onAddPrompt = (variant: PresetVariant) => {
  variant.prompts.push(createDefaultPrompt());
};

const onDeletePrompt = (variant: PresetVariant, promptToDelete: Prompt) => {
  if (confirm(`确定要删除提示词 "${promptToDelete.name}" 吗？`)) {
    variant.prompts = variant.prompts.filter((p) => p.id !== promptToDelete.id);
  }
};

function handlePositionUpdate(prompt: Prompt, value: injectPosition | "none") {
  prompt.injectPosition = value;
}
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <div class="flex items-center justify-end">
      <Button size="sm" @click="onAddVariant">
        <Plus class="mr-2 h-4 w-4" />
        添加配置
      </Button>
    </div>

    <Tabs v-if="variants.length" v-model="activeTab" class="w-full">
      <TabsList
        class="grid w-full"
        :style="{
          gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))`,
        }"
      >
        <TabsTrigger
          v-for="variant in variants"
          :key="variant.id"
          :value="variant.id"
        >
          {{ variant.name }}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        v-for="variant in variants"
        :key="variant.id"
        :value="variant.id"
        class="mt-4"
      >
        <Card>
          <CardHeader>
            <div class="grid grid-cols-1 gap-y-4 gap-x-4 md:grid-cols-2">
              <div class="grid gap-2">
                <Label :for="variant.id + '-name'">配置名称</Label>
                <Input
                  :id="variant.id + '-name'"
                  v-model="variant.name"
                  placeholder="例如：GPT-4o 配置"
                />
              </div>
              <div class="grid gap-2">
                <Label :for="variant.id + '-regex'"
                  >适用模型 (正则表达式)</Label
                >
                <Input
                  :id="variant.id + '-regex'"
                  v-model="variant.modelRegex"
                  placeholder="例如：gpt-4.*"
                />
              </div>
            </div>
            <div class="mt-4 flex justify-end" v-if="variants.length > 1">
              <Button
                variant="destructive"
                size="sm"
                @click="onDeleteVariant(variant)"
              >
                <Trash2 class="mr-2 h-4 w-4" />
                删除此配置
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div class="border-t pt-6">
              <draggable
                v-model="variant.prompts"
                item-key="id"
                handle=".prompt-handle"
                class="flex flex-col gap-3"
              >
                <template #header>
                  <div class="mb-2">
                    <h4 class="text-lg font-semibold">提示词列表</h4>
                    <p class="text-sm text-muted-foreground">
                      管理此配置下的提示词，可拖拽排序。
                    </p>
                  </div>
                </template>

                <template #item="{ element: prompt }">
                  <Collapsible class="w-full" as-child>
                    <Card class="w-full bg-background/50">
                      <div class="flex items-center">
                        <div
                          class="prompt-handle cursor-move px-2 text-muted-foreground"
                        >
                          <GripVertical class="h-5 w-5" />
                        </div>
                        <CollapsibleTrigger class="flex-1">
                          <CardHeader
                            class="flex cursor-pointer flex-row items-center justify-between py-3 text-left hover:bg-accent"
                          >
                            <h3 class="font-semibold">
                              {{ prompt.name || "无标题提示词" }}
                            </h3>
                            <div class="flex items-center gap-2">
                              <Switch v-model="prompt.enabled" @click.stop />
                              <ChevronsUpDown
                                class="h-4 w-4 text-muted-foreground"
                              />
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <CardContent
                          class="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2"
                        >
                          <div class="grid gap-2">
                            <Label>名称</Label>
                            <Input v-model="prompt.name" />
                          </div>
                          <div class="grid gap-2">
                            <Label>角色 (Role)</Label>
                            <Select v-model="prompt.role">
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="system">System</SelectItem>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="assistant"
                                  >Assistant</SelectItem
                                >
                              </SelectContent>
                            </Select>
                          </div>
                          <div class="grid gap-2 md:col-span-2">
                            <Label>注入位置</Label>
                            <Select
                              :model-value="prompt.injectPosition || 'none'"
                              @update:model-value="
                                (val) =>
                                  handlePositionUpdate(
                                    prompt,
                                    (val || 'none') as injectPosition | 'none',
                                  )
                              "
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">未指定</SelectItem>
                                <SelectItem value="BEFORE_CHAR"
                                  >角色定义前</SelectItem
                                >
                                <SelectItem value="AFTER_CHAR"
                                  >角色定义后</SelectItem
                                >
                                <SelectItem value="PERSONALITY"
                                  >人格设定中</SelectItem
                                >
                                <SelectItem value="SCENARIO"
                                  >场景设定中</SelectItem
                                >
                              </SelectContent>
                            </Select>
                          </div>
                          <div class="grid gap-2 md:col-span-2">
                            <Label>内容 (支持模板语法)</Label>
                            <Textarea
                              v-model="prompt.content"
                              class="min-h-24 font-mono"
                            />
                          </div>
                          <div class="flex justify-end md:col-span-2">
                            <Button
                              variant="outline"
                              size="sm"
                              @click="onDeletePrompt(variant, prompt)"
                            >
                              删除此提示词
                            </Button>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                </template>

                <template #footer>
                  <Button
                    class="mt-4 w-full"
                    variant="outline"
                    @click="onAddPrompt(variant)"
                  >
                    <Plus class="mr-2 h-4 w-4" />
                    添加提示词
                  </Button>
                </template>
              </draggable>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <div v-else class="py-10 text-center text-muted-foreground">
      <p>没有可用的提示词配置。</p>
      <p>请点击“添加配置”来创建第一个。</p>
    </div>
  </div>
</template>
