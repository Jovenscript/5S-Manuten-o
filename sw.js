/* =========================================================================
   SERVICE WORKER — 5S Manutenção
   Estratégia:
   - Navegação (HTML): network-first  -> sempre tenta a versão nova online,
     cai no cache só quando estiver offline. Isso evita "app travado" numa
     versão antiga depois de um deploy.
   - Estáticos (css/js/png/manifest): stale-while-revalidate -> abre rápido
     do cache e atualiza em segundo plano.
   - Cross-origin (Firebase, Cloudinary, gstatic): NÃO intercepta. Deixa o
     navegador cuidar. O SW só gerencia os arquivos do próprio app.
========================================================================= */
const CACHE_NAME = '5s-manutencao-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  './icon-maskable-192x192.png',
  './icon-maskable-512x512.png',
  './apple-touch-icon.png'
];

// INSTALL — pré-cacheia o app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// ACTIVATE — limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só cuidamos de GET e do mesmo domínio do app.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase/Cloudinary/gstatic passam direto

  // Navegação (abrir o app): network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Estáticos: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
