// City capture and elimination (Milestone 4).
//
// A city is captured by an enemy land unit with attack > 0 moving into it when it's empty
// (see stepError in movement.ts), or by winning the fight against its last defender (the
// winner moves in; see attack in combat.ts). Only civs at war can capture. The captured city changes owner, loses 1 population
// (never below 1; cities are never destroyed), loses its Walls, and starts its production
// over with nothing chosen. A civ with no cities and no units is eliminated.
// Ships (Round 8) don't defend a city, so a city with only ships in port counts as empty;
// when it falls, the ships docked there and their cargo are lost.

import { BARBARIAN_CIV } from '../data/barbarians';
import { CIVS } from '../data/civs';
import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { recordLoss, updateContacts } from './diplomacy';
import { updateExplored } from './fog';
import { RULES } from '../data/rules';
import { addLog } from './log';
import { atWar } from './war';
import { loseSpaceship } from './victory';
import { defendsTile, isShip, removeUnit } from './naval';
import { refreshWorkedTiles } from './yields';
import type { City, Coord, GameState, Unit } from './types';

// Civ names in messages. "the Franks" mid-sentence, "The Franks" to start one; Babylon stays
// Babylon. The grammar fields live with the civ in data (civs.ts).

function civOf(state: GameState, playerId: number) {
  const civId = state.players[playerId]?.civId;
  return civId === BARBARIAN_CIV.id ? BARBARIAN_CIV : CIVS.find((c) => c.id === civId);
}

/** The civ's name as it reads mid-sentence: "the Franks", "Babylon". */
export function civName(state: GameState, playerId: number): string {
  const civ = civOf(state, playerId);
  if (!civ) return 'a rival';
  return civ.article ? `${civ.article} ${civ.name}` : civ.name;
}

/** The civ's name to start a sentence: "The Franks", "Babylon". */
export function CivName(state: GameState, playerId: number): string {
  const n = civName(state, playerId);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Possessive: "the Franks'", "Babylon's". */
export function civPossessive(state: GameState, playerId: number): string {
  return civOf(state, playerId)?.plural ? `${civName(state, playerId)}'` : `${civName(state, playerId)}'s`;
}

/** Picks the verb form that agrees with the civ's name: civVerb(s, id, 'has', 'have'). */
export function civVerb(state: GameState, playerId: number, singular: string, plural: string): string {
  return civOf(state, playerId)?.plural ? plural : singular;
}

export function civAdjective(state: GameState, playerId: number): string {
  return civOf(state, playerId)?.adjective ?? 'Foreign';
}

/** The enemy city `unit` would capture by stepping onto `to`, if it can. */
export function capturableCity(state: GameState, unit: Unit, to: Coord): City | undefined {
  const city = state.cities.find((c) => c.x === to.x && c.y === to.y);
  if (!city || city.owner === unit.owner) return undefined;
  if (!atWar(state, unit.owner, city.owner)) return undefined;
  // Barbarians never capture cities; they raid them (Round 9, barbarians.ts).
  if (state.players[unit.owner]?.kind === 'barbarian') return undefined;
  if (UNITS[unit.type].attack <= 0 || isShip(unit)) return undefined;
  if (state.units.some((u) => u.x === to.x && u.y === to.y && u.owner !== unit.owner && defendsTile(state, u))) return undefined;
  return city;
}

/** Hands the city to `newOwner` (the capturing unit is already standing in it). */
export function captureCity(state: GameState, city: City, newOwner: number): void {
  const oldOwner = city.owner;
  // Ships in port (and whatever they carry) go down with the city.
  const lost = state.units.filter((u) => u.x === city.x && u.y === city.y && u.owner === oldOwner && isShip(u));
  let sunk = 0;
  for (const ship of lost) sunk += removeUnit(state, ship.id).length;
  city.owner = newOwner;
  city.size = Math.max(1, city.size - 1);
  city.buildings = city.buildings.filter((b) => !BUILDINGS[b].effects.defenseBonusPct);
  city.production = 0;
  city.build = null;
  refreshWorkedTiles(state);
  updateExplored(state, newOwner);
  recordLoss(state, oldOwner, newOwner, RULES.diplomacy.cityLossWeight);
  updateContacts(state);
  const who = CivName(state, newOwner);
  const text =
    city.capitalOf === oldOwner
      ? `${who} captured ${city.name}, the ${civAdjective(state, oldOwner)} capital!`
      : `${who} captured ${city.name} from ${civName(state, oldOwner)}`;
  addLog(state, newOwner, text, city, oldOwner);
  if (sunk > 0) {
    const ships = lost.length === 1 ? 'a ship' : `${lost.length} ships`;
    const aboard = sunk > lost.length ? ` and ${sunk - lost.length} unit${sunk - lost.length === 1 ? '' : 's'} aboard` : '';
    addLog(state, newOwner, `${CivName(state, oldOwner)} lost ${ships}${aboard} in port at ${city.name}`, city, oldOwner);
  }
  // A civ's spaceship is built in its capital: losing the capital loses the ship (Milestone 6).
  if (city.capitalOf === oldOwner) loseSpaceship(state, oldOwner, city);
  checkEliminations(state, newOwner, city);
}

/** Marks every living civ with no cities and no units as eliminated. */
export function checkEliminations(state: GameState, by: number, at: Coord): void {
  for (const p of state.players) {
    // The barbarians are never eliminated (Round 9).
    if (!p.alive || p.kind === 'barbarian') continue;
    const hasCity = state.cities.some((c) => c.owner === p.id);
    const hasUnit = state.units.some((u) => u.owner === p.id);
    if (hasCity || hasUnit) continue;
    p.alive = false;
    p.researching = null;
    state.diplomacy.offers = state.diplomacy.offers.filter((o) => o.from !== p.id && o.to !== p.id);
    state.aiPlans[p.id] = null;
    for (let i = 0; i < state.aiPlans.length; i++) if (state.aiPlans[i]?.target === p.id) state.aiPlans[i] = null;
    const text = `${CivName(state, p.id)} ${civVerb(state, p.id, 'has', 'have')} been eliminated`;
    addLog(state, p.id, text, at, by, { publicText: text });
  }
}
