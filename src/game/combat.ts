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

import { BUILDINGS } from '../data/buildings';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { captureCity, checkEliminations, civAdjective, CivName, civName } from './conquest';
import { recordLoss } from './diplomacy';
import { distance, tileAt } from './grid';
import { addLog } from './log';
import { findUnit } from './movement';
import { updateExplored } from './fog';
import { nextFloat } from './rng';
import { atWar } from './war';
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

export function attackStrength(u: Unit): Strength {
  const mods: Modifier[] = [];
  if (u.veteran) mods.push({ label: 'Veteran', pct: RULES.combat.veteranPct });
  return strength(UNITS[u.type].attack * armyFactor(u), mods);
}

/** Every attacker is a land unit for now; the Walls bonus applies to land attacks only. */
export function defenseStrength(state: GameState, u: Unit, attackerIsLand = true): Strength {
  const mods: Modifier[] = [];
  const terrain = TERRAIN[tileAt(state.map, u.x, u.y)!.terrain];
  const city = state.cities.find((c) => c.x === u.x && c.y === u.y);
  if (terrain.defensePct) mods.push({ label: terrain.name, pct: terrain.defensePct });
  if (city) {
    mods.push({ label: 'In a city', pct: RULES.combat.cityDefensePct });
    if (attackerIsLand) {
      for (const b of city.buildings) {
        const pct = BUILDINGS[b].effects.defenseBonusPct;
        if (pct) mods.push({ label: BUILDINGS[b].name, pct });
      }
    }
  }
  if (u.fortified) mods.push({ label: 'Fortified', pct: RULES.combat.fortifiedPct });
  if (u.veteran) mods.push({ label: 'Veteran', pct: RULES.combat.veteranPct });
  return strength(UNITS[u.type].defense * armyFactor(u), mods);
}

/** The unit on `at` that would defend against `attackerOwner`: the best effective defense. */
export function pickDefender(state: GameState, at: Coord, attackerOwner: number): Unit | undefined {
  let best: { u: Unit; d: number } | undefined;
  for (const u of state.units) {
    if (u.x !== at.x || u.y !== at.y || u.owner === attackerOwner) continue;
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
  if (unit.movesLeft <= 0) return 'No moves left';
  if (distance(unit, at) !== 1) return 'Move next to it first to attack';
  const defender = pickDefender(state, at, unit.owner);
  if (!defender) return 'Nothing to attack there';
  if (!atWar(state, unit.owner, defender.owner)) return `You are at peace with ${civName(state, defender.owner)}. Declare war in Diplomacy first`;
  return undefined;
}

/** The odds of `unit` attacking the tile `at`, or undefined if there's nothing to attack. */
export function combatOdds(state: GameState, unit: Unit, at: Coord): CombatOdds | undefined {
  const defender = pickDefender(state, at, unit.owner);
  if (!defender) return undefined;
  const attack = attackStrength(unit);
  const defense = defenseStrength(state, defender);
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
  state.units = state.units.filter((u) => u.id !== loser.id);
  let promoted = false;
  if (!winner.veteran && nextFloat(state) * 100 < RULES.combat.veteranChancePct) {
    winner.veteran = true;
    promoted = true;
  }
  unit.movesLeft = 0;
  unit.fortified = false;

  const name = (u: Unit) => `${civAdjective(state, u.owner)} ${UNITS[u.type].name}${u.army ? ' army' : ''}`;
  const pct = Math.round(chance * 100);
  const text = attackerWon
    ? `${name(unit)} defeated ${name(defender)} (${pct}% odds)`
    : `${name(unit)} was destroyed attacking ${name(defender)} (${pct}% odds)`;
  addLog(state, unit.owner, text, at, defender.owner);
  recordLoss(state, loser.owner, winner.owner, loser.army ? RULES.combat.armySize : 1);

  // The last defender of an enemy city fell: the winner moves in and takes the city.
  let captured: number | undefined;
  const city = state.cities.find((c) => c.x === at.x && c.y === at.y && c.owner === defender.owner);
  if (attackerWon && city && !state.units.some((u) => u.x === at.x && u.y === at.y)) {
    unit.x = at.x;
    unit.y = at.y;
    updateExplored(state, unit.owner);
    captureCity(state, city, unit.owner);
    captured = city.id;
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
    },
  };
}

// ---- fortify -------------------------------------------------------------------------------

export function fortifyError(state: GameState, unit: Unit): string | undefined {
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  if (UNITS[unit.type].canFoundCity) return 'Settlers can’t fortify';
  if (unit.fortified) return 'Already fortified';
  return undefined;
}

/**
 * Digs the unit in: +50% defense until it moves or attacks. Fortifying ends the unit's
 * turn, and "next unit" skips fortified units from then on.
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
  if (unit.army) return 'Already an army';
  const need = RULES.combat.armySize;
  const same = state.units.filter(
    (u) => u.id !== unit.id && u.owner === unit.owner && u.type === unit.type && !u.army && u.x === unit.x && u.y === unit.y,
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
  const gone = new Set(partners.map((u) => u.id));
  state.units = state.units.filter((u) => !gone.has(u.id));
  addLog(state, unit.owner, `${CivName(state, unit.owner)} formed an army of ${RULES.combat.armySize} ${UNITS[unit.type].name} units`, unit);
  return { ok: true };
}
