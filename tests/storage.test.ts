// Save safety (round 4, A2): a save is never thrown away. Every path that replaces the saved
// game first copies it to a backup; only MAX_BACKUPS are kept; a backup restores.

import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/newGame';
import { serializeGame } from '../src/game/save';
import { STATE_VERSION, type GameState } from '../src/game/types';
import {
  BACKUP_PREFIX,
  MAX_BACKUPS,
  SAVE_KEY,
  backupCurrentSave,
  listBackups,
  loadOrStart,
  restoreBackup,
  type KeyValueStore,
} from '../src/ui/storage';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  /** When set, writes to keys starting with this throw (like a full localStorage). */
  failWrites?: string;
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites !== undefined && k.startsWith(this.failWrites)) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  backups(): string[] {
    return [...this.data.keys()].filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
  }
}

let seed = 100;
const newGame = (): GameState => createGame({ seed: seed++, playerCount: 2 });
const start = (store: MemoryStore, forceNew = false) => loadOrStart({ forceNew, newGame, now: 1_000 }, store);

function savedGame(turn: number): string {
  const s = createGame({ seed: 1, playerCount: 2 });
  s.turn = turn;
  return serializeGame(s, 5_000);
}

/** The text in backup slot 1. */
function newestBackup(store: MemoryStore): string {
  return JSON.parse(store.getItem(BACKUP_PREFIX + 1)!).text;
}

describe('startup never discards a save', () => {
  it('no save: new game, no backup', () => {
    const store = new MemoryStore();
    const res = start(store);
    expect(res.autosave).toBe(true);
    expect(store.getItem(SAVE_KEY)).not.toBeNull();
    expect(store.backups()).toEqual([]);
  });

  it('a good save resumes, no backup', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, savedGame(12));
    const res = start(store);
    expect(res.state.turn).toBe(12);
    expect(res.notice).toContain('Resumed');
    expect(store.backups()).toEqual([]);
  });

  const discards: [string, string][] = [
    ['an incompatible (future) version', JSON.stringify({ ...JSON.parse(savedGame(3)), saveVersion: 99 })],
    ['an old version with no migration', JSON.stringify({ saveVersion: 1, state: { version: 1 } })],
    ['corrupt JSON', '{not json'],
    ['a damaged state', JSON.stringify({ ...JSON.parse(savedGame(3)), state: { ...JSON.parse(savedGame(3)).state, map: null } })],
    [
      'a migration that fails',
      // A v2 save whose players aren't objects: the migration chain can't run.
      JSON.stringify({ saveVersion: 2, savedAt: 1, state: { version: 2, players: [1, 2], cities: [], units: [] } }),
    ],
  ];

  it.each(discards)('%s: backed up first, then a new game', (_name, text) => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, text);
    const res = start(store);
    expect(res.autosave).toBe(true);
    expect(res.notice).toContain('Restore a backup');
    expect(newestBackup(store)).toBe(text); // exactly as it was
    expect(store.getItem(SAVE_KEY)).not.toBe(text); // the new game is saved in its place
  });

  it('?new: the current game is backed up first', () => {
    const store = new MemoryStore();
    const text = savedGame(40);
    store.setItem(SAVE_KEY, text);
    const res = start(store, true);
    expect(res.state.turn).toBe(1);
    expect(newestBackup(store)).toBe(text);
  });

  it('an upgraded (migrated) save keeps the pre-upgrade version as a backup', () => {
    const store = new MemoryStore();
    const raw = JSON.parse(savedGame(9));
    raw.saveVersion = 3;
    raw.state.version = 3;
    delete raw.state.atWar;
    delete raw.state.diplomacy;
    delete raw.state.aiPlans;
    for (const u of raw.state.units) delete u.fortified, delete u.army;
    const old = JSON.stringify(raw);
    store.setItem(SAVE_KEY, old);
    const res = start(store);
    expect(res.state.turn).toBe(9);
    expect(res.notice).toContain('combat and armies');
    expect(newestBackup(store)).toBe(old);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).saveVersion).toBe(STATE_VERSION);
  });

  it('if the backup can’t be written, the old save is left untouched and autosave is off', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, '{broken');
    store.failWrites = BACKUP_PREFIX;
    const res = start(store);
    expect(res.autosave).toBe(false);
    expect(store.getItem(SAVE_KEY)).toBe('{broken');
    expect(res.notice).toContain("couldn't be backed up");
  });
});

describe('backups', () => {
  it(`keeps only the newest ${MAX_BACKUPS}, newest first`, () => {
    const store = new MemoryStore();
    for (let t = 1; t <= MAX_BACKUPS + 2; t++) {
      store.setItem(SAVE_KEY, savedGame(t));
      expect(backupCurrentSave(`game ${t}`, t * 1000, store)).toBe(true);
    }
    expect(store.backups()).toHaveLength(MAX_BACKUPS);
    const list = listBackups(store);
    expect(list.map((b) => b.turn)).toEqual([5, 4, 3]);
    expect(list.map((b) => b.reason)).toEqual(['game 5', 'game 4', 'game 3']);
    expect(list[0]).toMatchObject({ slot: 1, backedUpAt: 5000, savedAt: 5000, saveVersion: STATE_VERSION, loadable: true });
  });

  it('lists unloadable backups with a plain reason', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, '{broken');
    backupCurrentSave('damaged', 1, store);
    store.setItem(SAVE_KEY, JSON.stringify({ ...JSON.parse(savedGame(2)), saveVersion: 99 }));
    backupCurrentSave('future', 2, store);
    const [future, damaged] = listBackups(store);
    expect(future).toMatchObject({ loadable: false, saveVersion: 99, turn: 2 });
    expect(future!.problem).toContain('version 99');
    expect(damaged).toMatchObject({ loadable: false });
    expect(damaged!.problem).toContain('damaged');
    expect(restoreBackup(1, 3, store)).toMatchObject({ ok: false });
  });

  it('a restore round-trips, and the replaced game becomes a backup', () => {
    const store = new MemoryStore();
    const a = savedGame(30);
    store.setItem(SAVE_KEY, a);
    backupCurrentSave('Replaced by New Game', 1, store);
    const b = savedGame(2);
    store.setItem(SAVE_KEY, b); // the new game in play
    const res = restoreBackup(1, 2, store);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state).toEqual(JSON.parse(a).state);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).state).toEqual(JSON.parse(a).state);
    // Both games are still around: the replaced one in slot 1, the restored one in slot 2.
    expect(listBackups(store).map((x) => x.turn)).toEqual([2, 30]);
  });

  it('restore does nothing if the current game can’t be backed up first', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, savedGame(30));
    backupCurrentSave('x', 1, store);
    const current = savedGame(5);
    store.setItem(SAVE_KEY, current);
    store.failWrites = BACKUP_PREFIX;
    expect(restoreBackup(1, 2, store).ok).toBe(false);
    expect(store.getItem(SAVE_KEY)).toBe(current);
  });

  it('backing up with no save is a no-op', () => {
    const store = new MemoryStore();
    expect(backupCurrentSave('x', 1, store)).toBe(true);
    expect(store.backups()).toEqual([]);
  });
});
