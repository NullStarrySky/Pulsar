<!-- src/components/layout/LeftSidebar.vue -->
<script setup lang="ts">
import { type PropType, type Component, computed, watchEffect } from "vue";
import { useColorMode, useStorage } from "@vueuse/core";
import { Sun, Moon, Palette, Check } from "lucide-vue-next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SidebarView, useUIStore } from "@/features/UI/UI.store";

type OnClickAction = string | Function;
interface ButtonConfig {
  svg: Component;
  onClick: OnClickAction;
  title?: string;
}
type ButtonGroup = ButtonConfig[];

defineProps({
  top: { type: Array as PropType<ButtonGroup>, required: true },
  bottom: { type: Array as PropType<ButtonGroup>, required: true },
});

const uiStore = useUIStore();

/* ======================================================================== */
/* 明暗模式切换                                          */
/* ======================================================================== */
const mode = useColorMode();
const themeIconComponent = computed(() => (mode.value === "dark" ? Sun : Moon));
const themeTitle = computed(
  () => `切换到${mode.value === "dark" ? "亮色" : "暗色"}模式`
);
const toggleTheme = () => {
  mode.value = mode.value === "dark" ? "light" : "dark";
};

/* ======================================================================== */
/* 主题切换                                                       */
/* ======================================================================== */
const themes = [
  {
    name: "默认",
    class: "theme-default",
    colors: ["oklch(0.6171 0.1375 39.0427)", "oklch(0.9245 0.0138 92.9892)"],
  },
  {
    name: "Catppuccin",
    class: "theme-catppuccin",
    colors: ["oklch(0.5547 0.2503 297.0156)", "oklch(0.6820 0.1448 235.3822)"],
  },
  {
    name: "Tangerine",
    class: "theme-tangerine",
    colors: ["oklch(0.6397 0.1720 36.4421)", "oklch(0.9119 0.0222 243.8174)"],
  },
  {
    name: "Amber Minimal",
    class: "theme-amberminimal",
    colors: ["oklch(0.7686 0.1647 70.0804)", "oklch(0.4732 0.1247 46.2007)"],
  },
  {
    name: "Clean Slate",
    class: "theme-cleanslate",
    colors: ["oklch(0.5854 0.2041 277.1173)", "oklch(0.3729 0.0306 259.7328)"],
  },
  {
    name: "Solar Dusk",
    class: "theme-solardusk",
    colors: ["oklch(0.5553 0.1455 48.9975)", "oklch(0.8276 0.0752 74.4400)"],
  },
  {
    name: "Claymorphism",
    class: "theme-claymorphism",
    colors: ["oklch(0.5854 0.2041 277.1173)", "oklch(0.8687 0.0043 56.3660)"],
  },
  {
    name: "Violet Bloom",
    class: "theme-violetbloom",
    colors: ["oklch(0.5393 0.2713 286.7462)", "oklch(0.9540 0.0063 255.4755)"],
  },
  {
    name: "Twitter",
    class: "theme-twitter",
    colors: ["oklch(0.6723 0.1606 244.9955)", "oklch(0.9392 0.0166 250.8453)"],
  },
  {
    name: "Notebook",
    class: "theme-notebook",
    colors: ["oklch(0.4891 0 0)", "oklch(0.9006 0 0)"],
  },
];

const currentTheme = useStorage("color-theme", "theme-default");

const setTheme = (themeClass: string) => {
  currentTheme.value = themeClass;
};

// 监听主题变化并更新<html>元素的class
watchEffect(() => {
  if (typeof window === "undefined") return;
  const htmlEl = document.documentElement;
  themes.forEach((theme) => {
    if (htmlEl.classList.contains(theme.class)) {
      htmlEl.classList.remove(theme.class);
    }
  });
  if (currentTheme.value && currentTheme.value !== "theme-default") {
    htmlEl.classList.add(currentTheme.value);
  }
});

/* ======================================================================== */
/* 按钮点击处理                                                  */
/* ======================================================================== */
const isActionActive = (action: OnClickAction): boolean => {
  // 如果 action 对应当前的 leftSidebarView，则高亮
  if (typeof action === "string") {
    return uiStore.uiState.leftSidebarView === action;
  }
  return false;
};

const handleButtonClick = (action: OnClickAction) => {
  if (typeof action === "string") {
    // 检查是否是侧边栏视图关键字
    if (action === "files" || action === "character") {
      uiStore.toggleSidebarView(action as SidebarView);
    } else {
      // 否则当作文件路径打开
      uiStore.openFile(action);
    }
  } else if (typeof action === "function") {
    action();
  }
};
</script>

<template>
  <nav
    class="bg-sidebar text-sidebar-foreground flex h-full w-[54px] flex-col transition-all duration-200 z-10"
  >
    <div
      class="flex flex-1 min-h-0 flex-col items-center gap-2.5 px-3 py-3"
      data-tauri-drag-region
    >
      <template v-for="item in top" :key="item.title">
        <button
          :title="item.title"
          @click="handleButtonClick(item.onClick)"
          class="flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent"
          :class="{
            'bg-sidebar-accent': isActionActive(item.onClick),
          }"
        >
          <component
            :is="item.svg"
            class="shrink-0 size-[18px]"
            :class="
              isActionActive(item.onClick)
                ? 'text-sidebar-accent-foreground'
                : 'text-sidebar-foreground'
            "
          />
        </button>
      </template>
    </div>
    <div
      class="flex flex-col items-center justify-center gap-2.5 px-[11px] pb-2.5 pt-3"
    >
      <Popover>
        <PopoverTrigger as-child>
          <button
            title="切换主题"
            class="flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent"
          >
            <Palette class="size-[18px] text-sidebar-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" class="w-40 p-2">
          <div class="flex flex-col gap-1">
            <button
              v-for="theme in themes"
              :key="theme.name"
              @click="setTheme(theme.class)"
              class="flex items-center justify-between px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
            >
              <div class="flex items-center gap-2">
                <div class="flex items-center gap-1.5">
                  <div
                    class="size-3 rounded-full"
                    :style="{
                      backgroundColor: theme.colors[0],
                    }"
                  ></div>
                  <div
                    class="size-3 rounded-full"
                    :style="{
                      backgroundColor: theme.colors[1],
                    }"
                  ></div>
                </div>
                <span>{{ theme.name }}</span>
              </div>
              <Check v-if="currentTheme === theme.class" class="size-4" />
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <!-- 明暗模式切换按钮 -->
      <button
        :title="themeTitle"
        @click="toggleTheme"
        class="flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent"
      >
        <component
          :is="themeIconComponent"
          class="size-[18px] text-sidebar-foreground"
        />
      </button>

      <!-- 底部其他按钮 -->
      <template v-for="item in bottom" :key="item.title">
        <button
          :title="item.title"
          @click="handleButtonClick(item.onClick)"
          class="flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent"
        >
          <component
            :is="item.svg"
            class="size-[18px] text-sidebar-foreground"
          />
        </button>
      </template>
    </div>
  </nav>
</template>
