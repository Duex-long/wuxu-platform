<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

import { useAuthStore } from "../stores/auth";

const email = ref("user@wuxu.local");
const password = ref("wuxu-user-123456");
const error = ref("");
const loading = ref(false);
const auth = useAuthStore();
const router = useRouter();

async function submit(): Promise<void> {
  error.value = "";
  loading.value = true;
  try {
    await auth.signIn(email.value, password.value);
    await router.push({ name: "home" });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-layout">
    <section class="login-intro">
      <p class="eyebrow">WUXU PERSONAL INVENTORY</p>
      <h1>把拥有的东西<br />重新变得清楚</h1>
      <p>登记、归类、定位，并持续了解每件物品的状态。</p>
      <div class="intro-stat">
        <span>V1</span>
        <small>个人物品审计与整理</small>
      </div>
    </section>
    <section class="login-panel">
      <form class="login-card" @submit.prevent="submit">
        <div>
          <p class="eyebrow">欢迎回来</p>
          <h2>登录物序</h2>
          <p class="muted">开发环境已预填普通用户账号。</p>
        </div>
        <label>
          邮箱
          <input v-model.trim="email" type="email" autocomplete="username" required />
        </label>
        <label>
          密码
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="error" class="error-message">{{ error }}</p>
        <button class="primary-button" type="submit" :disabled="loading">
          {{ loading ? "登录中…" : "进入我的物品" }}
        </button>
      </form>
    </section>
  </main>
</template>
