// Landmass report (Round 8, B7): how often the map gives each civ its own landmass, shared
// continents, and empty islands worth settling. Dev/test only: used by tests/naval.test.ts
// and printed by `npm run sim`.

import { TERRAIN } from '../data/terrain';
import { landRegionIds } from '../game/mapgen';
import { tileIndex } from '../game/grid';
import { createGame } from '../game/newGame';

export interface LandmassStats {
  seeds: number;
  /** Every civ starts on its own landmass. */
  allSeparate: number;
  /** Every civ starts on the same landmass. */
  allTogether: number;
  /** Some civs share a landmass, others don't. */
  mixed: number;
  /** Seeds with at least one landmass nobody starts on that has room for a city (5+ tiles, a city site). */
  emptyIsland: number;
  /** ...one with room for two or more cities (15+ tiles). */
  emptyBigIsland: number;
  /** How many seeds had 1, 2, 3, 4, 5 distinct start landmasses. */
  distinctStarts: number[];
}

/** The landmass stats of new 5-civ games over `count` seeds. */
export function landmassStats(count: number): LandmassStats {
  const stats: LandmassStats = { seeds: count, allSeparate: 0, allTogether: 0, mixed: 0, emptyIsland: 0, emptyBigIsland: 0, distinctStarts: [0, 0, 0, 0, 0] };
  for (let k = 0; k < count; k++) {
    const s = createGame({ seed: k * 7919 + 1, playerCount: 5 });
    const ids = landRegionIds(s.map);
    const starts = s.players.map((p) => {
      const u = s.units.find((x) => x.owner === p.id)!;
      return ids[tileIndex(s.map, u.x, u.y)]!;
    });
    const distinct = new Set(starts).size;
    stats.distinctStarts[distinct - 1]!++;
    if (distinct === starts.length) stats.allSeparate++;
    else if (distinct === 1) stats.allTogether++;
    else stats.mixed++;
    const size = new Map<number, number>();
    const site = new Set<number>();
    ids.forEach((id, i) => {
      if (id < 0) return;
      size.set(id, (size.get(id) ?? 0) + 1);
      if (TERRAIN[s.map.tiles[i]!.terrain].canFoundCity) site.add(id);
    });
    const empty = [...size].filter(([id, n]) => !starts.includes(id) && site.has(id) && n >= 5);
    if (empty.length) stats.emptyIsland++;
    if (empty.some(([, n]) => n >= 15)) stats.emptyBigIsland++;
  }
  return stats;
}
