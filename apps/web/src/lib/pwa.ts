"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

/** Registers the service worker once (it is what receives push messages). */
export function registerServiceWorker() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// "Install app": the browser offers an install prompt once, early on. Keep it so a button can use it later.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; ping(); });
  window.addEventListener("appinstalled", () => { deferred = null; ping(); });
}
export const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstall() {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return {
    canInstall: !!deferred && !isStandalone(),
    install: async () => { if (!deferred) return; await deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; ping(); },
  };
}

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const toKey = (b64: string) => { const p = "=".repeat((4 - (b64.length % 4)) % 4), s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}
/** Asks permission, subscribes this device and tells the server. Throws a readable message if anything is not possible. */
export async function enablePush() {
  if (!pushSupported()) throw new Error("This browser can’t show push notifications.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked for this site. Allow them in the browser settings, then try again.");
  const { enabled, key } = await api<{ enabled: boolean; key: string | null }>("/push/key");
  if (!enabled || !key) throw new Error("Push notifications aren’t set up on the server yet.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
  await api("/push/subscribe", { method: "POST", json: sub.toJSON() });
}
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api("/push/unsubscribe", { method: "POST", json: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
/** On sign-out: stop this device getting the previous person's notifications. Takes the token explicitly because it is about to be cleared. */
export async function forgetDevice(token: string | null) {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    if (token) await api("/push/unsubscribe", { method: "POST", json: { endpoint: sub.endpoint }, headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch { /* best effort */ }
}
