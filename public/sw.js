const CACHE = "nutrihome-public-v1";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add("/offline.html")));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("nutrihome-public-") && key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
// Private responses are never stored; only a public offline fallback is cached.
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});
