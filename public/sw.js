/*
 * Service Worker — Mentes Brillantes ERP
 *
 * Estrategia SEGURA para datos financieros en vivo:
 *  - Navegaciones (páginas): SIEMPRE red primero. Si no hay internet, se muestra
 *    una página offline. Nunca se sirven datos cacheados desactualizados.
 *  - APIs / Supabase / peticiones POST: nunca se cachean (pasan directo a la red).
 *  - Solo se cachean assets estáticos inmutables (/_next/static, iconos, fuentes).
 */
const CACHE = "mb-erp-static-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Solo gestionamos peticiones del propio origen.
  if (url.origin !== self.location.origin) return;

  // Páginas: red primero, página offline como respaldo.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || Response.error())
      )
    );
    return;
  }

  // Assets estáticos inmutables: cache primero (rápido), si no está, red y se cachea.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Todo lo demás (datos, APIs): directo a la red, sin cachear.
});
