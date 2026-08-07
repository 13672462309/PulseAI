// PulseAI Service Worker — Push Notifications
const CACHE_NAME = 'pulseai-v1';

// Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const { title, body, icon, data } = payload;

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: icon || '/icon-192.png',
        badge: '/icon-192.png',
        tag: data?.topicId ? `topic-${data.topicId}` : undefined,
        data,
        vibrate: [200, 100, 200],
        requireInteraction: true,
      })
    );
  } catch {
    // Fallback: show raw text
    event.waitUntil(
      self.registration.showNotification('PulseAI Alert', {
        body: event.data.text(),
        icon: '/icon-192.png',
      })
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { data } = event.notification;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const url = data?.url || '/';

      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }

      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
