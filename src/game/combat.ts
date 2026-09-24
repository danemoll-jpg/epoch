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
import { updateExplored } from './fog';
import { nextFloat } from './rng';
import { atWar } from './war';
import { armyWord, defendsTile, isShip, isWaterAt, removeUnit } from './naval';
import type { ActionResult, Coord, GameState, Unit } from './types';

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

export function attackStrength(u: Unit, state?: GameState): Strength {
  const mods: Modifier[] = [];
  if (u.veteran) mods.push({ label: 'Veteran', pct: RULES.combat.veteranPct });
  const general = generalMod(state, u);
  if (general) mods.push(general);
  return strength(UNITS[u.type].attack * armyFactor(u), mods);
}

/** Every attacker is a land unit for now; the Walls bonus applies to land attacks only. */
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
  if (u.fortified && !isShip(u)) mods.push({ label: 'Fortified', pct: RULES.combat.fortifiedPct });
  if (u.veteran) mods.push({ label: 'Veteran', pct: RULES.combat.veteranPct });
  const general = generalMod(state, u);
  if (general) mods.push(general);
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
  if (unit.carriedBy !== null) return 'Units can’t attack from a ship. Unload onto land first';
  if (unit.movesLeft <= 0) return 'No moves left';
  if (distance(unit, at) !== 1) return 'Move next to it first to attack';
  if (!isShip(unit) && isWaterAt(state, at.x, at.y)) return 'Land units can’t attack ships at sea';
  const defender = pickDefender(state, at, unit.owner);
  if (!defender) return 'Nothing to attack there';
  if (!atWar(state, unit.owner, defender.owner)) return `You are at peace with ${civName(state, defender.owner)}. Declare war in Diplomacy first`;
  return undefined;
}

/** The odds of `unit` attacking the tile `at`, or undefined if there's nothing to attack. */
export function combatOdds(state: GameState, unit: Unit, at: Coord): CombatOdds | undefined {
  const defender = pickDefender(state, at, unit.owner);
  if (!defender) return undefined;
  const attack = attackStrength(unit, state);
  const defense = defenseStrength(state, defender, !isShip(unit));
  return { attacker: unit, defender, attack, defense, chance: winChance(attack.total, defense.total) };
}

/** Attacks the best defender on `at`. The same action for the player and the AI. */
export function attack(state: GameState, unitId: number, at: Coord): ActionResult {
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  const err = attackError(state, unit, at);
  if (err) return { ok: false, reason: err };
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

  const name = (u: Unit) => `${civAdjective(state, u.owner)} ${UNITS[u.type].name}${u.army ? ` ${armyWord(u.type)}` : ''}`;
  const pct = Math.round(chance * 100);
  const text = attackerWon
    ? `${name(unit)} defeated ${name(defender)} (${pct}% odds)`
    : `${name(unit)} was destroyed attacking ${name(defender)} (${pct}% odds)`;
  addLog(state, unit.owner, text, at, defender.owner);
  if (cargoLost > 0) addLog(state, loser.owner, `${cargoLost} unit${cargoLost === 1 ? '' : 's'} aboard the ${UNITS[loser.type].name} went down with it`, at, winner.owner);
  recordLoss(state, loser.owner, winner.owner, (loser.army ? RULES.combat.armySize : 1) + cargoLost);

  // The last defender of an enemy city fell: the winner moves in and takes the city. A ship
  // bombarding never moves in.
  let captured: number | undefined;
  let raided = false;
  let tookVillage: number | undefined;
  const city = state.cities.find((c) => c.x === at.x && c.y === at.y && c.owner === defender.owner);
  const defenders = state.units.some((u) => u.x === at.x && u.y === at.y && u.owner !== unit.owner && defendsTile(state, u));
  const village = villageAt(state, at);
  if (attackerWon && city && !defenders && !isShip(unit) && isBarbarian(state, unit.owner)) {
    // Barbarians never take a city (Round 9, Q13): they raid it and stay outside.
    if (!raidError(state, city)) raidCity(state, unit, city);
    raided = true;
    checkEliminations(state, winner.owner, at);
  } else if (attackerWon && city && !defenders && !isShip(unit)) {
    unit.x = at.x;
    unit.y = at.y;
    updateExplored(state, unit.owner);
    captureCity(state, city, unit.owner);
    captured = city.id;
  } else if (attackerWon && village && village.takenBy === null && !defenders && !isShip(unit) && !isBarbarian(state, unit.owner)) {
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
    },
  };
}

// ---- fortify -------------------------------------------------------------------------------

export function fortifyError(state: GameState, unit: Unit): string | undefined {
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  if (UNITS[unit.type].canFoundCity) return 'Settlers can’t fortify';
  if (unit.carriedBy !== null) return 'Can’t fortify aboard a ship';
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
