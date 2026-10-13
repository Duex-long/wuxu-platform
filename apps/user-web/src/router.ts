import { createRouter, createWebHistory } from "vue-router";

import HomePage from "./pages/HomePage.vue";
import ItemCreatePage from "./pages/ItemCreatePage.vue";
import ItemSearchPage from "./pages/ItemSearchPage.vue";
import LoginPage from "./pages/LoginPage.vue";
import LocationCreatePage from "./pages/LocationCreatePage.vue";
import LocationSearchPage from "./pages/LocationSearchPage.vue";
import { useAuthStore } from "./stores/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginPage, meta: { public: true } },
    { path: "/", name: "home", component: HomePage },
    { path: "/items/search", name: "item-search", component: ItemSearchPage },
    { path: "/items/new", name: "item-create", component: ItemCreatePage },
    { path: "/items", redirect: "/items/search" },
    { path: "/locations/search", name: "location-search", component: LocationSearchPage },
    { path: "/locations/new", name: "location-create", component: LocationCreatePage },
    { path: "/locations", redirect: "/locations/search" },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.initialize();
  if (!to.meta.public && !auth.user) return { name: "login" };
  if (to.name === "login" && auth.user) return { name: "home" };
  return true;
});
