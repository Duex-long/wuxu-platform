import { createRouter, createWebHistory } from "vue-router";

import CategoryManagementPage from "./pages/CategoryManagementPage.vue";
import DashboardPage from "./pages/DashboardPage.vue";
import LoginPage from "./pages/LoginPage.vue";
import LocationManagementPage from "./pages/LocationManagementPage.vue";
import { useAuthStore } from "./stores/auth";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to) {
    if (to.hash !== "") return { el: to.hash, behavior: "smooth" };
    return { top: 0 };
  },
  routes: [
    { path: "/login", name: "login", component: LoginPage, meta: { public: true } },
    { path: "/", name: "dashboard", component: DashboardPage },
    { path: "/categories", name: "category-management", component: CategoryManagementPage },
    { path: "/locations", name: "location-management", component: LocationManagementPage },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.initialize();
  if (!to.meta.public && !auth.user) return { name: "login" };
  if (to.name === "login" && auth.user) return { name: "dashboard" };
  return true;
});
