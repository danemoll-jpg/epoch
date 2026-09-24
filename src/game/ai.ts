// The AI. It only uses the same action functions the human player uses, only looks at tiles
// it has explored (plus rough, public numbers like military strength), and every choice is
// deterministic (the seeded RNG breaks ties and rolls the dice).
//
// Each turn: research (a priority list in data), diplomacy (diplomacy.ts: peace, war,
// demands, tech trades), armies (three of a kind on one tile merge), the war plan, units,
// then cities.
//
// Units (Milestone 5):
// - Each city keeps a few defenders at home, fortified (RULES.ai: 1 while expanding, 2 after,
//   3 in a city near an enemy during a war). The best defenders on the tile are the ones kept
//   (armies and attack-minded units are left free for the war plan).
// - Every other fighting unit is free. A free unit first takes a chance at hand (capture an
//   empty enemy city next to it, or attack the adjacent enemy with the best odds if they're
//   at least RULES.combat.aiAttackMinChancePct). Then: one unit explores while there's land
//   to explore; units go to a city that's short of defenders; and at war, units follow the
//   war plan: gather at the staging city (its own city nearest the target) until the force
//   is big enough, then march on the target city and attack it. Idle units wait in a city.
// - Settlers found the capital at once, and later cities on a decent site nearby.
//
// Cities (see chooseBuild): a defender first; Settlers while there's room to expand (the city
// target scales with the map's land per civ); defenders up to the cap; attackers during a
// war; buildings; a few attackers in peacetime; then nothing (production is stored for
// later). Spare gold rush-buys Settlers and buildings.

import { AI_BUILDING_ORDER } from '../data/buildings';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { UNITS, UNIT_IDS, type UnitTypeId } from '../data/units';
import { distance, neighbors, tileIndex } from './grid';
import { foundCity, foundCityError } from './city';
import { siteScore } from './mapgen';
import { attack, attackError, combatOdds, defenseStrength, fortify, formArmy, formArmyError } from './combat';
import { capturableCity } from './conquest';
import { runAiDiplomacy } from './diplomacy';
import { findUnit, isEnterable, moveUnit, moveUnitToward } from './movement';
import { buildChoiceError, buyCost, buyError, clearBuild, rushBuy, sameItem, setBuild, setFocus } from './production';
import { nextFloat } from './rng';
import { chooseAiResearch, setResearch } from './tech';
import { atWar } from './war';
import type { AiPlan, BuildItem, City, Coord, GameState, Unit } from './types';

const AI = RULES.ai;

/** Breadth-first step distances over explored, enterable tiles. */
function reachable(state: GameState, unit: Unit, maxSteps: number): Map<number, number> {
  const { map } = state;
  const explored = state.players[unit.owner]!.explored;
  const dist = new Map<number, number>([[tileIndex(map, unit.x, unit.y), 0]]);
  const queue: Coord[] = [{ x: unit.x, y: unit.y }];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(tileIndex(map, cur.x, cur.y))!;
    if (d >= maxSteps) continue;
    for (const n of neighbors(map, cur)) {
      const k = tileIndex(map, n.x, n.y);
      if (dist.has(k) || explored[k] !== 1) continue;
      if (!isEnterable(state, unit.owner, n.x, n.y)) continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

function coordOf(state: GameState, k: number): Coord {
  return { x: k % state.map.width, y: Math.floor(k / state.map.width) };
}

function isValidCitySite(state: GameState, c: Coord): boolean {
  const t = state.map.tiles[tileIndex(state.map, c.x, c.y)]!;
  if (!TERRAIN[t.terrain].canFoundCity) return false;
  return state.cities.every((city) => distance(city, c) >= RULES.minCityDistance);
}

function playSettler(state: GameState, unit: Unit): void {
  const hasCity = state.cities.some((c) => c.owner === unit.owner);
  if (!foundCityError(state, unit.id)) {
    // Capital goes down immediately; later cities only on a decent site.
    if (!hasCity || siteScore(state.map, unit) >= 20) {
      foundCity(state, unit.id);
      return;
    }
  }
  let best: { k: number; value: number } | undefined;
  for (const [k, steps] of reachable(state, unit, 8)) {
    const c = coordOf(state, k);
    if (!isValidCitySite(state, c)) continue;
    const value = siteScore(state.map, c) - steps * 3 + nextFloat(state);
    if (!best || value > best.value) best = { k, value };
  }
  if (best) {
    const target = coordOf(state, best.k);
    if (target.x === unit.x && target.y === unit.y) foundCity(state, unit.id);
    else moveUnitToward(state, unit.id, target);
    // Arrived with moves to spare? Settle now rather than waste a turn.
    const after = findUnit(state, unit.id);
    if (after && after.x === target.x && after.y === target.y && !foundCityError(state, unit.id)) {
      foundCity(state, unit.id);
    }
  } else if (!foundCityError(state, unit.id)) {
    foundCity(state, unit.id);
  } else {
    // No valid site in what we've seen yet: go and look.
    explore(state, unit);
  }
}

function cityAt(state: GameState, x: number, y: number): City | undefined {
  return state.cities.find((c) => c.x === x && c.y === y);
}

export function isMilitary(u: Unit): boolean {
  return UNITS[u.type].defense > 0 && !UNITS[u.type].canFoundCity;
}

function defendersIn(state: GameState, city: City): Unit[] {
  return state.units.filter((u) => u.owner === city.owner && u.x === city.x && u.y === city.y && isMilitary(u));
}

function citiesOf(state: GameState, playerId: number): City[] {
  return state.cities.filter((c) => c.owner === playerId).sort((a, b) => a.id - b.id);
}

function atWarWithAnyone(state: GameState, playerId: number): boolean {
  return state.players.some((p) => p.alive && atWar(state, playerId, p.id));
}

/** The unlocked military unit with the best defense (cheaper wins a tie). */
export function bestDefender(state: GameState, city: City): UnitTypeId {
  return bestUnit(state, city, (d) => d.defense);
}

/** The unlocked military unit with the best attack (cheaper wins a tie). */
export function bestAttacker(state: GameState, city: City): UnitTypeId {
  return bestUnit(state, city, (d) => d.attack);
}

function bestUnit(state: GameState, city: City, score: (d: (typeof UNITS)[UnitTypeId]) => number): UnitTypeId {
  let best: UnitTypeId = 'warrior';
  for (const id of UNIT_IDS) {
    const def = UNITS[id];
    if (def.canFoundCity || buildChoiceError(state, city, { kind: 'unit', id })) continue;
    const cur = UNITS[best];
    if (score(def) > score(cur) || (score(def) === score(cur) && def.cost < cur.cost)) best = id;
  }
  return best;
}

/** How many cities this AI aims for: the map's land per living civ, in data-set bounds. */
export function aiCityTarget(state: GameState): number {
  const land = state.map.tiles.filter((t) => TERRAIN[t.terrain].canFoundCity).length;
  const civs = Math.max(1, state.players.filter((p) => p.alive).length);
  return Math.max(AI.minTargetCities, Math.min(AI.maxTargetCities, Math.floor(land / civs / AI.landTilesPerCity)));
}

/** Is there a valid city site the AI has seen within reach (8 tiles) of one of its cities or settlers? */
function hasOpenSite(state: GameState, playerId: number): boolean {
  const explored = state.players[playerId]!.explored;
  const anchors: Coord[] = [
    ...citiesOf(state, playerId),
    ...state.units.filter((u) => u.owner === playerId && UNITS[u.type].canFoundCity),
  ];
  const r = 8;
  for (const a of anchors) {
    for (let y = a.y - r; y <= a.y + r; y++) {
      for (let x = a.x - r; x <= a.x + r; x++) {
        if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) continue;
        if (explored[tileIndex(state.map, x, y)] !== 1) continue;
        if (isValidCitySite(state, { x, y }) && !state.units.some((u) => u.x === x && u.y === y && u.owner !== playerId)) {
          return true;
        }
      }
    }
  }
  return false;
}

/** An enemy (at war) city within RULES.ai.borderDistance of this city? */
function nearEnemy(state: GameState, city: City): boolean {
  return state.cities.some((c) => atWar(state, city.owner, c.owner) && distance(c, city) <= AI.borderDistance);
}

/** Defenders this city keeps at home. */
export function defendersWanted(state: GameState, city: City, expanding: boolean): number {
  if (atWarWithAnyone(state, city.owner)) return nearEnemy(state, city) ? AI.borderDefendersAtWar : AI.defendersPerCity;
  return expanding ? 1 : AI.defendersPerCity;
}

/** Facts about an AI's empire that every city's build choice uses (computed once per turn). */
export interface BuildContext {
  target: number;
  openSite: boolean;
  atWar: boolean;
}

export function buildContext(state: GameState, playerId: number): BuildContext {
  return { target: aiCityTarget(state), openSite: hasOpenSite(state, playerId), atWar: atWarWithAnyone(state, playerId) };
}

function isSettlerBuild(c: City): boolean {
  return c.build?.kind === 'unit' && UNITS[c.build.id].canFoundCity;
}

function isMilitaryBuild(c: City): boolean {
  return c.build?.kind === 'unit' && !UNITS[c.build.id].canFoundCity;
}

/**
 * Build rules, first match wins:
 * 1. No defender at home → the best unlocked defender.
 * 2. Room to expand (fewer cities, counting settlers out and in production, than the target,
 *    and a known open site) → Settler, with only a few settlers under way at once. A size-1
 *    city switches to Food focus so the Settler can finish. (At war, step 3 comes first.)
 * 3. Fewer defenders than this city keeps → a defender.
 * 4. At war and fewer fighting units than the wartime cap → the best attacker.
 * 5. The next unlocked building in AI_BUILDING_ORDER it doesn't have.
 * 6. Fewer fighting units than the peacetime cap → the best attacker.
 * 7. Nothing (production is stored until something new is unlocked).
 */
export function chooseBuild(state: GameState, city: City, ctx: BuildContext = buildContext(state, city.owner)): BuildItem | null {
  const owner = city.owner;
  const defender: BuildItem = { kind: 'unit', id: bestDefender(state, city) };
  const home = defendersIn(state, city).length;
  if (home === 0) return defender;

  const mine = citiesOf(state, owner);
  const others = mine.filter((c) => c.id !== city.id);
  const settlersOut = state.units.filter((u) => u.owner === owner && UNITS[u.type].canFoundCity).length;
  const settlerBuilds = others.filter(isSettlerBuild).length;
  const underWay = settlersOut + settlerBuilds;
  const atOnce = mine.length <= 1 ? AI.settlersAtOnceFirst : AI.settlersAtOnce;
  const expanding = mine.length + underWay < ctx.target && ctx.openSite;
  const wanted = defendersWanted(state, city, expanding);
  // At war, a city tops up its defenders before sending out settlers.
  if (ctx.atWar && home < wanted) return defender;
  if (expanding && underWay < atOnce) return { kind: 'unit', id: 'settler' };
  if (home < wanted) return defender;

  const military = state.units.filter((u) => u.owner === owner && isMilitary(u)).length + others.filter(isMilitaryBuild).length;
  const kept = mine.length * AI.defendersPerCity;
  const attacker: BuildItem = { kind: 'unit', id: bestAttacker(state, city) };
  if (ctx.atWar && military < kept + Math.ceil(mine.length * AI.offensePerCityWar)) return attacker;

  const next = AI_BUILDING_ORDER.find((b) => !buildChoiceError(state, city, { kind: 'building', id: b }));
  if (next) return { kind: 'building', id: next };
  if (military < kept + Math.ceil(mine.length * AI.offensePerCityPeace)) return attacker;
  return null;
}

function manageCities(state: GameState, playerId: number): void {
  const ctx = buildContext(state, playerId);
  for (const city of citiesOf(state, playerId)) {
    const want = chooseBuild(state, city, ctx);
    if (want === null) {
      if (city.build !== null) clearBuild(state, city.id);
    } else if (!sameItem(city.build, want)) {
      setBuild(state, city.id, want);
    }
    // Grow toward size 2 before a Settler can finish; otherwise stay balanced.
    const focus = want?.kind === 'unit' && UNITS[want.id].popCost >= city.size ? 'food' : 'balanced';
    if (city.focus !== focus) setFocus(state, city.id, focus);
    // An undefended city buys its defender if the treasury allows.
    if (defendersIn(state, city).length === 0 && !buyError(state, city)) rushBuy(state, city.id);
  }
  // Spare gold finishes Settlers and buildings, cheapest first.
  const player = state.players[playerId]!;
  const buys = citiesOf(state, playerId)
    .filter((c) => c.build && (c.build.kind === 'building' || isSettlerBuild(c)) && !buyError(state, c))
    .sort((a, b) => buyCost(a)! - buyCost(b)! || a.id - b.id);
  for (const c of buys) {
    if (player.gold - buyCost(c)! < AI.goldReserve) break;
    rushBuy(state, c.id);
  }
}

/**
 * Captures an adjacent undefended enemy city, or attacks the adjacent enemy with the best
 * odds if they clear the threshold (an enemy city is preferred on a tie). True if it acted.
 */
export function tryCombat(state: GameState, unit: Unit): boolean {
  if (UNITS[unit.type].attack <= 0 || unit.movesLeft <= 0) return false;
  for (const n of neighbors(state.map, unit)) {
    if (capturableCity(state, unit, n)) return moveUnit(state, unit.id, n).ok;
  }
  let best: { at: Coord; chance: number; score: number } | undefined;
  for (const n of neighbors(state.map, unit)) {
    if (attackError(state, unit, n)) continue;
    const odds = combatOdds(state, unit, n)!;
    const score = odds.chance + (cityAt(state, n.x, n.y) ? 0.05 : 0);
    if (!best || score > best.score) best = { at: n, chance: odds.chance, score };
  }
  if (!best || best.chance * 100 < RULES.combat.aiAttackMinChancePct) return false;
  return attack(state, unit.id, best.at).ok;
}

/** Any three of a kind standing together become an army (lowest id first, so it's deterministic). */
function formArmies(state: GameState, playerId: number): void {
  const mine = state.units.filter((u) => u.owner === playerId).sort((a, b) => a.id - b.id);
  for (const u of mine) {
    if (findUnit(state, u.id) && !formArmyError(state, u)) formArmy(state, u.id);
  }
}

/** Walk toward the nearest frontier of unexplored tiles. False if there's none to go to. */
function explore(state: GameState, unit: Unit, wander = true): boolean {
  const { map } = state;
  const explored = state.players[unit.owner]!.explored;
  // Frontier: explored tiles we can reach that border unexplored ones. Go to the nearest.
  let best: { k: number; value: number } | undefined;
  for (const [k, steps] of reachable(state, unit, 40)) {
    if (steps === 0) continue;
    const c = coordOf(state, k);
    const unknown = neighbors(map, c).filter((n) => explored[tileIndex(map, n.x, n.y)] !== 1).length;
    if (unknown === 0) continue;
    const value = unknown - steps * 2 + nextFloat(state) * 2;
    if (!best || value > best.value) best = { k, value };
  }
  if (best) return moveUnitToward(state, unit.id, coordOf(state, best.k)).ok;
  if (!wander) return false;
  // Nothing left to explore nearby: wander to a random passable neighbor.
  const options = neighbors(map, unit).filter((n) => isEnterable(state, unit.owner, n.x, n.y));
  if (options.length) {
    const choice = options[Math.floor(nextFloat(state) * options.length)]!;
    return moveUnitToward(state, unit.id, choice).ok;
  }
  return false;
}

// ---- war plans -----------------------------------------------------------------------------

function nearestCity(cities: City[], to: Coord): City | undefined {
  let best: City | undefined;
  for (const c of cities) if (!best || distance(c, to) < distance(best, to)) best = c;
  return best;
}

/** A fresh plan against the closest known city of anyone we're at war with, or null. */
function choosePlan(state: GameState, playerId: number): AiPlan | null {
  const mine = citiesOf(state, playerId);
  const explored = state.players[playerId]!.explored;
  let best: { city: City; d: number } | undefined;
  for (const c of state.cities) {
    if (!atWar(state, playerId, c.owner) || explored[tileIndex(state.map, c.x, c.y)] !== 1) continue;
    const home = nearestCity(mine, c);
    const d = home ? distance(home, c) : 0;
    if (!best || d < best.d || (d === best.d && c.id < best.city.id)) best = { city: c, d };
  }
  if (!best) return null;
  const staging = nearestCity(mine, best.city);
  return { target: best.city.owner, cityId: best.city.id, stagingCityId: staging?.id ?? null, phase: 'gather', since: state.turn };
}

function planValid(state: GameState, playerId: number, plan: AiPlan | null): plan is AiPlan {
  if (!plan || !atWar(state, playerId, plan.target)) return false;
  const city = state.cities.find((c) => c.id === plan.cityId);
  return !!city && city.owner === plan.target && state.turn - plan.since <= 40;
}

function updatePlan(state: GameState, playerId: number): AiPlan | null {
  let plan = state.aiPlans[playerId] ?? null;
  if (!planValid(state, playerId, plan)) plan = choosePlan(state, playerId);
  if (plan?.stagingCityId != null && !state.cities.some((c) => c.id === plan!.stagingCityId && c.owner === playerId)) {
    plan.stagingCityId = nearestCity(citiesOf(state, playerId), state.cities.find((c) => c.id === plan!.cityId)!)?.id ?? null;
  }
  state.aiPlans[playerId] = plan;
  return plan;
}

function unitWeight(u: Unit): number {
  return u.army ? RULES.combat.armySize : 1;
}

/** Moves a unit next to `target` (the free tile beside it closest to the unit). */
function approach(state: GameState, unit: Unit, target: Coord): boolean {
  if (distance(unit, target) <= 1) return false;
  const spots = neighbors(state.map, target)
    .filter((n) => isEnterable(state, unit.owner, n.x, n.y))
    .sort((a, b) => distance(unit, a) - distance(unit, b) || a.y - b.y || a.x - b.x);
  for (const s of spots.slice(0, 3)) if (moveUnitToward(state, unit.id, s).ok) return true;
  return false;
}

/** Walks the unit toward (into) one of its own cities. */
function goHome(state: GameState, unit: Unit, city: City): boolean {
  if (unit.x === city.x && unit.y === city.y) return false;
  return moveUnitToward(state, unit.id, city).ok;
}

function hold(state: GameState, unit: Unit): void {
  const u = findUnit(state, unit.id);
  if (u && u.movesLeft > 0 && !u.fortified) fortify(state, u.id);
}

// ---- the turn ------------------------------------------------------------------------------

export function runAiTurn(state: GameState, playerId: number): void {
  const player = state.players[playerId]!;
  if (!player.researching) {
    const tech = chooseAiResearch(player);
    if (tech) setResearch(state, tech);
  }
  runAiDiplomacy(state, playerId);
  formArmies(state, playerId);
  const plan = updatePlan(state, playerId);
  const ctx = buildContext(state, playerId);
  const expanding = citiesOf(state, playerId).length < ctx.target && ctx.openSite;

  // Roles: each city keeps its strongest units at home, up to what it wants.
  const guards = new Set<number>();
  const short: City[] = [];
  for (const city of citiesOf(state, playerId)) {
    const want = defendersWanted(state, city, expanding);
    // Armies are for the war plan (one guards only a city with nothing else), and among the
    // rest the defensive units are kept before attack-minded ones.
    const guardScore = (u: Unit) => defenseStrength(state, u).total - UNITS[u.type].attack / 2;
    const all = defendersIn(state, city);
    const here = all.filter((u) => !u.army).sort((a, b) => guardScore(b) - guardScore(a) || a.id - b.id);
    if (here.length === 0 && all.length > 0) here.push(all.sort((a, b) => a.id - b.id)[0]!);
    for (const u of here.slice(0, want)) guards.add(u.id);
    if (here.length < want) short.push(city);
  }

  // The war plan: enough gathered at the staging city? Then march.
  const staging = plan?.stagingCityId != null ? state.cities.find((c) => c.id === plan.stagingCityId) : undefined;
  const targetCity = plan ? state.cities.find((c) => c.id === plan.cityId) : undefined;
  const free = state.units.filter((u) => u.owner === playerId && isMilitary(u) && !guards.has(u.id));
  if (plan && staging && plan.phase === 'gather') {
    const gathered = free.filter((u) => distance(u, staging) <= 1).reduce((s, u) => s + unitWeight(u), 0);
    if (gathered >= AI.minAttackForce) plan.phase = 'march';
  } else if (plan && plan.phase === 'march' && free.length === 0) {
    plan.phase = 'gather';
  }

  let explorer = expanding || !plan ? free.map((u) => u.id).sort((a, b) => a - b)[0] : undefined;
  const ids = state.units.filter((u) => u.owner === playerId).map((u) => u.id);
  for (const id of ids) {
    const unit = findUnit(state, id);
    if (!unit || unit.movesLeft <= 0) continue;
    if (UNITS[unit.type].canFoundCity) {
      playSettler(state, unit);
      continue;
    }
    if (guards.has(id)) {
      hold(state, unit);
      continue;
    }
    if (tryCombat(state, unit)) continue;
    if (id === explorer) {
      if (explore(state, unit, false)) continue;
      explorer = undefined;
    }
    // A city short of guards calls in help (not armies, and not units already marching).
    const needy = unit.army || plan?.phase === 'march' ? undefined : nearestCity(short, unit);
    if (needy && distance(needy, unit) <= 10 && goHome(state, unit, needy)) {
      if (findUnit(state, id)?.x === needy.x && findUnit(state, id)?.y === needy.y) short.splice(short.indexOf(needy), 1);
      continue;
    }
    if (plan && targetCity) {
      if (plan.phase === 'march' || !staging) {
        if (approach(state, unit, targetCity)) {
          const after = findUnit(state, id);
          if (after) tryCombat(state, after);
          continue;
        }
        hold(state, unit);
        continue;
      }
      if (distance(unit, staging) > 1 && goHome(state, unit, staging)) continue;
      hold(state, unit);
      continue;
    }
    const home = nearestCity(citiesOf(state, playerId), unit);
    if (home && goHome(state, unit, home)) continue;
    if (!home && explore(state, unit)) continue;
    hold(state, unit);
  }
  // After moving, so a city founded this turn gets its first build choice right away.
  manageCities(state, playerId);
}
