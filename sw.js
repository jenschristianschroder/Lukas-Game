// The cache is scoped to this repo: other games on the same GitHub Pages origin are untouched.
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `echo-vault:${SCOPE}:`;
const CACHE = `${PREFIX}v1`;
const FILES = ['./', './index.html', './style.css', './src/app.js', './src/engine.js', './src/renderer.js', './src/audio.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
const ASSETS = new Set(FILES.map(file => new URL(file, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (event.request.mode === 'navigate') {
    // Network-first HTML, with a cached entry point for an offline home-screen launch.
    event.respondWith(fetch(event.request).then(async response => {
      if (!response.ok) return (await caches.match(new URL('./index.html', self.registration.scope))) || response;
      return response;
    }).catch(() => caches.match(new URL('./index.html', self.registration.scope))));
  } else if (ASSETS.has(url.href)) {
    // All versioned game assets come from the same installed cache.
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
