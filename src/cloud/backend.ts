// Round 16: what the game needs from a cloud (sign-in and a save store). The real one is
// Firebase (src/cloud/firebase.ts), loaded only when needed through `loadFirebase` below, so the
// SDK is never in the first load (scripts/check-dist.mjs checks the built game). The dev
// scenarios hand the game a stand-in instead (src/dev/memoryCloud.ts).

import type { CloudStore } from './sync';

export interface CloudUser {
  uid: string;
  /** The Google account's name (never the email: nothing shows that on screen). */
  name: string;
}

export interface CloudBackend {
  /** Called with the signed-in player (or null) now and whenever it changes. */
  onUser(cb: (user: CloudUser | null) => void): void;
  /** Google sign-in: a popup in a browser tab, a redirect from the Home Screen icon. */
  signIn(): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  /**
   * A redirect sign-in that just came back: signed in, back without an account (cancelled, or
   * Safari lost the sign-in on the way), or failed with a problem.
   */
  redirectResult(): Promise<RedirectOutcome>;
  store(uid: string): CloudStore;
}

export type SignInOutcome = { kind: 'done' } | { kind: 'redirecting' } | { kind: 'cancelled'; code?: string } | { kind: 'failed'; message: string; code?: string };
export type RedirectOutcome = { kind: 'done' } | { kind: 'none' } | { kind: 'failed'; message: string; code?: string };

/** Round 16b: what the player sees whenever a sign-in doesn't finish (Dan's wording). */
export const SIGN_IN_FAILED = 'Sign-in failed. Please try again.';

/** Loads the Firebase chunk and starts it; undefined (never an error) when it can't. */
export async function loadFirebase(): Promise<CloudBackend | undefined> {
  try {
    const m = await import('./firebase');
    return m.startFirebase();
  } catch (e) {
    console.warn('Epoch: cloud saves unavailable', e);
    return undefined;
  }
}

/** Plain words for a sign-in or cloud error code. */
export function problemText(code: string | undefined): string {
  switch (code) {
    case 'auth/unauthorized-domain':
      return 'Sign-in failed: it doesn’t work at this address. Play at https://epoch-fsts.netlify.app/ to use cloud saves.';
    case 'auth/network-request-failed':
      return 'Sign-in failed: no network. Please try again once you’re online.';
    case 'auth/too-many-requests':
      return 'Sign-in failed: too many tries. Wait a minute and try again.';
    case 'auth/web-storage-unsupported':
      return 'Sign-in failed: this browser is blocking the storage sign-in needs (private browsing?).';
    default:
      return SIGN_IN_FAILED;
  }
}
