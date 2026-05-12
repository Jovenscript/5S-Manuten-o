const CACHE_NAME = '5s-manutencao-v2'; // Mudamos para v2 para forçar a atualização
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// Instala o Service Worker e salva os arquivos no cache
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Força a instalação imediata
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Essa é a mágica nova: Apaga o cache da versão velha quando você atualiza o número da versão
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Apagando cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Força os clientes a usarem a nova versão
    );
});

// Intercepta as requisições
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
        .then((response) => {
            // Retorna do cache se tiver, se não, busca na internet
            return response || fetch(event.request);
        })
    );
});
