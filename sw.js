/* COS 102 Quiz — Service Worker
   Network-first so new deploys show up; cache is offline fallback only. */
const CACHE = 'cos102-quiz-v4';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/questions-data.js',
  './js/firebase-config.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  // Activate new worker immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;

  // Never cache Firebase / Google APIs
  if (
    url.includes('googleapis.com') ||
    url.includes('firebaseio.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('gstatic.com/firebasejs')
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Network-first for app shell (HTML/JS/CSS/config) so deploys apply
  const isAppShell =
    request.mode === 'navigate' ||
    url.includes('/index.html') ||
    url.includes('/js/') ||
    url.includes('/css/') ||
    url.endsWith('/sw.js') ||
    url.includes('/manifest.json');

  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Other GETs: cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
