// Roads and railroads (Round 12), Civ Rev style: no workers. A city buys a road to another
// city with gold; it's laid at once along the most direct land path (no water or mountains),
// paying only for tiles without a road. Round 22 (item 2): it reuses old road only when that
// adds no more than ROADS.maxDetour tiles to the direct route, and never crosses another
// nation's city or borders (only your own land, unclaimed land, and a friendly target's). Cities always count as road. Roads belong to no one:
// everyone moves on them (enemies too), a captured area keeps them, and they're never
// pillaged (Q26). A civ that knows Railroad has its roads upgraded to rails for free (Q25):
// every road tile whose nearest city is its own, checked when it learns the tech and at each
// of its turns; roads it buys after that are laid as rails. Moving from one road tile to
// another costs 1/3 of a move (1/10 on rails; we chose the fixed cost over "free in your
// territory"). Worked road tiles give +1 trade, rail tiles +1 production too (yields.ts).
// Numbers are in src/data/roads.ts.

import { ROADS } from '../data/roads';
import { TERRAIN } from '../data/terrain';
import { territory } from './borders';
import { CivName, civPossessive } from './conquest';
import { hasMet } from './diplomacy';
import { distance, neighbors, tileIndex } from './grid';
import { effectsOf } from './leaders';
import { addLog } from './log';
import type { ActionResult, City, Coord, GameState, RoadKind } from './types';

function knowsRail(state: GameState, p: number): boolean {
  return state.players[p]?.techs.includes(ROADS.railTech) ?? false;
}

function cityOn(state: GameState, x: number, y: number): City | undefined {
  return state.cities.find((c) => c.x === x && c.y === y);
}

/** The road on a tile: its own, or a city's (a rail once the city's owner knows Railroad). */
export function roadAt(state: GameState, x: number, y: number): RoadKind | undefined {
  const city = cityOn(state, x, y);
  if (city) return knowsRail(state, city.owner) ? 'rail' : 'road';
  return state.map.tiles[tileIndex(state.map, x, y)]?.road;
}

/**
 * What a land unit pays to step from `from` to `to` along a road, or undefined when the two
 * aren't both road (then it pays the terrain). Both rail: the rail cost.
 */
export function roadStepCost(state: GameState, from: Coord, to: Coord): number | undefined {
  const a = roadAt(state, from.x, from.y);
  const b = roadAt(state, to.x, to.y);
  if (!a || !b) return undefined;
  return a === 'rail' && b === 'rail' ? ROADS.railMoveCost : ROADS.roadMoveCost;
}

/** Can a road go on this tile (land that land units can walk on: no water, no mountains)? */
function roadable(state: GameState, k: number): boolean {
  const t = state.map.tiles[k];
  return !!t && TERRAIN[t.terrain].landPassable;
}

/** A road may wander this far outside the box around its two cities (keeps the search small). */
const PATH_MARGIN = 3;

interface RoadSearch {
  /** The box the road may use (inclusive), and its width and tile count. */
  x0: number;
  y0: number;
  w: number;
  size: number;
  /** Box-local indexes of the two cities. */
  start: number;
  goal: number;
  /** Tiles a road may use (roadable, explored by the buyer, and allowed by borders), box-local. */
  ok: Uint8Array;
  /** Tiles that already have a road or a city, box-local. */
  road: Uint8Array;
  /** Each box tile's distance (in tiles) from the straight line between the two cities. */
  offLine: Float64Array;
}

/**
 * The box a road from `from` to `to` may use, and which tiles in it are open. `borders` false
 * ignores who owns the land (to find what's in the way when the real search fails).
 */
function roadSearch(state: GameState, buyer: number, from: City, to: City, borders: boolean): RoadSearch {
  const { map } = state;
  const explored = state.players[buyer]?.explored;
  const x0 = Math.max(0, Math.min(from.x, to.x) - PATH_MARGIN);
  const x1 = Math.min(map.width - 1, Math.max(from.x, to.x) + PATH_MARGIN);
  const y0 = Math.max(0, Math.min(from.y, to.y) - PATH_MARGIN);
  const y1 = Math.min(map.height - 1, Math.max(from.y, to.y) + PATH_MARGIN);
  const w = x1 - x0 + 1;
  const size = w * (y1 - y0 + 1);
  const owner = borders ? territory(state).owner : undefined;
  const ok = new Uint8Array(size);
  const road = new Uint8Array(size);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = tileIndex(map, x, y);
      const i = (y - y0) * w + (x - x0);
      if (map.tiles[k]!.road) road[i] = 1;
      if (!roadable(state, k) || (explored && explored[k] !== 1)) continue;
      // Your land, unclaimed land, and (for a road to a friendly nation's city) that nation's land.
      const o = owner ? owner[k]! : -1;
      if (o < 0 || o === buyer || o === to.owner) ok[i] = 1;
    }
  }
  for (const c of state.cities) {
    if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) road[(c.y - y0) * w + (c.x - x0)] = 1;
  }
  const start = (from.y - y0) * w + (from.x - x0);
  const goal = (to.y - y0) * w + (to.x - x0);
  ok[start] = 1;
  ok[goal] = 1;
  // How far each tile is from the segment between the two cities.
  const offLine = new Float64Array(size);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy || 1;
  for (let i = 0; i < size; i++) {
    const px = x0 + (i % w) - from.x;
    const py = y0 + Math.floor(i / w) - from.y;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
    offLine[i] = Math.hypot(px - t * dx, py - t * dy);
  }
  return { x0, y0, w, size, start, goal, ok, road, offLine };
}

/** The box-local neighbors of box tile `i`. */
function boxNeighbors(sr: RoadSearch, i: number): number[] {
  const h = sr.size / sr.w;
  const x = i % sr.w;
  const y = Math.floor(i / sr.w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < sr.w && ny < h) out.push(ny * sr.w + nx);
    }
  }
  return out;
}

/** Steps from box tile `from` to every open box tile (-1 where it can't get). */
function stepsFrom(sr: RoadSearch, from: number): Int32Array {
  const dist = new Int32Array(sr.size).fill(-1);
  dist[from] = 0;
  let layer = [from];
  while (layer.length) {
    const next: number[] = [];
    for (const k of layer) {
      for (const n of boxNeighbors(sr, k)) {
        if (dist[n] !== -1 || !sr.ok[n]) continue;
        dist[n] = dist[k]! + 1;
        next.push(n);
      }
    }
    layer = next;
  }
  return dist;
}

/**
 * The road's path under `sr`: among the routes at most ROADS.maxDetour steps longer than the
 * most direct one, the one with the fewest new road tiles, each extra step counting as
 * ROADS.detourTileCost new tiles (so old road is reused only when that saves real work) and
 * each tile's distance from the straight line as ROADS.offLinePenalty of one (so it doesn't
 * wander off to pick up old road), then the fewest diagonal steps. Tiles between the two cities.
 */
function searchRoad(sr: RoadSearch): Coord[] | undefined {
  const fromGoal = stepsFrom(sr, sr.goal);
  const direct = fromGoal[sr.start]!;
  if (direct < 0) return undefined;
  const maxSteps = direct + ROADS.maxDetour;
  // score = new tiles × 1000 + diagonal steps, per step count (layer) and tile.
  const score: Float64Array[] = [new Float64Array(sr.size).fill(Infinity)];
  const prev: Int32Array[] = [new Int32Array(sr.size).fill(-1)];
  score[0]![sr.start] = 0;
  let frontier = [sr.start];
  let best: { steps: number; score: number } | undefined;
  for (let s = 1; s <= maxSteps && frontier.length; s++) {
    const sc = new Float64Array(sr.size).fill(Infinity);
    const pv = new Int32Array(sr.size).fill(-1);
    const next: number[] = [];
    for (const k of frontier) {
      for (const t of boxNeighbors(sr, k)) {
        const left = fromGoal[t]!;
        if (left < 0 || s + left > maxSteps) continue;
        const fresh = t !== sr.goal && !sr.road[t] ? 1000 : 0;
        const diagonal = t % sr.w !== k % sr.w && Math.floor(t / sr.w) !== Math.floor(k / sr.w) ? 1 : 0;
        const v = score[s - 1]![k]! + fresh + Math.round(sr.offLine[t]! * ROADS.offLinePenalty * 1000) + diagonal;
        if (v < sc[t]!) {
          if (sc[t] === Infinity) next.push(t);
          sc[t] = v;
          pv[t] = k;
        }
      }
    }
    score.push(sc);
    prev.push(pv);
    // Each step beyond the direct route counts as ROADS.detourTileCost new tiles.
    const total = sc[sr.goal]! + (s - direct) * ROADS.detourTileCost * 1000;
    if (total < Infinity && (!best || total < best.score)) best = { steps: s, score: total };
    frontier = next.filter((t) => t !== sr.goal);
  }
  if (!best) return undefined;
  const path: Coord[] = [];
  let k = prev[best.steps]![sr.goal]!;
  for (let s = best.steps - 1; s > 0; s--) {
    path.unshift({ x: sr.x0 + (k % sr.w), y: sr.y0 + Math.floor(k / sr.w) });
    k = prev[s]![k]!;
  }
  return path;
}

/**
 * The land path for a road from `from` to `to`, as the tiles between them (the two cities not
 * included), or undefined. Only tiles the buyer has explored, within a few tiles of the box
 * around the two cities, and outside other nations' borders (see searchRoad for the choice).
 */
export function roadPath(state: GameState, buyer: number, from: City, to: City): Coord[] | undefined {
  return searchRoad(roadSearch(state, buyer, from, to, true));
}

/**
 * Why no road can be laid between the two cities: another nation's borders in the way
 * ("Nantes's borders are in the way"), or no land path at all. Undefined when there's a path.
 */
export function roadBlocker(state: GameState, buyer: number, from: City, to: City): string | undefined {
  if (roadPath(state, buyer, from, to)) return undefined;
  const free = searchRoad(roadSearch(state, buyer, from, to, false));
  if (!free) return 'No land path (roads can’t cross water or mountains)';
  const t = territory(state);
  for (const c of free) {
    const k = tileIndex(state.map, c.x, c.y);
    const o = t.owner[k]!;
    if (o < 0 || o === buyer || o === to.owner) continue;
    const city = state.cities.find((x) => x.id === t.city[k]);
    return city ? `${city.name}'s borders are in the way` : `${civPossessive(state, o)} borders are in the way`;
  }
  return 'Other nations’ borders are in the way';
}

/** Tiles on the path that still need a road. */
export function newRoadTiles(state: GameState, path: Coord[]): Coord[] {
  return path.filter((c) => !roadAt(state, c.x, c.y));
}

/** Gold per new road tile for this player (Round 12: Merkel's roads cost half). */
export function roadGoldPerTile(state: GameState, p: number): number {
  const pct = effectsOf(state, p, 'roadCost').reduce((s, e) => s + e.pct, 0);
  return Math.max(1, Math.round((ROADS.goldPerTile * (100 + pct)) / 100));
}

export interface RoadOption {
  city: City;
  /** Tiles between the two cities, and how many of them need a road. */
  path: Coord[];
  newTiles: number;
  cost: number;
}

/** The road from `from` to `to`, with its cost, or undefined when no land path is known. */
export function roadOption(state: GameState, buyer: number, from: City, to: City): RoadOption | undefined {
  const path = roadPath(state, buyer, from, to);
  if (!path) return undefined;
  const newTiles = newRoadTiles(state, path).length;
  return { city: to, path, newTiles, cost: newTiles * roadGoldPerTile(state, buyer) };
}

/**
 * Why `from`'s owner can't lay a road to `to` at all, or undefined. The city panel offers the
 * owner's other cities and those of civs it has met and is at peace with; the AI may also
 * lay one toward its war target.
 */
function roadTargetError(state: GameState, from: City, to: City): string | undefined {
  const p = from.owner;
  if (to.id === from.id) return 'That is the same city';
  if (distance(from, to) > ROADS.maxDistance) return `Too far (over ${ROADS.maxDistance} tiles)`;
  if (state.players[p]?.explored[tileIndex(state.map, to.x, to.y)] !== 1) return 'You haven’t seen that city';
  if (to.owner !== p && !hasMet(state, p, to.owner)) return 'You haven’t met them';
  return undefined;
}

/** The cities `city` could build a road to, nearest first (own and friendly; see roadTargetError). */
export function roadTargets(state: GameState, city: City): RoadOption[] {
  const p = city.owner;
  const out: RoadOption[] = [];
  for (const to of state.cities) {
    if (roadTargetError(state, city, to)) continue;
    const friendly = to.owner === p || !state.atWar[p]?.[to.owner];
    if (!friendly) continue;
    const opt = roadOption(state, p, city, to);
    if (opt) out.push(opt);
  }
  return out.sort((a, b) => distance(city, a.city) - distance(city, b.city) || a.city.id - b.city.id);
}

/** Round 22 (item 2): cities a road could reach but for borders in the way, with why (for the city panel). */
export function blockedRoadTargets(state: GameState, city: City): { city: City; reason: string }[] {
  const p = city.owner;
  const out: { city: City; reason: string }[] = [];
  for (const to of state.cities) {
    if (roadTargetError(state, city, to)) continue;
    if (to.owner !== p && state.atWar[p]?.[to.owner]) continue;
    if (roadPath(state, p, city, to)) continue;
    const reason = roadBlocker(state, p, city, to);
    if (reason && !reason.startsWith('No land path')) out.push({ city: to, reason });
  }
  return out.sort((a, b) => distance(city, a.city) - distance(city, b.city) || a.city.id - b.city.id);
}

/** Why the current player can't buy this road now, or undefined. */
export function buyRoadError(state: GameState, fromCityId: number, toCityId: number): string | undefined {
  const from = state.cities.find((c) => c.id === fromCityId);
  const to = state.cities.find((c) => c.id === toCityId);
  if (!from || !to) return 'No such city';
  if (from.owner !== state.currentPlayer) return 'Not your city';
  const err = roadTargetError(state, from, to);
  if (err) return err;
  const opt = roadOption(state, from.owner, from, to);
  if (!opt) return roadBlocker(state, from.owner, from, to) ?? 'No land path (roads can’t cross water or mountains)';
  if (opt.newTiles === 0) return 'Already joined by road';
  if (state.players[from.owner]!.gold < opt.cost) return `Needs ${opt.cost} gold`;
  return undefined;
}

/** Lays a road from one city to another, paying for the tiles that don't have one. */
export function buyRoad(state: GameState, fromCityId: number, toCityId: number): ActionResult {
  const err = buyRoadError(state, fromCityId, toCityId);
  if (err) return { ok: false, reason: err };
  const from = state.cities.find((c) => c.id === fromCityId)!;
  const to = state.cities.find((c) => c.id === toCityId)!;
  const p = from.owner;
  const opt = roadOption(state, p, from, to)!;
  const kind: RoadKind = knowsRail(state, p) ? 'rail' : 'road';
  for (const c of newRoadTiles(state, opt.path)) state.map.tiles[tileIndex(state.map, c.x, c.y)]!.road = kind;
  state.players[p]!.gold -= opt.cost;
  const what = kind === 'rail' ? 'Railroad' : 'Road';
  const message = `${what} built from ${from.name} to ${to.name}: ${opt.newTiles} tile${opt.newTiles === 1 ? '' : 's'}, ${opt.cost} gold`;
  addLog(state, p, message, from, to.owner !== p ? to.owner : undefined, {
    otherText: to.owner !== p ? `${CivName(state, p)} built a road from ${from.name} to our ${to.name}` : undefined,
    kind: 'road',
  });
  return { ok: true, message };
}

// ---- railroads ---------------------------------------------------------------------------------

/** The owner of the city nearest to tile `k` (ties: the lower city id), or undefined. */
export function nearestCityOwner(state: GameState, k: number): number | undefined {
  const at = { x: k % state.map.width, y: Math.floor(k / state.map.width) };
  let best: City | undefined;
  for (const c of state.cities) {
    const d = distance(c, at);
    if (!best || d < distance(best, at) || (d === distance(best, at) && c.id < best.id)) best = c;
  }
  return best?.owner;
}

/** Road tiles "belonging" to a player's area: those whose nearest city is theirs. */
export function roadTilesNear(state: GameState, p: number): number[] {
  const out: number[] = [];
  state.map.tiles.forEach((t, k) => {
    if (t.road && nearestCityOwner(state, k) === p) out.push(k);
  });
  return out;
}

/** Railroad: every road near the player's cities becomes a rail. Returns how many were upgraded. */
export function upgradeRails(state: GameState, p: number): number {
  if (!knowsRail(state, p)) return 0;
  let n = 0;
  for (const k of roadTilesNear(state, p)) {
    const t = state.map.tiles[k]!;
    if (t.road === 'road') {
      t.road = 'rail';
      n++;
    }
  }
  return n;
}

/**
 * Are two cities joined by road within `maxSteps` road tiles (cities count as road)? Used by
 * religion's spread (Round 12: trade carries faith).
 */
export function roadConnected(state: GameState, a: Coord, b: Coord, maxSteps: number): boolean {
  const { map } = state;
  const goal = tileIndex(map, b.x, b.y);
  const seen = new Set<number>([tileIndex(map, a.x, a.y)]);
  let layer: Coord[] = [a];
  for (let step = 0; step < maxSteps && layer.length; step++) {
    const next: Coord[] = [];
    for (const c of layer) {
      for (const n of neighbors(map, c)) {
        const k = tileIndex(map, n.x, n.y);
        if (seen.has(k) || !roadAt(state, n.x, n.y)) continue;
        if (k === goal) return true;
        seen.add(k);
        next.push(n);
      }
    }
    layer = next;
  }
  return false;
}

// ---- the AI ------------------------------------------------------------------------------------

/**
 * An AI buys at most one road a turn with gold it can spare (above `reserve` plus the roads'
 * own reserve): at war, from its city nearest its war target toward that target; otherwise
 * the cheapest missing link between two of its cities close together. Deterministic.
 */
export function aiBuyRoads(state: GameState, p: number, reserve: number, priority?: { maxCost: number }): boolean {
  const player = state.players[p]!;
  const spare = priority ? Math.min(priority.maxCost, player.gold - reserve) : player.gold - reserve - ROADS.ai.reserve;
  if (spare < roadGoldPerTile(state, p)) return false;
  const mine = state.cities.filter((c) => c.owner === p).sort((a, b) => a.id - b.id);
  const options: { from: City; to: City; cost: number; war: boolean }[] = [];
  const plan = state.aiPlans[p];
  const target = plan && !priority ? state.cities.find((c) => c.id === plan.cityId) : undefined;
  if (target) {
    const from = mine.slice().sort((a, b) => distance(a, target) - distance(b, target) || a.id - b.id)[0];
    if (from && distance(from, target) <= ROADS.ai.warDistance && !roadTargetError(state, from, target)) {
      const opt = roadOption(state, p, from, target);
      if (opt && opt.newTiles > 0) options.push({ from, to: target, cost: opt.cost, war: true });
    }
  }
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) {
      const a = mine[i]!;
      const b = mine[j]!;
      if (distance(a, b) > ROADS.ai.linkDistance) continue;
      // Already joined by road without a real detour: nothing to buy (and no search to run).
      if (roadConnected(state, a, b, distance(a, b) + ROADS.maxDetour)) continue;
      const opt = roadOption(state, p, a, b);
      if (opt && opt.newTiles > 0) options.push({ from: a, to: b, cost: opt.cost, war: false });
    }
  }
  options.sort((x, y) => Number(y.war) - Number(x.war) || x.cost - y.cost || x.from.id - y.from.id || x.to.id - y.to.id);
  const pick = options.find((o) => o.cost <= spare);
  if (!pick) return false;
  return buyRoad(state, pick.from.id, pick.to.id).ok;
}
