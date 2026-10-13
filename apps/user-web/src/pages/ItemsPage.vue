<script setup lang="ts">
import {
  ITEM_STATUSES,
  type CategoryNode,
  type ImageAssetSummary,
  type InventoryStatistics,
  type ItemStatus,
  type ItemSummary,
  type LocationSummary,
  type PaginatedResponse,
} from "@wuxu/shared-types";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import { apiBlob, apiRequest } from "../api";
import { useAuthStore } from "../stores/auth";

type UploadStatus = "pending" | "uploading" | "uploaded" | "error";

interface PendingImage {
  key: string;
  file: File;
  previewUrl: string | null;
  status: UploadStatus;
  imageId?: string;
  error?: string;
}

const emptyStats = (): InventoryStatistics => ({
  totalRecords: 0,
  totalQuantity: 0,
  statusCounts: { IN_USE: 0, UNUSED: 0, DAMAGED: 0, CONSUMED: 0 },
  categoryCounts: [],
  expiringSoon: 0,
  expired: 0,
});

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const categorySaving = ref(false);
const error = ref("");
const keyword = ref("");
const statusFilter = ref<ItemStatus | "">("");
const categoryFilter = ref("");
const locationFilter = ref("");
const result = ref<PaginatedResponse<ItemSummary>>({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
const statistics = ref<InventoryStatistics>(emptyStats());
const categories = ref<CategoryNode[]>([]);
const locations = ref<LocationSummary[]>([]);
const pendingImages = ref<PendingImage[]>([]);
const thumbnailUrls = ref<Record<string, string>>({});
const locationPhotoUrls = ref<Record<string, string>>({});
const newBigCategory = ref("");
const newSmallCategory = ref("");
const newSmallParentId = ref("");

const form = reactive({
  name: "",
  bigCategoryId: "",
  smallCategoryId: "",
  quantity: 1,
  unit: "件",
  locationId: "",
  expiresOn: "",
  status: "UNUSED" as ItemStatus,
  remark: "",
});

const statusLabels: Record<ItemStatus, string> = {
  IN_USE: "使用中",
  UNUSED: "未使用",
  DAMAGED: "已损坏",
  CONSUMED: "已消耗",
};

const selectedBigCategory = computed(() => categories.value.find((category) => category.id === form.bigCategoryId));
const smallCategoryOptions = computed(() => selectedBigCategory.value?.children ?? []);
const hasUploadingImages = computed(() => pendingImages.value.some((image) => image.status === "uploading" || image.status === "pending"));

async function loadCategories(): Promise<void> {
  categories.value = await apiRequest<CategoryNode[]>("/categories/tree");
  if (!categories.value.some((category) => category.id === form.bigCategoryId)) {
    form.bigCategoryId = categories.value[0]?.id ?? "";
    form.smallCategoryId = "";
  }
  if (newSmallParentId.value === "" || !categories.value.some((category) => category.id === newSmallParentId.value)) {
    newSmallParentId.value = categories.value[0]?.id ?? "";
  }
}

async function loadStatistics(): Promise<void> {
  statistics.value = await apiRequest<InventoryStatistics>("/statistics/overview");
}

async function loadLocations(): Promise<void> {
  locations.value = await apiRequest<LocationSummary[]>("/locations");
  if (form.locationId !== "" && !locations.value.some((location) => location.id === form.locationId)) {
    form.locationId = "";
  }
  await loadLocationPhotos(locations.value);
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
  const targets = items.filter((item) => item.imageIds.length > 0);
  await runWithConcurrency(targets, 3, async (item) => {
    try {
      const blob = await apiBlob(`/media/images/${item.imageIds[0]}/content`);
      thumbnailUrls.value = { ...thumbnailUrls.value, [item.id]: URL.createObjectURL(blob) };
    } catch {
      // Keep the textual fallback when a thumbnail cannot be loaded.
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
      // Keep the visual fallback if an administrator replaces a photo during loading.
    }
  });
}

async function createItem(): Promise<void> {
  if (hasUploadingImages.value) {
    error.value = "请等待图片上传完成";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const body: Record<string, unknown> = {
      name: form.name,
      bigCategoryId: form.bigCategoryId,
      quantity: form.quantity,
      unit: form.unit,
      status: form.status,
      imageIds: pendingImages.value.flatMap((image) =>
        image.status === "uploaded" && image.imageId !== undefined ? [image.imageId] : [],
      ),
    };
    if (form.smallCategoryId !== "") body.smallCategoryId = form.smallCategoryId;
    if (form.locationId !== "") body.locationId = form.locationId;
    if (form.expiresOn !== "") body.expiresOn = form.expiresOn;
    if (form.remark.trim() !== "") body.remark = form.remark.trim();

    await apiRequest<ItemSummary>("/items", { method: "POST", body: JSON.stringify(body) });
    clearPendingImages();
    Object.assign(form, {
      name: "",
      bigCategoryId: categories.value[0]?.id ?? "",
      smallCategoryId: "",
      quantity: 1,
      unit: "件",
      locationId: "",
      expiresOn: "",
      status: "UNUSED",
      remark: "",
    });
    await Promise.all([loadItems(), loadStatistics(), loadLocations()]);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function handleImageSelection(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  const available = Math.max(0, 8 - pendingImages.value.filter((image) => image.status !== "error").length);
  const created = files.map<PendingImage>((file, index) => {
    const base = { key: `${Date.now()}-${index}-${file.name}`, file, previewUrl: null, status: "pending" as UploadStatus };
    if (index >= available) return { ...base, status: "error", error: "每件物品最多上传 8 张图片" };
    if (!file.type.startsWith("image/")) return { ...base, status: "error", error: "文件不是图片" };
    if (file.size === 0 || file.size > 10 * 1024 * 1024) return { ...base, status: "error", error: "图片大小必须在 1B 到 10MB 之间" };
    return { ...base, previewUrl: URL.createObjectURL(file) };
  });
  pendingImages.value.push(...created);
  await runWithConcurrency(created.filter((image) => image.status === "pending"), 3, uploadImage);
}

async function uploadImage(image: PendingImage): Promise<void> {
  image.status = "uploading";
  const body = new FormData();
  body.append("file", image.file);
  try {
    const uploaded = await apiRequest<ImageAssetSummary>("/media/images", { method: "POST", body });
    image.imageId = uploaded.id;
    image.status = "uploaded";
  } catch (cause) {
    image.status = "error";
    image.error = cause instanceof Error ? cause.message : "上传失败";
  }
}

async function removePendingImage(image: PendingImage): Promise<void> {
  if (image.status === "uploading") return;
  if (image.imageId !== undefined) {
    await apiRequest(`/media/images/${image.imageId}`, { method: "DELETE" }).catch(() => undefined);
  }
  if (image.previewUrl !== null) URL.revokeObjectURL(image.previewUrl);
  pendingImages.value = pendingImages.value.filter((candidate) => candidate.key !== image.key);
}

async function createBigCategory(): Promise<void> {
  if (newBigCategory.value.trim() === "") return;
  categorySaving.value = true;
  try {
    const created = await apiRequest<{ id: string; name: string }>("/categories", {
      method: "POST",
      body: JSON.stringify({ name: newBigCategory.value.trim() }),
    });
    newBigCategory.value = "";
    await loadCategories();
    form.bigCategoryId = created.id;
    form.smallCategoryId = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "创建大类目失败";
  } finally {
    categorySaving.value = false;
  }
}

async function createSmallCategory(): Promise<void> {
  if (newSmallCategory.value.trim() === "" || newSmallParentId.value === "") return;
  categorySaving.value = true;
  try {
    const created = await apiRequest<{ id: string; name: string }>("/categories", {
      method: "POST",
      body: JSON.stringify({ name: newSmallCategory.value.trim(), parentId: newSmallParentId.value }),
    });
    newSmallCategory.value = "";
    await loadCategories();
    form.bigCategoryId = newSmallParentId.value;
    form.smallCategoryId = created.id;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "创建小类目失败";
  } finally {
    categorySaving.value = false;
  }
}

async function removeCategory(id: string, name: string): Promise<void> {
  if (!window.confirm(`确认删除类目“${name}”吗？已登记物品仍保留类目快照。`)) return;
  try {
    await apiRequest(`/categories/${id}`, { method: "DELETE" });
    await loadCategories();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除类目失败";
  }
}

async function updateStatus(item: ItemSummary, status: ItemStatus): Promise<void> {
  if (item.status === status) return;
  error.value = "";
  try {
    await apiRequest(`/items/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    await Promise.all([loadItems(), loadStatistics()]);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "状态更新失败";
  }
}

async function removeItem(item: ItemSummary): Promise<void> {
  if (!window.confirm(`确认删除“${item.name}”吗？`)) return;
  try {
    await apiRequest(`/items/${item.id}`, { method: "DELETE" });
    await Promise.all([loadItems(), loadStatistics(), loadLocations()]);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除失败";
  }
}

function onBigCategoryChange(): void {
  form.smallCategoryId = "";
}

function clearPendingImages(): void {
  for (const image of pendingImages.value) if (image.previewUrl !== null) URL.revokeObjectURL(image.previewUrl);
  pendingImages.value = [];
}

function releaseThumbnailUrls(): void {
  for (const url of Object.values(thumbnailUrls.value)) URL.revokeObjectURL(url);
  thumbnailUrls.value = {};
}

function releaseLocationPhotoUrls(): void {
  for (const url of Object.values(locationPhotoUrls.value)) URL.revokeObjectURL(url);
  locationPhotoUrls.value = {};
}

async function showLocationContents(locationId: string): Promise<void> {
  locationFilter.value = locationId;
  await loadItems();
  document.getElementById("inventory-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

onMounted(async () => {
  try {
    await Promise.all([loadCategories(), loadLocations()]);
    await Promise.all([loadItems(), loadStatistics()]);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "初始化失败";
  }
});
onBeforeUnmount(() => {
  clearPendingImages();
  releaseThumbnailUrls();
  releaseLocationPhotoUrls();
});
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">序</span><div><strong>物序</strong><small>PERSONAL INVENTORY</small></div></div>
      <div class="user-menu"><span>{{ auth.user?.displayName }}</span><button class="text-button" type="button" @click="signOut">退出</button></div>
    </header>

    <main class="content-grid">
      <section class="hero-panel">
        <div><p class="eyebrow">我的物品</p><h1>今天也更了解<br />自己拥有的东西</h1></div>
        <div class="hero-metrics">
          <article><strong>{{ statistics.totalRecords }}</strong><span>物品记录</span></article>
          <article><strong>{{ statistics.statusCounts.IN_USE }}</strong><span>使用中</span></article>
          <article><strong>{{ statistics.expiringSoon }}</strong><span>30 天内到期</span></article>
          <article><strong>{{ statistics.expired }}</strong><span>已经过期</span></article>
        </div>
      </section>

      <section class="location-panel card">
        <div class="section-heading location-heading"><div><p class="eyebrow">存放地图</p><h2>我的存放位置</h2></div><span>位置由管理员统一创建</span></div>
        <div v-if="locations.length" class="location-grid">
          <button v-for="location in locations" :key="location.id" type="button" :class="['location-card', { active: locationFilter === location.id }]" @click="showLocationContents(location.id)">
            <img v-if="locationPhotoUrls[location.id]" :src="locationPhotoUrls[location.id]" :alt="location.name" />
            <div v-else class="location-photo-fallback">序</div>
            <span><strong>{{ location.name }}</strong><small>{{ location.description ?? '暂无说明' }}</small><em>{{ location.itemCount }} 件物品</em></span>
          </button>
        </div>
        <div v-else class="location-empty">管理员尚未创建存放位置</div>
      </section>

      <div class="side-stack">
        <section class="entry-panel card">
          <div class="section-heading"><div><p class="eyebrow">快速登记</p><h2>添加一件物品</h2></div></div>
          <form class="item-form" @submit.prevent="createItem">
            <label class="wide">物品名称<input v-model.trim="form.name" required maxlength="120" placeholder="例如：旅行收纳箱" /></label>
            <label>大类目<select v-model="form.bigCategoryId" required @change="onBigCategoryChange"><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
            <label>小类目<select v-model="form.smallCategoryId"><option value="">不选择</option><option v-for="category in smallCategoryOptions" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
            <label>数量<input v-model.number="form.quantity" type="number" min="0.001" step="0.001" required /></label>
            <label>单位<input v-model.trim="form.unit" required maxlength="20" /></label>
            <label>存放位置<select v-model="form.locationId"><option value="">暂不设置</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option></select></label>
            <label>初始状态<select v-model="form.status"><option v-for="status in ITEM_STATUSES" :key="status" :value="status">{{ statusLabels[status] }}</option></select></label>
            <label class="wide">到期日期<input v-model="form.expiresOn" type="date" /></label>
            <label class="wide image-picker">物品图片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple @change="handleImageSelection" /><small>最多 8 张，单张不超过 10MB；按选择顺序保存。</small></label>
            <div v-if="pendingImages.length" class="upload-grid wide">
              <article v-for="image in pendingImages" :key="image.key" :class="['upload-card', `upload-${image.status}`]">
                <img v-if="image.previewUrl" :src="image.previewUrl" :alt="image.file.name" />
                <div v-else class="upload-placeholder">!</div>
                <span>{{ image.file.name }}</span><small>{{ image.error ?? ({ pending: '等待上传', uploading: '上传中…', uploaded: '已上传', error: '失败' }[image.status]) }}</small>
                <button type="button" :disabled="image.status === 'uploading'" @click="removePendingImage(image)">移除</button>
              </article>
            </div>
            <label class="wide">备注<textarea v-model.trim="form.remark" rows="2" placeholder="选填"></textarea></label>
            <button class="primary-button form-submit" type="submit" :disabled="saving || hasUploadingImages">{{ saving ? "保存中…" : hasUploadingImages ? "图片上传中…" : "保存物品" }}</button>
          </form>
        </section>

        <section class="category-panel card">
          <div class="section-heading"><div><p class="eyebrow">分类体系</p><h2>类目管理</h2></div></div>
          <form class="category-create" @submit.prevent="createBigCategory"><input v-model="newBigCategory" maxlength="60" placeholder="新建大类目" /><button class="secondary-button" :disabled="categorySaving">添加</button></form>
          <form class="category-create category-create-small" @submit.prevent="createSmallCategory"><select v-model="newSmallParentId"><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option></select><input v-model="newSmallCategory" maxlength="60" placeholder="新建小类目" /><button class="secondary-button" :disabled="categorySaving">添加</button></form>
          <div class="category-tree">
            <article v-for="category in categories" :key="category.id"><div><strong>{{ category.name }}</strong><button type="button" @click="removeCategory(category.id, category.name)">删除</button></div><p v-if="category.children.length === 0">暂无小类目</p><div v-else class="category-tags"><span v-for="child in category.children" :key="child.id">{{ child.name }}<button type="button" @click="removeCategory(child.id, child.name)">×</button></span></div></article>
          </div>
        </section>
      </div>

      <section id="inventory-list" class="list-panel card">
        <div class="section-heading list-heading">
          <div><p class="eyebrow">物品清单</p><h2>最近登记</h2></div>
          <form class="filters" @submit.prevent="loadItems"><input v-model="keyword" type="search" placeholder="搜索名称" /><select v-model="categoryFilter"><option value="">全部类目</option><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option></select><select v-model="locationFilter"><option value="">全部位置</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option></select><select v-model="statusFilter"><option value="">全部状态</option><option v-for="status in ITEM_STATUSES" :key="status" :value="status">{{ statusLabels[status] }}</option></select><button class="secondary-button" type="submit">筛选</button></form>
        </div>
        <p v-if="error" class="error-message">{{ error }}</p>
        <div v-if="loading" class="empty-state">正在整理清单…</div>
        <div v-else-if="result.items.length === 0" class="empty-state"><strong>还没有物品</strong><span>从左侧表单登记第一件物品。</span></div>
        <div v-else class="item-list">
          <article v-for="item in result.items" :key="item.id" class="item-row">
            <img v-if="thumbnailUrls[item.id]" class="item-thumbnail" :src="thumbnailUrls[item.id]" :alt="item.name" />
            <div v-else class="item-avatar">{{ item.name.slice(0, 1) }}</div>
            <div class="item-main"><div class="item-title"><h3>{{ item.name }}</h3><span :class="['status-pill', `status-${item.status.toLowerCase()}`]">{{ statusLabels[item.status] }}</span></div><p>{{ item.bigCategoryName }}<template v-if="item.smallCategoryName"> / {{ item.smallCategoryName }}</template> · {{ item.quantity }} {{ item.unit }}<template v-if="item.location"> · {{ item.location }}</template></p><small v-if="item.expiresOn" class="expiry">到期：{{ item.expiresOn }}</small></div>
            <div class="item-actions"><select :value="item.status" aria-label="修改物品状态" @change="updateStatus(item, ($event.target as HTMLSelectElement).value as ItemStatus)"><option v-for="status in ITEM_STATUSES" :key="status" :value="status">{{ statusLabels[status] }}</option></select><button class="danger-link" type="button" @click="removeItem(item)">删除</button></div>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
