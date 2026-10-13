<script setup lang="ts">
import type { LocationSummary } from "@wuxu/shared-types";
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { apiBlob, apiRequest } from "../api";
import UserShell from "../components/UserShell.vue";
import { runWithConcurrency } from "../inventory";

const route = useRoute();
const router = useRouter();
const filters = reactive({ keyword: typeof route.query.keyword === "string" ? route.query.keyword : "" });
const locations = ref<LocationSummary[]>([]);
const photoUrls = ref<Record<string, string>>({});
const loading = ref(true);
const error = ref("");
const notice = ref(route.query.created === "1" ? "个人位置已创建，可以用于物品登记。" : "");

async function searchLocations(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams();
    if (filters.keyword.trim() !== "") params.set("keyword", filters.keyword.trim());
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    const entries = await apiRequest<LocationSummary[]>(`/locations${suffix}`);
    locations.value = entries;
    await loadPhotos(entries);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法加载存放位置";
  } finally {
    loading.value = false;
  }
}

async function loadPhotos(entries: LocationSummary[]): Promise<void> {
  releasePhotoUrls();
  await runWithConcurrency(entries, 3, async (location) => {
    try {
      const blob = await apiBlob(`/media/images/${location.photoImageId}/content`);
      photoUrls.value = { ...photoUrls.value, [location.id]: URL.createObjectURL(blob) };
    } catch {
      // Search and navigation remain available when a preview fails to load.
    }
  });
}

async function openItems(locationId: string): Promise<void> {
  await router.push({ name: "item-search", query: { locationId } });
}

async function removeLocation(location: LocationSummary): Promise<void> {
  if (!window.confirm(`确认删除个人位置“${location.name}”吗？位置中仍有物品时不能删除。`)) return;
  error.value = "";
  notice.value = "";
  try {
    await apiRequest(`/locations/${location.id}`, { method: "DELETE" });
    notice.value = "个人位置已删除。";
    await searchLocations();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除存放位置失败";
  }
}

function resetSearch(): void {
  filters.keyword = "";
  void searchLocations();
}

function releasePhotoUrls(): void {
  for (const url of Object.values(photoUrls.value)) URL.revokeObjectURL(url);
  photoUrls.value = {};
}

onMounted(searchLocations);
onBeforeUnmount(releasePhotoUrls);
</script>

<template>
  <UserShell>
    <header class="page-heading">
      <div><p class="eyebrow">FIND LOCATIONS</p><h1>查找存放位置</h1><p>搜索全局位置和你创建的个人位置，并查看其中的物品。</p></div>
      <RouterLink class="primary-button" :to="{ name: 'location-create' }">＋ 新增位置</RouterLink>
    </header>

    <p v-if="error" class="error-message">{{ error }}</p>
    <p v-if="notice" class="success-message">{{ notice }}</p>
    <section class="card location-search-card">
      <form class="location-search-form" @submit.prevent="searchLocations">
        <label>名称或说明<input v-model="filters.keyword" maxlength="80" placeholder="例如：衣柜、书房、第二层" /></label>
        <button class="primary-button" type="submit">搜索位置</button>
        <button class="text-action" type="button" @click="resetSearch">重置</button>
      </form>
    </section>

    <section class="card location-results-card">
      <div class="section-heading"><div><p class="eyebrow">VISIBLE LOCATIONS</p><h2>可用位置</h2></div><span>{{ locations.length }} 个结果</span></div>
      <div v-if="loading" class="empty-state">正在查找位置…</div>
      <div v-else-if="locations.length" class="location-result-grid">
        <article v-for="location in locations" :key="location.id" class="location-result-card">
          <img v-if="photoUrls[location.id]" :src="photoUrls[location.id]" :alt="location.name" />
          <span v-else class="location-result-fallback">序</span>
          <div class="location-result-content">
            <div class="location-result-title"><strong>{{ location.name }}</strong><em :class="`scope-${location.scope.toLowerCase()}`">{{ location.scope === 'PERSONAL' ? '个人' : '全局' }}</em></div>
            <p>{{ location.description ?? '暂无说明' }}</p>
            <small>{{ location.itemCount }} 件我的物品</small>
            <div class="location-result-actions">
              <button type="button" @click="openItems(location.id)">查看物品</button>
              <button v-if="location.scope === 'PERSONAL'" class="danger-link" type="button" @click="removeLocation(location)">删除位置</button>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="empty-state"><strong>没有找到位置</strong><span>可以调整搜索词，或创建一个新的个人位置。</span></div>
    </section>
  </UserShell>
</template>
