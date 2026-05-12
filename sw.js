const CACHE_NAME = '5s-manutencao-v2';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'logo-192.png',
    'logo-512.png'
];

// Instala o Service Worker e salva os arquivos no cache do celular
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Intercepta as requisições (permite abrir o app mesmo sem internet)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
        .then((response) => {
            return response || fetch(event.request);
        })
    );
});
