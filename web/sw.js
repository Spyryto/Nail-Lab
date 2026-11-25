/* BUILD_ID is substituted during deployment; installation waits for consent. */
const CACHE = "nail-lab-__BUILD_ID__";
const SHELL = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest", "./icon.svg",
  "./storage.js", "./editor.js", "./catalog.js", "./examples.json", "./app.js", "./updates.js",
  "./runtime-worker.js", "./runtime-worker.js?version=0.54",
  "./runtime-worker.js?version=0.60", "./runtime/v0.54/nailseed.js",
  "./runtime/v0.60/nailseed.js",
  "./runtime-worker.js?version=0.61", "./runtime/v0.61/nailseed.js",
  "./runtime-worker.js?version=syntax", "./runtime/vsyntax/nailseed.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("nail-lab-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/version.json")) return; // Network only: never report a stale build.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
