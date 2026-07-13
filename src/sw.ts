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
  const path = (event.notification.data?.url as string) ?? '/hub/admin/dashboard';
  const target = path.startsWith('http') ? path : `${self.location.origin}${path}`;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        return existing.navigate(target).then(c => c?.focus() ?? existing.focus());
      }
      return self.clients.openWindow(target);
    })
  );
});
