// Seeded RNG (mulberry32). All randomness in game logic goes through here so that the same
// seed and the same actions always produce the same game. The generator state is a single
// uint32 so it lives happily inside serializable game state.

export interface RngHolder {
  rngState: number;
}

export function hashSeed(seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Returns a float in [0, 1) and advances holder.rngState. */
export function nextFloat(holder: RngHolder): number {
  holder.rngState = (holder.rngState + 0x6d2b79f5) >>> 0;
  let t = holder.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function nextInt(holder: RngHolder, n: number): number {
  return Math.floor(nextFloat(holder) * n);
}

export function pick<T>(holder: RngHolder, items: readonly T[]): T {
  const item = items[nextInt(holder, items.length)];
  if (item === undefined) throw new Error('pick from empty list');
  return item;
}

export function shuffle<T>(holder: RngHolder, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(holder, i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}
