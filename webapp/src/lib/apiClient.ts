const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!BASE) return path;
  return `${BASE}${path}`;
}

export function apiFetch(path: string, init: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const finalInit: RequestInit = {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  };

  return fetch(apiUrl(path), finalInit);
}

export const API_BASE = BASE;
