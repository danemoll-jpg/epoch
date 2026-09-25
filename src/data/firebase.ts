// Round 16: cloud saves. The Firebase web config (from Dan's Firebase console) and the cloud
// save rules. The config isn't secret: anyone can read it from the page. What keeps each
// player's saves private is `firestore.rules` (in the repo root; see docs/FIREBASE-SETUP.md).
//
// Only a few hundred bytes of it are in the first load (the sync rules read CLOUD); the Firebase
// SDK itself is a separate chunk loaded on sign-in (src/cloud/firebase.ts).

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBuwR7c_d9jvO4g9ZxfEsaDKX39fhxmjp8',
  authDomain: 'epoch-ca127.firebaseapp.com',
  projectId: 'epoch-ca127',
  storageBucket: 'epoch-ca127.firebasestorage.app',
  messagingSenderId: '813379352639',
  appId: '1:813379352639:web:08b95e3eaeb1d6cd47a08a',
};

/**
 * Hosts that serve Firebase's sign-in handler themselves: netlify.toml passes `/__/auth/*` and
 * `/__/firebase/*` through to `<project>.firebaseapp.com`, so sign-in stays on the game's own
 * address. Safari blocks the cross-site storage the default (firebaseapp.com) handler relies on,
 * which breaks redirect sign-in, especially from the Home Screen icon. Firebase's "redirect
 * best practices", option 3. Anywhere else (localhost) uses the project's own authDomain.
 */
export const AUTH_PROXY_HOSTS = ['epoch-fsts.netlify.app'];

/** The authDomain to use on this host. */
export function authDomainFor(host: string): string {
  return AUTH_PROXY_HOSTS.includes(host) ? host : FIREBASE_CONFIG.authDomain;
}

export const CLOUD = {
  /** Cloud slots per player (Q32). Slot ids are s1..s5; firestore.rules allows no others. */
  maxSlots: 5,
  /** The largest compressed save a slot takes (firestore.rules checks it too). Firestore's limit is 1 MiB a document. */
  maxSaveBytes: 900 * 1024,
  /** A slot's name, at most (firestore.rules checks it too). */
  maxNameLength: 40,
  /** A failed write waits this long, doubling each time up to the maximum, then tries again. */
  retryFirstMs: 2000,
  retryMaxMs: 60_000,
};

/** The slot ids, in order. */
export const SLOT_IDS = Array.from({ length: CLOUD.maxSlots }, (_, i) => `s${i + 1}`);
