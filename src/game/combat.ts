// Combat, fortifying, and armies (Milestone 4).
//
// A fight has one result: the attacker wins with probability A / (A + D), where A is the
// attacker's attack and D the defender's defense, each after its bonuses (see winChance,
// the one place the formula lives). The loser is destroyed; there are no hit points. The
// winner may become a veteran. Attacking uses up the attacker's turn. An open-field winner
// stays where it is; but when the attack kills the last defender of an enemy city, the
// winner advances into the city and captures it at once (round 5, decided by Dan). When a
// tile holds several units, the one with the best defense fights; if it loses, only it dies.
//
// Bonuses are percentages that add up: terrain (hills, forest), fortified, veteran (either
// side), in a city, and Walls (in a city, against land attacks). They're listed in the
// odds so the player sees where the numbers come from. All values are in data.
//
// Ships (Round 8): ships fight ships with the same odds rule. A ship can also bombard an
// adjacent land tile: if it wins, the defender dies but the ship never moves in or captures;
// if it loses, the ship sinks. A sunk ship takes its cargo with it. Land units can't attack
// ships at sea, cargo can't attack from a ship, ships in port don't defend their city, and
// Walls count only against land attacks. Three ships of one type can form a fleet (a naval
// army: Dan decided yes to Q11); it carries all three ships' cargo.
//
// Aircraft (Round 10; see air.ts): a based aircraft strikes any tile within its range (one it
// can see), with the same odds rule. A win destroys the defender, but aircraft never move in
// or capture: afterwards the aircraft is back at its base. A loss destroys it. The Helicopter
// attacks from next door like a land unit, and never moves in either. Before an aircraft's (or
// a Helicopter's) fight, the defender's best fighter whose base is within its range of the
// target intercepts it: if the fighter wins, the attacker is shot down and the strike never
// happens; if it loses, the fighter is lost and the strike goes ahead. A Stealth Bomber is
// harder to intercept (its `evadePct` comes off the fighter's strength). Fighters use their
// `airAttack` against aircraft. Aircraft never defend a tile, and there are no air armies (Q16).

import { BUILDINGS } from '../data/buildings';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { GREAT_PEOPLE_RULES } from '../data/greatPeople';
import { isBarbarian, raidCity, raidError, villageAt, villageDefensePct } from './barbarians';
import { captureCity, checkEliminations, civAdjective, CivName, civName } from './conquest';
import { recordLoss, updateContacts } from './diplomacy';
import { enterTile } from './villages';
import { settled } from './yields';
import { distance, tileAt } from './grid';
import { addLog } from './log';
import { findUnit } from './movement';
import { unitVisibleTo, updateExplored } from './fog';
import { nextFloat } from './rng';
import { atWar } from './war';
import { armyWord, canCapture, defendsTile, hovers, isAir, isAircraft, isShip, isWaterAt, removeUnit } from './naval';
import { airRange } from './air';
import { attackMods, defenseMods, effectsOf } from './leaders';
import type { ActionResult, CombatReport, Coord, GameState, Unit } from './types';

export interface Modifier {
  label: string;
  pct: number;
}

export interface Strength {
  /** The unit type's value, × the army multiplier for an army. */
  base: number;
  mods: Modifier[];
  /** base × (1 + sum of mods / 100). */
  total: number;
}

export interface CombatOdds {
  attacker: Unit;
  defender: Unit;
  attack: Strength;
  defense: Strength;
  /** The attacker's win chance, 0–1. */
  chance: number;
}

/** The combat formula. Change it here and nowhere else. */
export function winChance(attack: number, defense: number): number {
  if (attack <= 0) return 0;
  if (defense <= 0) return 1;
  return attack / (attack + defense);
}

function strength(base: number, mods: Modifier[]): Strength {
  const pct = mods.reduce((sum, m) => sum + m.pct, 0);
  return { base, mods, total: base * (1 + pct / 100) };
}

function armyFactor(u: Unit): number {
  return u.army ? RULES.combat.armyMultiplier : 1;
}

/** A settled Great General (Round 9) makes armies attacking from, or defending in, its city fight better. */
function generalMod(state: GameState | undefined, u: Unit): Modifier | undefined {
  if (!state || !u.army) return undefined;
  const city = state.cities.find((c) => c.x === u.x && c.y === u.y && c.owner === u.owner);
  const n = city ? settled(city, 'general') : 0;
  return n > 0 ? { label: 'Great General', pct: n * GREAT_PEOPLE_RULES.generalArmyPct } : undefined;
}

/**
 * `vsAircraft`: a fighter attacking a Helicopter uses its strength against aircraft (Round 10).
 * `defenderOwner`: whom it's attacking, for leader bonuses that depend on it (Round 11).
 */
export function attackStrength(u: Unit, state?: GameState, vsAircraft = false, defenderOwner?: number): Strength {
  const mods: Modifier[] = [];
  if (u.veteran) mods.push({ label: 'Veteran', pct: RULES.combat.veteranPct });
  const general = generalMod(state, u);
  if (general) mods.push(general);
  if (state) mods.push(...attackMods(state, u, defenderOwner));
  const def = UNITS[u.type];
  const base = vsAircraft && (def.airAttack ?? 0) > def.attack ? def.airAttack! : def.attack;
  return strength(base * armyFactor(u), mods);
}

/** Only an attack by a walking land unit is a land attack (for Walls): not ships, aircraft, or Helicopters. */
export function isLandAttack(u: Unit): boolean {
  return !isShip(u) && !isAircraft(u);
}

/** The Walls bonus applies to land attacks only. */
export function defenseStrength(state: GameState, u: Unit, attackerIsLand = true): Strength {
  const mods: Modifier[] = [];
  const terrain = TERRAIN[tileAt(state.map, u.x, u.y)!.terrain];
  const city = state.cities.find((c) => c.x === u.x && c.y === u.y);
  if (terrain.defensePct) mods.push({ label: terrain.name, pct: terrain.defensePct });
  // A barbarian village (Round 9) is dug in.
  const village = villageDefensePct(state, u);
  if (village) mods.push({ label: 'Barbarian village', pct: village });
  if (city) {
    mods.push({ label: 'In a city', pct: RULES.combat.cityDefensePct });
    if (attackerIsLand) {
      for (const b of city.buildings) {
        const pct = BUILDINGS[b].effects.defenseBonusPct;
        if (pct) mods.push({ label: BUILDINGS[b].name, pct });
      }
    }
  }
  // A ship told to stay put (Round 8) is marked fortified, but only land units dig in.
  if (u.fortified && !isShip(u) && !hovers(u)) mods.push({ label: 'Fortified', pct: RULES.combat.fortifiedPct });
  if (u.veteran) mods.push({ label: 'Veteran', pct: RULES.combat.veteranPct });
  const general = generalMod(state, u);
  if (general) mods.push(general);
  mods.push(...defenseMods(state, u));
  return strength(UNITS[u.type].defense * armyFactor(u), mods);
}

/** The unit on `at` that would defend against `attackerOwner`: the best effective defense. */
export function pickDefender(state: GameState, at: Coord, attackerOwner: number): Unit | undefined {
  let best: { u: Unit; d: number } | undefined;
  for (const u of state.units) {
    if (u.x !== at.x || u.y !== at.y || u.owner === attackerOwner || !defendsTile(state, u)) continue;
    const d = defenseStrength(state, u).total;
    if (!best || d > best.d || (d === best.d && u.id < best.u.id)) best = { u, d };
  }
  return best?.u;
}

/** Why `unit` can't attack the tile `at` right now, or undefined if it can. */
export function attackError(state: GameState, unit: Unit, at: Coord): string | undefined {
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  const def = UNITS[unit.type];
  if (def.attack <= 0) return `A ${def.name} can't attack`;
  // Aircraft strike from a Carrier; land cargo can't attack from a ship.
  if (unit.carriedBy !== null && !isAir(unit)) return 'Units can’t attack from a ship. Unload onto land first';
  if (unit.movesLeft <= 0) return isAir(unit) ? 'Already flew this turn' : 'No moves left';
  if (isAir(unit)) {
    const d = distance(unit, at);
    if (d === 0) return 'Nothing to attack there';
    if (d > airRange(unit)) return `Out of range (${airRange(unit)} tiles)`;
  } else if (distance(unit, at) !== 1) return 'Move next to it first to attack';
  if (isLandAttack(unit) && isWaterAt(state, at.x, at.y)) return 'Land units can’t attack ships at sea';
  const defender = pickDefender(state, at, unit.owner);
  if (!defender) return 'Nothing to attack there';
  // A strike from afar needs eyes on the target (next door, you always see it).
  if (isAir(unit) && !unitVisibleTo(state, unit.owner, defender)) return 'You can’t see anything to strike there';
  if (!atWar(state, unit.owner, defender.owner)) return `You are at peace with ${civName(state, defender.owner)}. Declare war in Diplomacy first`;
  return undefined;
}

// ---- interception (Round 10) ---------------------------------------------------------------

export interface Interception {
  fighter: Unit;
  /** The fighter's strength against the attacker, and the attacker's against it. */
  attack: Strength;
  defense: Strength;
  /** The fighter's chance to shoot the attacker down. */
  chance: number;
}

/** A fighter's strength against an aircraft: its airAttack, less the target's stealth. */
function interceptStrength(fighter: Unit, target: Unit): Strength {
  const mods: Modifier[] = [];
  if (fighter.veteran) mods.push({ label: 'Veteran', pct: RULES.combat.veteranPct });
  const evade = UNITS[target.type].evadePct ?? 0;
  if (evade) mods.push({ label: 'Stealth', pct: -evade });
  return strength(UNITS[fighter.type].airAttack ?? 0, mods);
}

/** An aircraft's strength when a fighter goes after it: its defense. */
function airDefense(u: Unit): Strength {
  const mods: Modifier[] = [];
  if (u.veteran) mods.push({ label: 'Veteran', pct: RULES.combat.veteranPct });
  return strength(UNITS[u.type].defense * armyFactor(u), mods);
}

/**
 * The fighter that would intercept `attacker` striking `at`, or undefined: one of the target's
 * owner's fighters (a based aircraft with an airAttack) whose base is within its range of the
 * target, the one with the best chance. Only aircraft and Helicopters are intercepted.
 */
export function interception(state: GameState, attacker: Unit, at: Coord): Interception | undefined {
  if (!isAircraft(attacker)) return undefined;
  const target = pickDefender(state, at, attacker.owner);
  if (!target) return undefined;
  let best: Interception | undefined;
  for (const f of state.units) {
    if (f.owner !== target.owner || !isAir(f) || !((UNITS[f.type].airAttack ?? 0) > 0)) continue;
    if (distance(f, at) > airRange(f) || !atWar(state, f.owner, attacker.owner)) continue;
    const a = interceptStrength(f, attacker);
    const d = airDefense(attacker);
    const chance = winChance(a.total, d.total);
    if (!best || chance > best.chance || (chance === best.chance && f.id < best.fighter.id)) best = { fighter: f, attack: a, defense: d, chance };
  }
  return best;
}

/**
 * The chance an attack gets through and wins: (1 − the interceptor's chance) × the fight's
 * chance. The AI's odds rule for aircraft; the odds panel shows it too.
 */
export function overallChance(state: GameState, unit: Unit, at: Coord): number {
  const odds = combatOdds(state, unit, at);
  if (!odds) return 0;
  const icpt = interception(state, unit, at);
  return (1 - (icpt?.chance ?? 0)) * odds.chance;
}

/** The odds of `unit` attacking the tile `at`, or undefined if there's nothing to attack. */
export function combatOdds(state: GameState, unit: Unit, at: Coord): CombatOdds | undefined {
  const defender = pickDefender(state, at, unit.owner);
  if (!defender) return undefined;
  const attack = attackStrength(unit, state, isAircraft(defender), defender.owner);
  const defense = defenseStrength(state, defender, isLandAttack(unit));
  return { attacker: unit, defender, attack, defense, chance: winChance(attack.total, defense.total) };
}

/** Attacks the best defender on `at`. The same action for the player and the AI. */
export function attack(state: GameState, unitId: number, at: Coord): ActionResult {
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  const err = attackError(state, unit, at);
  if (err) return { ok: false, reason: err };
  const name = (u: Unit) => `${civAdjective(state, u.owner)} ${UNITS[u.type].name}${u.army ? ` ${armyWord(u.type)}` : ''}`;

  // An aircraft (or a Helicopter) may be intercepted on the way (Round 10).
  let intercepted: CombatReport['interception'];
  const icpt = interception(state, unit, at);
  if (icpt) {
    const { fighter } = icpt;
    const fighterWon = nextFloat(state) < icpt.chance;
    const ipct = Math.round(icpt.chance * 100);
    intercepted = { fighterType: fighter.type, fighterOwner: fighter.owner, fighterWon, chance: icpt.chance };
    if (fighterWon) {
      const target = pickDefender(state, at, unit.owner)!;
      const shotChance = combatOdds(state, unit, at)!.chance;
      removeUnit(state, unit.id);
      if (!fighter.veteran && nextFloat(state) * 100 < RULES.combat.veteranChancePct) fighter.veteran = true;
      addLog(state, unit.owner, `${name(fighter)} intercepted and shot down ${name(unit)} (${ipct}% odds)`, at, fighter.owner, { kind: 'intercept' });
      recordLoss(state, unit.owner, fighter.owner, 1);
      checkEliminations(state, fighter.owner, at);
      return {
        ok: true,
        combat: {
          attackerWon: false,
          chance: shotChance,
          attackerType: unit.type,
          defenderType: target.type,
          attackerArmy: unit.army,
          defenderArmy: target.army,
          attackerOwner: unit.owner,
          defenderOwner: target.owner,
          x: at.x,
          y: at.y,
          promoted: false,
          airStrike: isAir(unit) || undefined,
          interception: intercepted,
        },
      };
    }
    removeUnit(state, fighter.id);
    addLog(state, unit.owner, `${name(unit)} shot down the intercepting ${name(fighter)} (${100 - ipct}% odds)`, at, fighter.owner, { kind: 'intercept' });
    recordLoss(state, fighter.owner, unit.owner, 1);
  }

  const odds = combatOdds(state, unit, at)!;
  const { defender, chance } = odds;
  const attackerWon = nextFloat(state) < chance;
  const winner = attackerWon ? unit : defender;
  const loser = attackerWon ? defender : unit;
  // A sunk ship takes its cargo down with it.
  const cargoLost = removeUnit(state, loser.id).length - 1;
  let promoted = false;
  if (!winner.veteran && nextFloat(state) * 100 < RULES.combat.veteranChancePct) {
    winner.veteran = true;
    promoted = true;
  }
  unit.movesLeft = 0;
  unit.fortified = false;

  const pct = Math.round(chance * 100);
  const back = isAir(unit) && attackerWon ? ' and flew back to base' : '';
  const text = attackerWon
    ? `${name(unit)} defeated ${name(defender)}${back} (${pct}% odds)`
    : `${name(unit)} was destroyed attacking ${name(defender)} (${pct}% odds)`;
  addLog(state, unit.owner, text, at, defender.owner, isAircraft(unit) ? { kind: 'strike' } : undefined);
  if (cargoLost > 0) addLog(state, loser.owner, `${cargoLost} unit${cargoLost === 1 ? '' : 's'} aboard the ${UNITS[loser.type].name} went down with it`, at, winner.owner);
  recordLoss(state, loser.owner, winner.owner, (loser.army ? RULES.combat.armySize : 1) + cargoLost);
  winCulture(state, winner.owner);

  // The last defender of an enemy city fell: the winner moves in and takes the city. A ship
  // bombarding never moves in.
  let captured: number | undefined;
  let raided = false;
  let tookVillage: number | undefined;
  const city = state.cities.find((c) => c.x === at.x && c.y === at.y && c.owner === defender.owner);
  const defenders = state.units.some((u) => u.x === at.x && u.y === at.y && u.owner !== unit.owner && defendsTile(state, u));
  const village = villageAt(state, at);
  // Only walking land units move in: never ships, aircraft, or Helicopters.
  if (attackerWon && city && !defenders && canCapture(unit) && isBarbarian(state, unit.owner)) {
    // Barbarians never take a city (Round 9, Q13): they raid it and stay outside.
    if (!raidError(state, city)) raidCity(state, unit, city);
    raided = true;
    checkEliminations(state, winner.owner, at);
  } else if (attackerWon && city && !defenders && canCapture(unit)) {
    unit.x = at.x;
    unit.y = at.y;
    updateExplored(state, unit.owner);
    captureCity(state, city, unit.owner);
    captured = city.id;
  } else if (attackerWon && village && village.takenBy === null && !defenders && canCapture(unit) && !isBarbarian(state, unit.owner)) {
    // The village's last defender fell: the winner moves in and takes it (its owner then
    // chooses: destroy or settle; see villages.ts).
    unit.x = at.x;
    unit.y = at.y;
    tookVillage = village.id;
    updateExplored(state, unit.owner);
    updateContacts(state);
    enterTile(state, unit);
    checkEliminations(state, winner.owner, at);
  } else {
    checkEliminations(state, winner.owner, at);
  }
  return {
    ok: true,
    combat: {
      attackerWon,
      chance,
      attackerType: unit.type,
      defenderType: defender.type,
      attackerArmy: unit.army,
      defenderArmy: defender.army,
      attackerOwner: unit.owner,
      defenderOwner: defender.owner,
      x: at.x,
      y: at.y,
      promoted,
      capturedCityId: captured,
      tookVillage,
      raided: raided || undefined,
      bombard: isShip(unit) && !isWaterAt(state, at.x, at.y),
      cargoLost,
      airStrike: isAir(unit) || undefined,
      interception: intercepted,
    },
  };
}

/** Round 11: leaders whose bonus pays culture for every fight won (Caligula's triumphs). */
function winCulture(state: GameState, p: number): void {
  const player = state.players[p];
  if (!player) return;
  for (const e of effectsOf(state, p, 'winCulture')) player.culture += e.culture;
}

// ---- fortify -------------------------------------------------------------------------------

export function fortifyError(state: GameState, unit: Unit): string | undefined {
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  if (UNITS[unit.type].canFoundCity) return 'Settlers can’t fortify';
  if (unit.carriedBy !== null && !isAir(unit)) return 'Can’t fortify aboard a ship';
  if (unit.fortified) return 'Already fortified';
  return undefined;
}

/**
 * Digs the unit in: +50% defense until it moves or attacks. Fortifying ends the unit's
 * turn, and "next unit" skips fortified units from then on. A ship can be told to stay put
 * the same way ("Stay"), but gets no defense bonus.
 */
export function fortify(state: GameState, unitId: number): ActionResult {
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  const err = fortifyError(state, unit);
  if (err) return { ok: false, reason: err };
  unit.fortified = true;
  unit.movesLeft = 0;
  return { ok: true };
}

// ---- armies --------------------------------------------------------------------------------

/** The other units that would join `unit` in an army (same owner, type, and tile), or an error. */
export function armyPartners(state: GameState, unit: Unit): Unit[] | string {
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  const def = UNITS[unit.type];
  if (def.canFoundCity || (def.attack <= 0 && def.defense <= 0)) return `A ${def.name} can’t join an army`;
  // No air armies (Q16).
  if (isAircraft(unit)) return 'Aircraft can’t form armies';
  if (unit.army) return `Already ${armyWord(unit.type) === 'fleet' ? 'a fleet' : 'an army'}`;
  if (unit.carriedBy !== null) return 'Unload first to form an army';
  const need = RULES.combat.armySize;
  const same = state.units.filter(
    (u) => u.id !== unit.id && u.owner === unit.owner && u.type === unit.type && !u.army && u.carriedBy === null && u.x === unit.x && u.y === unit.y,
  );
  if (same.length < need - 1) return `Needs ${need} ${def.name} units on one tile`;
  return same.sort((a, b) => a.id - b.id).slice(0, need - 1);
}

export function formArmyError(state: GameState, unit: Unit): string | undefined {
  const p = armyPartners(state, unit);
  return typeof p === 'string' ? p : undefined;
}

/**
 * Merges `unit` and two more of its type on its tile into one army: 3× attack and defense,
 * the same moves, veteran if any member was. Armies can't be split; if one loses a fight,
 * the whole army is destroyed.
 */
export function formArmy(state: GameState, unitId: number): ActionResult {
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  const partners = armyPartners(state, unit);
  if (typeof partners === 'string') return { ok: false, reason: partners };
  const members = [unit, ...partners];
  unit.army = true;
  unit.veteran = members.some((u) => u.veteran);
  unit.movesLeft = Math.min(...members.map((u) => u.movesLeft));
  unit.fortified = false;
  // A fleet takes over its ships' cargo.
  for (const p of partners) for (const c of state.units) if (c.carriedBy === p.id) c.carriedBy = unit.id;
  const gone = new Set(partners.map((u) => u.id));
  state.units = state.units.filter((u) => !gone.has(u.id));
  addLog(state, unit.owner, `${CivName(state, unit.owner)} formed ${armyWord(unit.type) === 'fleet' ? 'a fleet' : 'an army'} of ${RULES.combat.armySize} ${UNITS[unit.type].name} units`, unit);
  return { ok: true };
}
