import { createRouter, createWebHistory } from "vue-router";

import ItemsPage from "./pages/ItemsPage.vue";
import LoginPage from "./pages/LoginPage.vue";
import { useAuthStore } from "./stores/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginPage, meta: { public: true } },
    { path: "/items", name: "items", component: ItemsPage },
    { path: "/:pathMatch(.*)*", redirect: "/items" },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.initialize();
  if (!to.meta.public && !auth.user) return { name: "login" };
  if (to.name === "login" && auth.user) return { name: "items" };
  return true;
});
