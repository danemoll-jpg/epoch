// City capture and elimination (Milestone 4).
//
// A city is captured by an enemy land unit with attack > 0 moving into it when it's empty
// (see stepError in movement.ts), or by winning the fight against its last defender (the
// winner moves in; see attack in combat.ts). Only civs at war can capture. The captured city changes owner, loses 1 population
// (never below 1; cities are never destroyed), loses its Walls, and starts its production
// over with nothing chosen. A civ with no cities and no units is eliminated; since Round 22
// (item 7) so is one that loses its last city, unless it still has a Settler (see checkEliminations).
// Ships (Round 8) don't defend a city, so a city with only ships in port counts as empty;
// when it falls, the ships docked there and their cargo are lost. Aircraft based there
// (Round 10) don't defend it either, and are lost with it. Helicopters never capture.

import { BARBARIAN_CIV } from '../data/barbarians';
import { CIVS } from '../data/civs';
import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { changeOpinion, hasMet, recordLoss, updateContacts } from './diplomacy';
import { SPIES } from '../data/spies';
import { updateExplored } from './fog';
import { RULES } from '../data/rules';
import { addLog } from './log';
import { atWar } from './war';
import { loseSpaceship } from './victory';
import { canCapture, defendsTile, isAir, isCoastal, isShip, removeUnit } from './naval';
import { distance } from './grid';
import { refreshWorkedTiles } from './yields';
import { bonusName, firstEffect } from './leaders';
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
  if (UNITS[unit.type].attack <= 0 || !canCapture(unit)) return undefined;
  if (state.units.some((u) => u.x === to.x && u.y === to.y && u.owner !== unit.owner && defendsTile(state, u))) return undefined;
  return city;
}

/** Hands the city to `newOwner` (the capturing unit is already standing in it). */
export function captureCity(state: GameState, city: City, newOwner: number): void {
  const oldOwner = city.owner;
  // Ships in port (and whatever they carry) go down with the city, and aircraft based there are lost.
  const lost = state.units.filter((u) => u.x === city.x && u.y === city.y && u.owner === oldOwner && isShip(u));
  let sunk = 0;
  for (const ship of lost) sunk += removeUnit(state, ship.id).length;
  const planes = state.units.filter((u) => u.x === city.x && u.y === city.y && u.owner === oldOwner && isAir(u) && u.carriedBy === null);
  for (const a of planes) removeUnit(state, a.id);
  // Round 11: Charlemagne takes cities whole; Bolívar's liberation keeps the people.
  const keep = !!firstEffect(state, newOwner, 'captureKeep');
  const lib = firstEffect(state, newOwner, 'liberation');
  const liberated = !!lib && city.founder !== oldOwner;
  city.owner = newOwner;
  city.capturedTurn = state.turn;
  if (!keep && !liberated) city.size = Math.max(1, city.size - 1);
  if (!keep) city.buildings = city.buildings.filter((b) => !BUILDINGS[b].effects.defenseBonusPct);
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
  addLog(state, newOwner, text, city, oldOwner, { kind: 'capture', ref: { cityId: city.id } });
  // Round 21: a rival's Spy still inside is caught by the new owner.
  catchSpies(state, city, newOwner);
  if (sunk > 0) {
    const ships = lost.length === 1 ? 'a ship' : `${lost.length} ships`;
    const aboard = sunk > lost.length ? ` and ${sunk - lost.length} unit${sunk - lost.length === 1 ? '' : 's'} aboard` : '';
    addLog(state, newOwner, `${CivName(state, oldOwner)} lost ${ships}${aboard} in port at ${city.name}`, city, oldOwner);
  }
  if (planes.length > 0) {
    addLog(state, newOwner, `${CivName(state, oldOwner)} lost ${planes.length === 1 ? 'an aircraft' : `${planes.length} aircraft`} on the ground at ${city.name}`, city, oldOwner);
  }
  if (liberated && lib) {
    const p = state.players[newOwner]!;
    p.culture += lib.culture;
    p.gold += lib.gold;
    addLog(state, newOwner, `${bonusName(state, newOwner, 'liberation')}: ${city.name} was freed from ${civName(state, oldOwner)}. +${lib.culture} culture and +${lib.gold} gold`, city, undefined, { kind: 'leader' });
  }
  const resilience = firstEffect(state, oldOwner, 'resilience');
  if (resilience) {
    state.players[oldOwner]!.culture += resilience.culture;
    addLog(state, oldOwner, `${bonusName(state, oldOwner, 'resilience')}: losing ${city.name} steeled the nation. +${resilience.culture} culture`, undefined, undefined, { kind: 'leader' });
  }
  // A civ's spaceship is built in its capital: losing the capital loses the ship (Milestone 6).
  if (city.capitalOf === oldOwner) loseSpaceship(state, oldOwner, city);
  checkEliminations(state, newOwner, city);
}

/**
 * Round 19: a city joins another civ without a fight (a spy's revolt, item 11, or a
 * referendum, item 7). It keeps its size, buildings, and wonders; what it was building starts
 * over. The old owner's units in it go home to their nearest city (ships to a coastal one), or
 * are lost if there's none. It can't flip again for a while (`capturedTurn`).
 */
export function transferCity(state: GameState, city: City, newOwner: number): void {
  const oldOwner = city.owner;
  const home = state.cities.filter((c) => c.owner === oldOwner && c.id !== city.id);
  for (const u of state.units.filter((x) => x.x === city.x && x.y === city.y && x.owner === oldOwner && x.carriedBy === null)) {
    const ok = isShip(u) ? home.filter((c) => isCoastal(state, c)) : home;
    const dest = [...ok].sort((a, b) => distance(a, city) - distance(b, city) || a.id - b.id)[0];
    if (!dest) {
      removeUnit(state, u.id);
      continue;
    }
    for (const m of [u, ...state.units.filter((x) => x.carriedBy === u.id)]) {
      m.x = dest.x;
      m.y = dest.y;
      m.fortified = false;
    }
  }
  city.owner = newOwner;
  city.capturedTurn = state.turn;
  city.build = null;
  city.production = 0;
  // Round 21: a rival's Spy inside (the old owner's went home above) is caught by the new owner.
  catchSpies(state, city, newOwner);
  refreshWorkedTiles(state);
  updateExplored(state, newOwner);
  updateContacts(state);
  checkEliminations(state, newOwner, city);
}

/** Round 21: does this unit catch an enemy Spy by stepping onto its tile? Military units on land or at sea (not spies, civilians, or aircraft). */
export function catchesSpies(u: Unit): boolean {
  const def = UNITS[u.type];
  return !def.spy && !isAir(u) && def.attack > 0 && u.carriedBy === null;
}

/**
 * Round 21: every other civ's Spy standing (not aboard a ship) on `at` is caught by `catcher`
 * and removed: a news item for both sides and, as for a spy caught acting, the catcher thinks
 * less of the spy's owner. Called when a military unit steps onto the tile (movement.ts,
 * combat.ts) and when a city changes hands (captureCity, transferCity). Returns how many.
 */
export function catchSpies(state: GameState, at: Coord, catcher: number): number {
  const spies = state.units.filter((u) => u.x === at.x && u.y === at.y && u.owner !== catcher && UNITS[u.type].spy && u.carriedBy === null);
  if (!spies.length) return 0;
  const city = state.cities.find((c) => c.x === at.x && c.y === at.y);
  const near = city ? undefined : [...state.cities].filter((c) => distance(c, at) <= 3).sort((a, b) => distance(a, at) - distance(b, at) || a.id - b.id)[0];
  const where = city ? ` in ${city.name}` : near ? ` near ${near.name}` : '';
  for (const spy of spies) {
    removeUnit(state, spy.id);
    const barbarian = state.players[catcher]?.kind === 'barbarian';
    if (!barbarian) changeOpinion(state, catcher, spy.owner, SPIES.caughtOpinion);
    const whose = barbarian || hasMet(state, catcher, spy.owner) ? civAdjective(state, spy.owner) : 'foreign';
    const by = barbarian ? 'barbarians' : civName(state, catcher);
    addLog(state, catcher, `You caught ${/^([AEIO]|U(?!k|ni))/i.test(whose) ? 'an' : 'a'} ${whose} spy${where}`, at, spy.owner, {
      otherText: `Your spy was caught by ${by}${where}`,
      kind: 'spy',
      ref: city ? { cityId: city.id } : undefined,
    });
  }
  return spies.length;
}

/**
 * Round 22 (item 7): eliminates every living nation that has no cities left:
 * - one that never had a city (the game's start) only once it has no units either;
 * - one that lost its last city at once, its remaining units disbanded, unless it still has a
 *   Settler: then it has RULES.homelessTurns turns (`homelessSince`) to found a new city.
 * Called after anything that takes a city or a unit, and once a game turn (the time limit).
 */
export function checkEliminations(state: GameState, by?: number, at?: Coord): void {
  for (const p of state.players) {
    // The barbarians are never eliminated (Round 9).
    if (!p.alive || p.kind === 'barbarian') continue;
    if (state.cities.some((c) => c.owner === p.id)) {
      if (p.homelessSince != null) p.homelessSince = null;
      continue;
    }
    const units = state.units.filter((u) => u.owner === p.id);
    const hadCity = p.citiesFounded > 0;
    if (!hadCity && units.length > 0) continue;
    const settler = units.find((u) => UNITS[u.type].canFoundCity);
    if (hadCity && settler) {
      if (p.homelessSince == null) {
        p.homelessSince = state.turn;
        const text = `${CivName(state, p.id)} ${civVerb(state, p.id, 'has', 'have')} no cities left; ${civVerb(state, p.id, 'its', 'their')} settlers are looking for new land`;
        addLog(state, p.id, `You have no cities left! Found a new city with your Settler within ${RULES.homelessTurns} turns, or your nation is lost`, settler, by, {
          otherText: text,
          publicText: text,
          kind: 'homeless',
        });
      }
      if (state.turn - p.homelessSince < RULES.homelessTurns) continue;
    }
    eliminate(state, p.id, by, at ?? settler);
  }
}

/** Takes a nation out of the game: its remaining units are disbanded and everyone is told. */
function eliminate(state: GameState, id: number, by?: number, at?: Coord): void {
  const p = state.players[id]!;
  const left = state.units.filter((u) => u.owner === id);
  state.units = state.units.filter((u) => u.owner !== id);
  p.alive = false;
  p.eliminatedTurn = state.turn;
  p.researching = null;
  p.homelessSince = null;
  state.diplomacy.offers = state.diplomacy.offers.filter((o) => o.from !== id && o.to !== id);
  state.aiPlans[id] = null;
  for (let i = 0; i < state.aiPlans.length; i++) if (state.aiPlans[i]?.target === id) state.aiPlans[i] = null;
  const units = left.length ? `; ${civVerb(state, id, 'its', 'their')} last ${left.length === 1 ? 'unit was' : `${left.length} units were`} disbanded` : '';
  const text = `${CivName(state, id)} ${civVerb(state, id, 'has', 'have')} been eliminated${units}`;
  addLog(state, id, text, at, by, { publicText: text, kind: 'eliminated' });
}
