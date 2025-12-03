<!-- src/schema/lorebook/components/EntryEditor.vue -->
<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { LorebookEntry } from "@/schema/lorebook/lorebook.types";
import { cloneDeep } from "lodash-es";
import {
  BookOpen,
  Plus,
  Search,
  Zap,
  ZapOff,
  Database,
  ArrowRight,
  MoreVertical,
  Eye,
  EyeOff,
  Trash2,
  Layers,
  SkipForward,
  Copy,
} from "lucide-vue-next";

// --- 自定义组件 ---
// 请确保这些组件路径正确，或者根据实际情况调整
import ExecutableStringEditor from "./ExecutableStringEditor.vue";
import PopableTextarea from "@/components/SchemaRenderer/content-elements/PopableTextarea.vue";

// --- Shadcn UI 组件 ---
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// --- Props & Emits ---
interface Props {
  modelValue: LorebookEntry[];
}
const props = defineProps<Props>();
const emit = defineEmits(["update:modelValue"]);

// --- State ---
const localEntries = ref<LorebookEntry[]>(cloneDeep(props.modelValue || []));
const selectedGroup = ref<string>("All");
const searchQuery = ref<string>("");

// --- Role Options (汉化) ---
const roleOptions = [
  { value: "system", label: "系统 (System)" },
  { value: "user", label: "用户 (User)" },
  { value: "assistant", label: "助手 (Assistant)" },
  { value: "tool", label: "工具 (Tool)" },
];

// --- Computed ---
// 提取唯一分组
const groups = computed(() => {
  const g = new Set(localEntries.value.map((e) => e.groupName || "未分组"));
  // 保持 "All" 作为逻辑键，但在界面显示时转为 "全部"
  return ["All", ...Array.from(g).sort()];
});

// 分组显示名称辅助函数
const getGroupLabel = (group: string) => {
  if (group === "All") return "全部";
  if (group === "Ungrouped") return "未分组";
  return group;
};

// 过滤逻辑
const filteredEntries = computed(() => {
  return localEntries.value.filter((entry) => {
    // 处理未分组的情况，统一逻辑
    const entryGroup = entry.groupName || "未分组";
    const currentSelection =
      selectedGroup.value === "All" ? "All" : selectedGroup.value;

    // 如果选的是All，则匹配所有；否则匹配具体组名（注意处理 Ungrouped/未分组 的映射）
    const matchGroup =
      currentSelection === "All" || entryGroup === currentSelection;

    const query = searchQuery.value.toLowerCase();
    const matchSearch =
      !query ||
      entry.name.toLowerCase().includes(query) ||
      entry.groupName?.toLowerCase().includes(query) ||
      entry.activationEffect.content.toLowerCase().includes(query) ||
      entry.activationWhen.condition.some((c) =>
        c.toLowerCase().includes(query)
      );

    return matchGroup && matchSearch;
  });
});

// --- Actions ---
watch(
  localEntries,
  (newVal) => {
    emit("update:modelValue", newVal);
  },
  { deep: true }
);

const addEntry = () => {
  const newEntry: LorebookEntry = {
    id: crypto.randomUUID().slice(0, 8), // 简短ID
    name: "新条目",
    description: "",
    groupName: selectedGroup.value === "All" ? "默认分组" : selectedGroup.value,
    enabled: true,
    escapeScanWhenRecursing: false,
    activationWhen: { alwaysActivation: false, condition: [] },
    activationEffect: {
      role: "system",
      position: "SCENARIO", // 默认常用位置
      content: "",
      insertion_order: 100,
      intervalsToCreate: { type: "", length: "", content: {} },
    },
  };
  localEntries.value.unshift(newEntry); // 添加到顶部
};

const removeEntry = (id: string) => {
  if (confirm("确定要删除这个世界书条目吗？")) {
    localEntries.value = localEntries.value.filter((e) => e.id !== id);
  }
};

const duplicateEntry = (entry: LorebookEntry) => {
  const newEntry = cloneDeep(entry);
  newEntry.id = crypto.randomUUID().slice(0, 8);
  newEntry.name = `${newEntry.name} (副本)`;
  localEntries.value.unshift(newEntry);
};
</script>

<template>
  <div
    class="flex h-[600px] w-full bg-slate-50/50 border border-slate-200 rounded-xl overflow-hidden shadow-sm font-sans"
  >
    <!-- 1. 侧边栏: 分组 -->
    <aside
      class="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0"
    >
      <div class="p-4 border-b border-slate-100 flex items-center gap-2">
        <BookOpen class="text-indigo-600 h-5 w-5" />
        <h2 class="font-bold text-sm tracking-tight text-slate-800">
          世界书 (Lorebook)
        </h2>
      </div>

      <ScrollArea class="flex-1">
        <div class="p-3">
          <div
            class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2"
          >
            分组列表
          </div>
          <nav class="space-y-0.5">
            <button
              v-for="group in groups"
              :key="group"
              @click="selectedGroup = group"
              :class="[
                'w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors flex justify-between items-center',
                selectedGroup === group
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              ]"
            >
              <span class="truncate">{{ getGroupLabel(group) }}</span>
              <Badge
                variant="secondary"
                class="ml-2 px-1.5 h-5 min-w-5 flex items-center justify-center text-[10px] bg-white border-slate-200 shadow-sm text-slate-500"
              >
                {{
                  group === "All"
                    ? localEntries.length
                    : localEntries.filter(
                        (e) => (e.groupName || "未分组") === group
                      ).length
                }}
              </Badge>
            </button>
          </nav>
        </div>
      </ScrollArea>

      <div class="p-3 border-t border-slate-100 bg-slate-50/50">
        <div class="text-[10px] text-slate-400 text-center">
          总条目数: {{ localEntries.length }}
        </div>
      </div>
    </aside>

    <!-- 2. 主内容区域 -->
    <main class="flex-1 flex flex-col min-w-0 bg-slate-50/30">
      <!-- 工具栏 -->
      <header
        class="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-4 shrink-0"
      >
        <div class="relative max-w-md w-full">
          <Search
            class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4"
          />
          <Input
            v-model="searchQuery"
            placeholder="搜索触发词、名称或内容..."
            class="pl-9 h-9 bg-slate-100 border-transparent focus:bg-white focus:border-indigo-500/50 transition-all text-xs"
          />
        </div>
        <Button
          size="sm"
          class="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-4 shadow-sm"
          @click="addEntry"
        >
          <Plus class="h-4 w-4 mr-2" />
          添加条目
        </Button>
      </header>

      <!-- 条目列表 -->
      <ScrollArea class="flex-1 p-4 sm:p-6">
        <div class="space-y-6">
          <div
            v-for="entry in filteredEntries"
            :key="entry.id"
            :class="[
              'group relative bg-white rounded-xl border transition-all duration-200 overflow-hidden',
              entry.enabled
                ? 'border-slate-200 shadow-sm hover:border-indigo-300'
                : 'border-slate-100 opacity-75 bg-slate-50 grayscale-[0.5]',
            ]"
          >
            <!-- 卡片头部: 元数据 -->
            <div
              class="flex flex-wrap items-center justify-between px-4 py-2 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 gap-2"
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <!-- 启用/禁用 开关 -->
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button
                        @click="entry.enabled = !entry.enabled"
                        :class="[
                          'p-1.5 rounded-md transition-colors border',
                          entry.enabled
                            ? 'text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100'
                            : 'text-slate-400 bg-white border-slate-200 hover:bg-slate-100',
                        ]"
                      >
                        <Eye v-if="entry.enabled" class="h-4 w-4" />
                        <EyeOff v-else class="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {{ entry.enabled ? "禁用此条目" : "启用此条目" }}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <!-- 名称 & 分组 -->
                <div class="flex flex-col min-w-0 gap-1 flex-1">
                  <Input
                    v-model="entry.name"
                    class="h-7 px-1.5 py-0 border-transparent hover:border-slate-200 focus:border-indigo-300 bg-transparent text-sm font-bold text-slate-800 placeholder:text-slate-300 w-full min-w-[120px]"
                    placeholder="条目名称"
                  />
                  <div class="flex items-center gap-2">
                    <Input
                      v-model="entry.groupName"
                      placeholder="未分组"
                      class="h-5 w-24 px-1.5 py-0 text-[10px] bg-slate-100 border-none rounded text-slate-600 placeholder:text-slate-400 focus:ring-0 focus:bg-white focus:border focus:border-slate-200"
                    />
                    <span class="text-[10px] text-slate-300 select-none"
                      >ID: {{ entry.id }}</span
                    >
                  </div>
                </div>
              </div>

              <!-- 右侧操作: 优先级 & 菜单 -->
              <div
                class="flex items-center gap-3 pl-2 border-l border-slate-100"
              >
                <!-- 优先级输入 -->
                <div class="flex flex-col items-end">
                  <span
                    class="uppercase text-[9px] font-bold text-slate-400 tracking-wider"
                  >
                    权重(Order)
                  </span>
                  <input
                    type="number"
                    v-model.number="entry.activationEffect.insertion_order"
                    class="w-12 text-right text-xs font-mono bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-500 outline-none text-slate-600"
                    title="插入顺序权重"
                  />
                </div>

                <!-- 递归扫描开关 (迷你版) -->
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button
                        @click="
                          entry.escapeScanWhenRecursing =
                            !entry.escapeScanWhenRecursing
                        "
                        :class="[
                          'p-1.5 rounded transition-colors',
                          entry.escapeScanWhenRecursing
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-300 hover:text-slate-500',
                        ]"
                      >
                        <SkipForward class="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>递归扫描跳过</p>
                      <p class="text-[10px] text-slate-400">
                        启用后，此条目内容不会触发其他条目
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <!-- 下拉菜单 -->
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-slate-400 hover:text-slate-700"
                    >
                      <MoreVertical class="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-32">
                    <DropdownMenuItem @click="duplicateEntry(entry)">
                      <Copy class="mr-2 h-3.5 w-3.5" /> 复制
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      @click="removeEntry(entry.id)"
                      class="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <Trash2 class="mr-2 h-3.5 w-3.5" /> 删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <!-- 卡片主体: 分栏布局 -->
            <div
              class="flex flex-col md:flex-row text-sm divide-y md:divide-y-0 md:divide-x divide-slate-100"
            >
              <!-- 左侧: 激活条件 -->
              <div
                class="md:w-5/12 bg-amber-50/20 p-4 flex flex-col gap-3 relative"
              >
                <div class="flex items-center justify-between mb-1">
                  <div
                    class="flex items-center gap-2 text-amber-700/80 font-bold text-xs uppercase tracking-wide"
                  >
                    <Zap class="h-3.5 w-3.5" /> 激活规则
                  </div>
                  <button
                    @click="
                      entry.activationWhen.alwaysActivation =
                        !entry.activationWhen.alwaysActivation
                    "
                    :class="[
                      'text-[10px] px-2 py-0.5 rounded-full border transition-all font-medium flex items-center gap-1',
                      entry.activationWhen.alwaysActivation
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-amber-300',
                    ]"
                  >
                    <span v-if="entry.activationWhen.alwaysActivation"
                      >常驻激活</span
                    >
                    <span v-else>条件激活</span>
                    <Zap
                      v-if="entry.activationWhen.alwaysActivation"
                      class="h-3 w-3 fill-current"
                    />
                    <ZapOff v-else class="h-3 w-3" />
                  </button>
                </div>

                <!-- 触发词编辑器 (Custom) -->
                <div class="flex-1 min-h-[60px]">
                  <ExecutableStringEditor
                    v-if="!entry.activationWhen.alwaysActivation"
                    v-model="entry.activationWhen.condition"
                    class="w-full"
                    placeholder="添加触发关键词..."
                  />
                  <div
                    v-else
                    class="h-full flex flex-col items-center justify-center text-green-600/60 text-xs italic p-4 border border-dashed border-green-200 rounded-lg bg-green-50/30 text-center"
                  >
                    此条目始终生效，<br />无需配置触发词。
                  </div>
                </div>
              </div>

              <!-- 右侧: 内容效果 -->
              <div
                class="flex-1 bg-indigo-50/10 p-4 flex flex-col gap-3 min-w-0 relative"
              >
                <!-- 视觉箭头连接符 -->
                <div
                  class="absolute top-1/2 -left-3 -translate-y-1/2 z-10 hidden md:block text-slate-300 bg-white rounded-full p-0.5 border border-slate-100 shadow-sm"
                >
                  <ArrowRight class="h-4 w-4" />
                </div>

                <div class="flex items-center justify-between mb-1">
                  <div
                    class="flex items-center gap-2 text-indigo-700/80 font-bold text-xs uppercase tracking-wide"
                  >
                    <Database class="h-3.5 w-3.5" /> 内容效果
                  </div>

                  <!-- 设置行 -->
                  <div class="flex gap-2">
                    <Select v-model="entry.activationEffect.role">
                      <SelectTrigger
                        class="h-6 w-[110px] text-[10px] px-2 bg-white border-slate-200"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="r in roleOptions"
                          :key="r.value"
                          :value="r.value"
                          >{{ r.label }}</SelectItem
                        >
                      </SelectContent>
                    </Select>
                    <Input
                      v-model="entry.activationEffect.position"
                      placeholder="插入位置"
                      title="Position (例如: SCENARIO, BEFORE_CHAR)"
                      class="h-6 w-24 text-[10px] px-2 bg-white border-slate-200"
                    />
                  </div>
                </div>

                <!-- 内容编辑器 -->
                <PopableTextarea
                  v-model="entry.activationEffect.content"
                  placeholder="在此输入世界书内容..."
                  dialogTitle="编辑详细内容"
                  class="text-xs font-mono leading-relaxed bg-white border-slate-200 focus-visible:ring-indigo-500/20 min-h-[100px] resize-none shadow-sm"
                />
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div
            v-if="filteredEntries.length === 0"
            class="flex flex-col items-center justify-center py-16 text-slate-400"
          >
            <Layers class="h-12 w-12 mb-4 opacity-10" />
            <p class="text-sm font-medium">没有找到匹配的条目。</p>
            <Button
              variant="link"
              size="sm"
              @click="
                selectedGroup = 'All';
                searchQuery = '';
              "
              class="mt-2 text-indigo-600"
            >
              清除筛选条件
            </Button>
          </div>
        </div>
      </ScrollArea>
    </main>
  </div>
</template>

<style scoped>
/* 自定义滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
