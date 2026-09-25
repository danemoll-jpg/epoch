// Round 16 (B5): firestore.rules against the Firestore emulator (tests/rules.test.ts is the game rules). It runs only when the emulator
// is up (`npm run test:rules` starts it; it needs Java 21 or newer and firebase-tools). In a
// plain `npm test` these are skipped: the rest of the cloud rules are tested against the
// in-memory store (tests/cloud.test.ts).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)('firestore.rules (emulator)', () => {
  // Loaded only here, so a plain `npm test` never needs the emulator's libraries.
  let env: import('@firebase/rules-unit-testing').RulesTestEnvironment;
  let t: typeof import('@firebase/rules-unit-testing');
  let fs: typeof import('firebase/firestore');

  const entry = (slot: string, rev: number, extra: Record<string, unknown> = {}) => ({
    slot, gameId: 'game-1', rev, name: 'Hatshepsut of Egypt', civId: 'egypt', leader: 'Hatshepsut', civName: 'Egypt',
    turn: 10, era: 'Ancient', mapSize: 'normal', difficulty: 'normal', savedAt: 1_700_000_000_000, device: 'PC',
    saveVersion: 12, bytes: 3, rawBytes: 10, ...extra,
  });

  beforeAll(async () => {
    t = await import('@firebase/rules-unit-testing');
    fs = await import('firebase/firestore');
    const [host, port] = EMULATOR!.split(':');
    env = await t.initializeTestEnvironment({
      projectId: 'demo-epoch',
      firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: host!, port: Number(port) },
    });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => env.clearFirestore());

  /** Writes slot + save together at `rev`, as `uid`. */
  const write = (uid: string, owner: string, slot: string, rev: number, bytes = new Uint8Array([1, 2, 3]), extra = {}) => {
    const db = env.authenticatedContext(uid).firestore();
    const b = fs.writeBatch(db);
    b.set(fs.doc(db, 'users', owner, 'slots', slot), entry(slot, rev, extra));
    b.set(fs.doc(db, 'users', owner, 'saves', slot), { rev, data: fs.Bytes.fromUint8Array(bytes) });
    return b.commit();
  };

  it('lets a player write and read their own saves', async () => {
    await t.assertSucceeds(write('alice', 'alice', 's1', 1));
    const db = env.authenticatedContext('alice').firestore();
    await t.assertSucceeds(fs.getDoc(fs.doc(db, 'users', 'alice', 'saves', 's1')));
    await t.assertSucceeds(fs.getDocs(fs.collection(db, 'users', 'alice', 'slots')));
  });

  it("never lets anyone read or write someone else's saves, or anything signed out", async () => {
    await t.assertSucceeds(write('alice', 'alice', 's1', 1));
    const bob = env.authenticatedContext('bob').firestore();
    await t.assertFails(fs.getDoc(fs.doc(bob, 'users', 'alice', 'saves', 's1')));
    await t.assertFails(fs.getDocs(fs.collection(bob, 'users', 'alice', 'slots')));
    await t.assertFails(write('bob', 'alice', 's2', 1));
    const anon = env.unauthenticatedContext().firestore();
    await t.assertFails(fs.getDoc(fs.doc(anon, 'users', 'alice', 'slots', 's1')));
    await t.assertFails(fs.setDoc(fs.doc(anon, 'other', 'x'), { a: 1 }));
  });

  it('allows only 5 slots (s1..s5)', async () => {
    for (const s of ['s1', 's2', 's3', 's4', 's5']) await t.assertSucceeds(write('alice', 'alice', s, 1));
    await t.assertFails(write('alice', 'alice', 's6', 1));
    await t.assertFails(write('alice', 'alice', 'anything', 1));
  });

  it('raises the revision by exactly one per write, with the save at the same revision', async () => {
    await t.assertFails(write('alice', 'alice', 's1', 2)); // a new slot starts at 1
    await t.assertSucceeds(write('alice', 'alice', 's1', 1));
    await t.assertFails(write('alice', 'alice', 's1', 1)); // an old copy can't overwrite
    await t.assertFails(write('alice', 'alice', 's1', 3)); // nor skip ahead
    await t.assertSucceeds(write('alice', 'alice', 's1', 2));
    // A save alone, not matching its entry's revision, is refused.
    const db = env.authenticatedContext('alice').firestore();
    await t.assertFails(fs.setDoc(fs.doc(db, 'users', 'alice', 'saves', 's1'), { rev: 5, data: fs.Bytes.fromUint8Array(new Uint8Array([1])) }));
  });

  it('lets a slot be renamed and deleted, but keeps the size limits', async () => {
    await t.assertSucceeds(write('alice', 'alice', 's1', 1));
    const db = env.authenticatedContext('alice').firestore();
    await t.assertSucceeds(fs.updateDoc(fs.doc(db, 'users', 'alice', 'slots', 's1'), { name: 'The long game' }));
    await t.assertFails(fs.updateDoc(fs.doc(db, 'users', 'alice', 'slots', 's1'), { name: 'x'.repeat(41) }));
    await t.assertFails(fs.updateDoc(fs.doc(db, 'users', 'alice', 'slots', 's1'), { turn: 99 })); // not a rename, no new revision
    await t.assertFails(write('alice', 'alice', 's2', 1, new Uint8Array(921_601)));
    await t.assertSucceeds(write('alice', 'alice', 's2', 1, new Uint8Array(500_000)));
    const b = fs.writeBatch(db);
    b.delete(fs.doc(db, 'users', 'alice', 'saves', 's1'));
    b.delete(fs.doc(db, 'users', 'alice', 'slots', 's1'));
    await t.assertSucceeds(b.commit());
  });
});
