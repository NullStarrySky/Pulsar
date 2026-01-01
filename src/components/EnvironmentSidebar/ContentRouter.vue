<!-- src/components/EnvironmentSidebar/ContentRouter.vue -->
<script setup lang="ts">
import { ref, computed, markRaw } from "vue";
import { useUIStore } from "@/features/UI/UI.store";
import {
	MessageSquare,
	User,
	BookOpen,
	Settings2,
	Image as ImageIcon,
	ChevronLeft,
	LayoutGrid,
} from "lucide-vue-next";

// 引入 Panel 组件
import ResourcePanel from "./ResourcePanel.vue";

// 类型定义
type PanelId = "chat" | "character" | "lorebook" | "preset" | "visual";

interface PanelCard {
	id: PanelId;
	title: string;
	description: string;
	icon: any;
	component: any;
}

interface PanelGroup {
	groupName: string;
	children: PanelCard[];
}

// 1. 定义分组和卡片配置

const PANEL_GROUPS: PanelGroup[] = [
	{
		groupName: "Narrative",
		children: [
			{
				id: "chat",
				title: "对话",
				description: "管理剧情分支与聊天记录",
				icon: MessageSquare,
				component: markRaw(ResourcePanel), // Fallback if ChatPanel missing
			},
		],
	},
	{
		groupName: "Resources",
		children: [
			{
				id: "character",
				title: "角色",
				description: "关联的角色卡与属性",
				icon: User,
				component: markRaw(ResourcePanel), // 使用新组件
			},
			{
				id: "lorebook",
				title: "世界书",
				description: "扩展词条与知识库",
				icon: BookOpen,
				component: markRaw(ResourcePanel), // 复用
			},
			{
				id: "preset",
				title: "预设",
				description: "生成参数与模型预设",
				icon: Settings2,
				component: markRaw(ResourcePanel), // 复用
			},
		],
	},
	{
		groupName: "Appearance",
		children: [
			{
				id: "visual",
				title: "视觉与组件",
				description: "背景图片、UI组件与样式",
				icon: ImageIcon,
				component: markRaw(ResourcePanel), // 复用，内部处理 id='visual'
			},
		],
	},
];

const uiStore = useUIStore();

// 2. 状态管理
// 面板 ID 状态，不随 activeFile 改变而重置（符合“切换角色维持 Panel”的需求）
const activePanelId = ref<PanelId | null>(null);

// 3. 路径计算
const packagePath = computed(() => {
	const activeFile = uiStore.uiState.activeFile;
	if (!activeFile) return null;
	const parts = activeFile.split("/");
	// 假设结构为 root/PackageName/...
	if (parts.length >= 2) {
		return parts.slice(0, 2).join("/");
	}
	return null;
});

// 计算当前激活的卡片配置
const activeCard = computed(() => {
	if (!activePanelId.value) return null;
	for (const group of PANEL_GROUPS) {
		const found = group.children.find((c) => c.id === activePanelId.value);
		if (found) return found;
	}
	return null;
});

// 4. 操作
const openPanel = (id: PanelId) => {
	activePanelId.value = id;
};

const closePanel = () => {
	activePanelId.value = null;
};
</script>

<template>
  <div class="h-full w-full bg-background flex flex-col overflow-hidden">
    <!-- 状态 A: 未检测到环境 -->
    <div
      v-if="!packagePath"
      class="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2"
    >
      <LayoutGrid class="w-10 h-10 opacity-20" />
      <div class="text-sm">未选择环境</div>
    </div>

    <!-- 状态 B: 显示 Panel (详情页) -->
    <div v-else-if="activePanelId && activeCard" class="flex flex-col h-full">
      <!-- Panel Header -->
      <div
        class="flex items-center gap-2 p-3 border-b border-border bg-muted/20 shrink-0"
      >
        <button
          @click="closePanel"
          class="p-1 hover:bg-accent rounded-md transition-colors"
          title="返回"
        >
          <ChevronLeft class="w-5 h-5 text-muted-foreground" />
        </button>
        <div class="flex items-center gap-2 text-sm font-medium">
          <component :is="activeCard.icon" class="w-4 h-4 text-primary" />
          <span>{{ activeCard.title }}</span>
        </div>
      </div>

      <!-- Panel Content -->
      <div class="flex-1 overflow-hidden relative">
        <!--
           传递 id 和 packagePath。
           组件内部负责根据 id (例如 'chat') 拼接完整路径。
        -->
        <component
          :is="activeCard.component"
          :id="activePanelId"
          :packagePath="packagePath"
          class="h-full w-full"
        />
      </div>
    </div>

    <!-- 状态 C: 显示分组卡片列表 (首页) -->
    <div v-else class="flex-1 overflow-y-auto p-4 space-y-6">
      <div v-for="group in PANEL_GROUPS" :key="group.groupName">
        <h3
          class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1"
        >
          {{ group.groupName }}
        </h3>
        <div class="grid grid-cols-1 gap-3">
          <div
            v-for="card in group.children"
            :key="card.id"
            @click="openPanel(card.id)"
            class="group relative flex items-start gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/50 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <div
              class="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
            >
              <component :is="card.icon" class="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="text-sm font-medium text-foreground mb-1">
                {{ card.title }}
              </h4>
              <p class="text-xs text-muted-foreground line-clamp-2">
                {{ card.description }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
