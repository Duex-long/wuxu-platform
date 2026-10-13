<script setup lang="ts">
import type { CategoryNode } from "@wuxu/shared-types";
import { computed, onMounted, ref } from "vue";

import { apiRequest } from "../api";
import AdminShell from "../components/AdminShell.vue";

const categories = ref<CategoryNode[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const newBigCategory = ref("");
const newSmallCategory = ref("");
const newSmallParentId = ref("");
const smallCategoryCount = computed(() => categories.value.reduce((total, category) => total + category.children.length, 0));

async function loadCategories(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    categories.value = await apiRequest<CategoryNode[]>("/categories/tree");
    if (!categories.value.some((category) => category.id === newSmallParentId.value)) {
      newSmallParentId.value = categories.value[0]?.id ?? "";
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法加载类目";
  } finally {
    loading.value = false;
  }
}

async function createBigCategory(): Promise<void> {
  if (newBigCategory.value.trim() === "") return;
  saving.value = true;
  error.value = "";
  try {
    await apiRequest("/categories", { method: "POST", body: JSON.stringify({ name: newBigCategory.value.trim() }) });
    newBigCategory.value = "";
    await loadCategories();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "创建大类目失败";
  } finally {
    saving.value = false;
  }
}

async function createSmallCategory(): Promise<void> {
  if (newSmallCategory.value.trim() === "" || newSmallParentId.value === "") return;
  saving.value = true;
  error.value = "";
  try {
    await apiRequest("/categories", {
      method: "POST",
      body: JSON.stringify({ name: newSmallCategory.value.trim(), parentId: newSmallParentId.value }),
    });
    newSmallCategory.value = "";
    await loadCategories();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "创建小类目失败";
  } finally {
    saving.value = false;
  }
}

async function removeCategory(id: string, name: string): Promise<void> {
  if (!window.confirm(`确认删除类目“${name}”吗？已登记物品仍保留类目名称快照。`)) return;
  error.value = "";
  try {
    await apiRequest(`/categories/${id}`, { method: "DELETE" });
    await loadCategories();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除类目失败";
  }
}

onMounted(loadCategories);
</script>

<template>
  <AdminShell>
    <header><div><p class="eyebrow">CATEGORY MANAGEMENT</p><h1>类目管理</h1><p class="page-description">统一维护用户登记物品时可以选择的大类目与小类目。</p></div><div class="management-summary">{{ categories.length }} 个大类目 · {{ smallCategoryCount }} 个小类目</div></header>

    <p v-if="error" class="error">{{ error }}</p>
    <section class="data-card category-management standalone-management">
      <div class="card-heading"><div><p class="eyebrow">CONTROLLED CATEGORIES</p><h2>两级类目</h2></div><span>用户端只能选择这里维护的类目</span></div>
      <div class="category-admin-layout">
        <div class="category-forms">
          <form @submit.prevent="createBigCategory"><label>大类目名称<input v-model="newBigCategory" maxlength="60" required placeholder="例如：玩具" /></label><button type="submit" :disabled="saving">添加大类目</button></form>
          <form @submit.prevent="createSmallCategory"><label>所属大类目<select v-model="newSmallParentId" required><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label><label>小类目名称<input v-model="newSmallCategory" maxlength="60" required placeholder="例如：乐高" /></label><button type="submit" :disabled="saving || newSmallParentId === ''">添加小类目</button></form>
        </div>
        <div v-if="loading" class="empty-insight">正在读取类目…</div>
        <div v-else class="admin-category-tree">
          <article v-for="category in categories" :key="category.id"><div><strong>{{ category.name }}</strong><button type="button" @click="removeCategory(category.id, category.name)">删除大类目</button></div><p v-if="category.children.length === 0">暂无小类目</p><div v-else><span v-for="child in category.children" :key="child.id">{{ child.name }}<button type="button" :aria-label="`删除${child.name}`" @click="removeCategory(child.id, child.name)">×</button></span></div></article>
        </div>
      </div>
    </section>
  </AdminShell>
</template>
