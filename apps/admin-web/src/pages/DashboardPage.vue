<script setup lang="ts">
import type { AuthUser, InventoryStatistics, ItemStatus, ItemSummary, LocationSummary, PaginatedResponse } from "@wuxu/shared-types";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import { apiBlob, apiRequest } from "../api";
import AdminShell from "../components/AdminShell.vue";

interface AdminItemSummary extends ItemSummary { owner: AuthUser | null }

const emptyStats = (): InventoryStatistics => ({
  totalRecords: 0,
  totalQuantity: 0,
  statusCounts: { IN_USE: 0, UNUSED: 0, DAMAGED: 0, CONSUMED: 0 },
  categoryCounts: [],
  expiringSoon: 0,
  expired: 0,
  consumablesDueForCheck: 0,
  userCount: 0,
});

const route = useRoute();
const result = ref<PaginatedResponse<AdminItemSummary>>({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 1 });
const statistics = ref<InventoryStatistics>(emptyStats());
const keyword = ref("");
const ownerId = ref("");
const locationId = ref(typeof route.query.locationId === "string" ? route.query.locationId : "");
const status = ref<ItemStatus | "">("");
const consumable = ref<"" | "true" | "false" | "due">("");
const loading = ref(false);
const error = ref("");
const thumbnailUrls = ref<Record<string, string>>({});
const locations = ref<LocationSummary[]>([]);

const statusLabels: Record<ItemStatus, string> = {
  IN_USE: "使用中",
  UNUSED: "未使用",
  DAMAGED: "已损坏",
  CONSUMED: "已消耗",
};
const statusEntries: Array<{ key: ItemStatus; label: string }> = Object.entries(statusLabels).map(([key, label]) => ({
  key: key as ItemStatus,
  label,
}));

async function loadDashboard(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({ page: "1", pageSize: "50" });
    if (keyword.value.trim() !== "") params.set("keyword", keyword.value.trim());
    if (ownerId.value.trim() !== "") params.set("ownerId", ownerId.value.trim());
    if (locationId.value !== "") params.set("locationId", locationId.value);
    if (status.value !== "") params.set("status", status.value);
    if (consumable.value === "true" || consumable.value === "false") params.set("consumable", consumable.value);
    if (consumable.value === "due") params.set("dueForCheck", "true");
    const [items, overview, storageLocations] = await Promise.all([
      apiRequest<PaginatedResponse<AdminItemSummary>>(`/admin/items?${params}`),
      apiRequest<InventoryStatistics>("/admin/statistics/overview"),
      apiRequest<LocationSummary[]>("/admin/locations"),
    ]);
    result.value = items;
    statistics.value = overview;
    locations.value = storageLocations;
    await loadThumbnails(items.items);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法加载数据";
  } finally {
    loading.value = false;
  }
}

async function loadThumbnails(items: AdminItemSummary[]): Promise<void> {
  releaseThumbnailUrls();
  await runWithConcurrency(items.filter((item) => item.imageIds.length > 0), 3, async (item) => {
    try {
      const blob = await apiBlob(`/media/images/${item.imageIds[0]}/content`);
      thumbnailUrls.value = { ...thumbnailUrls.value, [item.id]: URL.createObjectURL(blob) };
    } catch {
      // A missing preview must not block the read-only inventory table.
    }
  });
}

function statusPercent(value: number): number {
  return statistics.value.totalRecords === 0 ? 0 : Math.round((value / statistics.value.totalRecords) * 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDailyConsumption(value: number): string {
  if (value > 0 && value < 0.001) return "<0.001";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 }).format(value);
}

function releaseThumbnailUrls(): void {
  for (const url of Object.values(thumbnailUrls.value)) URL.revokeObjectURL(url);
  thumbnailUrls.value = {};
}

async function runWithConcurrency<T>(values: T[], limit: number, worker: (value: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const value = values[nextIndex];
      nextIndex += 1;
      if (value !== undefined) await worker(value);
    }
  });
  await Promise.all(runners);
}

onMounted(loadDashboard);
onBeforeUnmount(releaseThumbnailUrls);
</script>

<template>
  <AdminShell>
    <header><div><p class="eyebrow">OVERVIEW</p><h1>物品数据中心</h1><p class="page-description">查看全局统计并查询用户物品；类目和位置已拆分为独立管理页面。</p></div><div class="readonly-badge">物品只读</div></header>

    <section class="metrics metrics-wide">
      <article><span>记录总数</span><strong>{{ statistics.totalRecords }}</strong><small>全部有效物品</small></article>
      <article><span>涉及用户</span><strong>{{ statistics.userCount ?? 0 }}</strong><small>有物品记录的用户</small></article>
      <article><span>30 天内到期</span><strong>{{ statistics.expiringSoon }}</strong><small>未消耗物品</small></article>
      <article><span>已经过期</span><strong>{{ statistics.expired }}</strong><small>需要尽快处理</small></article>
    </section>

    <section class="insight-grid">
      <article class="data-card status-overview"><div class="card-heading"><p class="eyebrow">STATUS</p><h2>状态分布</h2></div><div class="bar-list"><div v-for="entry in statusEntries" :key="entry.key"><span>{{ entry.label }}<strong>{{ statistics.statusCounts[entry.key] }}</strong></span><div><i :style="{ width: `${statusPercent(statistics.statusCounts[entry.key])}%` }"></i></div></div></div></article>
      <article class="data-card"><div class="card-heading"><p class="eyebrow">CATEGORY</p><h2>类目排行</h2></div><div v-if="statistics.categoryCounts.length" class="category-ranking"><div v-for="category in statistics.categoryCounts" :key="category.categoryId"><span>{{ category.categoryName }}</span><strong>{{ category.count }}</strong></div></div><p v-else class="empty-insight">暂无类目数据</p></article>
    </section>

    <div v-if="statistics.consumablesDueForCheck > 0" class="admin-consumption-alert"><strong>{{ statistics.consumablesDueForCheck }} 件消耗品达到预计使用天数</strong><span>请通知相关用户检查实际剩余量；系统不会自动修改物品状态。</span></div>

    <section id="items" class="data-card">
      <div class="card-heading"><div><p class="eyebrow">INVENTORY QUERY</p><h2>物品查询</h2></div></div>
      <form class="filters filters-wide" @submit.prevent="loadDashboard">
        <label>物品名称<input v-model="keyword" type="search" placeholder="输入关键词" /></label>
        <label>用户 ID<input v-model="ownerId" placeholder="精确筛选" /></label>
        <label>存放位置<select v-model="locationId"><option value="">全部位置</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option></select></label>
        <label>状态<select v-model="status"><option value="">全部</option><option value="IN_USE">使用中</option><option value="UNUSED">未使用</option><option value="DAMAGED">已损坏</option><option value="CONSUMED">已消耗</option></select></label>
        <label>物品类型<select v-model="consumable"><option value="">全部类型</option><option value="true">消耗品</option><option value="false">非消耗品</option><option value="due">待检查消耗品</option></select></label>
        <button type="submit">应用筛选</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>物品</th><th>用户</th><th>类目</th><th>数量</th><th>位置</th><th>保质期</th><th>类型 / 使用进度</th><th>状态</th><th>登记时间</th></tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="9" class="empty">正在读取数据…</td></tr>
            <tr v-else-if="result.items.length === 0"><td colspan="9" class="empty">暂无匹配物品</td></tr>
            <tr v-for="item in result.items" v-else :key="item.id">
              <td><div class="item-cell"><img v-if="thumbnailUrls[item.id]" :src="thumbnailUrls[item.id]" :alt="item.name" /><span v-else>{{ item.name.slice(0, 1) }}</span><div><strong>{{ item.name }}</strong><small>{{ item.id }}</small></div></div></td>
              <td>{{ item.owner?.displayName ?? "已删除用户" }}<small>{{ item.owner?.email ?? item.ownerId }}</small></td>
              <td>{{ item.bigCategoryName }}<small>{{ item.smallCategoryName ?? "—" }}</small></td>
              <td>{{ item.quantity }} {{ item.unit }}</td>
              <td>{{ item.location ?? "—" }}</td>
              <td>{{ item.expiresOn ?? "—" }}</td>
              <td><div v-if="item.consumptionProgress" :class="['admin-progress', { 'is-due': item.consumptionProgress.dueForCheck }]"><strong>{{ item.consumptionProgress.elapsedDays }} / {{ item.consumptionProgress.expectedDays }} 天</strong><small>日均 {{ formatDailyConsumption(item.consumptionProgress.estimatedDailyConsumption) }} {{ item.unit }}/天</small><em>{{ item.consumptionProgress.dueForCheck ? '请检查' : `${item.consumptionProgress.percent}%` }}</em></div><span v-else>{{ item.isConsumable ? "消耗品 · 尚未开始" : "非消耗品" }}</span></td>
              <td><span :class="['status', `status-${item.status.toLowerCase()}`]">{{ statusLabels[item.status] }}</span></td>
              <td>{{ formatDate(item.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </AdminShell>
</template>
