// Round 15: registering the service worker and noticing a new version, on the page side.
// The browser types are narrowed to what's used, so tests/pwa.test.ts drives it with fakes.
//
// The rules:
// - A new version installs in the background and WAITS. The page shows "Update available: tap
//   to reload", and nothing else happens until the player taps it.
// - The very first install (no version controlling the page yet) is not an update: no banner.
// - Tapping asks the waiting version to take over; the page reloads only after that, and only
//   because it asked (the first install also changes the controller, and must not reload).
// - It checks for a new version every half hour and whenever the page comes back into view.

export interface WorkerLike {
  state: string;
  postMessage(msg: unknown): void;
  addEventListener(type: 'statechange', fn: () => void): void;
}

export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: 'updatefound', fn: () => void): void;
  update(): Promise<unknown>;
}

export interface ContainerLike {
  controller: unknown;
  register(url: string): Promise<RegistrationLike>;
  addEventListener(type: 'controllerchange', fn: () => void): void;
}

export interface UpdateHooks {
  /** Show the banner; `apply` switches to the new version and reloads. */
  onUpdate(apply: () => void): void;
  reload(): void;
  /** Calls `fn` every `ms` (tests pass a fake). */
  every?(ms: number, fn: () => void): void;
  /** Calls `fn` when the page comes back into view. */
  onVisible?(fn: () => void): void;
}

export const UPDATE_CHECK_MS = 30 * 60 * 1000;

/** Should the service worker run here? Only in a built game (not the dev server), where the browser allows it. */
export function swWanted(env: { prod: boolean; hasServiceWorker: boolean; secure: boolean }): boolean {
  return env.prod && env.hasServiceWorker && env.secure;
}

export async function watchForUpdates(container: ContainerLike, hooks: UpdateHooks, url = '/sw.js'): Promise<RegistrationLike> {
  const reg = await container.register(url);
  let asked = false;
  let shown = false;
  const offer = (w: WorkerLike) => {
    if (shown) return;
    shown = true;
    hooks.onUpdate(() => {
      asked = true;
      // The newest waiting version (another may have arrived since the banner showed).
      (reg.waiting ?? w).postMessage({ type: 'SKIP_WAITING' });
    });
  };
  container.addEventListener('controllerchange', () => {
    if (asked) hooks.reload();
  });
  // A version that finished installing while the game was closed.
  if (reg.waiting && container.controller) offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      // 'installed' with a controller already = a new version waiting (else it's the first install).
      if (w.state === 'installed' && container.controller) offer(w);
    });
  });
  const check = () => void reg.update().catch(() => undefined);
  hooks.every?.(UPDATE_CHECK_MS, check);
  hooks.onVisible?.(check);
  return reg;
}
