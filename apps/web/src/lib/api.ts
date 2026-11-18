// Same host as the page (so it works over LAN / a server), port 4000, unless NEXT_PUBLIC_API_URL is set.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `${location.protocol}//${location.hostname}:4000/api` : "http://localhost:4000/api");
const KEY = "bitcode_token";

export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(KEY)),
  set: (t: string) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (res.status === 401 && token) {
    tokenStore.clear();
    if (typeof window !== "undefined") location.reload(); // session expired -> back to guest view
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}
