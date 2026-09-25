// The AI at sea (Round 8). Same rules and actions as the player; deterministic.
//
// - Boxed in (below its city target, no open site on its own landmass): it researches Map
//   Making, builds a boat in a coastal city, and the boat explores the coast while no
//   overseas site is known.
// - Settling overseas (a 'settle' sea plan): once it knows a good site on another landmass
//   that its ship can reach, the port city builds a Settler; the Settler (and a free unit as
//   escort, if there is one) board in port, the ship sails next to the site, and they go
//   ashore on it. The Settler founds the city on its next turn.
// - Invading (an 'invade' sea plan): when its war plan's target city is on a landmass where it
//   has no city, the war plan's units gather at a port instead; they board (armies count as
//   one), the ship sails next to the target, and they go ashore next to it (or straight into
//   it if it's empty, capturing it). Then the war plan marches as usual.
// - Coastal defense: once a rival it has met has ships, it keeps a warship or two in port;
//   they attack enemy ships (or bombard) nearby when the odds are good.

import { aiVictoryGoal } from './aiGoals';
import { RULES } from '../data/rules';
import { UNITS, UNIT_IDS, type UnitTypeId } from '../data/units';
import { CivName, capturableCity } from './conquest';
import { unitVisibleTo, visibleTiles } from './fog';
import { distance, neighbors, tileIndex } from './grid';
import { addLog } from './log';
import { landmassAt, siteScore } from './mapgen';
import { boardShip, findUnit, isEnterable, moveUnit, moveUnitToward, stepError } from './movement';
import { cargoOf, cargoRoom, isCoastal, isShip, isWaterAt, terrainAllows } from './naval';
import { buildChoiceError } from './production';
import { hasTech } from './tech';
import { atWar } from './war';
import { citiesOf, isMilitary, isValidCitySite, tryCombat } from './ai';
import type { AiFerry, AiPlan, City, Coord, GameState, Unit } from './types';

const N = RULES.ai.naval;

function coord(state: GameState, k: number): Coord {
  return { x: k % state.map.width, y: Math.floor(k / state.map.width) };
}

/** Ship types this player can build that carry land units, best first (most cargo, then cheapest). */
export function cargoShipTypes(state: GameState, playerId: number): UnitTypeId[] {
  const player = state.players[playerId]!;
  return UNIT_IDS.filter((id) => UNITS[id].domain === 'sea' && UNITS[id].cargo > 0 && hasTech(player, UNITS[id].requires)).sort(
    (a, b) => UNITS[b].cargo - UNITS[a].cargo || UNITS[a].cost - UNITS[b].cost,
  );
}

/** A warship: a ship that can really fight (not a Galley, Caravel, or Transport). */
export function isWarship(u: Unit): boolean {
  return isShip(u) && UNITS[u.type].attack >= 2;
}

function cargoShips(state: GameState, p: number): Unit[] {
  return state.units.filter((u) => u.owner === p && isShip(u) && UNITS[u.type].cargo > 0).sort((a, b) => a.id - b.id);
}

function isShipBuild(c: City, test: (id: UnitTypeId) => boolean): boolean {
  return c.build?.kind === 'unit' && UNITS[c.build.id].domain === 'sea' && test(c.build.id);
}

/**
 * Steps a ship of this type could sail from `from` (its own coastal cities count as water).
 * Like land paths, unexplored tiles are assumed open, so a voyage can head into the unknown;
 * the ship finds out on the way. Units in the way are ignored: they move.
 */
function seaSteps(state: GameState, owner: number, type: UnitTypeId, from: Coord): Map<number, number> {
  const explored = state.players[owner]!.explored;
  const start = tileIndex(state.map, from.x, from.y);
  const dist = new Map<number, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const k = queue.shift()!;
    for (const n of neighbors(state.map, coord(state, k))) {
      const j = tileIndex(state.map, n.x, n.y);
      if (dist.has(j) || (explored[j] === 1 && !terrainAllows(state, type, owner, n.x, n.y))) continue;
      dist.set(j, dist.get(k)! + 1);
      queue.push(j);
    }
  }
  return dist;
}

/** Coastal cities of this player, lowest id first. */
function ports(state: GameState, p: number): City[] {
  return citiesOf(state, p).filter((c) => isCoastal(state, c));
}

/** Is there an own city on this landmass? */
function hasCityOn(state: GameState, p: number, landmass: number): boolean {
  return citiesOf(state, p).some((c) => landmassAt(state.map, c) === landmass);
}

interface Voyage {
  port: City;
  target: Coord;
  landing: Coord;
  steps: number;
  value: number;
}

/**
 * The best known city site on another landmass (one with no city of ours yet, so each voyage
 * opens up new land) that a ship of this type can reach from one of our ports.
 */
export function findOverseasSite(state: GameState, p: number, type: UnitTypeId): Voyage | undefined {
  const explored = state.players[p]!.explored;
  let best: Voyage | undefined;
  for (const port of ports(state, p)) {
    const steps = seaSteps(state, p, type, port);
    const home = landmassAt(state.map, port);
    for (let k = 0; k < state.map.tiles.length; k++) {
      if (explored[k] !== 1) continue;
      const site = coord(state, k);
      const land = landmassAt(state.map, site);
      if (land < 0 || land === home || hasCityOn(state, p, land) || !isValidCitySite(state, site)) continue;
      if (state.units.some((u) => u.x === site.x && u.y === site.y && u.owner !== p)) continue;
      const score = siteScore(state.map, site);
      if (score < N.minSiteScore) continue;
      let landing: { c: Coord; s: number } | undefined;
      for (const n of neighbors(state.map, site)) {
        const s = steps.get(tileIndex(state.map, n.x, n.y));
        if (s !== undefined && isWaterAt(state, n.x, n.y) && (!landing || s < landing.s)) landing = { c: n, s };
      }
      if (!landing) continue;
      const value = score - landing.s * N.sitePerStep;
      if (!best || value > best.value) best = { port, target: site, landing: landing.c, steps: landing.s, value };
    }
  }
  return best;
}

/** The water tile to unload next to an enemy city: next to a free land tile beside it (or the city itself). */
function findLanding(state: GameState, p: number, type: UnitTypeId, city: Coord): Voyage | undefined {
  let best: Voyage | undefined;
  for (const port of ports(state, p)) {
    const steps = seaSteps(state, p, type, port);
    for (const [k, s] of steps) {
      const w = coord(state, k);
      if (!isWaterAt(state, w.x, w.y)) continue;
      const shore = neighbors(state.map, w).some(
        (l) => distance(l, city) <= 1 && ((l.x === city.x && l.y === city.y) || isEnterable(state, p, l.x, l.y)),
      );
      if (!shore) continue;
      if (!best || s < best.steps) best = { port, target: city, landing: w, steps: s, value: -s };
    }
  }
  return best;
}

/** The type a sea plan will sail with: the ship it already has, or the one it would build. */
function planShipType(state: GameState, p: number): UnitTypeId | undefined {
  return cargoShips(state, p)[0]?.type ?? cargoShipTypes(state, p)[0];
}

// ---- plans ---------------------------------------------------------------------------------

function ferryValid(state: GameState, p: number, f: AiFerry, war: AiPlan | null): boolean {
  if (state.turn - f.since > N.maxPlanTurns) return false;
  const port = state.cities.find((c) => c.id === f.portCityId);
  if (!port || port.owner !== p) return false;
  if (f.shipId !== null && !findUnit(state, f.shipId)) return false;
  if (f.kind === 'settle') {
    if (!isValidCitySite(state, f.target)) return false;
    return !state.units.some((u) => u.x === f.target.x && u.y === f.target.y && u.owner !== p);
  }
  const city = state.cities.find((c) => c.x === f.target.x && c.y === f.target.y);
  return !!city && atWar(state, p, city.owner) && !!war;
}

/**
 * Keeps this AI's sea plan up to date: drops a plan that no longer makes sense, and starts a
 * new one: settling overseas when `boxedIn`, or carrying the war plan's force overseas.
 */
export function updateFerry(state: GameState, p: number, boxedIn: boolean, war: AiPlan | null): AiFerry | null {
  let f = state.aiFerries[p] ?? null;
  if (f && !ferryValid(state, p, f, war)) f = null;
  if (!f) {
    const type = planShipType(state, p);
    if (type) {
      const target = war ? state.cities.find((c) => c.id === war.cityId) : undefined;
      const overseas = target && landmassAt(state.map, target) >= 0 && !hasCityOn(state, p, landmassAt(state.map, target));
      const voyage = overseas ? findLanding(state, p, type, target) : boxedIn ? findOverseasSite(state, p, type) : undefined;
      if (voyage) {
        f = {
          kind: overseas ? 'invade' : 'settle',
          portCityId: voyage.port.id,
          shipId: null,
          target: { x: voyage.target.x, y: voyage.target.y },
          landing: voyage.landing,
          phase: 'load',
          since: state.turn,
        };
      }
    }
  }
  state.aiFerries[p] = f;
  // The war plan's units gather at the port the invasion sails from.
  if (f?.kind === 'invade' && war) war.stagingCityId = f.portCityId;
  return f;
}

// ---- carrying it out -----------------------------------------------------------------------

/** Units this plan wants aboard: for settling a Settler and one escort; for an invasion, the free fighting units. */
function wantedCargo(state: GameState, p: number, f: AiFerry, port: City, guards: Set<number>): Unit[] {
  const land = landmassAt(state.map, port);
  const near = (u: Unit) => u.owner === p && u.carriedBy === null && landmassAt(state.map, u) === land;
  const byDistance = (a: Unit, b: Unit) => distance(a, port) - distance(b, port) || a.id - b.id;
  const fighters = state.units.filter((u) => near(u) && isMilitary(u) && !guards.has(u.id)).sort(byDistance);
  if (f.kind === 'invade') return fighters;
  const settlers = state.units.filter((u) => near(u) && UNITS[u.type].canFoundCity).sort(byDistance);
  // The escort, once picked, stays picked.
  const picked = f.escortId !== undefined ? findUnit(state, f.escortId) : undefined;
  const escort = picked && picked.carriedBy === null && near(picked) ? picked : fighters[0];
  if (escort && !picked) f.escortId = escort.id;
  return [...settlers.slice(0, 1), ...(escort ? [escort] : [])];
}

function unitWeight(u: Unit): number {
  return u.army ? RULES.combat.armySize : 1;
}

/**
 * Runs this AI's sea plan for the turn: the ship comes to port, units board, the ship sails,
 * and the cargo goes ashore. Returns the units it moved (or is holding for boarding) so the
 * rest of the AI leaves them alone.
 */
export function runFerry(state: GameState, p: number, guards: Set<number>): Set<number> {
  const reserved = new Set<number>();
  const f = state.aiFerries[p];
  if (!f) return reserved;
  const port = state.cities.find((c) => c.id === f.portCityId)!;
  let ship = f.shipId !== null ? findUnit(state, f.shipId) : undefined;
  if (!ship) {
    ship = cargoShips(state, p).sort((a, b) => distance(a, port) - distance(b, port) || a.id - b.id)[0];
    if (ship) f.shipId = ship.id;
  }
  // The units it wants walk to the port (and wait there while a ship is built).
  const wanted = wantedCargo(state, p, f, port, guards);
  if (f.phase === 'load') {
    for (const u of wanted) {
      reserved.add(u.id);
      if (u.x !== port.x || u.y !== port.y) moveUnitToward(state, u.id, port);
    }
  }
  if (!ship) return reserved;
  reserved.add(ship.id);
  for (const c of cargoOf(state, ship)) reserved.add(c.id);

  if (f.phase === 'load') {
    if (ship.x !== port.x || ship.y !== port.y) {
      moveUnitToward(state, ship.id, port);
      return reserved;
    }
    for (const u of wanted) {
      const cur = findUnit(state, u.id);
      if (cur && cur.x === port.x && cur.y === port.y && cur.movesLeft > 0 && cargoRoom(state, ship) > 0) boardShip(state, cur.id, ship.id);
    }
    const cargo = cargoOf(state, ship);
    for (const c of cargo) reserved.add(c.id);
    if (cargo.length > 0 && f.loadedSince === undefined) f.loadedSince = state.turn;
    const waited = f.loadedSince === undefined ? 0 : state.turn - f.loadedSince;
    const full = cargoRoom(state, ship) <= 0;
    let ready: boolean;
    if (f.kind === 'settle') {
      const settler = cargo.some((u) => UNITS[u.type].canFoundCity);
      const escort = cargo.some((u) => !UNITS[u.type].canFoundCity);
      const escortComing = wanted.some((u) => !UNITS[u.type].canFoundCity && u.carriedBy === null);
      ready = settler && (escort || full || !escortComing || waited >= N.escortWaitTurns);
    } else {
      const weight = cargo.reduce((s, u) => s + unitWeight(u), 0);
      // Round 11: a conqueror sails with a bigger force.
      const force = aiVictoryGoal(state, p) === 'domination' ? RULES.ai.victory.dominationAttackForce : RULES.ai.minAttackForce;
      ready = cargo.length > 0 && (weight >= force || full || waited >= N.invadeWaitTurns * (force > RULES.ai.minAttackForce ? 2 : 1));
    }
    if (!ready) return reserved;
    f.phase = 'sail';
  }

  // Sailing: head for the landing, then put everyone ashore.
  if (ship.x !== f.landing.x || ship.y !== f.landing.y) {
    const res = moveUnitToward(state, ship.id, f.landing);
    ship = findUnit(state, ship.id);
    if (!ship) return reserved;
    if (!res.ok && distance(ship, f.landing) <= 1) {
      // Someone is in the way at the landing: unload from here if it's next to the target.
      if (distance(ship, f.target) > 1) return reserved;
    } else if (ship.x !== f.landing.x || ship.y !== f.landing.y) {
      return reserved;
    }
  }
  goAshore(state, p, f, ship);
  return reserved;
}

/** Puts the cargo ashore next to (or onto) the target, and ends the plan once it's done. */
function goAshore(state: GameState, p: number, f: AiFerry, ship: Unit): void {
  const cargo = cargoOf(state, ship).sort((a, b) => Number(UNITS[b.type].canFoundCity) - Number(UNITS[a.type].canFoundCity) || a.id - b.id);
  const city = f.kind === 'invade' ? state.cities.find((c) => c.x === f.target.x && c.y === f.target.y) : undefined;
  let landed = 0;
  for (const u of cargo) {
    if (u.movesLeft <= 0) continue;
    // Straight into an empty enemy city, or onto the city site.
    if (distance(ship, f.target) === 1 && (f.kind === 'settle' || (city && capturableCity(state, u, city))) && !stepError(state, u, f.target)) {
      if (moveUnit(state, u.id, f.target).ok) {
        landed++;
        continue;
      }
    }
    const spots = neighbors(state.map, ship)
      .filter((l) => !isWaterAt(state, l.x, l.y) && !stepError(state, u, l))
      .sort((a, b) => distance(a, f.target) - distance(b, f.target) || a.y - b.y || a.x - b.x);
    if (spots.length && moveUnit(state, u.id, spots[0]!).ok) landed++;
  }
  if (landed === 0) return;
  if (f.kind === 'invade' && city) {
    addLog(state, p, `${CivName(state, p)} landed troops near ${city.name}!`, ship, city.owner, { kind: 'landing' });
    const war = state.aiPlans[p];
    if (war) war.phase = 'march';
  }
  if (cargoOf(state, ship).length === 0) state.aiFerries[p] = null;
}

// ---- what to build, and the other ships ----------------------------------------------------

export interface NavalBuild {
  /** A cargo ship to build in this city (for the sea plan, or to explore when boxed in). */
  boat?: UnitTypeId;
  /** A warship to build in this city (coastal defense). */
  warship?: UnitTypeId;
}

/** Does a met rival have ships? Then it's worth keeping warships. */
function rivalsHaveShips(state: GameState, p: number): boolean {
  return state.units.some((u) => u.owner !== p && isShip(u) && state.diplomacy.met[p]?.[u.owner]);
}

/** What this city should build for the navy, if anything. `scout`: a boat is wanted to explore by sea. */
export function navalBuild(state: GameState, city: City, scout: boolean): NavalBuild {
  const p = city.owner;
  const out: NavalBuild = {};
  if (!isCoastal(state, city)) return out;
  const mine = citiesOf(state, p);
  const f = state.aiFerries[p] ?? null;
  const types = cargoShipTypes(state, p).filter((t) => !buildChoiceError(state, city, { kind: 'unit', id: t }));
  const haveBoat = cargoShips(state, p).length > 0 || mine.some((c) => isShipBuild(c, (id) => UNITS[id].cargo > 0));
  if (types.length && !haveBoat) {
    // The sea plan's port builds its ship; otherwise the first port builds an explorer.
    const boatPort = f ? f.portCityId : scout ? ports(state, p)[0]?.id : undefined;
    if (boatPort === city.id) out.boat = f ? types[0] : [...types].sort((a, b) => UNITS[a].cost - UNITS[b].cost)[0];
  }
  if (rivalsHaveShips(state, p)) {
    const want = Math.min(N.warships, ports(state, p).length);
    const have = state.units.filter((u) => u.owner === p && isWarship(u)).length + mine.filter((c) => isShipBuild(c, (id) => UNITS[id].attack >= 2)).length;
    const best = UNIT_IDS.filter((id) => UNITS[id].domain === 'sea' && UNITS[id].attack >= 2 && !buildChoiceError(state, city, { kind: 'unit', id })).sort(
      (a, b) => UNITS[b].attack + UNITS[b].defense - (UNITS[a].attack + UNITS[a].defense) || UNITS[a].cost - UNITS[b].cost,
    )[0];
    if (best && have < want) out.warship = best;
  }
  return out;
}

/**
 * A ship outside the sea plan: warships defend and hunt; an empty boat explores when its civ is
 * boxed in (looking for land) or at war without a known target (looking for the enemy).
 */
export function playShip(state: GameState, ship: Unit, explore: (u: Unit, wander: boolean) => boolean, scout: boolean): void {
  const p = ship.owner;
  if (tryCombat(state, ship)) return;
  if (isWarship(ship)) {
    // An enemy ship in sight and close: go after it.
    const vis = visibleTiles(state, p);
    const prey = state.units
      .filter((u) => isShip(u) && atWar(state, p, u.owner) && unitVisibleTo(state, p, u, vis) && distance(u, ship) <= N.huntDistance)
      .sort((a, b) => distance(a, ship) - distance(b, ship) || a.id - b.id)[0];
    if (prey) {
      const spot = neighbors(state.map, prey)
        .filter((n) => terrainAllows(state, ship.type, p, n.x, n.y))
        .sort((a, b) => distance(a, ship) - distance(b, ship) || a.y - b.y || a.x - b.x)[0];
      if (spot && moveUnitToward(state, ship.id, spot).ok) {
        const after = findUnit(state, ship.id);
        if (after) tryCombat(state, after);
        return;
      }
    }
  } else if (scout && cargoOf(state, ship).length === 0 && explore(ship, false)) {
    return;
  }
  // Otherwise wait in the nearest port.
  const home = ports(state, p).sort((a, b) => distance(a, ship) - distance(b, ship) || a.id - b.id)[0];
  if (home && (home.x !== ship.x || home.y !== ship.y)) moveUnitToward(state, ship.id, home);
}
