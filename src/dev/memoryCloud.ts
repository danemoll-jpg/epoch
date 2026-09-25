// Round 16 (dev/test only): an in-memory stand-in for one player's Firestore saves, with the same
// rules as the real one (revision check on write, slot ids s1..s5), plus switches for the tests
// and the cloud scenarios: go offline, slow every call down, or fail the next few calls.

import { SLOT_IDS } from '../data/firebase';
import type { CloudBackend, CloudUser } from '../cloud/backend';
import { gzipText } from '../cloud/compress';
import { defaultSlotName, slotMetaFor, type CloudStore, type SlotMeta, type SlotSave, type WriteResult } from '../cloud/sync';
import { serializeGame } from '../game/save';
import type { GameState } from '../game/types';

export class MemoryCloudStore implements CloudStore {
  readonly slots = new Map<string, SlotSave>();
  /** Every call fails as if there were no network. */
  offline = false;
  /** The next N calls fail as if offline (then it's back). */
  failNext = 0;
  /** Each call waits this long (ms) first: a slow network. */
  delayMs = 0;
  /** Called at the start of every call (e.g. to count them). */
  onCall?: (op: string) => void;
  writes = 0;

  private async gate(op: string): Promise<void> {
    this.onCall?.(op);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.offline || this.failNext > 0) {
      if (this.failNext > 0) this.failNext--;
      throw Object.assign(new Error('offline'), { code: 'unavailable' });
    }
  }

  async list(): Promise<SlotMeta[]> {
    await this.gate('list');
    return [...this.slots.values()].map((s) => ({ ...s.meta }));
  }

  async meta(slot: string): Promise<SlotMeta | undefined> {
    await this.gate('meta');
    const s = this.slots.get(slot);
    return s ? { ...s.meta } : undefined;
  }

  async read(slot: string): Promise<SlotSave | undefined> {
    await this.gate('read');
    const s = this.slots.get(slot);
    return s ? { meta: { ...s.meta }, data: s.data.slice() } : undefined;
  }

  async write(meta: SlotMeta, data: Uint8Array, expectRev: number): Promise<WriteResult> {
    await this.gate('write');
    if (!SLOT_IDS.includes(meta.slot)) throw Object.assign(new Error('no such slot'), { code: 'permission-denied' });
    const cur = this.slots.get(meta.slot);
    if ((cur?.meta.rev ?? 0) !== expectRev || meta.rev !== expectRev + 1) return { ok: false, current: cur ? { ...cur.meta } : undefined };
    this.slots.set(meta.slot, { meta: { ...meta }, data: data.slice() });
    this.writes++;
    return { ok: true };
  }

  async rename(slot: string, name: string): Promise<void> {
    await this.gate('rename');
    const s = this.slots.get(slot);
    if (s) s.meta.name = name;
  }

  async remove(slot: string): Promise<void> {
    await this.gate('remove');
    this.slots.delete(slot);
  }
}

/** A stand-in cloud for the dev scenarios: a signed-in player and a memory store. */
export function mockBackend(store: MemoryCloudStore, user: CloudUser = { uid: 'dev-user', name: 'Dan (stand-in)' }): CloudBackend {
  let cb: ((u: CloudUser | null) => void) | undefined;
  let current: CloudUser | null = user;
  return {
    onUser(f) {
      cb = f;
      // Like Firebase: reported soon after, not during the call.
      setTimeout(() => f(current), 0);
    },
    async signIn() {
      current = user;
      cb?.(current);
      return { kind: 'done' };
    },
    async signOut() {
      current = null;
      cb?.(null);
    },
    async redirectProblem() {
      return undefined;
    },
    store: () => store,
  };
}

/** Puts `state` in `store` as slot `slot` at revision `rev`, as `device` wrote it `agoMs` ago. */
export async function putSlot(
  store: MemoryCloudStore,
  state: GameState,
  o: { slot: string; gameId: string; rev: number; device: string; agoMs: number; name?: string },
): Promise<void> {
  const text = serializeGame(state, Date.now() - o.agoMs);
  const data = await gzipText(text);
  const meta = slotMetaFor(state, {
    slot: o.slot,
    gameId: o.gameId,
    rev: o.rev,
    name: o.name ?? defaultSlotName(state),
    savedAt: Date.now() - o.agoMs,
    device: o.device,
    bytes: data.length,
    rawBytes: text.length,
  });
  store.slots.set(o.slot, { meta, data });
}
