<script setup lang="ts">
import type { InventoryStatistics, LocationSummary } from "@wuxu/shared-types";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { apiBlob, apiRequest } from "../api";
import UserShell from "../components/UserShell.vue";
import { runWithConcurrency } from "../inventory";

const emptyStats = (): InventoryStatistics => ({
  totalRecords: 0,
  totalQuantity: 0,
  statusCounts: { IN_USE: 0, UNUSED: 0, DAMAGED: 0, CONSUMED: 0 },
  categoryCounts: [],
  expiringSoon: 0,
  expired: 0,
});

const router = useRouter();
const statistics = ref<InventoryStatistics>(emptyStats());
const locations = ref<LocationSummary[]>([]);
const locationPhotoUrls = ref<Record<string, string>>({});
const loading = ref(true);
const error = ref("");

async function loadHome(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const [overview, storageLocations] = await Promise.all([
      apiRequest<InventoryStatistics>("/statistics/overview"),
      apiRequest<LocationSummary[]>("/locations"),
    ]);
    statistics.value = overview;
    locations.value = storageLocations;
    await loadLocationPhotos(storageLocations);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "首页加载失败";
  } finally {
    loading.value = false;
  }
}

async function loadLocationPhotos(entries: LocationSummary[]): Promise<void> {
  releaseLocationPhotoUrls();
  await runWithConcurrency(entries, 3, async (location) => {
    try {
      const blob = await apiBlob(`/media/images/${location.photoImageId}/content`);
      locationPhotoUrls.value = { ...locationPhotoUrls.value, [location.id]: URL.createObjectURL(blob) };
    } catch {
      // The location remains usable when its preview cannot be loaded.
    }
  });
}

function releaseLocationPhotoUrls(): void {
  for (const url of Object.values(locationPhotoUrls.value)) URL.revokeObjectURL(url);
  locationPhotoUrls.value = {};
}

async function openLocation(locationId: string): Promise<void> {
  await router.push({ name: "item-search", query: { locationId } });
}

onMounted(loadHome);
onBeforeUnmount(releaseLocationPhotoUrls);
</script>

<template>
  <UserShell>
    <section class="home-hero">
      <div><p class="eyebrow">我的物品</p><h1>从一个清楚的入口<br />管理拥有的一切</h1><p>新增和查找各自独立，手机上也能快速完成。</p></div>
      <div class="hero-metrics">
        <article><strong>{{ statistics.totalRecords }}</strong><span>物品记录</span></article>
        <article><strong>{{ statistics.statusCounts.IN_USE }}</strong><span>使用中</span></article>
        <article><strong>{{ statistics.expiringSoon }}</strong><span>30 天内到期</span></article>
        <article><strong>{{ statistics.expired }}</strong><span>已经过期</span></article>
      </div>
    </section>

    <p v-if="error" class="error-message">{{ error }}</p>

    <section class="entry-grid" aria-label="物品操作入口">
      <RouterLink class="entry-card entry-search" :to="{ name: 'item-search' }">
        <span>⌕</span><div><p class="eyebrow">FIND</p><h2>查找物品</h2><p>按名称、类目、位置或状态筛选，并更新物品状态。</p></div><strong>进入查找 →</strong>
      </RouterLink>
      <RouterLink class="entry-card entry-create" :to="{ name: 'item-create' }">
        <span>＋</span><div><p class="eyebrow">ADD</p><h2>新增物品</h2><p>登记数量、存放位置、保质期和图片。</p></div><strong>开始登记 →</strong>
      </RouterLink>
    </section>

    <section class="card location-panel">
      <div class="section-heading"><div><p class="eyebrow">存放地图</p><h2>按位置查看</h2></div><span>位置由管理员统一创建</span></div>
      <div v-if="loading" class="empty-state">正在读取位置…</div>
      <div v-else-if="locations.length" class="location-grid">
        <button v-for="location in locations" :key="location.id" type="button" class="location-card" @click="openLocation(location.id)">
          <img v-if="locationPhotoUrls[location.id]" :src="locationPhotoUrls[location.id]" :alt="location.name" />
          <span v-else class="location-photo-fallback">序</span>
          <span><strong>{{ location.name }}</strong><small>{{ location.description ?? '暂无说明' }}</small><em>{{ location.itemCount }} 件物品</em></span>
        </button>
      </div>
      <div v-else class="empty-state">管理员尚未创建存放位置</div>
    </section>
  </UserShell>
</template>
