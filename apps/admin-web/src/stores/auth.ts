import type { AuthUser } from "@wuxu/shared-types";
import { defineStore } from "pinia";

import { apiRequest, clearToken, login, readToken, saveToken } from "../api";

export const useAuthStore = defineStore("admin-auth", {
  state: () => ({ token: readToken() as string | null, user: null as AuthUser | null, initialized: false }),
  actions: {
    async initialize(): Promise<void> {
      if (this.initialized) return;
      if (this.token) {
        try {
          const user = await apiRequest<AuthUser>("/auth/me");
          if (user.role !== "ADMIN") throw new Error("not admin");
          this.user = user;
        } catch {
          this.signOut();
        }
      }
      this.initialized = true;
    },
    async signIn(email: string, password: string): Promise<void> {
      const response = await login(email, password);
      if (response.user.role !== "ADMIN") throw new Error("该账号没有后台管理权限");
      saveToken(response.accessToken);
      this.token = response.accessToken;
      this.user = response.user;
      this.initialized = true;
    },
    signOut(): void {
      clearToken();
      this.token = null;
      this.user = null;
      this.initialized = true;
    },
  },
});
