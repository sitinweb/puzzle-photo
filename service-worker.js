var CACHE_NAME = "puzzle-photo-cache-v2";
var ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "engine.js",
  "db.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-192-maskable.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Force real network fetches (bypassing HTTP cache and any still-active
      // previous service worker) so an update can never re-cache stale
      // content it picked up from itself.
      return Promise.all(ASSETS.map(function (url) {
        return fetch(url, { cache: "reload" }).then(function (response) {
          return cache.put(url, response);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        return response;
      }).catch(function () {
        if (event.request.mode === "navigate") return caches.match("index.html");
      });
    })
  );
});
