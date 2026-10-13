<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

import { useAuthStore } from "../stores/auth";

const email = ref("admin@wuxu.local");
const password = ref("wuxu-admin-123456");
const error = ref("");
const loading = ref(false);
const auth = useAuthStore();
const router = useRouter();

async function submit(): Promise<void> {
  error.value = "";
  loading.value = true;
  try {
    await auth.signIn(email.value, password.value);
    await router.push({ name: "dashboard" });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="admin-login">
    <form class="login-card" @submit.prevent="submit">
      <div class="admin-symbol">序</div>
      <div><p class="eyebrow">WUXU OPERATIONS</p><h1>物序管理后台</h1><p class="muted">跨用户物品数据只读查询</p></div>
      <label>管理员邮箱<input v-model.trim="email" type="email" autocomplete="username" required /></label>
      <label>密码<input v-model="password" type="password" autocomplete="current-password" required /></label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? "验证中…" : "登录后台" }}</button>
    </form>
  </main>
</template>
