<script setup lang="ts">
import type { ImageAssetSummary, LocationSummary } from "@wuxu/shared-types";
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import { apiBlob, apiRequest } from "../api";
import AdminShell from "../components/AdminShell.vue";

const router = useRouter();
const locations = ref<LocationSummary[]>([]);
const photoUrls = ref<Record<string, string>>({});
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const draft = reactive({ name: "", description: "" });

async function loadLocations(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const entries = await apiRequest<LocationSummary[]>("/admin/locations");
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
      // A location remains manageable when its preview is temporarily unavailable.
    }
  });
}

function selectPhoto(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = "";
  if (file === null) return;
  if (!file.type.startsWith("image/") || file.size === 0 || file.size > 10 * 1024 * 1024) {
    error.value = "位置照片必须是 10MB 以内的有效图片";
    return;
  }
  if (previewUrl.value !== null) URL.revokeObjectURL(previewUrl.value);
  selectedFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
}

async function createLocation(): Promise<void> {
  if (draft.name.trim() === "" || selectedFile.value === null) {
    error.value = "位置名称和照片均为必填项";
    return;
  }
  saving.value = true;
  error.value = "";
  let uploadedId: string | null = null;
  try {
    const body = new FormData();
    body.append("file", selectedFile.value);
    const uploaded = await apiRequest<ImageAssetSummary>("/media/images", { method: "POST", body });
    uploadedId = uploaded.id;
    await apiRequest<LocationSummary>("/admin/locations", {
      method: "POST",
      body: JSON.stringify({
        name: draft.name.trim(),
        description: draft.description.trim() === "" ? undefined : draft.description.trim(),
        photoImageId: uploaded.id,
      }),
    });
    uploadedId = null;
    clearDraft();
    await loadLocations();
  } catch (cause) {
    if (uploadedId !== null) await apiRequest(`/media/images/${uploadedId}`, { method: "DELETE" }).catch(() => undefined);
    error.value = cause instanceof Error ? cause.message : "创建存放位置失败";
  } finally {
    saving.value = false;
  }
}

async function removeLocation(location: LocationSummary): Promise<void> {
  if (!window.confirm(`确认删除存放位置“${location.name}”吗？位置内有物品时服务端会拒绝删除。`)) return;
  try {
    await apiRequest(`/admin/locations/${location.id}`, { method: "DELETE" });
    await loadLocations();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除存放位置失败";
  }
}

async function showLocationItems(id: string): Promise<void> {
  await router.push({ name: "dashboard", query: { locationId: id }, hash: "#items" });
}

function clearDraft(): void {
  draft.name = "";
  draft.description = "";
  selectedFile.value = null;
  if (previewUrl.value !== null) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = null;
}

function releasePhotoUrls(): void {
  for (const url of Object.values(photoUrls.value)) URL.revokeObjectURL(url);
  photoUrls.value = {};
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

onMounted(loadLocations);
onBeforeUnmount(() => { releasePhotoUrls(); clearDraft(); });
</script>

<template>
  <AdminShell>
    <header><div><p class="eyebrow">STORAGE LOCATIONS</p><h1>位置管理</h1><p class="page-description">创建带照片的标准存放位置，并查看各位置中的物品。</p></div><div class="management-summary">{{ locations.length }} 个存放位置</div></header>

    <p v-if="error" class="error">{{ error }}</p>
    <section class="data-card location-management standalone-management">
      <div class="card-heading"><div><p class="eyebrow">CONTROLLED LOCATIONS</p><h2>存放位置</h2></div><span>用户端只能选择这里创建的位置</span></div>
      <div class="location-admin-layout">
        <form class="location-form" @submit.prevent="createLocation">
          <label>位置名称<input v-model="draft.name" maxlength="80" required placeholder="例如：书房左侧柜" /></label>
          <label>位置说明<textarea v-model="draft.description" maxlength="300" rows="3" placeholder="例如：靠窗的白色五层柜"></textarea></label>
          <label class="location-photo-picker">位置照片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" @change="selectPhoto" /><span v-if="previewUrl"><img :src="previewUrl" alt="待上传的位置照片" /></span><small v-else>必须上传一张照片，最大 10MB</small></label>
          <button type="submit" :disabled="saving">{{ saving ? '创建中…' : '创建位置' }}</button>
        </form>
        <div v-if="loading" class="empty-insight">正在读取存放位置…</div>
        <div v-else-if="locations.length" class="admin-location-grid">
          <article v-for="location in locations" :key="location.id">
            <img v-if="photoUrls[location.id]" :src="photoUrls[location.id]" :alt="location.name" />
            <div v-else class="admin-location-fallback">序</div>
            <div><strong>{{ location.name }}</strong><p>{{ location.description ?? '暂无说明' }}</p><small>{{ location.itemCount }} 件物品</small><span><button type="button" @click="showLocationItems(location.id)">查看物品</button><button class="remove-location" type="button" @click="removeLocation(location)">删除</button></span></div>
          </article>
        </div>
        <div v-else class="empty-insight">尚未创建存放位置</div>
      </div>
    </section>
  </AdminShell>
</template>
