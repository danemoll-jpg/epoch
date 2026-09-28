// Round 22 (item 8): Explore mode. Any ship, any land military unit, or the Drone can be told
// to explore: each turn, at the start of its owner's turn (and at once when ordered), it heads
// for the nearest unexplored area on its own (the AI's own explore step; the Drone scouts the
// most unknown spot in range instead), and Next Unit skips it. It stops and asks for orders
// when it sights an enemy unit or city, is attacked, or finds nothing left it can reach. Any
// order given to the unit, or tapping it, cancels it (the UI and applyAction). Units have no
// damage in this game, so "damaged" never applies; a Galley's moves already keep it on the
// coast, so it never ends a turn where it can't stay. The AI never uses it.

import { escortingError } from './escorts';
import { UNITS } from '../data/units';
import { aiExploreStep } from './ai';
import { airRange, recon } from './air';
import { isBarbarian } from './barbarians';
import { stopExploring } from './exploreStop';
import { unitVisibleTo, visibleTiles } from './fog';
import { distance, tileIndex } from './grid';
import { findUnit } from './movement';
import { isAir } from './naval';
import { atWar } from './war';
import type { ActionResult, Coord, GameState, Unit } from './types';

export { stopExploring } from './exploreStop';

/** Can this kind of unit explore on its own? Ships, land military units, and the Drone. */
export function canExplore(u: Unit): boolean {
  const def = UNITS[u.type];
  if (def.recon) return true;
  if (def.domain === 'air') return false;
  if (def.domain === 'sea') return true;
  return !def.canFoundCity && !def.spy && !def.spreadsReligion && def.attack > 0;
}

/** Why this unit can't be sent exploring now, or undefined. */
export function exploreError(state: GameState, u: Unit): string | undefined {
  if (state.currentPlayer !== u.owner) return 'Not your turn';
  if (!canExplore(u)) return `A ${UNITS[u.type].name} doesn’t explore`;
  if (u.carriedBy !== null && !isAir(u)) return 'Unload it first';
  if (u.exploring) return 'Already exploring';
  return escortingError(state, u);
}

/** A unit or city of someone this unit's owner is at war with (or barbarians), in sight of it. */
export function enemyInSight(state: GameState, u: Unit): string | undefined {
  const vis = visibleTiles(state, u.owner);
  const reach = UNITS[u.type].sight + 1;
  const hostile = (p: number) => p !== u.owner && (isBarbarian(state, p) || atWar(state, u.owner, p));
  const city = state.cities.find((c) => hostile(c.owner) && distance(c, u) <= reach && vis[tileIndex(state.map, c.x, c.y)]);
  if (city) return `it sighted ${city.name}, an enemy city`;
  const other = state.units
    .filter((o) => hostile(o.owner) && distance(o, u) <= reach && unitVisibleTo(state, u.owner, o, vis))
    .sort((a, b) => distance(a, u) - distance(b, u) || a.id - b.id)[0];
  return other ? `it sighted ${isBarbarian(state, other.owner) ? 'a barbarian' : 'an enemy'} ${UNITS[other.type].name}` : undefined;
}

/** The Drone's best spot to scout: the tile in range whose surroundings are least known. */
function droneTarget(state: GameState, u: Unit): Coord | undefined {
  const { map } = state;
  const explored = state.players[u.owner]!.explored;
  const range = airRange(u);
  const r = UNITS[u.type].sight;
  let best: { c: Coord; unknown: number } | undefined;
  for (let y = Math.max(0, u.y - range); y <= Math.min(map.height - 1, u.y + range); y++) {
    for (let x = Math.max(0, u.x - range); x <= Math.min(map.width - 1, u.x + range); x++) {
      if (x === u.x && y === u.y) continue;
      let unknown = 0;
      for (let ty = Math.max(0, y - r); ty <= Math.min(map.height - 1, y + r); ty++) {
        for (let tx = Math.max(0, x - r); tx <= Math.min(map.width - 1, x + r); tx++) if (explored[ty * map.width + tx] !== 1) unknown++;
      }
      if (unknown > 0 && (!best || unknown > best.unknown)) best = { c: { x, y }, unknown };
    }
  }
  return best?.c;
}

/**
 * One turn of exploring for this unit (with whatever moves it has). Returns why it stopped, or
 * undefined if it's still exploring. It stops (and says so in the news) when it sights an
 * enemy or finds nothing left to explore.
 */
export function exploreTurn(state: GameState, u: Unit): string | undefined {
  if (!u.exploring || u.movesLeft <= 0) return undefined;
  const before = enemyInSight(state, u);
  if (before) {
    stopExploring(state, u, before);
    return before;
  }
  let moved: boolean;
  if (UNITS[u.type].recon) {
    const at = droneTarget(state, u);
    moved = !!at && recon(state, u.id, at).ok;
  } else {
    moved = aiExploreStep(state, u);
  }
  const still = findUnit(state, u.id);
  if (!still) return undefined;
  if (!moved) {
    const why = 'nothing left to explore that it can reach';
    stopExploring(state, still, why);
    return why;
  }
  const after = enemyInSight(state, still);
  if (after) {
    stopExploring(state, still, after);
    return after;
  }
  return undefined;
}

/** The `explore` action: the unit starts exploring, and goes at once with the moves it has. */
export function startExploring(state: GameState, unitId: number): ActionResult {
  const u = findUnit(state, unitId);
  if (!u) return { ok: false, reason: 'No such unit' };
  const err = exploreError(state, u);
  if (err) return { ok: false, reason: err };
  u.exploring = true;
  u.fortified = false;
  const stopped = exploreTurn(state, u);
  const name = UNITS[u.type].name;
  return { ok: true, message: stopped ? `${name} stopped exploring: ${stopped}` : `${name} is exploring` };
}

/** At the start of a player's turn: each of its exploring units takes its turn, oldest first. */
export function runExplorers(state: GameState, p: number): void {
  for (const u of state.units.filter((x) => x.owner === p && x.exploring).sort((a, b) => a.id - b.id)) {
    if (findUnit(state, u.id)) exploreTurn(state, u);
  }
}
