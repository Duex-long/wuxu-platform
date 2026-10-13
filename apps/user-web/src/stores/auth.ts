import type { AuthUser } from "@wuxu/shared-types";
import { defineStore } from "pinia";

import { apiRequest, clearToken, login, readToken, saveToken } from "../api";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: readToken() as string | null,
    user: null as AuthUser | null,
    initialized: false,
  }),
  actions: {
    async initialize(): Promise<void> {
      if (this.initialized) return;
      if (this.token) {
        try {
          this.user = await apiRequest<AuthUser>("/auth/me");
        } catch {
          this.signOut();
        }
      }
      this.initialized = true;
    },
    async signIn(email: string, password: string): Promise<void> {
      const response = await login({ email, password });
      if (response.user.role !== "USER") throw new Error("请使用普通用户账号登录用户端");
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
