// Round 16: cloud saves. The rules for keeping a game in step with its cloud copy, and the
// background writer. Pure apart from the store, the clock, and the timers it's handed, so all of
// it is unit-tested against an in-memory store (src/dev/memoryCloud.ts).
//
// Local saves stay primary: the game always saves to the device first, exactly as before. When
// the player is signed in, the cloud copy is written in the background after End Turn (once the
// rivals have moved), when the game is hidden, and on pagehide. At most one write is in flight;
// a newer request while one is running just means "write again after it", with the newest game.
//
// Each slot carries a revision counter (`rev`, +1 per write) and the device that wrote it. A
// copy on a device remembers the revision it was based on (`CloudLink.syncedRev`) and whether it
// has changed since (`dirty`). So, for the same game:
//   the cloud is ahead and this device hasn't changed → take the cloud quietly;
//   this device changed and the cloud hasn't         → write it;
//   both changed                                      → ask which to keep (never overwrite).

import { CLOUD, SLOT_IDS } from '../data/firebase';
import { eraName, playerEra } from '../game/tech';
import { civDef } from '../game/diplomacy';
import { serializeGame, SAVE_VERSION, type CloudLink } from '../game/save';
import type { GameState } from '../game/types';
import { gzipText } from './compress';

/** A slot's index entry: everything the main menu shows, without the save itself. */
export interface SlotMeta {
  slot: string;
  gameId: string;
  rev: number;
  name: string;
  civId: string;
  leader: string;
  civName: string;
  turn: number;
  era: string;
  mapSize: string;
  difficulty: string;
  /** Wall-clock ms of the write, and the kind of device that made it ("iPad", "PC"). */
  savedAt: number;
  device: string;
  saveVersion: number;
  /** The save's size gzipped, and before. */
  bytes: number;
  rawBytes: number;
}

/** A save as downloaded: its index entry and the gzipped save file. */
export interface SlotSave {
  meta: SlotMeta;
  data: Uint8Array;
}

export type WriteResult = { ok: true } | { ok: false; current: SlotMeta | undefined };

/** One signed-in player's cloud: Firestore in the game (src/cloud/firebase.ts), memory in tests. */
export interface CloudStore {
  list(): Promise<SlotMeta[]>;
  meta(slot: string): Promise<SlotMeta | undefined>;
  read(slot: string): Promise<SlotSave | undefined>;
  /**
   * Writes `meta` and `data` to `meta.slot`, whose revision must still be `expectRev` (0: the
   * slot must be empty); `meta.rev` is `expectRev + 1`. Otherwise nothing is written and the
   * slot's current entry comes back.
   */
  write(meta: SlotMeta, data: Uint8Array, expectRev: number): Promise<WriteResult>;
  rename(slot: string, name: string): Promise<void>;
  remove(slot: string): Promise<void>;
}

export type SyncDecision = 'same' | 'push' | 'pull' | 'ask' | 'upload';

/** The B3 rule: what to do with this device's copy of a game and its cloud slot's entry. */
export function decide(link: CloudLink, cloud: SlotMeta | undefined): SyncDecision {
  // Never uploaded, or its slot was emptied or now holds another game: upload it afresh.
  if (!link.slot || !cloud || cloud.gameId !== link.gameId) return 'upload';
  if (cloud.rev === link.syncedRev) return link.dirty ? 'push' : 'same';
  if (cloud.rev > link.syncedRev && !link.dirty) return 'pull';
  // Both changed (or the cloud went backwards, which only a deleted and re-made slot does).
  return 'ask';
}

/** The first empty slot, if any (at most CLOUD.maxSlots; firestore.rules allows no other ids). */
export function freeSlot(used: SlotMeta[]): string | undefined {
  return SLOT_IDS.find((id) => !used.some((m) => m.slot === id));
}

/** The name a new slot gets: "Hatshepsut of Egypt". */
export function defaultSlotName(state: GameState): string {
  const def = civDef(state, 0);
  return `${def.leader} of ${def.name}`.slice(0, CLOUD.maxNameLength);
}

/** The index entry for this game at revision `rev`, written now from `device`. */
export function slotMetaFor(
  state: GameState,
  o: { slot: string; gameId: string; rev: number; name: string; savedAt: number; device: string; bytes: number; rawBytes: number },
): SlotMeta {
  const me = state.players[0]!;
  const def = civDef(state, 0);
  return {
    ...o,
    civId: me.civId,
    leader: def.leader,
    civName: def.name,
    turn: state.turn,
    era: eraName(playerEra(me)),
    mapSize: state.mapSize,
    difficulty: state.difficulty,
    saveVersion: SAVE_VERSION,
  };
}

export type SyncStatus =
  | 'signedOut' // "Not signed in"
  | 'unavailable' // "Cloud saves unavailable"
  | 'syncing' // "Syncing…"
  | 'saved' // "Saved to cloud ✓"
  | 'offline' // "Offline: will sync"
  | 'retrying' // "Couldn't sync: will retry"
  | 'conflict' // "Waiting for your choice"
  | 'full' // "Cloud full (5 games)"
  | 'otherAccount' // this game is in someone else's cloud
  | 'localOnly'; // the player deleted its cloud copy

export const STATUS_TEXT: Record<SyncStatus, string> = {
  signedOut: 'Not signed in',
  unavailable: 'Cloud saves unavailable',
  syncing: 'Syncing…',
  saved: 'Saved to cloud ✓',
  offline: 'Offline: will sync',
  retrying: 'Couldn’t sync: will retry',
  conflict: 'Waiting for your choice',
  full: `Cloud full (${CLOUD.maxSlots} games)`,
  otherAccount: 'Not synced (another account’s game)',
  localOnly: 'This game is on this device only',
};

/** What the sync needs from the game around it (the App, or a test). */
export interface SyncHost {
  /** The game now, its link, and a counter that goes up with every change; undefined: nothing to sync. */
  current(): { state: GameState; link: CloudLink; changes: number } | undefined;
  /** The link changed (a write finished, or a slot was taken): save it with the game. */
  setLink(link: CloudLink): void;
  /** The cloud copy is newer and this device hasn't changed it: take it quietly. */
  take(save: SlotSave): void;
  /** Both changed: ask which to keep, then call `keepLocal` or take the cloud's. */
  conflict(cloud: SlotMeta): void;
  status(s: SyncStatus): void;
  now(): number;
  online(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** "iPad", "PC": written with each save. */
  device: string;
}

/** An error from the store that means "no network" (Firestore's code, or a fetch failure). */
export function isOfflineError(e: unknown, online: boolean): boolean {
  const code = (e as { code?: string } | undefined)?.code;
  return !online || code === 'unavailable' || code === 'network-request-failed' || code === 'deadline-exceeded';
}

export class CloudSync {
  private running = false;
  private wanted = false;
  private retryMs = 0;
  private retryTimer: unknown;
  /** A keep-which question is open: no writes until it's answered. */
  private paused = false;
  private checking: Promise<SyncDecision | undefined> | undefined;
  /** Write attempts and their results, for tests and the dev console. */
  readonly log: string[] = [];

  constructor(
    readonly store: CloudStore,
    readonly uid: string,
    private readonly host: SyncHost,
  ) {}

  /** Asks for a background write of the game as it is when the write starts. Never waits. */
  request(): void {
    this.wanted = true;
    if (!this.running && !this.retryTimer && !this.paused) void this.loop();
  }

  /** The network is back (or the player tapped): retry now instead of waiting out the backoff. */
  kick(): void {
    if (this.retryTimer) {
      this.host.clearTimer(this.retryTimer);
      this.retryTimer = undefined;
      this.request();
    }
  }

  /** Is a write running or waiting (for tests and the pagehide handler)? */
  get busy(): boolean {
    return this.running || this.wanted;
  }

  private async loop(): Promise<void> {
    this.running = true;
    try {
      while (this.wanted && !this.paused) {
        this.wanted = false;
        try {
          await this.writeOnce();
          this.retryMs = 0;
        } catch (e) {
          const offline = isOfflineError(e, this.host.online());
          this.log.push(`error: ${offline ? 'offline' : String((e as { code?: string })?.code ?? e)}`);
          this.host.status(offline ? 'offline' : 'retrying');
          this.retryMs = Math.min(CLOUD.retryMaxMs, this.retryMs ? this.retryMs * 2 : CLOUD.retryFirstMs);
          this.retryTimer = this.host.setTimer(() => {
            this.retryTimer = undefined;
            this.request();
          }, this.retryMs);
          return;
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** The link, checked for this account; undefined (with the status set) if this game isn't synced here. */
  private usable(): { state: GameState; link: CloudLink; changes: number } | undefined {
    const cur = this.host.current();
    if (!cur) return undefined;
    if (cur.link.localOnly) {
      this.host.status('localOnly');
      return undefined;
    }
    if (cur.link.uid && cur.link.uid !== this.uid) {
      this.host.status('otherAccount');
      return undefined;
    }
    return cur;
  }

  private async writeOnce(): Promise<void> {
    const cur = this.usable();
    if (!cur) return;
    const { state, link, changes } = cur;
    if (link.slot && !link.dirty) {
      this.host.status('saved');
      return;
    }
    this.host.status('syncing');
    // Taken now: the newest game when this write starts (a later change asks for another write).
    const text = serializeGame(state, this.host.now());
    const data = await gzipText(text);
    if (data.length > CLOUD.maxSaveBytes) throw Object.assign(new Error('save too big for the cloud'), { code: 'too-big' });
    // Up to a couple of tries at claiming a slot (another device may take the same free one).
    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = this.host.current()?.link ?? link;
      let slot = latest.slot;
      let expectRev = latest.syncedRev;
      let name: string | undefined;
      if (!slot) {
        const used = await this.store.list();
        slot = freeSlot(used);
        if (!slot) {
          this.log.push('full');
          this.host.status('full');
          return;
        }
        expectRev = 0;
      } else {
        name = (await this.store.meta(slot))?.name;
      }
      const meta = slotMetaFor(state, {
        slot,
        gameId: link.gameId,
        rev: expectRev + 1,
        name: name ?? defaultSlotName(state),
        savedAt: this.host.now(),
        device: this.host.device,
        bytes: data.length,
        rawBytes: text.length,
      });
      const res = await this.store.write(meta, data, expectRev);
      if (res.ok) {
        this.log.push(`wrote ${slot} rev ${meta.rev} turn ${state.turn}`);
        const now = this.host.current();
        // Still dirty if the game changed while this write was on its way.
        const dirty = !now || now.changes !== changes;
        this.host.setLink({ gameId: link.gameId, slot, uid: this.uid, syncedRev: meta.rev, dirty });
        this.host.status(dirty ? 'syncing' : 'saved');
        if (dirty) this.wanted = true;
        return;
      }
      const other = res.current;
      if (other && other.gameId === link.gameId) {
        // The cloud moved on while this device changed too: ask, and write nothing until answered.
        this.log.push(`conflict ${slot}: cloud rev ${other.rev}, this device had ${expectRev}`);
        this.paused = true;
        this.host.status('conflict');
        this.host.conflict(other);
        return;
      }
      // The slot was emptied, or holds another game now: find this one a new slot.
      this.log.push(`slot ${slot} gone or taken; finding another`);
      this.host.setLink({ ...latest, slot: undefined, syncedRev: 0, dirty: true });
    }
    throw Object.assign(new Error('could not claim a slot'), { code: 'slot-race' });
  }

  /**
   * On opening a game, coming back to it, or signing in: compares this device's copy with its
   * slot and does what `decide` says (a quiet take, a write, or the question).
   */
  check(): Promise<SyncDecision | undefined> {
    // One at a time: a second call while one runs (the game shown, then signed in) shares it.
    this.checking ??= this.checkOnce().finally(() => (this.checking = undefined));
    return this.checking;
  }

  private async checkOnce(): Promise<SyncDecision | undefined> {
    const cur = this.usable();
    if (!cur) return undefined;
    let cloud: SlotMeta | undefined;
    try {
      cloud = cur.link.slot ? await this.store.meta(cur.link.slot) : undefined;
    } catch (e) {
      this.host.status(isOfflineError(e, this.host.online()) ? 'offline' : 'retrying');
      return undefined;
    }
    const d = decide(cur.link, cloud);
    this.log.push(`check: ${d}`);
    if (d === 'same') this.host.status('saved');
    else if (d === 'push') this.request();
    else if (d === 'upload') {
      this.host.setLink({ ...cur.link, slot: undefined, uid: this.uid, syncedRev: 0, dirty: true });
      this.request();
    } else if (d === 'pull') {
      const save = await this.store.read(cloud!.slot);
      if (save) {
        this.host.take(save);
        this.host.status('saved');
      }
    } else {
      this.paused = true;
      this.host.status('conflict');
      this.host.conflict(cloud!);
    }
    return d;
  }

  /** "Keep this device's": the cloud copy (already backed up by the caller) gets overwritten. */
  keepLocal(cloud: SlotMeta): void {
    const cur = this.host.current();
    this.paused = false;
    if (cur) this.host.setLink({ ...cur.link, slot: cloud.slot, uid: this.uid, syncedRev: cloud.rev, dirty: true });
    this.request();
  }

  /** "Keep the cloud's": the caller has taken it; writing resumes from there. */
  keptCloud(): void {
    this.paused = false;
    this.host.status('saved');
  }

  /** The question was put off (e.g. a scenario was left): nothing is written until the next check. */
  get waitingForChoice(): boolean {
    return this.paused;
  }
}
