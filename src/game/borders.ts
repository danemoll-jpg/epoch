// Culture borders and referendums (Round 19, item 7).
//
// - Influence: every city reaches out to a radius that grows with the culture it has made over
//   the game (`City.culture`): BORDERS.radius. On each tile in reach its influence is
//   (base + its culture + its size × sizeWeight) ÷ (distance + 1). A tile belongs to the city
//   with the most influence there (the older city on a tie), and so to that city's civ.
// - Unrest: once a game turn, a city (not an original capital, not within
//   BORDERS.protectTurns of being founded or changing hands) whose neighboring tiles mostly
//   belong to one foreign civ, and whose own influence is far below the foreign city pulling
//   it, gains unrest (half as fast with a Courthouse); otherwise its unrest fades. Its owner is
//   warned when it passes warnAt. From voteAt, each turn there's a chance (less per defender
//   and with a Courthouse) of a referendum: the city joins the civ pulling it, keeping its
//   buildings; its units go home (conquest.ts transferCity). Both ways: your cities too.
// - You can't found a city inside another civ's borders.
// Every number is in BORDERS (src/data/rules.ts).

import { BORDERS } from '../data/rules';
import { UNITS } from '../data/units';
import { civAdjective, civName, transferCity } from './conquest';
import { changeOpinion } from './diplomacy';
import { distance } from './grid';
import { addLog } from './log';
import { defendsTile } from './naval';
import { nextFloat } from './rng';
import type { City, GameState } from './types';

/** How far this city's influence reaches, from the culture it has made. */
export function borderRadius(city: City): number {
  let r = 1;
  BORDERS.radius.forEach((need, i) => {
    if ((city.culture ?? 0) >= need) r = i + 1;
  });
  return r;
}

/** The city's influence before distance: base + culture + size. */
export function cityInfluence(city: City): number {
  return BORDERS.baseInfluence + (city.culture ?? 0) + city.size * BORDERS.sizeWeight;
}

export interface Territory {
  /** Per tile (row-major): the owning player, or -1. */
  owner: Int8Array;
  /** Per tile: the owning city's id, or -1. */
  city: Int32Array;
}

// Cached per game state object and what it depends on (the cities' places, owners, sizes and
// culture), so the page and the turn worker never disagree.
const cache = new WeakMap<GameState, { sig: string; t: Territory }>();

/** Who owns every tile right now (cached until a city changes). */
export function territory(state: GameState): Territory {
  let sig = `${state.map.width}x${state.map.height}`;
  for (const c of state.cities) sig += `|${c.id},${c.x},${c.y},${c.owner},${c.size},${c.culture ?? 0}`;
  const hit = cache.get(state);
  if (hit && hit.sig === sig) return hit.t;
  const t = computeTerritory(state);
  cache.set(state, { sig, t });
  return t;
}

function computeTerritory(state: GameState): Territory {
  const { width: w, height: h } = state.map;
  const owner = new Int8Array(w * h).fill(-1);
  const city = new Int32Array(w * h).fill(-1);
  const best = new Float64Array(w * h);
  const cities = [...state.cities].sort((a, b) => a.id - b.id);
  for (const c of cities) {
    const r = borderRadius(c);
    const inf = cityInfluence(c);
    for (let y = Math.max(0, c.y - r); y <= Math.min(h - 1, c.y + r); y++) {
      for (let x = Math.max(0, c.x - r); x <= Math.min(w - 1, c.x + r); x++) {
        const i = y * w + x;
        const v = inf / (Math.max(Math.abs(x - c.x), Math.abs(y - c.y)) + 1);
        // A city always holds its own tile.
        if (x === c.x && y === c.y) {
          owner[i] = c.owner;
          city[i] = c.id;
          best[i] = Infinity;
          continue;
        }
        if (v > best[i]!) {
          best[i] = v;
          owner[i] = c.owner;
          city[i] = c.id;
        }
      }
    }
  }
  return { owner, city };
}

/** The player whose borders hold this tile, or -1. */
export function tileOwner(state: GameState, x: number, y: number, t: Territory = territory(state)): number {
  return t.owner[y * state.map.width + x] ?? -1;
}

/** The city can't flip: an original capital, or founded or taken too recently. */
export function flipProtected(state: GameState, city: City): boolean {
  if (city.capitalOf !== null) return true;
  const since = Math.max(city.foundedTurn, city.capturedTurn ?? -Infinity);
  return state.turn - since < BORDERS.protectTurns;
}

/** Which foreign city pulls at this city (the one with most influence over its neighborhood), if the pull counts. */
export function pullOn(state: GameState, city: City, t: Territory = territory(state)): City | undefined {
  const { width: w, height: h } = state.map;
  const counts = new Map<number, number>();
  let tiles = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = city.x + dx;
      const y = city.y + dy;
      if ((!dx && !dy) || x < 0 || y < 0 || x >= w || y >= h) continue;
      tiles++;
      const o = t.owner[y * w + x]!;
      if (o >= 0 && o !== city.owner) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
  }
  let civ = -1;
  let most = 0;
  for (const [o, n] of counts) if (n > most) [civ, most] = [o, n];
  if (civ < 0 || most * 100 < tiles * BORDERS.foreignTilePct) return undefined;
  if (state.players[civ]?.kind === 'barbarian') return undefined;
  // The strongest city of that civ within reach.
  const puller = state.cities
    .filter((c) => c.owner === civ && distance(c, city) <= borderRadius(c) + 1)
    .sort((a, b) => cityInfluence(b) / (distance(b, city) + 1) - cityInfluence(a) / (distance(a, city) + 1) || a.id - b.id)[0];
  if (!puller) return undefined;
  if (cityInfluence(puller) < cityInfluence(city) * BORDERS.pullRatio) return undefined;
  return puller;
}

function defenders(state: GameState, city: City): number {
  return state.units.filter((u) => u.owner === city.owner && u.x === city.x && u.y === city.y && defendsTile(state, u) && UNITS[u.type].defense > 0).length;
}

/** The chance (percent) of a referendum this turn for a city at voteAt unrest or more. */
export function referendumChance(state: GameState, city: City): number {
  let pct = BORDERS.votePct + defenders(state, city) * BORDERS.perDefenderPct;
  if (city.buildings.includes(BORDERS.resistBuilding)) pct += BORDERS.resistBuildingPct;
  return Math.max(BORDERS.minVotePct, pct);
}

/**
 * Once a game turn: every city's culture adds up (so borders grow), unrest rises or fades, the
 * owner is warned, and a referendum may move a city to the civ pulling it.
 */
export function processBorders(state: GameState): void {
  const t = territory(state);
  for (const city of [...state.cities].sort((a, b) => a.id - b.id)) {
    const puller = flipProtected(state, city) ? undefined : pullOn(state, city, t);
    const before = city.unrest ?? 0;
    if (!puller) {
      city.unrest = Math.max(0, before - BORDERS.unrestFade);
      continue;
    }
    const gain = city.buildings.includes(BORDERS.resistBuilding) ? BORDERS.unrestGain / 2 : BORDERS.unrestGain;
    city.unrest = before + gain;
    const adj = civAdjective(state, puller.owner);
    if (before < BORDERS.warnAt && city.unrest >= BORDERS.warnAt) {
      addLog(state, city.owner, `Unrest in ${city.name}: its people are drawn to ${adj} culture from ${puller.name}`, city, puller.owner, {
        otherText: `${city.name} (${civName(state, city.owner)}) is drawn to your culture from ${puller.name}`,
        kind: 'referendum',
        ref: { cityId: city.id },
      });
    }
    if (city.unrest < BORDERS.voteAt) continue;
    const chance = referendumChance(state, city);
    if (nextFloat(state) * 100 >= chance) continue;
    const from = city.owner;
    const to = puller.owner;
    city.unrest = 0;
    changeOpinion(state, from, to, BORDERS.lostCityOpinion);
    const text = `${city.name} voted to leave ${civName(state, from)} and joined ${civName(state, to)}`;
    transferCity(state, city, to);
    addLog(state, from, `Referendum! ${city.name} voted to join ${civName(state, to)}`, city, to, {
      otherText: `Referendum! ${city.name} voted to leave ${civName(state, from)} and joined you`,
      publicText: text.charAt(0).toUpperCase() + text.slice(1),
      kind: 'referendum',
      ref: { cityId: city.id },
    });
  }
}

/** Why a city can't be founded here because of borders (another civ's territory), or undefined. */
export function bordersFoundError(state: GameState, owner: number, x: number, y: number): string | undefined {
  const o = tileOwner(state, x, y);
  if (o < 0 || o === owner) return undefined;
  return `Inside ${civName(state, o)}'s borders`;
}

/** Adds each city's culture this turn to its running total (called with the owner's city update). */
export function addCityCulture(city: City, perTurn: number): void {
  city.culture = (city.culture ?? 0) + perTurn;
}
