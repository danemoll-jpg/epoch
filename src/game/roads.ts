// Roads and railroads (Round 12), Civ Rev style: no workers. A city buys a road to another
// city with gold; it's laid at once along the cheapest land path (no water or mountains),
// paying only for tiles without a road. Cities always count as road. Roads belong to no one:
// everyone moves on them (enemies too), a captured area keeps them, and they're never
// pillaged (Q26). A civ that knows Railroad has its roads upgraded to rails for free (Q25):
// every road tile whose nearest city is its own, checked when it learns the tech and at each
// of its turns; roads it buys after that are laid as rails. Moving from one road tile to
// another costs 1/3 of a move (1/10 on rails; we chose the fixed cost over "free in your
// territory"). Worked road tiles give +1 trade, rail tiles +1 production too (yields.ts).
// Numbers are in src/data/roads.ts.

import { MinHeap } from './heap';
import { ROADS } from '../data/roads';
import { TERRAIN } from '../data/terrain';
import { CivName } from './conquest';
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

/**
 * The cheapest land path for a road from `from` to `to`, as the tiles between them (the two
 * cities not included), or undefined. Only tiles the buyer has explored, within a few tiles of
 * the box around the two cities. Cheapest = fewest new road tiles, then the shortest.
 */
export function roadPath(state: GameState, buyer: number, from: City, to: City): Coord[] | undefined {
  const { map } = state;
  const explored = state.players[buyer]?.explored;
  const start = tileIndex(map, from.x, from.y);
  const goal = tileIndex(map, to.x, to.y);
  const box = {
    x0: Math.min(from.x, to.x) - PATH_MARGIN,
    x1: Math.max(from.x, to.x) + PATH_MARGIN,
    y0: Math.min(from.y, to.y) - PATH_MARGIN,
    y1: Math.max(from.y, to.y) + PATH_MARGIN,
  };
  // Round 14: a heap, and each tile's city looked up once (the same order as before: the
  // cheapest first, then the lowest tile index).
  const n = map.width * map.height;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const cityTile = new Uint8Array(n);
  for (const c of state.cities) cityTile[c.y * map.width + c.x] = 1;
  const heap = new MinHeap();
  cost[start] = 0;
  heap.push(0, start, start);
  while (heap.size) {
    const cur = heap.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === goal) break;
    const c = { x: cur % map.width, y: Math.floor(cur / map.width) };
    for (const nb of neighbors(map, c)) {
      const k = tileIndex(map, nb.x, nb.y);
      if (done[k] || !roadable(state, k)) continue;
      if (explored && explored[k] !== 1) continue;
      if (nb.x < box.x0 || nb.x > box.x1 || nb.y < box.y0 || nb.y > box.y1) continue;
      // A city in the way is fine (it has a road); new road tiles cost the most, and a diagonal
      // step a hair more than a straight one, so a road runs straight when it can.
      const fresh = k !== goal && !cityTile[k] && !map.tiles[k]!.road ? 1000 : 0;
      const diagonal = nb.x !== c.x && nb.y !== c.y ? 0.01 : 0;
      const nc = cost[cur]! + fresh + 1 + diagonal;
      if (nc < cost[k]!) {
        cost[k] = nc;
        prev[k] = cur;
        heap.push(nc, k, k);
      }
    }
  }
  if (prev[goal] === -1) return undefined;
  const path: Coord[] = [];
  let k = prev[goal]!;
  while (k !== start) {
    path.unshift({ x: k % map.width, y: Math.floor(k / map.width) });
    k = prev[k]!;
  }
  return path;
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

/** Why the current player can't buy this road now, or undefined. */
export function buyRoadError(state: GameState, fromCityId: number, toCityId: number): string | undefined {
  const from = state.cities.find((c) => c.id === fromCityId);
  const to = state.cities.find((c) => c.id === toCityId);
  if (!from || !to) return 'No such city';
  if (from.owner !== state.currentPlayer) return 'Not your city';
  const err = roadTargetError(state, from, to);
  if (err) return err;
  const opt = roadOption(state, from.owner, from, to);
  if (!opt) return 'No land path (roads can’t cross water or mountains)';
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
export function aiBuyRoads(state: GameState, p: number, reserve: number): boolean {
  const player = state.players[p]!;
  const spare = player.gold - reserve - ROADS.ai.reserve;
  if (spare < roadGoldPerTile(state, p)) return false;
  const mine = state.cities.filter((c) => c.owner === p).sort((a, b) => a.id - b.id);
  const options: { from: City; to: City; cost: number; war: boolean }[] = [];
  const plan = state.aiPlans[p];
  const target = plan ? state.cities.find((c) => c.id === plan.cityId) : undefined;
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
      const opt = roadOption(state, p, a, b);
      if (opt && opt.newTiles > 0) options.push({ from: a, to: b, cost: opt.cost, war: false });
    }
  }
  options.sort((x, y) => Number(y.war) - Number(x.war) || x.cost - y.cost || x.from.id - y.from.id || x.to.id - y.to.id);
  const pick = options.find((o) => o.cost <= spare);
  if (!pick) return false;
  return buyRoad(state, pick.from.id, pick.to.id).ok;
}
