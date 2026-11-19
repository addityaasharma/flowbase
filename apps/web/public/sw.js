/* Flowbase service worker: shows push notifications (even when the app is closed) and opens the right task when one is tapped.
   It deliberately caches nothing, so a new release is never hidden behind old files. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil((async () => {
    // if Flowbase is open and in front of the person, the in-app notification already told them: don't pop a second one
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === "visible" && c.focused)) return;
    await self.registration.showNotification(d.title || "Flowbase", {
      body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: d.tag || undefined, data: { url: d.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  if (target.origin !== self.location.origin) return; // only ever open our own pages
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) {
      if (new URL(c.url).origin === self.location.origin && "focus" in c) {
        await c.focus();
        try { await c.navigate(target.href); } catch (_) { /* not controllable: fall through to a fresh window */ return self.clients.openWindow(target.href); }
        return;
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
