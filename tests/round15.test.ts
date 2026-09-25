// Round 15 (M9 part 3): the name in one place, the web app manifest and icons, the offline
// service worker and its update rules, and the balance targets (loosely, on a few seeds).
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import swTemplate from '../src/pwa/sw-template.js?raw';
import appIconDoc from '../docs/APP-ICON.md?raw';
import goLive from '../docs/GO-LIVE.md?raw';
import { GAME, webManifest } from '../src/data/game';
import { isMusicFile, precacheEntries } from '../src/pwa/files';
import { swWanted, watchForUpdates, UPDATE_CHECK_MS, type ContainerLike, type RegistrationLike, type WorkerLike } from '../src/pwa/update';
import { guidePages } from '../src/ui/guide';
import { TIPS } from '../src/ui/tips';
import { pwaPlugin } from '../scripts/pwa-plugin';

const ICONS = import.meta.glob<string>('../public/icons/*.png', { query: '?inline', import: 'default', eager: true });

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(dataUrl: string): [number, number] {
  const bin = atob(dataUrl.split(',')[1]!.slice(0, 64));
  const u32 = (o: number) => ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0;
  expect(bin.slice(1, 4)).toBe('PNG');
  return [u32(16), u32(20)];
}

describe('A1: the name in one place', () => {
  it('is "Epoch: From Stone to Stars", short name "Epoch"', () => {
    expect(GAME.name).toBe('Epoch: From Stone to Stars');
    expect(GAME.shortName).toBe('Epoch');
    expect(GAME.wordmark).toBe('EPOCH');
    expect(GAME.subtitle).toBe('From Stone to Stars');
  });

  it('index.html takes every name from the placeholders (no name typed in it)', () => {
    expect(indexHtml).toContain('<title>%GAME_NAME%</title>');
    expect(indexHtml).toContain('%GAME_WORDMARK%');
    expect(indexHtml).toContain('%GAME_SUBTITLE%');
    const text = indexHtml.replace(/<!--[\s\S]*?-->/g, '');
    expect(text).not.toMatch(/Epoch|EPOCH|From Stone/);
  });

  it('the build fills the placeholders from GAME', () => {
    const plugin = pwaPlugin();
    const transform = plugin.transformIndexHtml as (html: string) => string;
    const out = transform(indexHtml).replace(/<!--[\s\S]*?-->/g, '');
    expect(out).toContain(`<title>${GAME.name}</title>`);
    expect(out).toContain(`<div class="wm">${GAME.wordmark}</div>`);
    expect(out).toContain(`<div class="wmSub">${GAME.subtitle}</div>`);
    expect(out).toContain(`content="${GAME.shortName}"`);
    expect(out).not.toMatch(/%GAME_/);
  });

  it('How to Play and the first tip use it', () => {
    expect(guidePages()[0]!.html).toContain(GAME.name);
    expect(TIPS[0]!.title).toContain(GAME.shortName);
  });

  it('GO-LIVE.md and the hub card use the full name', () => {
    expect(goLive).toContain(GAME.name);
  });
});

describe('C1: the web app manifest and icons', () => {
  const m = webManifest() as { name: string; short_name: string; display: string; orientation: string; start_url: string; theme_color: string; background_color: string; icons: { src: string; sizes: string; purpose: string }[] };

  it('has the name, colors, standalone display, and both orientations', () => {
    expect(m.name).toBe(GAME.name);
    expect(m.short_name).toBe('Epoch');
    expect(m.display).toBe('standalone');
    expect(m.orientation).toBe('any');
    expect(m.start_url).toBe('/');
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toBe('#001f57');
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });

  it('lists 192, 512, and a maskable 512, and each file exists at its size', () => {
    expect(m.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const icon of m.icons) {
      const file = ICONS[`../public${icon.src}`];
      expect(file, icon.src).toBeDefined();
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(file!)).toEqual([w, h]);
    }
  });

  it('index.html links the manifest, the Apple touch icon (180), and the favicons', () => {
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(indexHtml).toContain('apple-mobile-web-app-capable');
    expect(indexHtml).toContain('viewport-fit=cover');
    for (const [href, size] of [['/icons/apple-touch-icon-180.png', 180], ['/icons/favicon-48.png', 48], ['/icons/favicon-32.png', 32]] as const) {
      expect(indexHtml).toContain(`href="${href}"`);
      expect(pngSize(ICONS[`../public${href}`]!)).toEqual([size, size]);
    }
  });

  it('docs/APP-ICON.md says where the icons live', () => {
    expect(appIconDoc).toContain('public/icons/');
    for (const f of Object.keys(ICONS)) expect(appIconDoc).toContain(f.split('/').at(-1)!);
  });
});

describe('C2: what the service worker keeps offline', () => {
  const files = ['/index.html', '/manifest.webmanifest', '/sw.js', '/assets/index-abc.js', '/assets/index-abc.js.map', '/assets/rome-x.png',
    '/assets/tap-1.mp3', '/assets/music-theme-2.mp3', '/assets/music-modern-3.mp3', '/icons/icon-192.png', '/docs/sounds.html'];

  it('precaches the game, not the music, the worker itself, maps, or /docs/', () => {
    expect(precacheEntries(files)).toEqual(['/assets/index-abc.js', '/assets/rome-x.png', '/assets/tap-1.mp3', '/icons/icon-192.png', '/index.html', '/manifest.webmanifest']);
    expect(files.filter(isMusicFile)).toEqual(['/assets/music-theme-2.mp3', '/assets/music-modern-3.mp3']);
  });

  it('runs only in a built game, where the browser allows it', () => {
    expect(swWanted({ prod: true, hasServiceWorker: true, secure: true })).toBe(true);
    expect(swWanted({ prod: false, hasServiceWorker: true, secure: true })).toBe(false); // the dev server
    expect(swWanted({ prod: true, hasServiceWorker: false, secure: false })).toBe(false); // http on the LAN
    expect(swWanted({ prod: true, hasServiceWorker: true, secure: false })).toBe(false);
  });
});

// ---- the service worker itself, run against a fake browser -----------------------------------

class FakeResponse {
  constructor(public body: string, public status = 200) {}
  get ok() { return this.status >= 200 && this.status < 300; }
  clone() { return new FakeResponse(this.body, this.status); }
}

function fakeBrowser(version: string, precache: string[], media: string[], existing: Record<string, Record<string, FakeResponse>> = {}) {
  const store: Record<string, Map<string, FakeResponse>> = {};
  for (const [name, entries] of Object.entries(existing)) store[name] = new Map(Object.entries(entries));
  const fetched: string[] = [];
  const path = (r: string | { url: string }) => new URL(typeof r === 'string' ? r : r.url, 'https://epoch.test').pathname;
  const cache = (name: string) => {
    const m = (store[name] ??= new Map());
    return {
      addAll: async (urls: string[]) => { for (const u of urls) { fetched.push(u); m.set(u, new FakeResponse(`${version}:${u}`)); } },
      match: async (r: string | { url: string }) => m.get(path(r)),
      put: async (r: string, res: FakeResponse) => void m.set(path(r), res),
      keys: async () => [...m.keys()].map((k) => ({ url: `https://epoch.test${k}` })),
      delete: async (r: { url: string }) => m.delete(path(r)),
    };
  };
  const caches = {
    open: async (name: string) => cache(name),
    keys: async () => Object.keys(store),
    delete: async (name: string) => delete store[name],
  };
  let network = true;
  const fetch = async (r: { url: string }) => {
    if (!network) throw new Error('offline');
    fetched.push(path(r));
    return new FakeResponse(`net:${path(r)}`);
  };
  const handlers: Record<string, (e: unknown) => void> = {};
  let skipped = false;
  const self = {
    location: { origin: 'https://epoch.test' },
    addEventListener: (t: string, fn: (e: unknown) => void) => void (handlers[t] = fn),
    skipWaiting: () => void (skipped = true),
    clients: { claim: async () => undefined },
  };
  new Function('self', 'caches', 'fetch', 'VERSION', 'PRECACHE', 'MEDIA', swTemplate)(self, caches, fetch, version, precache, media);
  const wait = async (type: string, data?: unknown) => {
    let p: Promise<unknown> = Promise.resolve();
    handlers[type]!({ data, waitUntil: (x: Promise<unknown>) => void (p = x) });
    await p;
  };
  const request = async (url: string, mode = 'no-cors') => {
    let res: Promise<FakeResponse> | undefined;
    handlers.fetch!({ request: { url: `https://epoch.test${url}`, method: 'GET', mode }, respondWith: (x: Promise<FakeResponse>) => void (res = x) });
    return res ? (await res).body : 'passed through';
  };
  return { store, fetched, wait, request, offline: () => void (network = false), skipped: () => skipped };
}

describe('C2: the service worker', () => {
  const PRE = ['/index.html', '/assets/index-a.js', '/assets/tap-1.mp3'];
  const MEDIA = ['/assets/music-theme-2.mp3'];

  it('installs the game into its own cache, and waits (no skipWaiting of its own)', async () => {
    const b = fakeBrowser('v1', PRE, MEDIA);
    await b.wait('install');
    expect([...b.store['epoch-v1']!.keys()].sort()).toEqual([...PRE].sort());
    expect(b.skipped()).toBe(false);
    // The music isn't downloaded up front.
    expect(b.fetched).not.toContain(MEDIA[0]);
  });

  it('serves the page and the game from the cache when offline', async () => {
    const b = fakeBrowser('v1', PRE, MEDIA);
    await b.wait('install');
    await b.wait('activate');
    b.offline();
    expect(await b.request('/', 'navigate')).toBe('v1:/index.html');
    expect(await b.request('/some/deep/link', 'navigate')).toBe('v1:/index.html');
    expect(await b.request('/assets/index-a.js')).toBe('v1:/assets/index-a.js');
  });

  it('caches the music the first time it plays, then plays it offline', async () => {
    const b = fakeBrowser('v1', PRE, MEDIA);
    await b.wait('install');
    await b.wait('activate');
    expect(await b.request(MEDIA[0]!)).toBe(`net:${MEDIA[0]}`);
    b.offline();
    expect(await b.request(MEDIA[0]!)).toBe(`net:${MEDIA[0]}`);
    expect(b.store['epoch-media']!.has(MEDIA[0]!)).toBe(true);
  });

  it('takes over only when the page asks', async () => {
    const b = fakeBrowser('v2', PRE, MEDIA);
    await b.wait('install');
    expect(b.skipped()).toBe(false);
    await b.wait('message', { type: 'something else' });
    expect(b.skipped()).toBe(false);
    await b.wait('message', { type: 'SKIP_WAITING' });
    expect(b.skipped()).toBe(true);
  });

  it('on taking over, drops the old version and music no longer used, keeps the rest', async () => {
    const old = { '/index.html': new FakeResponse('v1:/index.html') };
    const b = fakeBrowser('v2', PRE, MEDIA, {
      'epoch-v1': old,
      'epoch-media': { [MEDIA[0]!]: new FakeResponse('theme'), '/assets/music-old-9.mp3': new FakeResponse('old') },
      'someone-else': old,
    });
    await b.wait('install');
    await b.wait('activate');
    expect(Object.keys(b.store).sort()).toEqual(['epoch-media', 'epoch-v2', 'someone-else']);
    expect([...b.store['epoch-media']!.keys()]).toEqual([MEDIA[0]]);
  });

  it('leaves /docs/ pages and other sites to the network', async () => {
    const b = fakeBrowser('v1', PRE, MEDIA);
    expect(await b.request('/docs/sounds.html')).toBe('passed through');
  });
});

// ---- the page side: noticing a new version --------------------------------------------------

function fakeContainer(opts: { controller: boolean; waiting?: boolean }) {
  const posted: unknown[] = [];
  const worker = (state: string): WorkerLike & { fire: () => void } => {
    let fn = () => {};
    const w = {
      state,
      postMessage: (m: unknown) => void posted.push(m),
      addEventListener: (_t: 'statechange', f: () => void) => void (fn = f),
      fire: () => fn(),
    };
    return w;
  };
  let onUpdateFound = () => {};
  let onControllerChange = () => {};
  let updates = 0;
  const reg: RegistrationLike = {
    waiting: opts.waiting ? worker('installed') : null,
    installing: null,
    addEventListener: (_t, fn) => void (onUpdateFound = fn),
    update: async () => void updates++,
  };
  const container: ContainerLike = {
    controller: opts.controller ? {} : null,
    register: async () => reg,
    addEventListener: (_t, fn) => void (onControllerChange = fn),
  };
  return {
    container, reg, posted,
    newVersion() {
      const w = worker('installing');
      reg.installing = w;
      onUpdateFound();
      w.state = 'installed';
      reg.waiting = w;
      w.fire();
    },
    controllerChange: () => onControllerChange(),
    updates: () => updates,
  };
}

describe('C2: "Update available" on the page', () => {
  it('a new version while playing shows the banner; nothing reloads until it is tapped', async () => {
    const f = fakeContainer({ controller: true });
    let apply: (() => void) | undefined;
    let reloads = 0;
    await watchForUpdates(f.container, { onUpdate: (a) => void (apply = a), reload: () => void reloads++ });
    expect(apply).toBeUndefined();
    f.newVersion();
    expect(apply).toBeDefined();
    expect(f.posted).toEqual([]);
    expect(reloads).toBe(0);
    apply!();
    expect(f.posted).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(reloads).toBe(0); // not until the new version has taken over
    f.controllerChange();
    expect(reloads).toBe(1);
  });

  it('the first install is not an update: no banner, and taking control does not reload', async () => {
    const f = fakeContainer({ controller: false });
    let shown = 0;
    let reloads = 0;
    await watchForUpdates(f.container, { onUpdate: () => void shown++, reload: () => void reloads++ });
    f.newVersion();
    f.controllerChange();
    expect(shown).toBe(0);
    expect(reloads).toBe(0);
  });

  it('a version that arrived while the game was closed shows the banner at once, once', async () => {
    const f = fakeContainer({ controller: true, waiting: true });
    let shown = 0;
    await watchForUpdates(f.container, { onUpdate: () => void shown++, reload: () => {} });
    f.newVersion();
    expect(shown).toBe(1);
  });

  it('checks for a new version every half hour and when the page comes back', async () => {
    const f = fakeContainer({ controller: true });
    let tick = () => {};
    let visible = () => {};
    let every = 0;
    await watchForUpdates(f.container, {
      onUpdate: () => {}, reload: () => {},
      every: (ms, fn) => { every = ms; tick = fn; },
      onVisible: (fn) => void (visible = fn),
    });
    expect(every).toBe(UPDATE_CHECK_MS);
    tick();
    visible();
    await Promise.resolve();
    expect(f.updates()).toBe(2);
  });
});

describe('B1, B3: the Round 15 goals', () => {
  it('each size has its own culture and gold goals, and Legendary adds 15%', async () => {
    const { victoryGoals } = await import('../src/data/mapSizes');
    expect(victoryGoals('small')).toEqual({ culture: 9200, gold: 7800 });
    expect(victoryGoals('normal')).toEqual({ culture: 8000, gold: 13000 });
    expect(victoryGoals('large')).toEqual({ culture: 10000, gold: 14950 });
    expect(victoryGoals('huge')).toEqual({ culture: 14000, gold: 19500 });
    expect(victoryGoals('epic')).toEqual({ culture: 11600, gold: 20800 });
    expect(victoryGoals('normal', 'legendary')).toEqual({ culture: 9200, gold: 14950 });
    expect(victoryGoals('normal', 'novice')).toEqual(victoryGoals('normal'));
  });
});
