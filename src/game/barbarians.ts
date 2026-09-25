// The barbarians (Round 9, Milestone 7, Dan's spec). A special player, always last in
// `players`, always at war with everyone. It has no cities and no research, isn't in
// diplomacy (nobody ever "meets" it), can't win, and is never eliminated or counted for
// domination. Its units are played here, not by the civ AI (ai.ts).
//
// Villages (state.villages, placed at the start by villages.ts) each hold a fortified
// defender, gain a flag every BARBARIANS.turnsPerFlag turns (none in the first graceTurns,
// none once the world reaches stopEra), and send a unit out at 4 flags. Units stay within
// homeRadius of their village; they attack an adjacent civ unit when the odds are decent, and
// now and then head for a civ unit or an unguarded city nearby. They never capture a city:
// reaching an unguarded one (or killing its last defender), they raid it: some gold and 1
// population, never below size 1 (Q13).

import { applyPct, effectsOf } from './leaders';
import { BARBARIANS as B, BARBARIAN_CIV } from '../data/barbarians';
import { UNITS, type UnitTypeId } from '../data/units';
import { attack, attackError, combatOdds, fortify } from './combat';
import { distance, neighbors, tileAt } from './grid';
import { addLog } from './log';
import { findUnit, moveUnitToward } from './movement';
import { defendsTile, isShip } from './naval';
import { nextFloat, nextInt, pick } from './rng';
import { eraIndex, playerEra } from './tech';
import { refreshWorkedTiles } from './yields';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { ERAS, type EraId } from '../data/techs';
import type { City, Coord, GameState, Player, Unit, Village } from './types';
import { newSpaceProgram } from './victory';

/** The barbarian player's id, or -1 in a game without them (older tests, hand-made states). */
export function barbarianId(state: GameState): number {
  return state.players.findIndex((p) => p.kind === 'barbarian');
}

export function isBarbarian(state: GameState, playerId: number): boolean {
  return state.players[playerId]?.kind === 'barbarian';
}

/** The real civs (everyone but the barbarians). */
export function civPlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.kind !== 'barbarian');
}

/** The barbarian player for a game of `id` players before it (it sees the whole map, so it can find its way). */
export function newBarbarianPlayer(id: number, tiles: number): Player {
  return {
    id,
    civId: BARBARIAN_CIV.id,
    kind: 'barbarian',
    explored: new Array<number>(tiles).fill(1),
    citiesFounded: 0,
    alive: true,
    gold: 0,
    science: 0,
    scienceRate: RULES.defaultScienceRate,
    techs: [],
    researching: null,
    culture: 0,
    space: newSpaceProgram(),
    greatPeople: 0,
    greatPeopleCultureBase: 0,
    uniquesUsed: [],
    dissolvedUntil: null,
    challenge: null,
    shipsBuilt: [],
  };
}

/** The world's era: the median living civ's (so one runaway civ doesn't make barbarians stronger). */
export function worldEra(state: GameState): EraId {
  const idx = civPlayers(state)
    .filter((p) => p.alive)
    .map((p) => eraIndex(playerEra(p)))
    .sort((a, b) => a - b);
  if (idx.length === 0) return ERAS[0]!.id;
  return ERAS[idx[Math.floor((idx.length - 1) / 2)]!]!.id;
}

export function villageAt(state: GameState, at: Coord): Village | undefined {
  return state.villages.find((v) => v.x === at.x && v.y === at.y);
}

/** Barbarian units that belong to this village (its defender included). */
export function villageUnits(state: GameState, v: Village): Unit[] {
  return state.units.filter((u) => u.home === v.id);
}

function isOpenLand(state: GameState, at: Coord): boolean {
  const t = tileAt(state.map, at.x, at.y);
  if (!t || !TERRAIN[t.terrain].landPassable) return false;
  if (state.cities.some((c) => c.x === at.x && c.y === at.y)) return false;
  return !state.units.some((u) => u.x === at.x && u.y === at.y);
}

/** Adds a barbarian unit (0 moves: it acts from the next barbarian turn). */
export function addBarbarianUnit(state: GameState, type: UnitTypeId, at: Coord, home?: number, fortified = false): Unit {
  const unit: Unit = {
    id: state.nextId++,
    type,
    owner: barbarianId(state),
    x: at.x,
    y: at.y,
    movesLeft: 0,
    veteran: false,
    fortified,
    army: false,
    carriedBy: null,
  };
  if (home !== undefined) unit.home = home;
  state.units.push(unit);
  return unit;
}

/** Can villages gain flags right now (past the early grace turns, before the late era)? */
export function villagesActive(state: GameState): boolean {
  return state.turn >= B.graceTurns && eraIndex(worldEra(state)) < eraIndex(B.stopEra);
}

/**
 * The village's flag timer, once per barbarian turn: a flag every turnsPerFlag turns, and at
 * flagsToSpawn it sends a unit out (onto a free tile next to it, or it guards the village if
 * the village is empty) and starts again. At the cap of units out, the flags wait.
 */
export function advanceVillage(state: GameState, v: Village): Unit | undefined {
  if (v.takenBy !== null || !villagesActive(state)) return undefined;
  if (v.flags < B.flagsToSpawn) {
    v.progress++;
    if (v.progress >= B.turnsPerFlag) {
      v.progress = 0;
      v.flags++;
    }
  }
  if (v.flags < B.flagsToSpawn) return undefined;
  const mine = villageUnits(state, v);
  const empty = !state.units.some((u) => u.x === v.x && u.y === v.y);
  if (!empty && mine.length >= B.maxUnitsOut + 1) return undefined;
  const type = pick(state, B.spawnUnits[worldEra(state)]);
  let at: Coord | undefined = empty ? v : undefined;
  if (!at) {
    const spots = neighbors(state.map, v).filter((n) => isOpenLand(state, n));
    if (spots.length === 0) return undefined;
    at = spots[nextInt(state, spots.length)]!;
  }
  v.flags = 0;
  const unit = addBarbarianUnit(state, type, at, v.id, empty);
  addLog(state, unit.owner, `A barbarian village sent out a ${UNITS[type].name}`, v, undefined, { kind: 'barbarians' });
  return unit;
}

// ---- raids ---------------------------------------------------------------------------------

/** Why barbarians can't raid this city now, or undefined if they can. */
export function raidError(state: GameState, city: City): string | undefined {
  if (isBarbarian(state, city.owner)) return 'Their own';
  if (state.units.some((u) => u.x === city.x && u.y === city.y && u.owner === city.owner && defendsTile(state, u))) return 'Guarded';
  if (city.lastRaid !== undefined && state.turn - city.lastRaid < B.raidCooldownTurns) return 'Raided recently';
  return undefined;
}

/**
 * Barbarians raid an unguarded city instead of taking it: they steal some of its owner's gold
 * and 1 population (never below 1), then leave. The raider's turn is over.
 */
export function raidCity(state: GameState, raider: Unit, city: City): { gold: number; population: number } {
  const owner = state.players[city.owner]!;
  const want = Math.round((owner.gold * B.raidGoldPct) / 100);
  // Round 11: Merkel's cities lose less.
  const lossPct = effectsOf(state, city.owner, 'raidLoss').reduce((s, e) => s + e.pct, 0);
  const gold = applyPct(Math.min(owner.gold, Math.max(B.raidGoldMin, Math.min(B.raidGoldMax, want))), lossPct);
  owner.gold -= gold;
  const population = Math.min(B.raidPopulation, city.size - 1);
  city.size -= population;
  city.lastRaid = state.turn;
  raider.movesLeft = 0;
  raider.fortified = false;
  refreshWorkedTiles(state);
  const loss = [gold > 0 ? `${gold} gold` : '', population > 0 ? `${population} population` : ''].filter(Boolean).join(' and ') || 'nothing';
  addLog(state, raider.owner, `Barbarians raided ${city.name} and took ${loss}`, city, city.owner, {
    otherText: `Barbarians raided ${city.name} and took ${loss}! Keep a unit in your cities to stop raids.`,
    kind: 'raid',
  });
  return { gold, population };
}

// ---- the barbarian turn --------------------------------------------------------------------

/** The unit that holds a village: the oldest barbarian unit standing on it. */
function isGarrison(state: GameState, unit: Unit): boolean {
  const v = villageAt(state, unit);
  if (!v) return false;
  const here = state.units.filter((u) => u.x === v.x && u.y === v.y && u.owner === unit.owner).sort((a, b) => a.id - b.id);
  return here[0]?.id === unit.id;
}

function homeOf(state: GameState, unit: Unit): Village | undefined {
  return unit.home === undefined ? undefined : state.villages.find((v) => v.id === unit.home);
}

/** Attack the adjacent civ unit with the best odds, if they're decent. */
function tryAttack(state: GameState, unit: Unit): boolean {
  let best: { at: Coord; chance: number } | undefined;
  for (const n of neighbors(state.map, unit)) {
    if (attackError(state, unit, n)) continue;
    const chance = combatOdds(state, unit, n)!.chance;
    if (!best || chance > best.chance) best = { at: n, chance };
  }
  if (!best || best.chance * 100 < B.attackMinChancePct) return false;
  return attack(state, unit.id, best.at).ok;
}

function tryRaid(state: GameState, unit: Unit): boolean {
  for (const n of neighbors(state.map, unit)) {
    const city = state.cities.find((c) => c.x === n.x && c.y === n.y);
    if (city && !raidError(state, city)) {
      raidCity(state, unit, city);
      return true;
    }
  }
  return false;
}

/** Within reach of home (or anywhere, for a unit with no village left). */
function nearHome(home: Village | undefined, at: Coord, slack = 0): boolean {
  return !home || distance(home, at) <= B.homeRadius + slack;
}

/** Something to go after: a civ unit on land, or an unguarded city, near the unit and its home. */
function seekTarget(state: GameState, unit: Unit, home: Village | undefined): Coord | undefined {
  let best: { at: Coord; d: number } | undefined;
  const consider = (at: Coord) => {
    const d = distance(unit, at);
    if (d <= 1 || d > B.seekDistance || !nearHome(home, at, 1)) return;
    if (!best || d < best.d || (d === best.d && (at.y < best.at.y || (at.y === best.at.y && at.x < best.at.x)))) best = { at, d };
  };
  for (const u of state.units) {
    if (u.owner === unit.owner || isBarbarian(state, u.owner) || isShip(u) || u.carriedBy !== null) continue;
    if (state.cities.some((c) => c.x === u.x && c.y === u.y)) continue;
    consider(u);
  }
  for (const c of state.cities) if (!raidError(state, c)) consider(c);
  return best?.at;
}

/** Steps next to `target` (the free tile beside it closest to the unit). */
function approach(state: GameState, unit: Unit, target: Coord): boolean {
  const spots = neighbors(state.map, target)
    .filter((n) => isOpenLand(state, n) || (n.x === unit.x && n.y === unit.y))
    .sort((a, b) => distance(unit, a) - distance(unit, b) || a.y - b.y || a.x - b.x);
  for (const s of spots.slice(0, 3)) {
    if (s.x === unit.x && s.y === unit.y) return false;
    if (moveUnitToward(state, unit.id, s).ok) return true;
  }
  return false;
}

function wander(state: GameState, unit: Unit, home: Village | undefined): void {
  if (home && distance(unit, home) > B.homeRadius) {
    moveUnitToward(state, unit.id, home);
    return;
  }
  const options = neighbors(state.map, unit).filter((n) => isOpenLand(state, n) && nearHome(home, n) && !villageAt(state, n));
  if (options.length === 0) return;
  moveUnitToward(state, unit.id, options[nextInt(state, options.length)]!);
}

function playUnit(state: GameState, unit: Unit): void {
  if (isGarrison(state, unit)) {
    if (!unit.fortified) fortify(state, unit.id);
    return;
  }
  const home = homeOf(state, unit);
  if (tryAttack(state, unit)) return;
  if (tryRaid(state, unit)) return;
  // An empty home village gets its unit back.
  if (home && !state.units.some((u) => u.x === home.x && u.y === home.y)) {
    if (distance(unit, home) <= 1 || moveUnitToward(state, unit.id, home).ok) {
      const after = findUnit(state, unit.id);
      if (after && after.x === home.x && after.y === home.y && after.movesLeft > 0) fortify(state, unit.id);
      return;
    }
  }
  if (nextFloat(state) * 100 < B.seekChancePct) {
    const target = seekTarget(state, unit, home);
    if (target && approach(state, unit, target)) {
      const after = findUnit(state, unit.id);
      if (after && after.movesLeft > 0 && !tryAttack(state, after)) tryRaid(state, after);
      return;
    }
  }
  wander(state, unit, home);
}

/** The barbarians' turn: villages advance their flags, then every barbarian unit acts. */
export function runBarbarianTurn(state: GameState, playerId: number): void {
  for (const v of [...state.villages].sort((a, b) => a.id - b.id)) advanceVillage(state, v);
  const ids = state.units.filter((u) => u.owner === playerId).map((u) => u.id).sort((a, b) => a - b);
  for (const id of ids) {
    const unit = findUnit(state, id);
    if (!unit || unit.movesLeft <= 0) continue;
    playUnit(state, unit);
  }
}

/** Villages' combat bonus for the unit holding one. */
export function villageDefensePct(state: GameState, at: Coord): number {
  return villageAt(state, at) ? B.villageDefensePct : 0;
}

