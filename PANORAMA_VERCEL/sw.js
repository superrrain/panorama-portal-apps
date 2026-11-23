/**
 * PANORAMA PWA Service Worker (Integrated with OneSignal Web Push)
 * Network-First Offline Engine & Background Notification Resiliency
 */
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (eImport) {
  console.log('OneSignal worker import notice:', eImport);
}

const CACHE_NAME = 'panorama-pwa-v6';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/panorama-logo.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Cache install warning:', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Hanya proses GET requests
  if (event.request.method !== 'GET') return;

  // Network-First strategy untuk data operasional terkini
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Push Notification Listener (Anti-Duplicate Guard: 100% Ditangani oleh OneSignal SDK)
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  // PENTING: Jika push berasal dari OneSignal (memiliki properti custom / onesignal / notificationId),
  // abaikan listener manual ini 100% agar TIDAK TERJADI DUPLIKASI NOTIFIKASI di status bar HP!
  // OneSignalSDK.sw.js sudah otomatis merender notifikasi resmi lengkap.
  if (data && (data.custom || data.onesignal || data.isOneSignal || data.notificationId)) {
    return;
  }

  // Jika payload kosong atau tidak ada konten valid, jangan tampilkan apa-apa
  if (!data || Object.keys(data).length === 0 || (!data.title && !data.body && !data.message)) {
    return;
  }

  const title = data.title || 'PANORAMA Operations Alert';
  const options = {
    body: data.body || data.message || 'Ada pembaruan status operasional penting.',
    icon: 'assets/panorama-logo.png',
    badge: 'assets/panorama-logo.png',
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: data.url || data.actionUrl || './'
    },
    actions: [
      { action: 'open', title: 'Buka Portal ↗' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
