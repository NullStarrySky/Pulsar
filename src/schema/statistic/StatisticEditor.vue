<!-- src/schema/statistic/StatisticEditor.vue -->
<template>
  <div class="space-y-6 p-4" v-if="localContent">
    <!-- 消息统计部分 -->
    <section>
      <h2 class="text-xl font-semibold mb-4">消息统计</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <!-- Card for User Messages -->
        <Card>
          <CardHeader
            class="flex flex-row items-center justify-between space-y-0 pb-2"
          >
            <CardTitle class="text-sm font-medium">用户消息</CardTitle>
            <Users class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ localContent.userMessageCount }}
            </div>
          </CardContent>
        </Card>

        <!-- Card for Model Messages -->
        <Card>
          <CardHeader
            class="flex flex-row items-center justify-between space-y-0 pb-2"
          >
            <CardTitle class="text-sm font-medium">模型消息</CardTitle>
            <Bot class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ localContent.modelMessageCount }}
            </div>
          </CardContent>
        </Card>

        <!-- Card for Total Messages -->
        <Card>
          <CardHeader
            class="flex flex-row items-center justify-between space-y-0 pb-2"
          >
            <CardTitle class="text-sm font-medium">总消息数</CardTitle>
            <MessageSquare class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ totalMessageCount }}</div>
          </CardContent>
        </Card>
      </div>
    </section>

    <!-- 新的会话活跃度热力图 -->
    <section>
      <h2 class="text-xl font-semibold mb-4">会话活跃度</h2>
      <Card>
        <CardContent class="p-6">
          <div v-if="activityData.length > 0" class="heatmap-container">
            <div
              v-for="day in activityData"
              :key="day.date"
              class="heatmap-day-cell"
              :style="{
                backgroundColor: getColorForCount(day.count),
              }"
            >
              <div class="tooltip">
                {{ day.count }} 次会话 on {{ day.date }}
              </div>
            </div>
          </div>
          <div v-else class="text-center text-muted-foreground py-10">
            暂无会话记录
          </div>
        </CardContent>
      </Card>
    </section>
  </div>
  <div v-else class="flex h-full w-full items-center justify-center">
    <p class="text-muted-foreground">正在加载统计数据...</p>
  </div>
</template>

<style scoped>
/* 热力图样式 */
.heatmap-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(1rem, 1fr));
  grid-template-rows: repeat(7, 1rem);
  grid-auto-flow: column;
  gap: 3px;
  max-width: 100%;
  overflow-x: auto;
  padding: 5px;
}

.heatmap-day-cell {
  width: 1rem;
  height: 1rem;
  border-radius: 2px;
  background-color: #ebedf0; /* 默认无数据颜色 */
  position: relative;
  transition: transform 0.1s ease-in-out;
}

.heatmap-day-cell:hover {
  transform: scale(1.2);
  z-index: 10;
}

/* Tooltip 样式 */
.heatmap-day-cell .tooltip {
  visibility: hidden;
  width: max-content;
  background-color: #333;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 5px 10px;
  position: absolute;
  z-index: 1;
  bottom: 125%; /* 定位在元素上方 */
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 0.2s;
  white-space: nowrap;
  font-size: 0.8rem;
}

.heatmap-day-cell:hover .tooltip {
  visibility: visible;
  opacity: 1;
}
</style>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";

// 导入UI组件
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Bot, MessageSquare } from "lucide-vue-next";

// --- 1. 类型定义 ---
interface Statistic {
  userMessageCount: number;
  modelMessageCount: number;
  // 结构与原始定义保持一致
  timeIntervals: {
    [dateKey: string]: { start: string; end: string }[];
  };
}

interface ActivityData {
  date: string;
  count: number;
}

// --- 2. Props & 状态管理 ---
const props = defineProps<{ path: string }>();
const { content: remoteContent, sync } = useFileContent<Statistic>(props.path);
const localContent = ref<Statistic | null>(null);

// --- 3. 计算属性 (Computed Properties) ---

const totalMessageCount = computed<number>(() => {
  if (!localContent.value) return 0;
  return (
    localContent.value.userMessageCount + localContent.value.modelMessageCount
  );
});

/**
 * 计算用于热力图的数据。
 * 返回过去一年的每日活动数据。
 */
const activityData = computed<ActivityData[]>(() => {
  if (!localContent.value) return [];
  const result: ActivityData[] = [];
  const intervals = localContent.value.timeIntervals || {};

  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  startDate.setDate(startDate.getDate() + 1); // 从一年前的明天开始，确保大约是52-53周

  // 确保第一天是周日，以对齐网格
  const dayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday...
  startDate.setDate(startDate.getDate() - dayOfWeek);

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateKey = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const intervalsOnDate = intervals[dateKey] || [];
    result.push({
      date: dateKey,
      count: intervalsOnDate.length,
    });
  }
  return result;
});

/**
 * 根据会话次数返回不同的颜色。
 * @param count - 当天的会话次数
 */
const getColorForCount = (count: number): string => {
  if (count === 0) return "#ebedf0"; // 无贡献
  if (count <= 2) return "#9be9a8"; // 少
  if (count <= 5) return "#40c463"; // 中
  if (count <= 10) return "#30a14e"; // 多
  return "#216e39"; // 非常多
};

// --- 4. 数据同步与生命周期 ---

watch(
  localContent,
  (newContent) => {
    if (newContent) {
      sync(newContent);
    }
  },
  { deep: true },
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
    }
  },
  { immediate: true, deep: true },
);

onUnmounted(() => {
  sync.cancel();
});
</script>
