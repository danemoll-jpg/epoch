// Research pace (Round 6, Q7) and game length (Round 7). A loose check on all-AI games so a change that breaks the era
// timing gets caught. Targets: Medieval by about turn 50–70, Industrial by 120–150, Modern by
// 180–220, and someone finishing the tree in about 250 turns. The ranges below are wider
// than the targets, since three seeds are a small sample. `npm run sim` prints the full report.

import { describe, expect, it } from 'vitest';
import { medianTurn, simulate } from '../src/dev/sim';

describe('research pace (all-AI simulation)', () => {
  it('civs move through the eras on schedule', () => {
    const runs = [8, 21, 42].map((seed) => simulate(seed, 260));
    const civs = runs.flatMap((r) => r.civs.filter((c) => c.alive));
    const median = (era: 'medieval' | 'industrial' | 'modern') => medianTurn(civs.map((c) => c.eraTurn[era]))!;
    expect(median('medieval')).toBeGreaterThanOrEqual(45);
    expect(median('medieval')).toBeLessThanOrEqual(80);
    expect(median('industrial')).toBeGreaterThanOrEqual(95);
    expect(median('industrial')).toBeLessThanOrEqual(160);
    expect(median('modern')).toBeGreaterThanOrEqual(165);
    expect(median('modern')).toBeLessThanOrEqual(235);
    // In every game, someone finishes the tree by about turn 250.
    for (const r of runs) {
      const first = Math.min(...r.civs.map((c) => c.treeDoneTurn ?? Infinity));
      expect(first, `seed ${r.seed}`).toBeLessThanOrEqual(260);
    }
    // Wars stay sensible: no one is wiped out early.
    for (const r of runs) expect(r.eliminated, `seed ${r.seed}`).toBeLessThanOrEqual(1);
    // Round 7: someone wins every game, and never too early (the sim plays on afterwards, so
    // the era numbers above still cover the whole tree).
    for (const r of runs) {
      expect(r.victory, `seed ${r.seed}`).not.toBeNull();
      expect(r.victory!.turn, `seed ${r.seed}`).toBeGreaterThanOrEqual(150);
    }
  }, 120_000);
});
