<script setup lang="ts">
import { ITEM_STATUSES, type CategoryNode, type ImageAssetSummary, type ItemStatus, type ItemSummary, type LocationSummary } from "@wuxu/shared-types";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import { apiRequest } from "../api";
import UserShell from "../components/UserShell.vue";
import { runWithConcurrency, statusLabels } from "../inventory";

type UploadStatus = "pending" | "uploading" | "uploaded" | "error";
interface PendingImage { key: string; file: File; previewUrl: string | null; status: UploadStatus; imageId?: string; error?: string }

const router = useRouter();
const categories = ref<CategoryNode[]>([]);
const locations = ref<LocationSummary[]>([]);
const pendingImages = ref<PendingImage[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref("");

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

const selectedBigCategory = computed(() => categories.value.find((category) => category.id === form.bigCategoryId));
const smallCategoryOptions = computed(() => selectedBigCategory.value?.children ?? []);
const hasUploadingImages = computed(() => pendingImages.value.some((image) => image.status === "uploading" || image.status === "pending"));
const canSubmit = computed(() => categories.value.length > 0 && !saving.value && !hasUploadingImages.value);

async function loadOptions(): Promise<void> {
  loading.value = true;
  try {
    [categories.value, locations.value] = await Promise.all([
      apiRequest<CategoryNode[]>("/categories/tree"),
      apiRequest<LocationSummary[]>("/locations"),
    ]);
    form.bigCategoryId = categories.value[0]?.id ?? "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法加载登记选项";
  } finally {
    loading.value = false;
  }
}

async function createItem(): Promise<void> {
  if (!canSubmit.value) return;
  saving.value = true;
  error.value = "";
  try {
    const body: Record<string, unknown> = {
      name: form.name,
      bigCategoryId: form.bigCategoryId,
      quantity: form.quantity,
      unit: form.unit,
      status: form.status,
      imageIds: pendingImages.value.flatMap((image) => image.status === "uploaded" && image.imageId ? [image.imageId] : []),
    };
    if (form.smallCategoryId !== "") body.smallCategoryId = form.smallCategoryId;
    if (form.locationId !== "") body.locationId = form.locationId;
    if (form.expiresOn !== "") body.expiresOn = form.expiresOn;
    if (form.remark.trim() !== "") body.remark = form.remark.trim();
    await apiRequest<ItemSummary>("/items", { method: "POST", body: JSON.stringify(body) });
    clearPendingImages();
    await router.push({ name: "item-search", query: { keyword: form.name, created: "1" } });
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
  if (image.imageId) await apiRequest(`/media/images/${image.imageId}`, { method: "DELETE" }).catch(() => undefined);
  if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
  pendingImages.value = pendingImages.value.filter((candidate) => candidate.key !== image.key);
}

function onBigCategoryChange(): void { form.smallCategoryId = ""; }
function clearPendingImages(): void {
  for (const image of pendingImages.value) if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
  pendingImages.value = [];
}

onMounted(loadOptions);
onBeforeUnmount(clearPendingImages);
</script>

<template>
  <UserShell>
    <header class="page-heading"><div><p class="eyebrow">NEW INVENTORY</p><h1>新增物品</h1><p>一次完成物品资料、位置和图片登记。</p></div><RouterLink class="secondary-button" :to="{ name: 'item-search' }">返回查找</RouterLink></header>

    <section class="card create-card">
      <div v-if="loading" class="empty-state">正在加载登记选项…</div>
      <template v-else>
        <p v-if="categories.length === 0" class="notice-message">管理员尚未创建类目，请先联系管理员配置。</p>
        <p v-if="error" class="error-message">{{ error }}</p>
        <form class="item-form" @submit.prevent="createItem">
          <label class="wide">物品名称<input v-model.trim="form.name" required maxlength="120" placeholder="例如：旅行收纳箱" /></label>
          <label>大类目<select v-model="form.bigCategoryId" required @change="onBigCategoryChange"><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option></select><small>类目由管理员统一维护</small></label>
          <label>小类目<select v-model="form.smallCategoryId"><option value="">不选择</option><option v-for="category in smallCategoryOptions" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
          <label>数量<input v-model.number="form.quantity" type="number" min="0.001" step="0.001" required /></label>
          <label>单位<input v-model.trim="form.unit" required maxlength="20" /></label>
          <label>存放位置<select v-model="form.locationId"><option value="">暂不设置</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option></select></label>
          <label>初始状态<select v-model="form.status"><option v-for="itemStatus in ITEM_STATUSES" :key="itemStatus" :value="itemStatus">{{ statusLabels[itemStatus] }}</option></select></label>
          <label class="wide">到期日期<input v-model="form.expiresOn" type="date" /></label>
          <label class="wide image-picker">物品图片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple @change="handleImageSelection" /><small>最多 8 张，单张不超过 10MB；按选择顺序保存。</small></label>
          <div v-if="pendingImages.length" class="upload-grid wide">
            <article v-for="image in pendingImages" :key="image.key" :class="['upload-card', `upload-${image.status}`]">
              <img v-if="image.previewUrl" :src="image.previewUrl" :alt="image.file.name" /><span v-else class="upload-placeholder">!</span>
              <span>{{ image.file.name }}</span><small>{{ image.error ?? ({ pending: '等待上传', uploading: '上传中…', uploaded: '已上传', error: '失败' }[image.status]) }}</small>
              <button type="button" :disabled="image.status === 'uploading'" @click="removePendingImage(image)">移除</button>
            </article>
          </div>
          <label class="wide">备注<textarea v-model.trim="form.remark" rows="3" placeholder="选填"></textarea></label>
          <button class="primary-button form-submit" type="submit" :disabled="!canSubmit">{{ saving ? "保存中…" : hasUploadingImages ? "图片上传中…" : "保存物品" }}</button>
        </form>
      </template>
    </section>
  </UserShell>
</template>
