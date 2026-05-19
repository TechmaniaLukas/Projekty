// Minimální service worker pro instalovatelnost (PWA) + offline fallback.
// Aplikace je realtime (Convex přes WebSocket) — SW záměrně NEcachuje data,
// jen app shell pro případ výpadku sítě.

const CACHE = "tm-projekty-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Cizí origin (Convex, Resend, fonty) nechat projít beze změny.
  if (url.origin !== self.location.origin) return;

  // Navigace: network-first, fallback na cache shellu (offline).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((r) => r || caches.match("/")),
      ),
    );
    return;
  }

  // Ostatní GET (statika): cache-first s doplněním ze sítě.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached),
    ),
  );
});
