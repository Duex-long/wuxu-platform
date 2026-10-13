<script setup lang="ts">
import type { AuthUser, ImageAssetSummary, InventoryStatistics, ItemStatus, ItemSummary, LocationSummary, PaginatedResponse } from "@wuxu/shared-types";
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import { apiBlob, apiRequest } from "../api";
import { useAuthStore } from "../stores/auth";

interface AdminItemSummary extends ItemSummary { owner: AuthUser | null }

const emptyStats = (): InventoryStatistics => ({
  totalRecords: 0,
  totalQuantity: 0,
  statusCounts: { IN_USE: 0, UNUSED: 0, DAMAGED: 0, CONSUMED: 0 },
  categoryCounts: [],
  expiringSoon: 0,
  expired: 0,
  userCount: 0,
});

const auth = useAuthStore();
const router = useRouter();
const result = ref<PaginatedResponse<AdminItemSummary>>({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 1 });
const statistics = ref<InventoryStatistics>(emptyStats());
const keyword = ref("");
const ownerId = ref("");
const locationId = ref("");
const status = ref<ItemStatus | "">("");
const loading = ref(false);
const error = ref("");
const thumbnailUrls = ref<Record<string, string>>({});
const locations = ref<LocationSummary[]>([]);
const locationPhotoUrls = ref<Record<string, string>>({});
const locationSaving = ref(false);
const locationFile = ref<File | null>(null);
const locationPreviewUrl = ref<string | null>(null);
const locationDraft = reactive({ name: "", description: "" });

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
    const [items, overview, storageLocations] = await Promise.all([
      apiRequest<PaginatedResponse<AdminItemSummary>>(`/admin/items?${params}`),
      apiRequest<InventoryStatistics>("/admin/statistics/overview"),
      apiRequest<LocationSummary[]>("/admin/locations"),
    ]);
    result.value = items;
    statistics.value = overview;
    locations.value = storageLocations;
    await Promise.all([loadThumbnails(items.items), loadLocationPhotos(storageLocations)]);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法加载数据";
  } finally {
    loading.value = false;
  }
}

async function loadThumbnails(items: AdminItemSummary[]): Promise<void> {
  releaseThumbnailUrls();
  const targets = items.filter((item) => item.imageIds.length > 0);
  await runWithConcurrency(targets, 3, async (item) => {
    try {
      const blob = await apiBlob(`/media/images/${item.imageIds[0]}/content`);
      thumbnailUrls.value = { ...thumbnailUrls.value, [item.id]: URL.createObjectURL(blob) };
    } catch {
      // A missing preview must not block the read-only inventory table.
    }
  });
}

async function loadLocationPhotos(entries: LocationSummary[]): Promise<void> {
  releaseLocationPhotoUrls();
  await runWithConcurrency(entries, 3, async (location) => {
    try {
      const blob = await apiBlob(`/media/images/${location.photoImageId}/content`);
      locationPhotoUrls.value = { ...locationPhotoUrls.value, [location.id]: URL.createObjectURL(blob) };
    } catch {
      // Keep the fallback when the underlying image is temporarily unavailable.
    }
  });
}

function statusPercent(value: number): number {
  return statistics.value.totalRecords === 0 ? 0 : Math.round((value / statistics.value.totalRecords) * 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function releaseThumbnailUrls(): void {
  for (const url of Object.values(thumbnailUrls.value)) URL.revokeObjectURL(url);
  thumbnailUrls.value = {};
}

function releaseLocationPhotoUrls(): void {
  for (const url of Object.values(locationPhotoUrls.value)) URL.revokeObjectURL(url);
  locationPhotoUrls.value = {};
}

function selectLocationPhoto(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = "";
  if (file === null) return;
  if (!file.type.startsWith("image/") || file.size === 0 || file.size > 10 * 1024 * 1024) {
    error.value = "位置照片必须是 10MB 以内的有效图片";
    return;
  }
  if (locationPreviewUrl.value !== null) URL.revokeObjectURL(locationPreviewUrl.value);
  locationFile.value = file;
  locationPreviewUrl.value = URL.createObjectURL(file);
}

async function createLocation(): Promise<void> {
  if (locationDraft.name.trim() === "" || locationFile.value === null) {
    error.value = "位置名称和照片均为必填项";
    return;
  }
  locationSaving.value = true;
  error.value = "";
  let uploadedId: string | null = null;
  try {
    const body = new FormData();
    body.append("file", locationFile.value);
    const uploaded = await apiRequest<ImageAssetSummary>("/media/images", { method: "POST", body });
    uploadedId = uploaded.id;
    await apiRequest<LocationSummary>("/admin/locations", {
      method: "POST",
      body: JSON.stringify({
        name: locationDraft.name.trim(),
        description: locationDraft.description.trim() === "" ? undefined : locationDraft.description.trim(),
        photoImageId: uploaded.id,
      }),
    });
    clearLocationDraft();
    await loadDashboard();
  } catch (cause) {
    if (uploadedId !== null) {
      await apiRequest(`/media/images/${uploadedId}`, { method: "DELETE" }).catch(() => undefined);
    }
    error.value = cause instanceof Error ? cause.message : "创建存放位置失败";
  } finally {
    locationSaving.value = false;
  }
}

async function removeLocation(location: LocationSummary): Promise<void> {
  if (!window.confirm(`确认删除存放位置“${location.name}”吗？位置内有物品时服务端会拒绝删除。`)) return;
  try {
    await apiRequest(`/admin/locations/${location.id}`, { method: "DELETE" });
    if (locationId.value === location.id) locationId.value = "";
    await loadDashboard();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除存放位置失败";
  }
}

async function showLocationItems(id: string): Promise<void> {
  locationId.value = id;
  await loadDashboard();
  document.getElementById("items")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearLocationDraft(): void {
  locationDraft.name = "";
  locationDraft.description = "";
  locationFile.value = null;
  if (locationPreviewUrl.value !== null) URL.revokeObjectURL(locationPreviewUrl.value);
  locationPreviewUrl.value = null;
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

async function signOut(): Promise<void> {
  auth.signOut();
  await router.push({ name: "login" });
}

onMounted(loadDashboard);
onBeforeUnmount(() => {
  releaseThumbnailUrls();
  releaseLocationPhotoUrls();
  clearLocationDraft();
});
</script>

<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand"><span>序</span><div><strong>物序</strong><small>ADMIN CONSOLE</small></div></div>
      <nav><a class="active" href="#overview"><span>◫</span>数据概览</a><a href="#locations"><span>⌂</span>位置管理</a><a href="#items"><span>≡</span>物品查询</a></nav>
      <div class="sidebar-foot"><small>当前管理员</small><strong>{{ auth.user?.displayName }}</strong><button type="button" @click="signOut">退出登录</button></div>
    </aside>
    <main class="workspace">
      <header><div><p class="eyebrow">OVERVIEW</p><h1>物品数据概览</h1></div><div class="readonly-badge">物品只读</div></header>

      <section id="overview" class="metrics metrics-wide">
        <article><span>记录总数</span><strong>{{ statistics.totalRecords }}</strong><small>全部有效物品</small></article>
        <article><span>涉及用户</span><strong>{{ statistics.userCount ?? 0 }}</strong><small>有物品记录的用户</small></article>
        <article><span>30 天内到期</span><strong>{{ statistics.expiringSoon }}</strong><small>未消耗物品</small></article>
        <article><span>已经过期</span><strong>{{ statistics.expired }}</strong><small>需要尽快处理</small></article>
      </section>

      <section class="insight-grid">
        <article class="data-card status-overview"><div class="card-heading"><p class="eyebrow">STATUS</p><h2>状态分布</h2></div><div class="bar-list"><div v-for="entry in statusEntries" :key="entry.key"><span>{{ entry.label }}<strong>{{ statistics.statusCounts[entry.key] }}</strong></span><div><i :style="{ width: `${statusPercent(statistics.statusCounts[entry.key])}%` }"></i></div></div></div></article>
        <article class="data-card"><div class="card-heading"><p class="eyebrow">CATEGORY</p><h2>类目排行</h2></div><div v-if="statistics.categoryCounts.length" class="category-ranking"><div v-for="category in statistics.categoryCounts" :key="category.categoryId"><span>{{ category.categoryName }}</span><strong>{{ category.count }}</strong></div></div><p v-else class="empty-insight">暂无类目数据</p></article>
      </section>

      <section id="locations" class="data-card location-management">
        <div class="card-heading"><div><p class="eyebrow">STORAGE LOCATIONS</p><h2>存放位置管理</h2></div><span>用户端只能选择这里创建的位置</span></div>
        <div class="location-admin-layout">
          <form class="location-form" @submit.prevent="createLocation">
            <label>位置名称<input v-model="locationDraft.name" maxlength="80" required placeholder="例如：书房左侧柜" /></label>
            <label>位置说明<textarea v-model="locationDraft.description" maxlength="300" rows="3" placeholder="例如：靠窗的白色五层柜"></textarea></label>
            <label class="location-photo-picker">位置照片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" @change="selectLocationPhoto" /><span v-if="locationPreviewUrl"><img :src="locationPreviewUrl" alt="待上传的位置照片" /></span><small v-else>必须上传一张照片，最大 10MB</small></label>
            <button type="submit" :disabled="locationSaving">{{ locationSaving ? '创建中…' : '创建位置' }}</button>
          </form>
          <div v-if="locations.length" class="admin-location-grid">
            <article v-for="location in locations" :key="location.id">
              <img v-if="locationPhotoUrls[location.id]" :src="locationPhotoUrls[location.id]" :alt="location.name" />
              <div v-else class="admin-location-fallback">序</div>
              <div><strong>{{ location.name }}</strong><p>{{ location.description ?? '暂无说明' }}</p><small>{{ location.itemCount }} 件物品</small><span><button type="button" @click="showLocationItems(location.id)">查看物品</button><button class="remove-location" type="button" @click="removeLocation(location)">删除</button></span></div>
            </article>
          </div>
          <div v-else class="empty-insight">尚未创建存放位置</div>
        </div>
      </section>

      <section id="items" class="data-card">
        <div class="card-heading"><div><p class="eyebrow">INVENTORY QUERY</p><h2>物品查询</h2></div></div>
        <form class="filters filters-wide" @submit.prevent="loadDashboard">
          <label>物品名称<input v-model="keyword" type="search" placeholder="输入关键词" /></label>
          <label>用户 ID<input v-model="ownerId" placeholder="精确筛选" /></label>
          <label>存放位置<select v-model="locationId"><option value="">全部位置</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option></select></label>
          <label>状态<select v-model="status"><option value="">全部</option><option value="IN_USE">使用中</option><option value="UNUSED">未使用</option><option value="DAMAGED">已损坏</option><option value="CONSUMED">已消耗</option></select></label>
          <button type="submit">应用筛选</button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>物品</th><th>用户</th><th>类目</th><th>数量</th><th>位置</th><th>保质期</th><th>状态</th><th>登记时间</th></tr></thead>
            <tbody>
              <tr v-if="loading"><td colspan="8" class="empty">正在读取数据…</td></tr>
              <tr v-else-if="result.items.length === 0"><td colspan="8" class="empty">暂无匹配物品</td></tr>
              <tr v-for="item in result.items" v-else :key="item.id">
                <td><div class="item-cell"><img v-if="thumbnailUrls[item.id]" :src="thumbnailUrls[item.id]" :alt="item.name" /><span v-else>{{ item.name.slice(0, 1) }}</span><div><strong>{{ item.name }}</strong><small>{{ item.id }}</small></div></div></td>
                <td>{{ item.owner?.displayName ?? "已删除用户" }}<small>{{ item.owner?.email ?? item.ownerId }}</small></td>
                <td>{{ item.bigCategoryName }}<small>{{ item.smallCategoryName ?? "—" }}</small></td>
                <td>{{ item.quantity }} {{ item.unit }}</td>
                <td>{{ item.location ?? "—" }}</td>
                <td>{{ item.expiresOn ?? "—" }}</td>
                <td><span :class="['status', `status-${item.status.toLowerCase()}`]">{{ statusLabels[item.status] }}</span></td>
                <td>{{ formatDate(item.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>
