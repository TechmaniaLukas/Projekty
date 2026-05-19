// Minimální service worker pro instalovatelnost (PWA) + bezpečný offline
// fallback. Aplikace je realtime (Convex přes WebSocket) — SW NEcachuje data,
// drží jen lehký app shell a NIKDY nevrací nevalidní Response.

const CACHE = "tm-projekty-v2";

const OFFLINE_HTML = `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><style>body{font-family:system-ui,sans-serif;background:#0f172a;
color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;
margin:0;text-align:center;padding:24px}a{color:#60a5fa}</style></head>
<body><div><h1>Bez připojení</h1><p>Techmania Projekty potřebuje internet.
Zkus to prosím znovu.</p><p><a href="/">Obnovit</a></p></div></body></html>`;

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/manifest.webmanifest", "/icon.svg"]))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Cizí origin (Convex, fonty…) nechat projít beze změny.
  if (url.origin !== self.location.origin) return;

  // Navigace: network-first; při selhání bezpečný offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cached = await caches.match(req);
          return cached || offlineResponse();
        }
      })(),
    );
    return;
  }

  // Statika: cache-first, doplň ze sítě; nikdy nevracej undefined.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch {
        return new Response("", { status: 504 });
      }
    })(),
  );
});
