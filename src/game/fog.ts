// Fog of war. "Explored" is stored per player in state; "visible" is derived on demand from
// the player's units and cities, so it can never go stale.

import { RULES } from '../data/rules';
import { UNITS } from '../data/units';
import { distance, tileIndex } from './grid';
import type { GameState, Unit } from './types';

export function visibleTiles(state: GameState, playerId: number): boolean[] {
  const vis = new Array<boolean>(state.map.tiles.length).fill(false);
  const { width: w, height: h } = state.map;
  // Round 14: plain loops (this runs after every move, for every civ that hasn't met everyone).
  const mark = (x: number, y: number, r: number) => {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    const x0 = Math.max(0, x - r);
    const x1 = Math.min(w - 1, x + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) vis[ty * w + tx] = true;
  };
  for (const u of state.units) if (u.owner === playerId) mark(u.x, u.y, UNITS[u.type].sight);
  for (const c of state.cities) if (c.owner === playerId) mark(c.x, c.y, RULES.citySight);
  return vis;
}

/** Marks everything the player can currently see as explored. */
export function updateExplored(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player) return;
  const vis = visibleTiles(state, playerId);
  for (let i = 0; i < vis.length; i++) if (vis[i]) player.explored[i] = 1;
}

/**
 * Can `viewer` see this unit? Their own always; others where the viewer can see the tile.
 * A stealthy unit (the Submarine, Round 8) only when one of the viewer's units or cities is
 * right next to it. `vis` is the viewer's visibleTiles, if already computed.
 */
export function unitVisibleTo(state: GameState, viewer: number, u: Unit, vis?: boolean[]): boolean {
  if (u.owner === viewer) return true;
  if (UNITS[u.type].stealth) {
    return (
      state.units.some((o) => o.owner === viewer && distance(o, u) <= 1) ||
      state.cities.some((c) => c.owner === viewer && distance(c, u) <= 1)
    );
  }
  return (vis ?? visibleTiles(state, viewer))[tileIndex(state.map, u.x, u.y)] === true;
}

export function isExplored(state: GameState, playerId: number, x: number, y: number): boolean {
  return state.players[playerId]?.explored[tileIndex(state.map, x, y)] === 1;
}
