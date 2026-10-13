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
  <div class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" :to="{ name: 'home' }">
        <span class="brand-mark">序</span>
        <span><strong>物序</strong><small>PERSONAL INVENTORY</small></span>
      </RouterLink>
      <nav class="primary-nav" aria-label="主导航">
        <RouterLink :to="{ name: 'home' }">首页</RouterLink>
        <RouterLink :to="{ name: 'item-search' }">查找物品</RouterLink>
        <RouterLink :to="{ name: 'item-create' }">新增物品</RouterLink>
      </nav>
      <div class="user-menu">
        <span>{{ auth.user?.displayName }}</span>
        <button class="text-button" type="button" @click="signOut">退出</button>
      </div>
    </header>

    <main class="page-container"><slot /></main>

    <nav class="mobile-nav" aria-label="移动端主导航">
      <RouterLink :to="{ name: 'home' }"><span>⌂</span>首页</RouterLink>
      <RouterLink :to="{ name: 'item-search' }"><span>⌕</span>查找</RouterLink>
      <RouterLink :to="{ name: 'item-create' }"><span>＋</span>新增</RouterLink>
    </nav>
  </div>
</template>
