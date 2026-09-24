// Barbarian villages, ancient artifacts, and exploration huts (Round 9, Milestone 7).
//
// Taking a village (Dan's rule): a civ's unit that kills a village's last defender moves in
// (combat.ts), or it walks into an empty one. Its owner then chooses (chooseVillage):
// - destroy it for a random reward (VILLAGE_REWARDS: mostly gold; sometimes a Horseman, a
//   Settler, a Galley (coastal village and Map Making, else re-rolled), or a free tech), which
//   also reveals a hidden resource on the tile if there is one; or
// - settle it: it becomes the civ's new size-1 city on that tile, with the civ's next city
//   name. This is allowed even inside the normal minimum distance between cities.
// Either way there's an ARTIFACTS.chancePct chance of an ancient artifact: usually 1 free
// tech, rarely a leap of 2–3 (the deepest the civ can reach). The AI chooses at once and
// deterministically: it settles a good, uncrowded site while it wants more cities, and
// destroys the rest. The human answers a panel (state.villages[].takenBy marks the wait).
//
// Huts: the first civ unit to step on one gets a random HUTS result (gold, nearby map, a free
// unit, rarely a free tech, or, from turn 20, a few barbarians). Never artifacts.

import { ARTIFACTS, HUTS, VILLAGE_REWARDS, type HutResultKind, type VillageRewardKind, BARBARIANS } from '../data/barbarians';
import { RESOURCES } from '../data/resources';
import { RULES } from '../data/rules';
import { TECHS, TECH_IDS, type TechId } from '../data/techs';
import { TERRAIN } from '../data/terrain';
import { UNITS, type UnitTypeId } from '../data/units';
import { addBarbarianUnit, barbarianId, isBarbarian, villageAt } from './barbarians';
import { createCity } from './city';
import { CivName } from './conquest';
import { distance, neighbors, tileAt, tileIndex, tilesInRadius } from './grid';
import { addLog } from './log';
import { siteScore } from './mapgen';
import { isCoastal, isShip } from './naval';
import { hiddenResourceFor, placementRng, revealResourceAt } from './resources';
import { nextFloat, nextInt, shuffle, type RngHolder } from './rng';
import { availableTechs, learnTech } from './tech';
import type { ActionResult, Coord, GameState, Unit, Village, VillageOutcome } from './types';

export type { VillageOutcome };

// ---- placement ------------------------------------------------------------------------------

/**
 * Places villages (each with its fortified defender) and huts, from the game's seed on their
 * own RNG stream. `open(i)` says whether tile i may get one: a new game allows every tile; a
 * migrated save only tiles no civ has explored yet (Round 9 B8). Needs the barbarian player.
 */
export function placeVillagesAndHuts(state: GameState, starts: Coord[], open: (i: number) => boolean = () => true): void {
  const rng = placementRng(state.seed, 0x7a11a6e);
  const { map } = state;
  const land: Coord[] = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    if (TERRAIN[map.tiles[tileIndex(map, x, y)]!.terrain].canFoundCity) land.push({ x, y });
  }
  const taken = (c: Coord) =>
    state.cities.some((city) => distance(city, c) < 1) || state.units.some((u) => u.x === c.x && u.y === c.y);
  const B = BARBARIANS;
  const villageCount = Math.max(B.minVillages, Math.min(B.maxVillages, Math.floor(land.length / B.landTilesPerVillage)));
  const cityNear = (c: Coord, d: number) => state.cities.some((city) => distance(city, c) < d);
  const candidates = shuffle(rng, land.filter((c) =>
    open(tileIndex(map, c.x, c.y)) && !taken(c) &&
    starts.every((s) => distance(s, c) >= B.minDistanceFromStart) && !cityNear(c, B.minDistanceFromStart)));
  const barb = barbarianId(state);
  for (const c of candidates) {
    if (state.villages.length >= villageCount || barb < 0) break;
    if (state.villages.some((v) => distance(v, c) < B.minDistanceBetween)) continue;
    const v: Village = { id: state.nextId++, x: c.x, y: c.y, flags: nextInt(rng, 3), progress: 0, takenBy: null };
    state.villages.push(v);
    addBarbarianUnit(state, B.garrison, c, v.id, true);
    const tile = map.tiles[tileIndex(map, c.x, c.y)]!;
    if (!tile.resource) {
      const hidden = hiddenResourceFor(rng, tile.terrain);
      if (hidden) tile.resource = hidden;
    }
  }
  const hutCount = Math.max(HUTS.minHuts, Math.min(HUTS.maxHuts, Math.floor(land.length / HUTS.landTilesPerHut)));
  const hutSpots = shuffle(rng, land.filter((c) =>
    open(tileIndex(map, c.x, c.y)) && !taken(c) && !cityNear(c, HUTS.minDistanceFromStart + 1) &&
    starts.every((s) => distance(s, c) > HUTS.minDistanceFromStart)));
  let huts = 0;
  for (const c of hutSpots) {
    if (huts >= hutCount) break;
    if (state.villages.some((v) => distance(v, c) < HUTS.minDistanceFromVillage)) continue;
    const tile = map.tiles[tileIndex(map, c.x, c.y)]!;
    if (tile.hut || hutsNear(state, c)) continue;
    tile.hut = true;
    huts++;
  }
}

function hutsNear(state: GameState, c: Coord): boolean {
  return tilesInRadius(state.map, c, 2).some((t) => state.map.tiles[tileIndex(state.map, t.x, t.y)]!.hut);
}

// ---- stepping onto a village or a hut -------------------------------------------------------

/** The village waiting for `playerId` to choose, if any. */
export function pendingVillage(state: GameState, playerId: number): Village | undefined {
  return state.villages.find((v) => v.takenBy === playerId);
}

/**
 * A civ's land unit has just arrived on `unit`'s tile (by walking, or by winning the fight
 * for it): take the village there (its owner must choose next; the AI chooses at once), or
 * explore the hut there.
 */
export function enterTile(state: GameState, unit: Unit): void {
  if (isBarbarian(state, unit.owner) || isShip(unit) || unit.carriedBy !== null) return;
  const v = villageAt(state, unit);
  if (v && v.takenBy === null) {
    v.takenBy = unit.owner;
    addLog(state, unit.owner, `Your ${UNITS[unit.type].name} took a barbarian village`, v, undefined, { kind: 'village' });
    // Barbarians from it keep roaming, but they have no home now.
    for (const u of state.units) if (u.home === v.id) delete u.home;
    if (state.players[unit.owner]?.kind === 'ai') chooseVillage(state, v.id, aiVillageChoice(state, v, unit.owner));
  }
  const tile = tileAt(state.map, unit.x, unit.y);
  if (tile?.hut) {
    const set = tile.hutResult;
    delete tile.hut;
    delete tile.hutResult;
    enterHut(state, unit, set);
  }
}

// ---- the village choice ---------------------------------------------------------------------

export type VillageChoice = 'destroy' | 'settle';

/** Why `playerId` can't settle this village as a city, or undefined if they can. */
export function settleVillageError(state: GameState, v: Village): string | undefined {
  const t = tileAt(state.map, v.x, v.y);
  if (!t || !TERRAIN[t.terrain].canFoundCity) return "Can't build a city on this terrain";
  if (state.cities.some((c) => c.x === v.x && c.y === v.y)) return 'There is a city here';
  return undefined;
}

/** Destroy or settle a village your unit has taken. The same action for the human and the AI. */
export function chooseVillage(state: GameState, villageId: number, choice: VillageChoice): ActionResult {
  const v = state.villages.find((x) => x.id === villageId);
  if (!v) return { ok: false, reason: 'No such village' };
  const me = v.takenBy;
  if (me === null || me !== state.currentPlayer) return { ok: false, reason: 'Not your village to choose for' };
  if (choice === 'settle') {
    const err = settleVillageError(state, v);
    if (err) return { ok: false, reason: err };
  }
  state.villages = state.villages.filter((x) => x.id !== v.id);
  const who = CivName(state, me);
  const outcome: VillageOutcome = { choice };
  if (choice === 'settle') {
    const city = createCity(state, me, v);
    outcome.cityId = city.id;
    addLog(state, me, `${who} settled a barbarian village as ${city.name}`, v, undefined, {
      publicText: `${who} settled a barbarian village as ${city.name}`,
      kind: 'village',
    });
  } else {
    const reward = giveReward(state, me, v);
    outcome.reward = reward.text;
    outcome.rewardKind = reward.kind;
    outcome.revealed = revealResourceAt(state, v);
    const found = outcome.revealed ? ` There was ${RESOURCES[outcome.revealed].name} under it.` : '';
    addLog(state, me, `Destroyed a barbarian village: ${reward.text}.${found}`, v, undefined, {
      publicText: `${who} destroyed a barbarian village`,
      kind: 'village',
    });
  }
  const artifact = rollArtifact(state, me);
  if (artifact) outcome.artifact = artifact;
  return { ok: true, village: outcome };
}

/** The AI settles a good site no city crowds while it still wants cities; otherwise it destroys. */
export function aiVillageChoice(state: GameState, v: Village, ai: number): VillageChoice {
  if (settleVillageError(state, v)) return 'destroy';
  const crowded = state.cities.some((c) => distance(c, v) < RULES.minCityDistance);
  const cities = state.cities.filter((c) => c.owner === ai).length;
  const land = state.map.tiles.filter((t) => TERRAIN[t.terrain].canFoundCity).length;
  const civs = Math.max(1, state.players.filter((p) => p.alive && p.kind !== 'barbarian').length);
  const target = Math.max(RULES.ai.minTargetCities, Math.min(RULES.ai.maxTargetCities, Math.floor(land / civs / RULES.ai.landTilesPerCity)));
  return !crowded && cities < target && siteScore(state.map, v) >= RULES.ai.naval.minSiteScore ? 'settle' : 'destroy';
}

function rollWeighted<T extends { weight: number }>(rng: RngHolder, list: T[]): T {
  const total = list.reduce((s, r) => s + r.weight, 0);
  let roll = nextFloat(rng) * total;
  for (const r of list) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return list[list.length - 1]!;
}

/** A coast tile next to the village with room for a Galley, if any. */
function galleySpot(state: GameState, at: Coord, owner: number): Coord | undefined {
  return neighbors(state.map, at).find(
    (n) => tileAt(state.map, n.x, n.y)?.terrain === 'coast' && !state.units.some((u) => u.x === n.x && u.y === n.y && u.owner !== owner),
  );
}

/** Adds a unit for `owner` (0 moves: it can act next turn). */
function giveUnit(state: GameState, owner: number, type: UnitTypeId, at: Coord): Unit {
  const unit: Unit = { id: state.nextId++, type, owner, x: at.x, y: at.y, movesLeft: 0, veteran: false, fortified: false, army: false, carriedBy: null };
  state.units.push(unit);
  return unit;
}

function rewardValid(state: GameState, owner: number, v: Coord, kind: VillageRewardKind): boolean {
  const player = state.players[owner]!;
  if (kind === 'galley') return isCoastal(state, v) && player.techs.includes('map_making') && !!galleySpot(state, v, owner);
  if (kind === 'tech') return availableTechs(player).length > 0;
  return true;
}

/** Rolls and hands out a destroyed village's reward. Invalid rolls are re-rolled among the valid ones. */
function giveReward(state: GameState, owner: number, v: Coord): { kind: VillageRewardKind; text: string } {
  const valid = VILLAGE_REWARDS.filter((r) => rewardValid(state, owner, v, r.kind));
  const kind = rollWeighted(state, valid).kind;
  const player = state.players[owner]!;
  switch (kind) {
    case 'gold30':
    case 'gold40':
    case 'gold50': {
      const gold = Number(kind.slice(4));
      player.gold += gold;
      return { kind, text: `${gold} gold` };
    }
    case 'horseman':
    case 'settler':
      giveUnit(state, owner, kind, v);
      return { kind, text: `a free ${UNITS[kind].name}` };
    case 'galley':
      giveUnit(state, owner, 'galley', galleySpot(state, v, owner)!);
      return { kind, text: 'a free Galley' };
    case 'tech': {
      const tech = freeTech(state, owner, false)!;
      learnTech(state, owner, tech, `Learned ${TECHS[tech].name} from the village`);
      return { kind, text: `the secret of ${TECHS[tech].name}` };
    }
  }
}

/**
 * A free tech for `owner`: normally what they're researching (else one at random they could
 * research now); a `leap` picks the deepest tech they can reach (an artifact's "advanced for
 * its time" knowledge).
 */
export function freeTech(state: GameState, owner: number, leap: boolean): TechId | undefined {
  const player = state.players[owner]!;
  const available = availableTechs(player);
  if (available.length === 0) return undefined;
  if (leap) {
    const deepest = Math.max(...available.map((t) => TECHS[t].tier));
    return available.filter((t) => TECHS[t].tier === deepest).sort((a, b) => TECH_IDS.indexOf(a) - TECH_IDS.indexOf(b))[0];
  }
  if (player.researching && available.includes(player.researching)) return player.researching;
  return available[nextInt(state, available.length)];
}

/** The artifact roll for a taken village: usually nothing; else 1 tech, rarely 2–3. */
function rollArtifact(state: GameState, owner: number): { name: string; techs: TechId[] } | undefined {
  if (nextFloat(state) * 100 >= ARTIFACTS.chancePct) return undefined;
  const count = rollWeighted(state, ARTIFACTS.techCounts).techs;
  const name = ARTIFACTS.names[nextInt(state, ARTIFACTS.names.length)]!;
  return grantArtifact(state, owner, name, count);
}

/** Gives `owner` an artifact worth `count` techs (fewer if they run out of techs to learn). */
export function grantArtifact(state: GameState, owner: number, name: string, count: number): { name: string; techs: TechId[] } | undefined {
  const techs: TechId[] = [];
  for (let i = 0; i < count; i++) {
    // The first is the usual free tech; a leap's later ones reach as deep as they can.
    const tech = freeTech(state, owner, i > 0);
    if (!tech) break;
    learnTech(state, owner, tech, `Learned ${TECHS[tech].name} from the ${name}`);
    techs.push(tech);
  }
  if (techs.length === 0) return undefined;
  const list = techs.map((t) => TECHS[t].name).join(', ');
  addLog(state, owner, `Found an ancient artifact, the ${name}: ${list}`, undefined, undefined, {
    publicText: `${CivName(state, owner)} found an ancient artifact`,
    kind: 'artifact',
  });
  return { name, techs };
}

// ---- huts -----------------------------------------------------------------------------------

export interface HutOutcome {
  kind: HutResultKind;
  text: string;
}

function hutValid(state: GameState, owner: number, at: Coord, kind: HutResultKind): boolean {
  if (kind === 'tech') return availableTechs(state.players[owner]!).length > 0;
  if (kind === 'barbarians') return state.turn >= HUTS.barbariansFromTurn && barbarianId(state) >= 0 && barbarianSpots(state, at).length > 0;
  return true;
}

function barbarianSpots(state: GameState, at: Coord): Coord[] {
  return neighbors(state.map, at).filter((n) => {
    const t = tileAt(state.map, n.x, n.y);
    if (!t || !TERRAIN[t.terrain].landPassable) return false;
    return !state.cities.some((c) => distance(c, n) <= 1) && !state.units.some((u) => u.x === n.x && u.y === n.y);
  });
}

/** The unit explores the hut it stepped on: one random result (never an artifact). */
export function enterHut(state: GameState, unit: Unit, forced?: HutResultKind): HutOutcome {
  const owner = unit.owner;
  const player = state.players[owner]!;
  const kind = forced ?? rollWeighted(state, HUTS.results.filter((r) => hutValid(state, owner, unit, r.kind))).kind;
  let text: string;
  switch (kind) {
    case 'gold': {
      const gold = HUTS.goldMin + nextInt(state, HUTS.goldMax - HUTS.goldMin + 1);
      player.gold += gold;
      text = `The ruins held ${gold} gold`;
      break;
    }
    case 'map': {
      for (const t of tilesInRadius(state.map, unit, HUTS.mapRadius)) player.explored[tileIndex(state.map, t.x, t.y)] = 1;
      text = 'Old maps showed you the land around it';
      break;
    }
    case 'unit': {
      const type = HUTS.units[nextInt(state, HUTS.units.length)]!;
      giveUnit(state, owner, type, unit);
      text = `A ${UNITS[type].name} joined you`;
      break;
    }
    case 'tech': {
      const tech = freeTech(state, owner, false);
      if (tech) learnTech(state, owner, tech, `Learned ${TECHS[tech].name} from the hut`);
      text = tech ? `Old writings taught you ${TECHS[tech].name}` : 'It was empty';
      break;
    }
    case 'barbarians': {
      const spots = barbarianSpots(state, unit);
      const n = Math.min(HUTS.barbarianCount, spots.length);
      for (let i = 0; i < n; i++) addBarbarianUnit(state, HUTS.barbarianUnit, spots[i]!);
      text = n > 0 ? `It was a trap: ${n} barbarian${n === 1 ? '' : 's'} appeared!` : 'It was empty';
      break;
    }
  }
  addLog(state, owner, `Explored a hut: ${text}`, unit, undefined, { kind: 'hut' });
  return { kind, text };
}
