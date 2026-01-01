<!-- src/components/EnvironmentSidebar/panel/ResourcePanel.vue -->
<template>
  <div class="flex flex-col h-full bg-background text-foreground">
    <!-- =========================
         顶部操作栏
         ========================= -->
    <div class="flex items-center gap-2 p-3 border-b border-border shrink-0">
      <div class="relative flex-1">
        <Search
          class="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
        />
        <input
          v-model="searchQuery"
          class="w-full pl-8 pr-2 py-1.5 text-sm bg-muted/50 border border-transparent focus:border-primary rounded-md outline-none transition-all placeholder:text-muted-foreground/50"
          placeholder="搜索..."
        />
      </div>

      <!-- 新建按钮 -->
      <button
        @click="handleCreate"
        class="p-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors"
        title="新建"
      >
        <Plus class="w-4 h-4" />
      </button>

      <!-- 导入按钮 -->
      <button
        @click="fileInput?.click()"
        class="p-2 hover:bg-accent text-muted-foreground hover:text-foreground rounded-md transition-colors"
        title="导入"
      >
        <Upload class="w-4 h-4" />
      </button>
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="handleImport"
      />
    </div>

    <!-- =========================
         中间：资源列表
         ========================= -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <!-- Loading 态 -->
      <div v-if="env.isScanning.value" class="flex justify-center p-4">
        <Loader2 class="w-5 h-5 animate-spin text-muted-foreground" />
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="filteredList.length === 0"
        class="text-center py-8 text-xs text-muted-foreground"
      >
        暂无资源
      </div>

      <!-- 列表项 -->
      <div
        v-for="item in filteredList"
        :key="item.path"
        class="group flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 border border-transparent hover:border-border transition-all cursor-pointer"
        @click="handleItemClick(item)"
      >
        <!-- 左侧：选择框 (背景图除外，背景图用RadioButton逻辑或独立逻辑) -->
        <div
          class="shrink-0 flex items-center justify-center w-6 h-6"
          @click.stop="env.actions.toggleSelection(item, !item.isSelected)"
        >
          <!-- 选中状态 (Character/Lorebook) -->
          <div
            v-if="item.isSelected"
            class="w-4 h-4 rounded bg-primary flex items-center justify-center text-primary-foreground"
          >
            <Check class="w-3 h-3" />
          </div>
          <!-- 未选中状态 (Hover显示边框) -->
          <div
            v-else
            class="w-4 h-4 rounded border border-muted-foreground/30 group-hover:border-primary/50 transition-colors"
          ></div>
        </div>

        <!-- 中间：名称与标签 -->
        <div class="flex-1 min-w-0 flex flex-col">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium truncate">{{ item.name }}</span>
            <!-- 状态 Flags -->
            <span
              v-if="item.isTemplate"
              class="text-[10px] px-1 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20"
              >T</span
            >
            <span
              v-if="item.isShared"
              class="text-[10px] px-1 rounded bg-purple-500/10 text-purple-500 border border-purple-500/20"
              >S</span
            >
            <span
              v-if="item.isMixin"
              class="text-[10px] px-1 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20"
              >M</span
            >
          </div>
          <!-- 底部 Tag (显示路径或自定义Tag) -->
          <div
            class="text-xs text-muted-foreground/70 truncate flex gap-1 mt-0.5"
          >
            <span
              v-for="tag in item.tags.slice(0, 3)"
              :key="tag"
              class="bg-muted px-1 rounded text-[10px]"
              >{{ tag }}</span
            >
            <span v-if="item.tags.length === 0" class="italic opacity-50">{{
              item.type
            }}</span>
          </div>
        </div>

        <!-- 右侧：下拉操作栏 -->
        <div class="shrink-0 relative" ref="menuContainer" @click.stop>
          <button
            @click="toggleMenu(item.path)"
            class="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-background hover:shadow-sm transition-all"
          >
            <MoreVertical class="w-4 h-4 text-muted-foreground" />
          </button>

          <!-- 简易 Dropdown (实际项目中建议使用 Headless UI Popover) -->
          <div
            v-if="activeMenuId === item.path"
            class="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50 flex flex-col py-1 text-sm animate-in fade-in zoom-in-95 duration-100 origin-top-right"
          >
            <!-- 基础操作 -->
            <button
              @click="triggerRename(item)"
              class="text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2"
            >
              <Pencil class="w-3 h-3" /> 重命名
            </button>
            <button
              @click="triggerCopy(item)"
              class="text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2"
            >
              <Copy class="w-3 h-3" /> 复制
            </button>

            <div class="h-px bg-border my-1"></div>

            <!-- 标志位设置 -->
            <template v-if="props.id !== 'chat'">
              <button
                @click="toggleStatus(item, 'T')"
                class="text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2"
              >
                <LayoutTemplate
                  class="w-3 h-3"
                  :class="item.isTemplate ? 'text-primary' : ''"
                />
                设为模板
              </button>
              <button
                @click="toggleStatus(item, 'S')"
                class="text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2"
              >
                <Share2
                  class="w-3 h-3"
                  :class="item.isShared && !item.isMixin ? 'text-primary' : ''"
                />
                设为共享
              </button>
              <button
                @click="toggleStatus(item, 'M')"
                class="text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2"
              >
                <Globe2
                  class="w-3 h-3"
                  :class="item.isMixin ? 'text-primary' : ''"
                />
                全局共享 (Mixin)
              </button>
              <button
                @click="toggleStatus(item, null)"
                class="text-left px-3 py-1.5 hover:bg-accent text-destructive flex items-center gap-2"
              >
                <XCircle class="w-3 h-3" /> 清除标志
              </button>
            </template>

            <!-- 特殊操作: 背景图 -->
            <template v-if="resourceKey === 'background'">
              <div class="h-px bg-border my-1"></div>
              <button
                @click="setAsBackground(item)"
                class="text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2"
              >
                <ImageIcon class="w-3 h-3" /> 设为环境背景
              </button>
            </template>

            <!-- 特殊操作: 组件类型 (Visual Panel) -->
            <template v-if="props.id === 'visual' && item.type !== 'image'">
              <div class="h-px bg-border my-1"></div>
              <button
                @click="openComponentModal(item)"
                class="text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2"
              >
                <AppWindow class="w-3 h-3" /> 组件设置...
              </button>
            </template>

            <div class="h-px bg-border my-1"></div>

            <button
              @click="triggerDelete(item)"
              class="text-left px-3 py-1.5 hover:bg-destructive/10 text-destructive flex items-center gap-2"
            >
              <Trash2 class="w-3 h-3" /> 删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- =========================
         弹窗：组件设置 (简化版)
         ========================= -->
    <div
      v-if="showCompModal"
      class="absolute inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        class="bg-card border border-border shadow-xl rounded-lg w-full max-w-xs p-4 space-y-4"
      >
        <h3 class="font-medium text-sm">设置组件类型</h3>
        <p class="text-xs text-muted-foreground">
          选择 "{{ tempModalItem?.name }}" 的加载方式:
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button
            @click="setComponentType('inline')"
            class="border p-2 rounded hover:bg-accent text-xs"
          >
            内联 (Inline)
          </button>
          <button
            @click="setComponentType('overlay')"
            class="border p-2 rounded hover:bg-accent text-xs"
          >
            覆盖 (Overlay)
          </button>
        </div>
        <button
          @click="showCompModal = false"
          class="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          取消
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import {
  Search,
  Plus,
  Upload,
  MoreVertical,
  Loader2,
  Check,
  Trash2,
  Pencil,
  Copy,
  LayoutTemplate,
  Share2,
  Globe2,
  XCircle,
  Image as ImageIcon,
  AppWindow,
} from "lucide-vue-next";
import {
  useEnvironment,
  type ResourceItem,
} from "../composables/useEnvironment";
import { useUIStore } from "@/features/UI/UI.store";
import { SemanticType } from "@/schema/SemanticType";

// ==========================
// Props & Context
// ==========================
const props = defineProps<{
  id: string; // "character" | "lorebook" | "preset" | "visual" | "chat"
  packagePath: string | null;
}>();

// 映射 Panel ID 到 useEnvironment 的资源 Key
const resourceKey = computed(() => {
  if (props.id === "visual") return "background";
  return props.id as "character" | "lorebook" | "preset" | "background";
});

// 映射 SemanticType 用于新建
const semanticType = computed((): SemanticType | "background" => {
  if (props.id === "visual") return "background";
  if (["character", "lorebook", "preset"].includes(props.id))
    return props.id as SemanticType;
  return "character"; // Fallback
});

// 初始化环境 Hook
// 注意：packagePath 传入 null 时 hook 内部会处理，但这里我们尽量传入有效路径
// 如果 packagePath 仅仅是包路径，我们需要构建一个虚拟的文件路径让 hook 解析出 root
const activePathFake = computed(() =>
  props.packagePath ? `${props.packagePath}/manifest.json` : null
);
const env = useEnvironment(activePathFake);

const uiStore = useUIStore();

// ==========================
// State
// ==========================
const searchQuery = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

// Dropdown State
const activeMenuId = ref<string | null>(null);

// Component Modal State
const showCompModal = ref(false);
const tempModalItem = ref<ResourceItem | null>(null);

// ==========================
// Computed
// ==========================
const currentResourceList = computed(() => {
  const key = resourceKey.value;
  // @ts-ignore - Dynamic key access
  return (env.resources.value[key] || []) as ResourceItem[];
});

const filteredList = computed(() => {
  if (!searchQuery.value) return currentResourceList.value;
  const q = searchQuery.value.toLowerCase();
  return currentResourceList.value.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q))
  );
});

// ==========================
// Actions
// ==========================

// 1. Navigation
const handleItemClick = (item: ResourceItem) => {
  // 需求：character/name/index.json -> 打开 index
  // useEnvironment 的 ResourceItem.path 已经是 index.json 的路径 (VirtualFile.path)
  // 直接请求 UI 打开
  uiStore.setActiveFile(item.path);
};

// 2. CRUD
const handleCreate = async () => {
  if (semanticType.value === "background") {
    // Background 通常只能导入，不能创建一个空文本
    fileInput.value?.click();
    return;
  }
  await env.actions.createNew(semanticType.value as SemanticType);
};

const handleImport = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (!files) return;
  for (let i = 0; i < files.length; i++) {
    await env.actions.uploadFile(files[i]);
  }
  // Reset input
  if (fileInput.value) fileInput.value.value = "";
};

const triggerRename = async (item: ResourceItem) => {
  activeMenuId.value = null;
  const newName = prompt("重命名资源", item.name);
  if (newName && newName !== item.name) {
    await env.actions.rename(item, newName);
  }
};

const triggerDelete = async (item: ResourceItem) => {
  activeMenuId.value = null;
  if (confirm(`确定要删除 ${item.name} 吗?`)) {
    await env.actions.delete(item);
  }
};

const triggerCopy = async (item: ResourceItem) => {
  activeMenuId.value = null;
  // 简易实现：复制逻辑通常需要 Backend 支持或读取内容再创建
  // 这里暂时留空或提示
  console.log("Copy logic to be implemented for", item.path);
};

// 3. Flags (Template, Shared, Global)
const toggleStatus = async (
  item: ResourceItem,
  signal: "S" | "M" | "T" | null
) => {
  activeMenuId.value = null;
  await env.actions.setSignal(item, signal);
};

// 4. Background Specific
const setAsBackground = (item: ResourceItem) => {
  activeMenuId.value = null;
  // 强制选中逻辑：对于 Background，Selection 即为 Set Active
  env.actions.toggleSelection(item, true);
};

// 5. Component Modal Logic
const openComponentModal = (item: ResourceItem) => {
  activeMenuId.value = null;
  tempModalItem.value = item;
  showCompModal.value = true;
};

const setComponentType = (type: "inline" | "overlay") => {
  // 需求：结果显示在 Tag 里面
  // 这是一个 Mock 实现，我们假设 VirtualNode 有一个 storage 或我们修改 manifest
  console.log(`Setting ${tempModalItem.value?.name} to ${type}`);

  // 实际操作中，这里可能需要写各种 meta 文件或修改 manifest
  // 这里我们简单 hack 一下，暂时无法直接写回 tag，
  // 但我们可以触发一次 refresh 或者在 UI 上假装加个 Tag
  if (tempModalItem.value) {
    tempModalItem.value.tags.push(type); // 临时视觉反馈
  }

  showCompModal.value = false;
  tempModalItem.value = null;
};

// ==========================
// UI Helpers
// ==========================
const toggleMenu = (id: string) => {
  activeMenuId.value = activeMenuId.value === id ? null : id;
};

// 点击外部关闭菜单
const closeMenu = () => {
  activeMenuId.value = null;
};

onMounted(() => document.addEventListener("click", closeMenu));
onUnmounted(() => document.removeEventListener("click", closeMenu));
</script>
