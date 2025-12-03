<!-- src/schema/statistic/StatisticEditor.vue -->
<template>
  <div class="space-y-6 p-4">
    <!-- 1. 概览数据卡片 -->
    <section>
      <h2 class="text-xl font-semibold mb-4 tracking-tight">概览数据</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <!-- 用户消息 -->
        <Card>
          <CardHeader
            class="flex flex-row items-center justify-between space-y-0 pb-2"
          >
            <CardTitle class="text-sm font-medium">用户消息</CardTitle>
            <Users class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ statisticData.userMessageCount }}
            </div>
            <p class="text-xs text-muted-foreground">累计发送的消息数量</p>
          </CardContent>
        </Card>

        <!-- 模型回复 -->
        <Card>
          <CardHeader
            class="flex flex-row items-center justify-between space-y-0 pb-2"
          >
            <CardTitle class="text-sm font-medium">模型回复</CardTitle>
            <Bot class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ statisticData.modelMessageCount }}
            </div>
            <p class="text-xs text-muted-foreground">累计接收的回复数量</p>
          </CardContent>
        </Card>

        <!-- 总计 -->
        <Card>
          <CardHeader
            class="flex flex-row items-center justify-between space-y-0 pb-2"
          >
            <CardTitle class="text-sm font-medium">总交互数</CardTitle>
            <MessageSquare class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ totalMessageCount }}</div>
            <p class="text-xs text-muted-foreground">所有对话交互总和</p>
          </CardContent>
        </Card>
      </div>
    </section>

    <!-- 2. 月度活跃热力图 -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold tracking-tight">活跃度热力图</h2>

        <!-- 月份控制 -->
        <div class="flex items-center space-x-2">
          <Button variant="outline" size="icon" @click="changeMonth(-1)">
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <div class="w-32 text-center font-medium">
            {{ currentYear }}年 {{ currentMonth + 1 }}月
          </div>
          <Button variant="outline" size="icon" @click="changeMonth(1)">
            <ChevronRight class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" @click="resetToToday" class="ml-2">
            回到今天
          </Button>
        </div>
      </div>

      <Card>
        <CardContent class="p-6">
          <!-- 星期表头 -->
          <div class="grid grid-cols-7 mb-2">
            <div
              v-for="day in weekDays"
              :key="day"
              class="text-center text-xs text-muted-foreground font-medium py-1"
            >
              {{ day }}
            </div>
          </div>

          <!-- 日历网格 -->
          <div class="grid grid-cols-7 gap-2">
            <TooltipProvider
              v-for="(day, _) in calendarGrid"
              :key="day.dateStr"
            >
              <Tooltip :delayDuration="0">
                <TooltipTrigger as-child>
                  <div
                    class="aspect-square rounded-md flex items-center justify-center text-xs relative cursor-default transition-colors border"
                    :class="[
                      getCellColorClass(day.count),
                      !day.isCurrentMonth ? 'opacity-30' : 'opacity-100',
                      day.isToday ? 'ring-2 ring-primary ring-offset-2' : '',
                    ]"
                  >
                    <span
                      :class="
                        day.count > 0
                          ? 'text-primary-foreground font-medium'
                          : 'text-muted-foreground'
                      "
                    >
                      {{ day.dayNum }}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p class="font-semibold">{{ day.dateStr }}</p>
                  <p class="text-xs text-muted-foreground">
                    {{ day.count }} 次会话
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <!-- 图例 -->
          <div
            class="mt-6 flex items-center justify-end space-x-2 text-xs text-muted-foreground"
          >
            <span>少</span>
            <div class="flex space-x-1">
              <div class="w-3 h-3 rounded-sm bg-secondary"></div>
              <div class="w-3 h-3 rounded-sm bg-emerald-200"></div>
              <div class="w-3 h-3 rounded-sm bg-emerald-400"></div>
              <div class="w-3 h-3 rounded-sm bg-emerald-600"></div>
              <div class="w-3 h-3 rounded-sm bg-emerald-800"></div>
            </div>
            <span>多</span>
          </div>
        </CardContent>
      </Card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";

// Shadcn UI Components
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Users,
  Bot,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-vue-next";

// --- 类型定义 ---
interface Statistic {
  userMessageCount: number;
  modelMessageCount: number;
  timeIntervals: {
    [dateKey: string]: { start: string; end: string }[];
  };
}

interface CalendarCell {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  count: number;
}

// --- Props & Data Fetching ---
const props = defineProps<{ path: string }>();

// 使用 useFileContent 获取数据，但不解构 sync 方法，实现“纯渲染”
const remoteContent = useFileContent<Statistic>(props.path);

// 安全访问数据的计算属性
const statisticData = computed<Statistic>(() => {
  return (
    remoteContent.value || {
      userMessageCount: 0,
      modelMessageCount: 0,
      timeIntervals: {},
    }
  );
});

// --- 概览统计逻辑 ---

const totalMessageCount = computed(() => {
  return (
    statisticData.value.userMessageCount + statisticData.value.modelMessageCount
  );
});

// --- 日历/热力图逻辑 ---

const currentDate = ref(new Date());
const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

const currentYear = computed(() => currentDate.value.getFullYear());
const currentMonth = computed(() => currentDate.value.getMonth());

// 切换月份
const changeMonth = (delta: number) => {
  const newDate = new Date(currentDate.value);
  newDate.setMonth(newDate.getMonth() + delta);
  currentDate.value = newDate;
};

// 回到今天
const resetToToday = () => {
  currentDate.value = new Date();
};

/**
 * 生成当前视图的日历网格数据
 */
const calendarGrid = computed<CalendarCell[]>(() => {
  const year = currentYear.value;
  const month = currentMonth.value;

  // 当月第一天
  const firstDayOfMonth = new Date(year, month, 1);
  // 当月最后一天
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // 网格开始日期：第一天所在周的周日
  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  // 网格结束日期：最后一天所在周的周六 (为了保持网格完整，通常显示42天即6周，或者动态计算)
  // 这里我们动态计算直到填满最后一周
  const endDate = new Date(lastDayOfMonth);
  const neededToEnd = 6 - endDate.getDay();
  endDate.setDate(endDate.getDate() + neededToEnd);

  const grid: CalendarCell[] = [];
  const iterator = new Date(startDate);
  const todayStr = new Date().toISOString().slice(0, 10);

  // 循环生成日期，直到超过结束日期
  while (iterator <= endDate) {
    const dateStr = iterator.toISOString().slice(0, 10);
    const count = statisticData.value.timeIntervals[dateStr]?.length || 0;

    grid.push({
      date: new Date(iterator),
      dateStr,
      dayNum: iterator.getDate(),
      isCurrentMonth: iterator.getMonth() === month,
      isToday: dateStr === todayStr,
      count,
    });

    iterator.setDate(iterator.getDate() + 1);
  }

  return grid;
});

/**
 * 根据活跃度返回 Tailwind 类名
 * 使用 emerald 色系，因为它在浅色和深色模式下表现都较好且符合“贡献度”直觉
 */
const getCellColorClass = (count: number): string => {
  if (count === 0)
    return "bg-secondary text-secondary-foreground hover:bg-secondary/80"; // 无数据：灰色/默认背景
  if (count <= 2)
    return "bg-emerald-200 dark:bg-emerald-900 border-emerald-200";
  if (count <= 5)
    return "bg-emerald-400 dark:bg-emerald-700 border-emerald-400";
  if (count <= 10)
    return "bg-emerald-600 dark:bg-emerald-600 border-emerald-600";
  return "bg-emerald-800 dark:bg-emerald-500 border-emerald-800"; // 很多数据
};
</script>
