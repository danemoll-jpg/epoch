// Autosave storage: localStorage. It's synchronous, so a save made in a pagehide or
// visibilitychange handler finishes before Safari freezes or kills the tab (an async
// IndexedDB write might not). The state is small (tens of KB), well within its limits.
//
// A save is never thrown away. Before the saved game is replaced by anything other than
// its own next autosave (it can't be loaded, it's being upgraded to a new version, New Game,
// ?new, or restoring a backup), its exact text is copied to a backup slot. The last
// MAX_BACKUPS are kept, newest in slot 1. ☰ → Restore a backup lists them.
//
// Every function takes the store as a parameter (localStorage by default) so the rules
// here are unit-tested without a browser.

import { deserializeGame, migrationSummary, serializeGame, type LoadResult } from '../game/save';
import type { GameState } from '../game/types';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'epoch.autosave';
export const BACKUP_PREFIX = 'epoch.autosave.backup.';
export const MAX_BACKUPS = 3;

// Lazy: in some private modes even reading `localStorage` throws, and callers catch that.
const browserStore = (): KeyValueStore => ({
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
});

export function saveToStorage(state: GameState, store: KeyValueStore = browserStore()): boolean {
  try {
    store.setItem(SAVE_KEY, serializeGame(state, Date.now()));
    return true;
  } catch (e) {
    // Private browsing or storage full: keep playing, just without autosave.
    console.warn('Epoch: autosave failed', e);
    return false;
  }
}

// ---- backups ---------------------------------------------------------------------------------

interface BackupRecord {
  /** Wall-clock ms when the backup was made. */
  backedUpAt: number;
  /** Why, in plain words ("Replaced by New Game"). */
  reason: string;
  /** The save exactly as it was, even if it can't be parsed. */
  text: string;
}

export interface BackupInfo {
  slot: number;
  backedUpAt: number;
  reason: string;
  /** From inside the save, when it can be read at all. */
  turn?: number;
  saveVersion?: number;
  savedAt?: number;
  /** Can this backup be loaded (possibly after upgrading)? */
  loadable: boolean;
  /** Why it can't be loaded, in plain words. */
  problem?: string;
}

/**
 * Copies whatever is in the save slot to backup slot 1, shifting older backups down and
 * dropping the oldest past MAX_BACKUPS. True if there was nothing to back up or it worked.
 */
export function backupCurrentSave(reason: string, now: number, store: KeyValueStore = browserStore()): boolean {
  try {
    const text = store.getItem(SAVE_KEY);
    if (text === null) return true;
    for (let slot = MAX_BACKUPS; slot > 1; slot--) {
      const older = store.getItem(BACKUP_PREFIX + (slot - 1));
      if (older === null) store.removeItem(BACKUP_PREFIX + slot);
      else store.setItem(BACKUP_PREFIX + slot, older);
    }
    const record: BackupRecord = { backedUpAt: now, reason, text };
    store.setItem(BACKUP_PREFIX + 1, JSON.stringify(record));
    return true;
  } catch (e) {
    console.warn('Epoch: backup failed', e);
    return false;
  }
}

function readBackup(slot: number, store: KeyValueStore): BackupRecord | undefined {
  try {
    const raw = store.getItem(BACKUP_PREFIX + slot);
    if (raw === null) return undefined;
    const rec = JSON.parse(raw) as BackupRecord;
    return typeof rec?.text === 'string' ? rec : undefined;
  } catch {
    return undefined;
  }
}

function safeLoad(text: string): LoadResult {
  try {
    return deserializeGame(text);
  } catch (e) {
    return { kind: 'corrupt', error: `load failed: ${String(e)}` };
  }
}

function problemText(res: LoadResult): string | undefined {
  if (res.kind === 'incompatible') {
    return typeof res.saveVersion === 'number'
      ? `It's from version ${res.saveVersion} of Epoch, which this version can't read.`
      : "It isn't an Epoch save this version can read.";
  }
  if (res.kind === 'corrupt') return "It's damaged and can't be read.";
  return undefined;
}

export function listBackups(store: KeyValueStore = browserStore()): BackupInfo[] {
  const out: BackupInfo[] = [];
  for (let slot = 1; slot <= MAX_BACKUPS; slot++) {
    const rec = readBackup(slot, store);
    if (!rec) continue;
    const info: BackupInfo = { slot, backedUpAt: rec.backedUpAt, reason: rec.reason, loadable: false };
    try {
      const file = JSON.parse(rec.text);
      if (typeof file?.saveVersion === 'number') info.saveVersion = file.saveVersion;
      if (typeof file?.savedAt === 'number') info.savedAt = file.savedAt;
      if (typeof file?.state?.turn === 'number') info.turn = file.state.turn;
    } catch {
      // Unreadable: shown with what we know (when and why it was kept).
    }
    const res = safeLoad(rec.text);
    info.loadable = res.kind === 'ok';
    info.problem = problemText(res);
    out.push(info);
  }
  return out;
}

export type RestoreResult = { ok: true; state: GameState; migratedFrom?: number } | { ok: false; reason: string };

/**
 * Loads backup `slot` as the current game. The game being replaced is backed up first, and
 * the restored backup stays in the list too.
 */
export function restoreBackup(slot: number, now: number, store: KeyValueStore = browserStore()): RestoreResult {
  const rec = readBackup(slot, store);
  if (!rec) return { ok: false, reason: 'That backup is gone.' };
  const res = safeLoad(rec.text);
  if (res.kind !== 'ok') return { ok: false, reason: problemText(res)! };
  if (!backupCurrentSave('Replaced by restoring a backup', now, store)) {
    return { ok: false, reason: "There's no room to back up your current game first, so nothing was changed." };
  }
  saveToStorage(res.state, store);
  return res.migratedFrom ? { ok: true, state: res.state, migratedFrom: res.migratedFrom } : { ok: true, state: res.state };
}

// ---- startup ---------------------------------------------------------------------------------

export interface StartupResult {
  state: GameState;
  notice?: string;
  /** False when an old save couldn't be backed up: it's left in place, untouched. */
  autosave: boolean;
  /**
   * Round 13: there was no saved game, and `saveFresh` was false, so `state` is only a stand-in
   * behind the main menu: it isn't saved, and New Game replaces it without a backup.
   */
  placeholder?: boolean;
}

const RESTORE_HINT = '☰ → Restore a backup';

/**
 * Loads the saved game, or starts a new one. Any save that is about to be replaced gets a
 * backup first. If that backup can't be made, the old save stays where it is and the new
 * game is not autosaved, so nothing is ever lost.
 */
export function loadOrStart(
  opts: { forceNew: boolean; newGame: () => GameState; now: number; saveFresh?: boolean },
  store: KeyValueStore = browserStore(),
): StartupResult {
  const saveFresh = opts.saveFresh ?? true;
  let text: string | null;
  try {
    text = store.getItem(SAVE_KEY);
  } catch {
    // Storage unavailable (e.g. blocked): play on; saving will just fail quietly.
    return saveFresh ? { state: opts.newGame(), autosave: true } : { state: opts.newGame(), autosave: true, placeholder: true };
  }

  /** A new game. `lead` starts the notice; `reason` (if any) means the old save gets a backup. */
  const fresh = (lead: string | undefined, reason: string | undefined): StartupResult => {
    const state = opts.newGame();
    if (!reason) {
      saveToStorage(state, store);
      return { state, autosave: true, notice: lead };
    }
    if (!backupCurrentSave(reason, opts.now, store)) {
      return {
        state,
        autosave: false,
        notice: `${lead} Your old save couldn't be backed up (storage is full), so it was left untouched and this game won't be saved.`,
      };
    }
    saveToStorage(state, store);
    return { state, autosave: true, notice: `${lead} Your old game was kept: ${RESTORE_HINT}.` };
  };

  // Round 13: with the main menu, "no save" means no game yet: the menu offers New Game.
  if (text === null && !saveFresh && !opts.forceNew) return { state: opts.newGame(), autosave: true, placeholder: true };
  if (text === null) return fresh(undefined, undefined);
  if (opts.forceNew) return fresh('Started a new game (?new).', 'Replaced by ?new');

  const res = safeLoad(text);
  if (res.kind === 'ok') {
    if (!res.migratedFrom) {
      return { state: res.state, autosave: true, notice: `Resumed your game (turn ${res.state.turn})` };
    }
    const updated = `Your saved game was updated for ${migrationSummary(res.migratedFrom)} (turn ${res.state.turn}).`;
    // The pre-upgrade save is kept exactly as it was, then the upgraded one is written.
    if (!backupCurrentSave(`Upgraded from version ${res.migratedFrom}`, opts.now, store)) {
      return { state: res.state, autosave: false, notice: `${updated} Storage is full, so it won't be saved.` };
    }
    saveToStorage(res.state, store);
    return { state: res.state, autosave: true, notice: `${updated} The old version was kept as a backup.` };
  }
  if (res.kind === 'corrupt') console.warn('Epoch: saved game unreadable:', res.error);
  const why = res.kind === 'incompatible' ? 'is from a version of Epoch this one can’t read' : 'couldn’t be read';
  return fresh(
    `Your saved game ${why}, so a new game has started.`,
    res.kind === 'incompatible' ? "Couldn't be loaded (other version)" : "Couldn't be loaded (damaged)",
  );
}
