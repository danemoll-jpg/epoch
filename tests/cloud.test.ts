// Round 16: cloud saves. The sync rules against the in-memory store (B1, B3, B6), slots (B2),
// compression (B4), the save file's link, the first load staying free of Firebase (A1), the
// device names, and the cloud dev scenarios (C3). firestore.rules itself: tests/firestore-rules.test.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gunzipText, gzipText } from '../src/cloud/compress';
import { deviceLabel } from '../src/cloud/device';
import { CloudSync, decide, freeSlot, STATUS_TEXT, type SlotMeta, type SyncHost, type SyncStatus } from '../src/cloud/sync';
import { authDomainFor, CLOUD, FIREBASE_CONFIG, SLOT_IDS } from '../src/data/firebase';
import { lateGame } from '../src/dev/fixtures/fixtures';
import { MemoryCloudStore, putSlot } from '../src/dev/memoryCloud';
import { SCENARIOS } from '../src/dev/scenarios';
import { applyAction } from '../src/game/actions';
import { deserializeGame, serializeGame, type CloudLink } from '../src/game/save';
import type { GameState } from '../src/game/types';
import { isCloudChunk, isOnDemandFile, precacheEntries } from '../src/pwa/files';
import { menuEntries, type MenuEntry } from '../src/ui/cloud';
import { backupCurrentSave, listBackups, loadOrStart, restoreBackup, saveToStorage, SAVE_KEY, type KeyValueStore } from '../src/ui/storage';
import { makeState } from './helpers';

const memStore = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

const link = (o: Partial<CloudLink> = {}): CloudLink => ({ gameId: 'g1', slot: 's1', uid: 'u1', syncedRev: 3, dirty: false, ...o });
const meta = (o: Partial<SlotMeta> = {}): SlotMeta => ({
  slot: 's1', gameId: 'g1', rev: 3, name: 'x', civId: 'egypt', leader: 'Hatshepsut', civName: 'Egypt', turn: 10, era: 'Ancient',
  mapSize: 'normal', difficulty: 'normal', savedAt: 0, device: 'PC', saveVersion: 12, bytes: 1, rawBytes: 1, ...o,
});

describe('B3: the keep-which rule', () => {
  it('cloud ahead, this device unchanged → take the cloud quietly', () => {
    expect(decide(link({ syncedRev: 3, dirty: false }), meta({ rev: 5 }))).toBe('pull');
  });
  it('this device changed, cloud unchanged → write it', () => {
    expect(decide(link({ syncedRev: 3, dirty: true }), meta({ rev: 3 }))).toBe('push');
  });
  it('both changed → ask', () => {
    expect(decide(link({ syncedRev: 3, dirty: true }), meta({ rev: 4 }))).toBe('ask');
  });
  it('in step → nothing; never uploaded, slot emptied, or slot reused → upload afresh', () => {
    expect(decide(link(), meta())).toBe('same');
    expect(decide(link({ slot: undefined }), undefined)).toBe('upload');
    expect(decide(link(), undefined)).toBe('upload');
    expect(decide(link(), meta({ gameId: 'another' }))).toBe('upload');
  });
  it('a cloud copy that went backwards is never overwritten quietly', () => {
    expect(decide(link({ syncedRev: 7 }), meta({ rev: 2 }))).toBe('ask');
  });
});

describe('B2: slots', () => {
  it('has at most 5 (s1..s5), taking the first free one', () => {
    expect(CLOUD.maxSlots).toBe(5);
    expect(SLOT_IDS).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(freeSlot([])).toBe('s1');
    expect(freeSlot([meta({ slot: 's1' }), meta({ slot: 's3' })])).toBe('s2');
    expect(freeSlot(SLOT_IDS.map((slot) => meta({ slot })))).toBeUndefined();
  });

  it('the store refuses a 6th slot, as firestore.rules does', async () => {
    const store = new MemoryCloudStore();
    await expect(store.write(meta({ slot: 's6', rev: 1 }), new Uint8Array(1), 0)).rejects.toMatchObject({ code: 'permission-denied' });
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain("slot in ['s1', 's2', 's3', 's4', 's5']");
    expect(rules).toContain('request.auth.uid == uid');
    expect(rules).toContain(`<= ${CLOUD.maxSaveBytes}`);
    expect(rules).toContain(`size() <= ${CLOUD.maxNameLength}`);
  });

  it('the menu folds the cloud copy of this game into it while in step, newest first', () => {
    const local: MenuEntry = { ...meta(), kind: 'local', where: '', savedAt: 500, device: 'PC' };
    const slots = [meta({ slot: 's1', gameId: 'g1', rev: 3, savedAt: 400 }), meta({ slot: 's2', gameId: 'g2', savedAt: 900, device: 'iPad' })];
    const inStep = menuEntries(local, link(), slots);
    expect(inStep.map((e) => [e.kind, e.slot, e.where])).toEqual([
      ['cloud', 's2', 'In the cloud'],
      ['local', 's1', 'On this device and in the cloud'],
    ]);
    // The cloud copy moved on elsewhere: both show.
    const ahead = menuEntries(local, link(), [meta({ rev: 6, savedAt: 800 })]);
    expect(ahead.map((e) => e.where)).toEqual(['In the cloud (newer than this device’s)', 'On this device']);
    // A new device with no game of its own: only the cloud games.
    expect(menuEntries(undefined, undefined, slots).map((e) => e.slot)).toEqual(['s2', 's1']);
  });
});

// ---- the background writer ----

interface Harness {
  store: MemoryCloudStore;
  sync: CloudSync;
  statuses: SyncStatus[];
  timers: { fn: () => void; ms: number }[];
  took: SlotMeta[];
  conflicts: SlotMeta[];
  game: { state: GameState; link: CloudLink; changes: number };
  change: (turn?: number) => void;
  settle: () => Promise<void>;
}

function harness(o: { link?: CloudLink; store?: MemoryCloudStore; online?: boolean; uid?: string } = {}): Harness {
  const store = o.store ?? new MemoryCloudStore();
  const h = {
    store,
    statuses: [] as SyncStatus[],
    timers: [] as { fn: () => void; ms: number }[],
    took: [] as SlotMeta[],
    conflicts: [] as SlotMeta[],
    game: { state: makeState(['ggg', 'ggg']), link: o.link ?? { gameId: 'g1', syncedRev: 0, dirty: true }, changes: 0 },
  } as Harness;
  const host: SyncHost = {
    current: () => h.game,
    setLink: (l) => void (h.game.link = l),
    take: (save) => void h.took.push(save.meta),
    conflict: (m) => void h.conflicts.push(m),
    status: (s) => void h.statuses.push(s),
    now: () => 1_000,
    online: () => o.online ?? true,
    setTimer: (fn, ms) => h.timers.push({ fn, ms }),
    clearTimer: () => {},
    device: 'PC',
  };
  h.sync = new CloudSync(store, o.uid ?? 'u1', host);
  h.change = (turn) => {
    if (turn !== undefined) h.game.state = { ...h.game.state, turn };
    h.game.link = { ...h.game.link, dirty: true };
    h.game.changes++;
  };
  h.settle = async () => {
    for (let i = 0; i < 50 && h.sync.busy; i++) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 5));
  };
  return h;
}

describe('B1: writing in the background', () => {
  it('uploads a new game to the first free slot, then writes each change with the next revision', async () => {
    const h = harness();
    h.sync.request();
    await h.settle();
    expect(h.game.link).toMatchObject({ slot: 's1', uid: 'u1', syncedRev: 1, dirty: false });
    expect(h.store.slots.get('s1')!.meta).toMatchObject({ rev: 1, gameId: 'g1', device: 'PC', turn: h.game.state.turn });
    h.change(7);
    h.sync.request();
    await h.settle();
    expect(h.game.link.syncedRev).toBe(2);
    const back = deserializeGame(await gunzipText(h.store.slots.get('s1')!.data));
    expect(back.kind === 'ok' && back.state.turn).toBe(7);
    expect(h.statuses.at(-1)).toBe('saved');
  });

  it('nothing to write when in step', async () => {
    const h = harness();
    h.sync.request();
    await h.settle();
    const writes = h.store.writes;
    h.sync.request();
    await h.settle();
    expect(h.store.writes).toBe(writes);
  });

  it('coalesces: one write in flight at a time, and the newest game wins', async () => {
    const h = harness();
    h.store.delayMs = 20;
    let inFlight = 0;
    let most = 0;
    const write = h.store.write.bind(h.store);
    h.store.write = async (...a) => {
      most = Math.max(most, ++inFlight);
      try {
        return await write(...a);
      } finally {
        inFlight--;
      }
    };
    for (let t = 2; t <= 6; t++) {
      h.change(t);
      h.sync.request();
      await new Promise((r) => setTimeout(r, 3));
    }
    await h.settle();
    expect(most).toBe(1);
    expect(h.store.writes).toBeLessThan(5);
    const back = deserializeGame(await gunzipText(h.store.slots.get('s1')!.data));
    expect(back.kind === 'ok' && back.state.turn).toBe(6);
    expect(h.game.link.dirty).toBe(false);
  });

  it('a slow network never holds up the game: request() returns at once and End Turn runs meanwhile', async () => {
    const h = harness();
    h.store.delayMs = 200;
    const state = makeState(['ggg', 'ggg']);
    h.game.state = state;
    const t0 = performance.now();
    h.sync.request();
    expect(performance.now() - t0).toBeLessThan(50);
    expect(h.sync.busy).toBe(true);
    expect(applyAction(state, { type: 'endTurn' }).ok).toBe(true);
    expect(h.store.writes).toBe(0);
    await h.settle();
    expect(h.store.writes).toBe(1);
  });

  it('offline: says so, retries with growing waits, never a pop-up, and syncs once back', async () => {
    const h = harness({ online: false });
    h.store.failNext = 3;
    h.sync.request();
    await h.settle();
    expect(h.statuses.at(-1)).toBe('offline');
    for (let i = 0; i < 3; i++) {
      const t = h.timers.shift()!;
      t.fn();
      await h.settle();
    }
    expect(h.store.writes).toBe(1);
    expect(h.statuses.at(-1)).toBe('saved');
    expect(STATUS_TEXT.offline).toBe('Offline: will sync');
    expect(STATUS_TEXT.saved).toBe('Saved to cloud ✓');
  });

  it('backs off 2 s, 4 s, 8 s … up to a minute', async () => {
    const h = harness();
    h.store.offline = true;
    h.sync.request();
    await h.settle();
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t = h.timers.shift()!;
      waits.push(t.ms);
      t.fn();
      await h.settle();
    }
    expect(waits).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  });

  it('a failure that is not the network says "will retry" and keeps trying', async () => {
    const h = harness();
    const write = h.store.write.bind(h.store);
    let fails = 1;
    h.store.write = async (...a) => {
      if (fails-- > 0) throw Object.assign(new Error('boom'), { code: 'internal' });
      return write(...a);
    };
    h.sync.request();
    await h.settle();
    expect(h.statuses.at(-1)).toBe('retrying');
    h.timers.shift()!.fn();
    await h.settle();
    expect(h.statuses.at(-1)).toBe('saved');
  });

  it('when the cloud copy moved on meanwhile, asks instead of writing', async () => {
    const store = new MemoryCloudStore();
    const other = makeState(['ggg', 'ggg']);
    other.turn = 20;
    await putSlot(store, other, { slot: 's1', gameId: 'g1', rev: 5, device: 'iPad', agoMs: 0 });
    const h = harness({ store, link: link({ syncedRev: 3, dirty: true }) });
    h.sync.request();
    await h.settle();
    expect(h.conflicts.map((m) => m.rev)).toEqual([5]);
    expect(h.statuses.at(-1)).toBe('conflict');
    expect(store.slots.get('s1')!.meta.rev).toBe(5);
    // No writes while the question is open…
    h.change();
    h.sync.request();
    await h.settle();
    expect(store.writes).toBe(0);
    // …and "keep this device's" writes over it (the caller backs the cloud's up first).
    h.sync.keepLocal(h.conflicts[0]!);
    await h.settle();
    expect(store.slots.get('s1')!.meta).toMatchObject({ rev: 6, device: 'PC' });
  });

  it('a slot emptied elsewhere: the game finds a new one; all 5 taken: "Cloud full"', async () => {
    const store = new MemoryCloudStore();
    const h = harness({ store, link: link({ slot: 's2', syncedRev: 4, dirty: true }) });
    h.sync.request();
    await h.settle();
    expect(h.game.link).toMatchObject({ slot: 's1', syncedRev: 1 });
    const full = new MemoryCloudStore();
    for (const slot of SLOT_IDS) await putSlot(full, makeState(['ggg', 'ggg']), { slot, gameId: `other-${slot}`, rev: 1, device: 'PC', agoMs: 0 });
    const h2 = harness({ store: full });
    h2.sync.request();
    await h2.settle();
    expect(h2.statuses.at(-1)).toBe('full');
    expect(full.writes).toBe(0);
  });

  it("leaves another account's game alone", async () => {
    const h = harness({ link: link({ uid: 'someone-else', dirty: true }) });
    h.sync.request();
    await h.settle();
    expect(h.store.writes).toBe(0);
    expect(h.statuses.at(-1)).toBe('otherAccount');
  });
});

describe('B3: checking on open, and coming back', () => {
  async function withCloud(rev: number, l: CloudLink) {
    const store = new MemoryCloudStore();
    const s = makeState(['ggg', 'ggg']);
    s.turn = 30;
    await putSlot(store, s, { slot: 's1', gameId: 'g1', rev, device: 'iPad', agoMs: 0 });
    return harness({ store, link: l });
  }
  it('takes a newer cloud copy quietly when this device has not changed', async () => {
    const h = await withCloud(5, link({ syncedRev: 3 }));
    expect(await h.sync.check()).toBe('pull');
    expect(h.took.map((m) => m.turn)).toEqual([30]);
    expect(h.conflicts).toEqual([]);
  });
  it('writes when only this device changed', async () => {
    const h = await withCloud(3, link({ syncedRev: 3, dirty: true }));
    expect(await h.sync.check()).toBe('push');
    await h.settle();
    expect(h.store.slots.get('s1')!.meta.rev).toBe(4);
  });
  it('asks when both changed', async () => {
    const h = await withCloud(5, link({ syncedRev: 3, dirty: true }));
    expect(await h.sync.check()).toBe('ask');
    expect(h.conflicts.map((m) => m.turn)).toEqual([30]);
    expect(h.store.writes).toBe(0);
  });
  it('offline: nothing changes, and says so', async () => {
    const h = await withCloud(5, link({ syncedRev: 3 }));
    h.store.offline = true;
    expect(await h.sync.check()).toBeUndefined();
    expect(h.statuses.at(-1)).toBe('offline');
    expect(h.took).toEqual([]);
  });
});

describe('B3: the one not kept goes into the backups', () => {
  it('the save file carries the link, and a backup keeps it', () => {
    const store = memStore();
    const s = makeState(['ggg', 'ggg']);
    const l = link({ dirty: true });
    saveToStorage(s, store, l);
    const r = deserializeGame(store.getItem(SAVE_KEY)!);
    expect(r.kind === 'ok' && r.cloud).toEqual(l);
    expect(backupCurrentSave('Replaced by the cloud copy', 5, store)).toBe(true);
    expect(listBackups(store)[0]).toMatchObject({ reason: 'Replaced by the cloud copy', loadable: true });
    const restored = restoreBackup(1, 6, store);
    expect(restored.ok && restored.cloud).toEqual(l);
    const start = loadOrStart({ forceNew: false, newGame: () => s, now: 7 }, store);
    expect(start.cloud).toEqual(l);
    // An old save without a link still loads (no link, no version bump needed).
    const plain = deserializeGame(serializeGame(s, 1));
    expect(plain.kind === 'ok' && plain.cloud).toBeUndefined();
  });
});

describe('B4: compression', () => {
  it('round-trips a save with the browser streams and with the fallback, and each reads the other', async () => {
    const text = serializeGame(makeState(['ggg', 'ggg']), 1);
    for (const w of [true, false]) for (const r of [true, false]) expect(await gunzipText(await gzipText(text, w), r)).toBe(text);
  });

  it('an Epic save late in a game (the turn-151 fixture) fits far inside the limit', async () => {
    const s = lateGame('epic');
    const text = serializeGame(s, 1);
    const gz = await gzipText(text);
    expect(await gunzipText(gz)).toBe(text);
    expect(await gunzipText(await gzipText(text, false), true)).toBe(text);
    expect(gz.length).toBeLessThan(text.length / 5);
    expect(gz.length).toBeLessThan(CLOUD.maxSaveBytes / 10);
    const back = deserializeGame(await gunzipText(gz));
    expect(back.kind).toBe('ok');
  });
});

describe('A1: Firebase only when needed', () => {
  /** Every module main.ts loads up front: static imports only (import() starts a separate chunk). */
  function firstLoadGraph(): Set<string> {
    const seen = new Set<string>();
    const packages = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm)) {
        const spec = m[1] ?? m[2]!;
        if (!spec.startsWith('.')) {
          packages.add(spec);
          continue;
        }
        const base = resolve(dirname(file), spec.replace(/\?raw$/, ''));
        for (const f of [base, `${base}.ts`, join(base, 'index.ts')]) {
          try {
            if (f.endsWith('.ts')) {
              readFileSync(f);
              visit(f);
              break;
            }
          } catch {
            // try the next
          }
        }
      }
    };
    visit(resolve('src/main.ts'));
    for (const p of packages) seen.add(`pkg:${p}`);
    return seen;
  }

  it("main.ts's static imports never reach the Firebase SDK or the Firebase module", () => {
    const g = [...firstLoadGraph()];
    expect(g.some((f) => f.includes('src/cloud/sync.ts') || f.includes('src\\cloud\\sync.ts'))).toBe(true);
    expect(g.filter((f) => /pkg:(@?firebase|fflate)/.test(f))).toEqual([]);
    expect(g.filter((f) => /cloud[\\/](firebase|gzipFallback)\.ts$/.test(f))).toEqual([]);
  });

  it('the build check fails a build with Firebase in the first load', () => {
    const check = readFileSync('scripts/check-dist.mjs', 'utf8');
    expect(check).toContain('FirebaseError');
    expect(check).toContain('modulepreload'.slice(0, 0) + 'firstLoad');
  });

  it('the service worker keeps the cloud code only once used, and never handles sign-in pages', () => {
    expect(isCloudChunk('/assets/firebase-CH7aDDhk.js')).toBe(true);
    expect(isCloudChunk('/assets/gzipFallback-abc.js')).toBe(true);
    expect(isCloudChunk('/assets/index-abc.js')).toBe(false);
    expect(precacheEntries(['/assets/firebase-x.js', '/assets/index-y.js'])).toEqual(['/assets/index-y.js']);
    expect(isOnDemandFile('/assets/music-theme-2.mp3')).toBe(true);
    expect(readFileSync('src/pwa/sw-template.js', 'utf8')).toContain("url.pathname.startsWith('/__/')");
  });
});

describe('A2: sign-in on our own domain', () => {
  it('uses the Netlify address as authDomain there (the proxy), the project default elsewhere', () => {
    expect(authDomainFor('epoch-fsts.netlify.app')).toBe('epoch-fsts.netlify.app');
    expect(authDomainFor('localhost:5174')).toBe(FIREBASE_CONFIG.authDomain);
  });
  it('netlify.toml passes /__/auth and /__/firebase through before the catch-all', () => {
    const toml = readFileSync('netlify.toml', 'utf8');
    const auth = toml.indexOf('from = "/__/auth/*"');
    const fb = toml.indexOf('from = "/__/firebase/*"');
    const spa = toml.indexOf('from = "/*"');
    expect(auth).toBeGreaterThan(0);
    expect(fb).toBeGreaterThan(0);
    expect(auth).toBeLessThan(spa);
    expect(fb).toBeLessThan(spa);
    expect(toml).toContain(`to = "https://${FIREBASE_CONFIG.authDomain}/__/auth/:splat"`);
  });
});

describe('device names', () => {
  it('tells an iPad (even when it says Macintosh) from a PC and a Mac', () => {
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    expect(deviceLabel(ipad, 5)).toBe('iPad');
    expect(deviceLabel(ipad, 0)).toBe('Mac');
    expect(deviceLabel('Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)', 5)).toBe('iPad');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140', 0)).toBe('PC');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('iPhone');
  });
});

describe('C3: the cloud scenarios', () => {
  async function run(id: string) {
    const sc = SCENARIOS.find((s) => s.id === id)!;
    const c = sc.cloud!();
    const backend = await c.backend();
    const state = sc.build();
    const h = harness({ store: c.store, link: c.link, uid: 'dev-user' });
    h.game.state = state;
    void backend;
    return { h, c, state };
  }

  it('cloud-conflict asks, showing turn 12 here and turn 15 from the iPad', async () => {
    const { h, state } = await run('cloud-conflict');
    expect(state.turn).toBe(12);
    expect(await h.sync.check()).toBe('ask');
    expect(h.conflicts[0]).toMatchObject({ turn: 15, device: 'iPad' });
  });

  it('cloud-offline says "Offline: will sync", then writes once the network is back', async () => {
    const { h, c } = await run('cloud-offline');
    h.change();
    h.sync.request();
    await h.settle();
    expect(h.statuses.at(-1)).toBe('offline');
    c.store.offline = false;
    h.timers.shift()!.fn();
    await h.settle();
    expect(h.statuses.at(-1)).toBe('saved');
    expect(c.store.slots.get('s1')!.meta.rev).toBe(3);
  });

  it('cloud-slots has three cloud games, and the game here goes up into the 4th slot', async () => {
    const { h, c } = await run('cloud-slots');
    expect([...c.store.slots.values()].map((s) => s.meta.turn).sort((a, b) => a - b)).toEqual([34, 87, 143]);
    expect(await h.sync.check()).toBe('upload');
    await h.settle();
    expect(c.store.slots.size).toBe(4);
    expect(h.game.link.slot).toBe('s4');
  });
});

describe('docs', () => {
  it('docs/FIREBASE-SETUP.md covers the console steps', () => {
    const doc = readFileSync('docs/FIREBASE-SETUP.md', 'utf8');
    expect(doc).toContain('https://epoch-fsts.netlify.app/__/auth/handler');
    expect(doc).toContain('firestore.rules');
    expect(readdirSync('.')).toContain('firestore.rules');
  });
});
