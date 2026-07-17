// DocuSalud Service Worker — v13 (jul-2026)
// App shell offline: tras una primera carga con conexión, la aplicación abre y
// funciona sin internet (los datos y la cola de cambios los maneja la
// persistencia IndexedDB de Firestore; este SW solo garantiza que el "cascarón"
// —HTML, SDK de Firebase, fuentes— esté disponible).
//
// DESPLIEGUE: subir este archivo a la RAÍZ del sitio, junto a index.html.
// Al publicar una nueva versión del index, incrementar CACHE_V aquí.

const CACHE_V = 'docusalud-v13-2';
const SHELL = ['/', '/index.html'];
// Módulos del SDK que el index importa: se precachean en el install para que
// el offline funcione desde la PRIMERA visita (en la primera carga, los imports
// ocurren antes de que el SW controle la página — sin esto, solo la 2ª carga
// los cachearía). mode:'cors' es obligatorio: una respuesta opaca no sirve
// para <script type="module">.
const SHELL_CORS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_V)
      .then((c) => Promise.allSettled([
        c.addAll(SHELL).catch(() => c.add('/')),
        ...SHELL_CORS.map((u) =>
          fetch(new Request(u, { mode: 'cors' }))
            .then((r) => { if (r && r.ok) return c.put(u, r); })
            .catch(() => {})
        )
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // ── SDK de Firebase (módulos ES de gstatic): cache-first.
  // Sin esto, el import del módulo falla offline y la app no arranca.
  if (url.includes('gstatic.com/firebasejs')) {
    e.respondWith(
      caches.open(CACHE_V).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const r = await fetch(req);
        if (r && r.ok) c.put(req, r.clone());
        return r;
      })
    );
    return;
  }

  // ── APIs de datos (Firestore/Auth/Storage/RTDB): red directa, sin interceptar.
  // El SDK gestiona su propio modo offline; cachear esto rompería la sincronización.
  if (/googleapis\.com|firebaseio\.com|firebasedatabase\.app|firebasestorage/.test(url)) return;

  // ── Navegación (el index): red primero con actualización del caché;
  // sin conexión → servir el shell cacheado.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE_V).then((c) => { c.put('/index.html', copy).catch(() => {}); });
          return r;
        })
        .catch(() => caches.match('/index.html').then((x) => x || caches.match('/')))
    );
    return;
  }

  // ── Fuentes y CDNs (Google Fonts, cdnjs): stale-while-revalidate.
  if (/fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare/.test(url)) {
    e.respondWith(
      caches.open(CACHE_V).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req)
          .then((r) => { if (r && r.ok) c.put(req, r.clone()); return r; })
          .catch(() => null);
        return hit || net.then((r) => r || new Response('', { status: 504 }));
      })
    );
  }
});
