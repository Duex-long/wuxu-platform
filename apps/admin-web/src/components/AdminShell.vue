<script setup lang="ts">
import { useRouter } from "vue-router";

import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();

async function signOut(): Promise<void> {
  auth.signOut();
  await router.push({ name: "login" });
}
</script>

<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <RouterLink class="brand" :to="{ name: 'dashboard' }">
        <span>序</span><div><strong>物序</strong><small>ADMIN CONSOLE</small></div>
      </RouterLink>
      <nav aria-label="后台主导航">
        <RouterLink :to="{ name: 'dashboard' }"><span>◫</span>数据中心</RouterLink>
        <RouterLink :to="{ name: 'category-management' }"><span>◇</span>类目管理</RouterLink>
        <RouterLink :to="{ name: 'location-management' }"><span>⌂</span>位置管理</RouterLink>
      </nav>
      <div class="sidebar-foot"><small>当前管理员</small><strong>{{ auth.user?.displayName }}</strong><button type="button" @click="signOut">退出登录</button></div>
    </aside>
    <main class="workspace"><slot /></main>
  </div>
</template>
