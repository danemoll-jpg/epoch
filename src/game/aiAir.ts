// The AI in the air (Round 10). Deterministic, and it only uses the player's own actions
// (attack, rebase).
//
// Builds (airBuild, asked by chooseBuild in ai.ts):
// - Fighters for defense once it can build them (Flight is a Modern tech): in border cities (a
//   met rival's city within RULES.ai.borderDistance) and coastal cities, at most one per city,
//   and RULES.ai.air.fightersPerCity per such city in all.
// - At war with a plan: bombers (its strongest strike aircraft), RULES.ai.air.bombersPerCityWar
//   per city.
//
// Each turn, before its land units move (runAiAir), so strikes soften targets ahead of an
// invasion: every aircraft with its turn left strikes the best target in range whose overall
// odds (not shot down by a fighter × winning the fight) clear strikeMinChancePct, the war
// plan's target city and enemies next to its own units first. An aircraft with nothing to
// strike rebases toward the front: to its own city closest to the plan's target, if that's
// closer than where it is now.

import { RULES } from '../data/rules';
import { UNITS, UNIT_IDS, type UnitTypeId } from '../data/units';
import { airRange, rebase, rebaseError, recon, reconError, tilesWithin } from './air';
import { attack, attackError, overallChance } from './combat';
import { distance, neighbors } from './grid';
import { isAir, isCoastal } from './naval';
import { buildChoiceError } from './production';
import type { AiPlan, City, Coord, GameState, Unit } from './types';

const A = RULES.ai.air;

function isFighterType(id: UnitTypeId): boolean {
  return UNITS[id].domain === 'air' && (UNITS[id].airAttack ?? 0) > 0;
}

function isBomberType(id: UnitTypeId): boolean {
  return UNITS[id].domain === 'air' && !isFighterType(id) && !UNITS[id].recon;
}

function isDroneType(id: UnitTypeId): boolean {
  return UNITS[id].domain === 'air' && !!UNITS[id].recon;
}

/** The best aircraft of a kind this city can build (by `score`, cheaper on a tie), if any. */
function bestAir(state: GameState, city: City, kind: (id: UnitTypeId) => boolean, score: (id: UnitTypeId) => number): UnitTypeId | undefined {
  let best: UnitTypeId | undefined;
  for (const id of UNIT_IDS) {
    if (!kind(id) || buildChoiceError(state, city, { kind: 'unit', id })) continue;
    if (!best || score(id) > score(best) || (score(id) === score(best) && UNITS[id].cost < UNITS[best].cost)) best = id;
  }
  return best;
}

/** A city that should keep a fighter: coastal, or near a met rival's city. */
export function airDefenseCity(state: GameState, city: City): boolean {
  if (isCoastal(state, city)) return true;
  const met = state.diplomacy.met[city.owner] ?? [];
  return state.cities.some((c) => c.owner !== city.owner && met[c.owner] && distance(c, city) <= RULES.ai.borderDistance);
}

function count(state: GameState, owner: number, kind: (id: UnitTypeId) => boolean, at?: City): number {
  const units = state.units.filter((u) => u.owner === owner && kind(u.type) && (!at || (u.x === at.x && u.y === at.y && u.carriedBy === null))).length;
  const builds = state.cities.filter((c) => c.owner === owner && (!at || c.id === at.id) && c.build?.kind === 'unit' && kind(c.build.id)).length;
  return units + builds;
}

/**
 * Aircraft this city should build now, if any: `fighter` (defense, any time) and `bomber`
 * (only at war with a plan). chooseBuild decides where they fit among its other choices.
 */
export function airBuild(state: GameState, city: City, atWar: boolean): { fighter?: UnitTypeId; bomber?: UnitTypeId; drone?: UnitTypeId } {
  const owner = city.owner;
  const out: { fighter?: UnitTypeId; bomber?: UnitTypeId; drone?: UnitTypeId } = {};
  // Round 19: a Drone or two (a scout in peacetime, cheap strikes at war).
  const drone = bestAir(state, city, isDroneType, (id) => UNITS[id].range ?? 0);
  if (drone) {
    const building = city.build?.kind === 'unit' && isDroneType(city.build.id) ? 1 : 0;
    if (count(state, owner, isDroneType) - building < (atWar ? A.dronesPerCivWar : A.dronesPerCiv)) out.drone = drone;
  }
  const fighter = bestAir(state, city, isFighterType, (id) => UNITS[id].airAttack ?? 0);
  if (fighter && airDefenseCity(state, city)) {
    const mine = state.cities.filter((c) => c.owner === owner);
    const cap = Math.ceil(mine.filter((c) => airDefenseCity(state, c)).length * A.fightersPerCity);
    // Count this city's own build as not there yet, so it keeps choosing the same thing.
    const building = city.build?.kind === 'unit' && isFighterType(city.build.id) ? 1 : 0;
    if (count(state, owner, isFighterType, city) - building < 1 && count(state, owner, isFighterType) - building < cap) out.fighter = fighter;
  }
  const bomber = bestAir(state, city, isBomberType, (id) => UNITS[id].attack);
  if (bomber && atWar && state.aiPlans[owner]) {
    const cap = Math.ceil(state.cities.filter((c) => c.owner === owner).length * A.bombersPerCityWar);
    const building = city.build?.kind === 'unit' && isBomberType(city.build.id) ? 1 : 0;
    if (count(state, owner, isBomberType) - building < cap) out.bomber = bomber;
  }
  return out;
}

/** The best tile for this aircraft to strike, or undefined if nothing clears the odds rule. */
export function bestStrike(state: GameState, unit: Unit, plan: AiPlan | null): Coord | undefined {
  const targetCity = plan ? state.cities.find((c) => c.id === plan.cityId) : undefined;
  let best: { at: Coord; score: number } | undefined;
  for (const at of tilesWithin(state, unit, airRange(unit))) {
    if (attackError(state, unit, at)) continue;
    const chance = overallChance(state, unit, at);
    if (chance * 100 < A.strikeMinChancePct) continue;
    let score = chance;
    if (targetCity && distance(targetCity, at) === 0) score += 0.1;
    else if (targetCity && distance(targetCity, at) <= 1) score += 0.05;
    if (neighbors(state.map, at).some((n) => state.units.some((u) => u.owner === unit.owner && u.x === n.x && u.y === n.y && !isAir(u)))) score += 0.05;
    if (!best || score > best.score || (score === best.score && (at.y < best.at.y || (at.y === best.at.y && at.x < best.at.x)))) best = { at, score };
  }
  return best?.at;
}

/** Rebase toward the war plan's target city (own cities only). True if it moved. */
function rebaseTowardFront(state: GameState, unit: Unit, target: City): boolean {
  const here = distance(unit, target);
  let best: { city: City; d: number } | undefined;
  for (const c of state.cities) {
    if (c.owner !== unit.owner || rebaseError(state, unit, c)) continue;
    const d = distance(c, target);
    if (d >= here) continue;
    if (!best || d < best.d || (d === best.d && c.id < best.city.id)) best = { city: c, d };
  }
  return !!best && rebase(state, unit.id, best.city).ok;
}

/** Plays this AI's aircraft for the turn: strike, else rebase toward the front. */
export function runAiAir(state: GameState, playerId: number, plan: AiPlan | null): void {
  const planes = state.units.filter((u) => u.owner === playerId && isAir(u)).sort((a, b) => a.id - b.id);
  const targetCity = plan ? state.cities.find((c) => c.id === plan.cityId) : undefined;
  for (const p of planes) {
    const unit = state.units.find((u) => u.id === p.id);
    if (!unit || unit.movesLeft <= 0) continue;
    const at = bestStrike(state, unit, plan);
    if (at) {
      attack(state, unit.id, at);
      continue;
    }
    // Round 19: a Drone with nothing to strike scouts (the war target, else the nearest dark area).
    if (UNITS[unit.type].recon && droneScout(state, unit, targetCity)) continue;
    if (targetCity) rebaseTowardFront(state, unit, targetCity);
  }
}

/** Round 19: where an AI Drone scouts: the plan's target city if in range, else the closest unexplored tile in range. */
function droneScout(state: GameState, unit: Unit, targetCity: City | undefined): boolean {
  if (targetCity && !reconError(state, unit, targetCity)) return recon(state, unit.id, targetCity).ok;
  const explored = state.players[unit.owner]!.explored;
  let best: { at: Coord; d: number } | undefined;
  for (const at of tilesWithin(state, unit, airRange(unit))) {
    if (explored[at.y * state.map.width + at.x] === 1 || reconError(state, unit, at)) continue;
    const d = distance(unit, at);
    if (!best || d < best.d || (d === best.d && (at.y < best.at.y || (at.y === best.at.y && at.x < best.at.x)))) best = { at, d };
  }
  return !!best && recon(state, unit.id, best.at).ok;
}
