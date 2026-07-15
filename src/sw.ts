/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST ?? []);

// Serve all navigations from the precached app shell — the installed app
// opens instantly instead of refetching index.html over the network.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Deliberately no skipWaiting() on install: an updated SW waits until every
// tab from the old build closes. Activating mid-session used to delete the
// old precache while open tabs still needed its lazy chunks, which showed up
// as a black/stuck screen until a manual reload.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }

  const title = data.title ?? 'FS Architects';
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url ?? '/hub/admin/dashboard' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const raw = (event.notification.data?.url as string) ?? '/hub/admin/dashboard';
  // Push payloads may carry absolute URLs (sometimes on a different subdomain,
  // e.g. apex vs www.). Normalize onto this worker's origin — an origin
  // mismatch kicks the click out of the installed app's scope, landing in a
  // browser tab with no stored session (login prompt).
  let target: URL;
  try {
    target = new URL(raw, self.location.origin);
  } catch {
    target = new URL('/hub/admin/dashboard', self.location.origin);
  }
  const absoluteUrl = `${self.location.origin}${target.pathname}${target.search}${target.hash}`;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((c) => c.url.startsWith(self.location.origin + '/hub'))
        ?? clients.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        const focused = await existing.focus().catch(() => existing);
        try {
          await (focused ?? existing).navigate(absoluteUrl);
        } catch {
          // Uncontrolled clients can't be navigated from the SW —
          // hand the URL to the app and let it route itself.
          (focused ?? existing).postMessage({ type: 'push-navigate', url: absoluteUrl });
        }
        return;
      }
      await self.clients.openWindow(absoluteUrl);
    }),
  );
});
