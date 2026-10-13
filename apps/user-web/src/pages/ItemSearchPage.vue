<script setup lang="ts">
import {
  ITEM_STATUSES,
  type CategoryNode,
  type ItemStatus,
  type ItemSummary,
  type LocationSummary,
  type PaginatedResponse,
} from "@wuxu/shared-types";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import { apiBlob, apiRequest } from "../api";
import UserShell from "../components/UserShell.vue";
import { runWithConcurrency, statusLabels } from "../inventory";

const route = useRoute();
const loading = ref(false);
const error = ref("");
const keyword = ref(typeof route.query.keyword === "string" ? route.query.keyword : "");
const statusFilter = ref<ItemStatus | "">(typeof route.query.status === "string" ? route.query.status as ItemStatus : "");
const categoryFilter = ref(typeof route.query.bigCategoryId === "string" ? route.query.bigCategoryId : "");
const locationFilter = ref(typeof route.query.locationId === "string" ? route.query.locationId : "");
const result = ref<PaginatedResponse<ItemSummary>>({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
const categories = ref<CategoryNode[]>([]);
const locations = ref<LocationSummary[]>([]);
const thumbnailUrls = ref<Record<string, string>>({});

async function loadReferenceData(): Promise<void> {
  [categories.value, locations.value] = await Promise.all([
    apiRequest<CategoryNode[]>("/categories/tree"),
    apiRequest<LocationSummary[]>("/locations"),
  ]);
}

async function loadItems(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({ page: "1", pageSize: "20" });
    if (keyword.value.trim() !== "") params.set("keyword", keyword.value.trim());
    if (statusFilter.value !== "") params.set("status", statusFilter.value);
    if (categoryFilter.value !== "") params.set("bigCategoryId", categoryFilter.value);
    if (locationFilter.value !== "") params.set("locationId", locationFilter.value);
    result.value = await apiRequest<PaginatedResponse<ItemSummary>>(`/items?${params}`);
    await loadThumbnails(result.value.items);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法加载物品";
  } finally {
    loading.value = false;
  }
}

async function loadThumbnails(items: ItemSummary[]): Promise<void> {
  releaseThumbnailUrls();
  await runWithConcurrency(items.filter((item) => item.imageIds.length > 0), 3, async (item) => {
    try {
      const blob = await apiBlob(`/media/images/${item.imageIds[0]}/content`);
      thumbnailUrls.value = { ...thumbnailUrls.value, [item.id]: URL.createObjectURL(blob) };
    } catch {
      // Keep the textual avatar when a preview is unavailable.
    }
  });
}

function releaseThumbnailUrls(): void {
  for (const url of Object.values(thumbnailUrls.value)) URL.revokeObjectURL(url);
  thumbnailUrls.value = {};
}

async function updateStatus(item: ItemSummary, status: ItemStatus): Promise<void> {
  if (item.status === status) return;
  error.value = "";
  try {
    await apiRequest(`/items/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadItems();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "状态更新失败";
  }
}

async function removeItem(item: ItemSummary): Promise<void> {
  if (!window.confirm(`确认删除“${item.name}”吗？`)) return;
  try {
    await apiRequest(`/items/${item.id}`, { method: "DELETE" });
    await loadItems();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除失败";
  }
}

function clearFilters(): void {
  keyword.value = "";
  statusFilter.value = "";
  categoryFilter.value = "";
  locationFilter.value = "";
  void loadItems();
}

onMounted(async () => {
  try {
    await loadReferenceData();
    await loadItems();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "初始化失败";
  }
});
onBeforeUnmount(releaseThumbnailUrls);
</script>

<template>
  <UserShell>
    <header class="page-heading"><div><p class="eyebrow">INVENTORY SEARCH</p><h1>查找物品</h1><p>快速确认物品在哪里、处于什么状态。</p></div><RouterLink class="primary-button" :to="{ name: 'item-create' }">＋ 新增物品</RouterLink></header>

    <section class="card search-card">
      <form class="search-filters" @submit.prevent="loadItems">
        <label class="search-keyword">物品名称<input v-model="keyword" type="search" placeholder="例如：收纳箱" /></label>
        <label>大类目<select v-model="categoryFilter"><option value="">全部类目</option><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
        <label>存放位置<select v-model="locationFilter"><option value="">全部位置</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option></select></label>
        <label>状态<select v-model="statusFilter"><option value="">全部状态</option><option v-for="itemStatus in ITEM_STATUSES" :key="itemStatus" :value="itemStatus">{{ statusLabels[itemStatus] }}</option></select></label>
        <div class="filter-actions"><button class="primary-button" type="submit">查找</button><button class="text-action" type="button" @click="clearFilters">清空</button></div>
      </form>
    </section>

    <section class="card results-card">
      <div class="section-heading"><div><p class="eyebrow">RESULTS</p><h2>物品清单</h2></div><span>共 {{ result.total }} 条</span></div>
      <p v-if="route.query.created" class="success-message">物品已保存，可在下方查看。</p>
      <p v-if="error" class="error-message">{{ error }}</p>
      <div v-if="loading" class="empty-state">正在查找物品…</div>
      <div v-else-if="result.items.length === 0" class="empty-state"><strong>没有找到物品</strong><span>可以更换筛选条件，或先新增一件物品。</span></div>
      <div v-else class="item-list">
        <article v-for="item in result.items" :key="item.id" class="item-row">
          <img v-if="thumbnailUrls[item.id]" class="item-thumbnail" :src="thumbnailUrls[item.id]" :alt="item.name" />
          <div v-else class="item-avatar">{{ item.name.slice(0, 1) }}</div>
          <div class="item-main"><div class="item-title"><h3>{{ item.name }}</h3><span :class="['status-pill', `status-${item.status.toLowerCase()}`]">{{ statusLabels[item.status] }}</span></div><p>{{ item.bigCategoryName }}<template v-if="item.smallCategoryName"> / {{ item.smallCategoryName }}</template> · {{ item.quantity }} {{ item.unit }}<template v-if="item.location"> · {{ item.location }}</template></p><small v-if="item.expiresOn" class="expiry">到期：{{ item.expiresOn }}</small></div>
          <div class="item-actions"><select :value="item.status" aria-label="修改物品状态" @change="updateStatus(item, ($event.target as HTMLSelectElement).value as ItemStatus)"><option v-for="itemStatus in ITEM_STATUSES" :key="itemStatus" :value="itemStatus">{{ statusLabels[itemStatus] }}</option></select><button class="danger-link" type="button" @click="removeItem(item)">删除</button></div>
        </article>
      </div>
    </section>
  </UserShell>
</template>
