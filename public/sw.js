// Service worker for Gicko's push notifications. No offline caching — every screen reads
// live data from Supabase, so a cached shell would only ever show a stale night.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Gicko", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Gicko", {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      // One reminder of a kind at a time: a fresh nap warning replaces the last one
      // rather than stacking up on the lock screen.
      tag: payload.tag ?? "gicko",
      renotify: true,
      vibrate: [100, 50, 100],
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Reuse the open app if it's already there — on iOS that's the installed one.
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
