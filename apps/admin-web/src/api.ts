import type { LoginResponse } from "@wuxu/shared-types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "wuxu-admin-token";

export function readToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function saveToken(token: string): void { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken(): void { localStorage.removeItem(TOKEN_KEY); }

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && init.body !== null && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join("，") : body.message;
    throw new Error(message ?? `请求失败 ${response.status}`);
  }
  return body as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers({ Accept: "image/*" });
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) throw new Error(`图片加载失败 ${response.status}`);
  return response.blob();
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}
