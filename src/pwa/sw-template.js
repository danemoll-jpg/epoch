// Round 15: the service worker. Plain JS (it runs as-is in the browser); vite.config.ts puts
// three lines in front of it when it builds `sw.js`:
//   const VERSION = '<hash of the build>';
//   const PRECACHE = [every file the game needs, except the music];
//   const MEDIA = [the music files];
//
// The rules (tests/pwa.test.ts runs this file against a fake browser):
// - install: download PRECACHE into this version's cache. It does NOT take over: a new version
//   waits until the page asks (the player tapped "Update available"), so it never reloads by
//   itself mid-game.
// - activate: delete older versions' caches; keep only the music this version still uses.
// - fetch: the page itself and every game file come from this version's cache first (so the
//   game runs offline, and a new version can't mix its files with an old page's); music is
//   cached the first time it plays (it's big, so it's not downloaded up front).
// - Saved games live in localStorage, which a service worker never touches.

const CACHE = 'epoch-' + VERSION;
const MEDIA_CACHE = 'epoch-media';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('epoch-') && name !== CACHE && name !== MEDIA_CACHE) await caches.delete(name);
    }
    const media = await caches.open(MEDIA_CACHE);
    for (const req of await media.keys()) {
      if (!MEDIA.includes(new URL(req.url).pathname)) await media.delete(req);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The picker and check pages under /docs/ aren't part of the game: always from the network.
  if (url.pathname.startsWith('/docs/')) return;
  if (MEDIA.includes(url.pathname)) {
    event.respondWith(mediaFirst(req));
    return;
  }
  // A page load (any path: the site is a single page) gets this version's index.html.
  const key = req.mode === 'navigate' ? '/index.html' : url.pathname;
  event.respondWith(
    caches.open(CACHE).then((c) => c.match(key)).then((hit) => hit || fetch(req)),
  );
});

/** Music: from the media cache, else the network (and keep a copy for next time). */
async function mediaFirst(req) {
  const media = await caches.open(MEDIA_CACHE);
  const path = new URL(req.url).pathname;
  const hit = await media.match(path);
  if (hit) return hit;
  const res = await fetch(req);
  // Only a whole file is kept (a 206 range reply is a piece of one).
  if (res.ok && res.status === 200) await media.put(path, res.clone());
  return res;
}
