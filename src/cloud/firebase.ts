// Round 16: the Firebase side of cloud saves. This module (and the Firebase SDK it imports) is
// its own chunk, loaded only through `loadFirebase` in ./backend.ts: when the player taps Sign
// in, or at startup if they were signed in before (or are coming back from a redirect sign-in).
//
// Firestore layout (firestore.rules enforces it):
//   users/{uid}/slots/{slot}  the slot's index entry (SlotMeta): small, listed by the main menu
//   users/{uid}/saves/{slot}  { rev, data }: the gzipped save file, as Firestore bytes
// Slots are s1..s5. A write is a transaction: it reads the slot's rev, and writes both documents
// only if it's still the one this device expects.

import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { Bytes, collection, doc, getDoc, getDocs, initializeFirestore, runTransaction, serverTimestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { authDomainFor, FIREBASE_CONFIG } from '../data/firebase';
import { problemText, type CloudBackend, type CloudUser, type SignInOutcome } from './backend';
import { isStandalone } from './device';
import type { CloudStore, SlotMeta, SlotSave, WriteResult } from './sync';

const META_KEYS: (keyof SlotMeta)[] = [
  'slot', 'gameId', 'rev', 'name', 'civId', 'leader', 'civName', 'turn', 'era', 'mapSize', 'difficulty', 'savedAt', 'device', 'saveVersion', 'bytes', 'rawBytes',
];

function toMeta(d: Record<string, unknown>): SlotMeta {
  const m = {} as Record<string, unknown>;
  for (const k of META_KEYS) m[k] = d[k];
  return m as unknown as SlotMeta;
}

class FirestoreStore implements CloudStore {
  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
  ) {}

  private slotRef(slot: string) {
    return doc(this.db, 'users', this.uid, 'slots', slot);
  }
  private saveRef(slot: string) {
    return doc(this.db, 'users', this.uid, 'saves', slot);
  }

  async list(): Promise<SlotMeta[]> {
    const snap = await getDocs(collection(this.db, 'users', this.uid, 'slots'));
    return snap.docs.map((d) => toMeta(d.data()));
  }

  async meta(slot: string): Promise<SlotMeta | undefined> {
    const snap = await getDoc(this.slotRef(slot));
    return snap.exists() ? toMeta(snap.data()) : undefined;
  }

  async read(slot: string): Promise<SlotSave | undefined> {
    // Both documents in one transaction, so the save always matches its entry.
    return runTransaction(this.db, async (tx) => {
      const m = await tx.get(this.slotRef(slot));
      if (!m.exists()) return undefined;
      const s = await tx.get(this.saveRef(slot));
      const meta = toMeta(m.data());
      if (!s.exists() || s.data().rev !== meta.rev) throw Object.assign(new Error('save and entry differ'), { code: 'aborted' });
      return { meta, data: (s.data().data as Bytes).toUint8Array() };
    });
  }

  async write(meta: SlotMeta, data: Uint8Array, expectRev: number): Promise<WriteResult> {
    return runTransaction(this.db, async (tx): Promise<WriteResult> => {
      const snap = await tx.get(this.slotRef(meta.slot));
      const current = snap.exists() ? toMeta(snap.data()) : undefined;
      if ((current?.rev ?? 0) !== expectRev) return { ok: false, current };
      tx.set(this.slotRef(meta.slot), { ...meta, updatedAt: serverTimestamp() });
      tx.set(this.saveRef(meta.slot), { rev: meta.rev, data: Bytes.fromUint8Array(data) });
      return { ok: true };
    });
  }

  async rename(slot: string, name: string): Promise<void> {
    await updateDoc(this.slotRef(slot), { name });
  }

  async remove(slot: string): Promise<void> {
    const b = writeBatch(this.db);
    b.delete(this.saveRef(slot));
    b.delete(this.slotRef(slot));
    await b.commit();
  }
}

export function startFirebase(): CloudBackend {
  const app = initializeApp({ ...FIREBASE_CONFIG, authDomain: authDomainFor(location.host) });
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // Memory cache only: the device's own save is the offline copy, and a write that can't reach
  // the server should fail (and be retried by the sync) rather than wait in a hidden queue.
  const db = initializeFirestore(app, {});
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const redirect = async (): Promise<SignInOutcome> => {
    await signInWithRedirect(auth, provider);
    return { kind: 'redirecting' };
  };

  return {
    onUser(cb) {
      onAuthStateChanged(auth, (u) => cb(u ? ({ uid: u.uid, name: u.displayName || 'Signed in' } satisfies CloudUser) : null));
    },
    async signIn() {
      try {
        // From the Home Screen icon a popup opens in a separate browser that can't hand the
        // sign-in back, so it's a redirect there; a popup everywhere else (it keeps the game open).
        if (isStandalone()) return await redirect();
        await signInWithPopup(auth, provider);
        return { kind: 'done' };
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') return { kind: 'cancelled' };
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          try {
            return await redirect();
          } catch (e2) {
            return { kind: 'failed', message: problemText((e2 as { code?: string }).code) };
          }
        }
        console.warn('Epoch: sign-in failed', e);
        return { kind: 'failed', message: problemText(code) };
      }
    },
    async signOut() {
      await signOut(auth);
    },
    async redirectProblem() {
      try {
        await getRedirectResult(auth);
        return undefined;
      } catch (e) {
        console.warn('Epoch: redirect sign-in failed', e);
        return problemText((e as { code?: string }).code);
      }
    },
    store: (uid) => new FirestoreStore(db, uid),
  };
}
