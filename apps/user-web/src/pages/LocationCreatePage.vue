<script setup lang="ts">
import type { ImageAssetSummary, LocationSummary } from "@wuxu/shared-types";
import { onBeforeUnmount, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import { apiRequest } from "../api";
import UserShell from "../components/UserShell.vue";

const router = useRouter();
const draft = reactive({ name: "", description: "" });
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const saving = ref(false);
const error = ref("");

function selectPhoto(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = "";
  if (file === null) return;
  if (!file.type.startsWith("image/") || file.size === 0 || file.size > 10 * 1024 * 1024) {
    error.value = "位置照片必须是 10MB 以内的有效图片";
    return;
  }
  releasePreview();
  selectedFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
  error.value = "";
}

async function createLocation(): Promise<void> {
  const cleanName = draft.name.trim();
  if (cleanName === "" || selectedFile.value === null) {
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
    await apiRequest<LocationSummary>("/locations", {
      method: "POST",
      body: JSON.stringify({
        name: cleanName,
        description: draft.description.trim() === "" ? undefined : draft.description.trim(),
        photoImageId: uploaded.id,
      }),
    });
    uploadedId = null;
    await router.push({ name: "location-search", query: { keyword: cleanName, created: "1" } });
  } catch (cause) {
    if (uploadedId !== null) {
      await apiRequest(`/media/images/${uploadedId}`, { method: "DELETE" }).catch(() => undefined);
    }
    error.value = cause instanceof Error ? cause.message : "创建存放位置失败";
  } finally {
    saving.value = false;
  }
}

function releasePreview(): void {
  if (previewUrl.value !== null) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = null;
}

onBeforeUnmount(releasePreview);
</script>

<template>
  <UserShell>
    <header class="page-heading">
      <div><p class="eyebrow">NEW PERSONAL LOCATION</p><h1>新增存放位置</h1><p>创建仅自己可见的位置，之后可在物品登记时直接选择。</p></div>
      <RouterLink class="secondary-button" :to="{ name: 'location-search' }">查找位置</RouterLink>
    </header>

    <section class="card location-create-card">
      <p v-if="error" class="error-message">{{ error }}</p>
      <form class="location-create-form" @submit.prevent="createLocation">
        <label>位置名称<input v-model="draft.name" maxlength="80" required placeholder="例如：卧室衣柜第二层" /></label>
        <label>位置说明<textarea v-model="draft.description" maxlength="300" rows="4" placeholder="补充颜色、方位或容易辨认的特征"></textarea></label>
        <label class="user-location-photo-picker">
          位置照片
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" @change="selectPhoto" />
          <span v-if="previewUrl"><img :src="previewUrl" alt="待上传的位置照片" /></span>
          <small v-else>必须上传一张照片，支持 JPEG、PNG、WebP、GIF，最大 10MB</small>
        </label>
        <p class="location-visibility-note"><strong>个人位置</strong> 仅你自己和管理员可见；其他用户不能查找、选择或查看照片。</p>
        <button class="primary-button" type="submit" :disabled="saving">{{ saving ? '正在创建…' : '创建个人位置' }}</button>
      </form>
    </section>
  </UserShell>
</template>
