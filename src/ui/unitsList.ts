// Round 18 (item 2): ☰ → Units, every unit you have, so a fortified one (which Next Unit skips)
// is always easy to find. Pure: reads state, changes nothing.

import { distance } from '../game/grid';
import { isAir } from '../game/naval';
import type { GameState, Unit } from '../game/types';

export type UnitStatus = 'ready' | 'fortified' | 'aboard' | 'done';
export type UnitFilter = 'all' | 'ready' | 'fortified' | 'aboard';

export const UNIT_FILTERS: { id: UnitFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'fortified', label: 'Fortified' },
  { id: 'aboard', label: 'Aboard' },
];

/**
 * Where a unit stands in the turn: fortified (or a ship staying put) first, then riding aboard
 * a ship (an aircraft on a Carrier isn't cargo), then ready (moves left) or done.
 */
export function unitStatus(u: Unit): UnitStatus {
  if (u.fortified) return 'fortified';
  if (u.carriedBy !== null && !isAir(u)) return 'aboard';
  return u.movesLeft > 0 ? 'ready' : 'done';
}

/** Your units that pass the filter, grouped by status (ready, fortified, aboard, done), oldest first. */
export function listUnits(state: GameState, viewer: number, filter: UnitFilter): Unit[] {
  const order: UnitStatus[] = ['ready', 'fortified', 'aboard', 'done'];
  return state.units
    .filter((u) => u.owner === viewer && (filter === 'all' || unitStatus(u) === filter))
    .sort((a, b) => order.indexOf(unitStatus(a)) - order.indexOf(unitStatus(b)) || a.id - b.id);
}

/** How many of your units each filter shows (for the filter buttons). */
export function filterCounts(state: GameState, viewer: number): Record<UnitFilter, number> {
  const counts: Record<UnitFilter, number> = { all: 0, ready: 0, fortified: 0, aboard: 0 };
  for (const u of state.units) {
    if (u.owner !== viewer) continue;
    counts.all++;
    const s = unitStatus(u);
    if (s !== 'done') counts[s]++;
  }
  return counts;
}

/** "in Babylon", "2 tiles from Ur", or "far from your cities": where the unit is, in words. */
export function unitWhere(state: GameState, viewer: number, u: Unit): string {
  const here = state.cities.find((c) => c.x === u.x && c.y === u.y);
  if (here) return `in ${here.name}`;
  let best: { name: string; d: number } | undefined;
  for (const c of state.cities) {
    if (c.owner !== viewer) continue;
    const d = distance(c, u);
    if (!best || d < best.d) best = { name: c.name, d };
  }
  if (!best || best.d > 12) return 'far from your cities';
  return `${best.d} tile${best.d === 1 ? '' : 's'} from ${best.name}`;
}
