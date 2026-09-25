// Round 15 (B1, B2, E2): the balance targets, loosely, on 8 all-AI Normal games (the first 8
// of the matrix seeds). The full numbers come from `npm run sim -- matrix` (20 games per map
// size and difficulty); this only catches a change that tips the game far off: one kind of
// victory taking over, or one leader winning everything.
import { describe, expect, it } from 'vitest';
import { playToVictory } from '../src/dev/sim';

describe('balance (all-AI, Normal map, 8 games)', () => {
  it('no victory kind takes over, no leader wins everything, and no game ends before turn 150', () => {
    const runs = Array.from({ length: 8 }, (_, i) => playToVictory(101 + i * 7));
    const kinds: Record<string, number> = {};
    const wins: Record<string, number> = {};
    for (const r of runs) {
      expect(r.victory, `seed ${r.seed}`).not.toBeNull();
      expect(r.victory!.turn, `seed ${r.seed}`).toBeGreaterThanOrEqual(150);
      kinds[r.victory!.kind] = (kinds[r.victory!.kind] ?? 0) + 1;
      wins[r.winnerCiv!] = (wins[r.winnerCiv!] ?? 0) + 1;
    }
    // The matrix target is about 40% at most per kind over 20 games; 8 games are noisier.
    for (const [k, n] of Object.entries(kinds)) expect(n, `${k} wins`).toBeLessThanOrEqual(5);
    expect(Object.keys(kinds).length).toBeGreaterThanOrEqual(3);
    // The matrix target is no leader above about twice its fair share over 140 games (Round 15:
    // the highest is Ukraine at 1.6×); 8 games can't show that, so here only: no one wins more
    // than half of them, and at least 4 different leaders win.
    for (const [civ, n] of Object.entries(wins)) expect(n, civ).toBeLessThanOrEqual(4);
    expect(Object.keys(wins).length).toBeGreaterThanOrEqual(4);
  }, 300_000);
});
