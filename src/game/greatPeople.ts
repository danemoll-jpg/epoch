// Great People (Round 9, Milestone 7; Civ Rev spirit, our own rules).
//
// A civ earns one each time the culture it has made passes the next threshold (they rise:
// greatPersonThreshold). Its kind is random (seeded); its name is the next unused one of that
// kind in data. Culture a civ already had when an older save was upgraded doesn't count
// (Player.greatPeopleCultureBase), so nobody gets a backlog at once.
//
// Each one is either settled in a city for good (a bonus there: see GREAT_PEOPLE and yields.ts,
// production.ts, combat.ts), or used once: a Scientist teaches a tech, an Artist gives a
// burst of culture, a Merchant a sum of gold, an Engineer finishes the wonder or building a
// city is making, a General makes every unit on one tile a veteran. The human decides from a
// panel (they wait in state.greatPeople); the AI decides at once, deterministically.

import { GREAT_PEOPLE, GREAT_PEOPLE_RULES as GP, GREAT_PERSON_KINDS, type GreatPersonKind } from '../data/greatPeople';
import { TECHS } from '../data/techs';
import { UNITS } from '../data/units';
import { aiVictoryGoal } from './aiGoals';
import { isBarbarian } from './barbarians';
import { civPossessive } from './conquest';
import { itemCost } from './production';
import { nextInt } from './rng';
import { eraIndex, learnTech, playerEra } from './tech';
import type { ActionResult, City, Coord, GameState, GreatPerson } from './types';
import { freeTech } from './villages';
import { atWar } from './war';
import { addLog } from './log';
import { cityCulture, cityScienceGold, cityYields } from './yields';

/** Culture needed (since the civ's starting point) for its n-th Great Person (n from 0). */
export function greatPersonThreshold(n: number): number {
  return GP.first + GP.step * n + (GP.growth * n * (n - 1)) / 2;
}

/** Culture that counts toward Great People. */
export function greatPeopleCulture(state: GameState, playerId: number): number {
  const p = state.players[playerId]!;
  return p.culture - (p.greatPeopleCultureBase ?? 0);
}

/** Culture still needed for the next one. */
export function cultureToNextGreatPerson(state: GameState, playerId: number): number {
  const p = state.players[playerId]!;
  return Math.max(0, greatPersonThreshold(p.greatPeople ?? 0) - greatPeopleCulture(state, playerId));
}

function nextName(state: GameState, kind: GreatPersonKind): string {
  const names = GREAT_PEOPLE[kind].names;
  const free = names.find((n) => !state.greatPeopleNames.includes(n));
  if (free) {
    state.greatPeopleNames.push(free);
    return free;
  }
  // Every name of this kind used (rare): reuse one, marked as a namesake.
  const name = `${names[state.greatPeopleNames.length % names.length]} the Younger`;
  state.greatPeopleNames.push(name);
  return name;
}

/** Adds a Great Person of `kind` for `owner` (the AI uses it at once). */
export function addGreatPerson(state: GameState, owner: number, kind: GreatPersonKind): GreatPerson {
  const gp: GreatPerson = { id: state.nextId++, owner, kind, name: nextName(state, kind), turn: state.turn };
  state.greatPeople.push(gp);
  const title = GREAT_PEOPLE[kind].name;
  addLog(state, owner, `A ${title}, ${gp.name}, was born in your empire`, undefined, undefined, {
    publicText: `A ${title}, ${gp.name}, was born in ${civPossessive(state, owner)} empire`,
    kind: 'greatPerson',
  });
  if (state.players[owner]?.kind === 'ai') aiUseGreatPerson(state, gp);
  return gp;
}

/**
 * After a civ's culture has come in (end of its turn): a Great Person for every threshold it
 * has passed. Returns the new ones.
 */
export function checkGreatPeople(state: GameState, playerId: number): GreatPerson[] {
  const p = state.players[playerId];
  if (!p || !p.alive || isBarbarian(state, playerId)) return [];
  const out: GreatPerson[] = [];
  while (greatPeopleCulture(state, playerId) >= greatPersonThreshold(p.greatPeople ?? 0)) {
    p.greatPeople = (p.greatPeople ?? 0) + 1;
    const kind = GREAT_PERSON_KINDS[nextInt(state, GREAT_PERSON_KINDS.length)]!;
    out.push(addGreatPerson(state, playerId, kind));
  }
  return out;
}

// ---- using one --------------------------------------------------------------------------------

export type GreatPersonUse =
  | { mode: 'settle'; cityId: number }
  | { mode: 'use'; cityId?: number; at?: Coord };

/** Cities where an Engineer could finish something now: building a wonder or a building not yet paid for. */
export function engineerCities(state: GameState, owner: number): City[] {
  return state.cities
    .filter((c) => c.owner === owner && (c.build?.kind === 'wonder' || c.build?.kind === 'building') && c.production < itemCost(c.build))
    .sort((a, b) => a.id - b.id);
}

/** Tiles where a General would make someone a veteran: your land fighting units, not all veterans already. */
export function generalTiles(state: GameState, owner: number): Coord[] {
  const out: Coord[] = [];
  for (const u of state.units) {
    if (u.owner !== owner || u.veteran || !isFighter(u.type) || out.some((c) => c.x === u.x && c.y === u.y)) continue;
    out.push({ x: u.x, y: u.y });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

function isFighter(type: keyof typeof UNITS): boolean {
  const d = UNITS[type];
  return !d.canFoundCity && (d.attack > 0 || d.defense > 0);
}

/** Why this Great Person can't be used this way, or undefined if it can. */
export function greatPersonError(state: GameState, gp: GreatPerson, how: GreatPersonUse): string | undefined {
  if (gp.owner !== state.currentPlayer) return 'Not your turn';
  const city = how.cityId !== undefined ? state.cities.find((c) => c.id === how.cityId) : undefined;
  if (how.mode === 'settle') {
    if (!city || city.owner !== gp.owner) return 'Choose one of your cities';
    return undefined;
  }
  switch (gp.kind) {
    case 'scientist':
      return freeTechPreview(state, gp.owner) ? undefined : 'Nothing left to learn';
    case 'artist':
    case 'merchant':
      return undefined;
    case 'engineer':
      if (!city || city.owner !== gp.owner) return 'Choose a city building a wonder or a building';
      if (!engineerCities(state, gp.owner).includes(city)) return `${city.name} isn’t building a wonder or a building`;
      return undefined;
    case 'general':
      if (!how.at || !generalTiles(state, gp.owner).some((c) => c.x === how.at!.x && c.y === how.at!.y)) return 'Choose a tile with your units';
      return undefined;
  }
}

/** Whether a Scientist has anything to teach (without drawing from the RNG). */
function freeTechPreview(state: GameState, owner: number): boolean {
  const p = state.players[owner]!;
  return Object.values(TECHS).some((t) => !p.techs.includes(t.id) && t.prereqs.every((q) => p.techs.includes(q)));
}

/** The Merchant's one-time gold for this owner (more in later eras). */
export function merchantGold(state: GameState, owner: number): number {
  return GP.merchantGoldBase + GP.merchantGoldPerEra * eraIndex(playerEra(state.players[owner]!));
}

/** Settles or uses a waiting Great Person. The same action for the human and the AI. */
export function useGreatPerson(state: GameState, gpId: number, how: GreatPersonUse): ActionResult {
  const gp = state.greatPeople.find((g) => g.id === gpId);
  if (!gp) return { ok: false, reason: 'No such Great Person' };
  const err = greatPersonError(state, gp, how);
  if (err) return { ok: false, reason: err };
  const def = GREAT_PEOPLE[gp.kind];
  const player = state.players[gp.owner]!;
  const city = how.cityId !== undefined ? state.cities.find((c) => c.id === how.cityId) : undefined;
  let message: string;
  if (how.mode === 'settle') {
    city!.greatPeople.push(gp.kind);
    message = `${gp.name} settled in ${city!.name}: ${def.settleText}`;
  } else {
    switch (gp.kind) {
      case 'scientist': {
        const tech = freeTech(state, gp.owner, false)!;
        learnTech(state, gp.owner, tech, `Learned ${TECHS[tech].name} from ${gp.name}`);
        message = `${gp.name} taught you ${TECHS[tech].name}`;
        break;
      }
      case 'artist':
        player.culture += GP.artistCultureBurst;
        message = `${gp.name}'s masterpiece brought ${GP.artistCultureBurst} culture`;
        break;
      case 'merchant': {
        const gold = merchantGold(state, gp.owner);
        player.gold += gold;
        message = `${gp.name} brought ${gold} gold`;
        break;
      }
      case 'engineer':
        city!.production = Math.max(city!.production, itemCost(city!.build!));
        message = `${gp.name} will finish ${city!.name}'s ${itemName(city!)} this turn`;
        break;
      case 'general': {
        const at = how.at!;
        const units = state.units.filter((u) => u.owner === gp.owner && u.x === at.x && u.y === at.y && isFighter(u.type));
        for (const u of units) u.veteran = true;
        message = `${gp.name} trained ${units.length} unit${units.length === 1 ? '' : 's'} into veterans`;
        break;
      }
    }
  }
  state.greatPeople = state.greatPeople.filter((g) => g.id !== gp.id);
  addLog(state, gp.owner, message, city ?? (how.mode === 'use' ? how.at : undefined), undefined, { kind: 'greatPerson' });
  return { ok: true, message };
}

function itemName(city: City): string {
  const b = city.build!;
  return b.kind === 'wonder' ? 'wonder' : 'building';
}

// ---- the AI --------------------------------------------------------------------------------

function best(cities: City[], score: (c: City) => number): City | undefined {
  let top: { c: City; v: number } | undefined;
  for (const c of cities) {
    const v = score(c);
    if (!top || v > top.v || (v === top.v && c.id < top.c.id)) top = { c, v };
  }
  return top?.c;
}

/**
 * The AI's choice, at once and deterministic: an Engineer finishes a wonder; a Scientist,
 * Merchant, or Artist is used right away when it helps the victory it's going for (tech,
 * economic, culture) and is settled otherwise; a General trains a stack at war, else settles.
 */
export function aiUseGreatPerson(state: GameState, gp: GreatPerson): void {
  const owner = gp.owner;
  const mine = state.cities.filter((c) => c.owner === owner);
  if (mine.length === 0) {
    state.greatPeople = state.greatPeople.filter((g) => g.id !== gp.id);
    return;
  }
  const goal = aiVictoryGoal(state, owner);
  const capital = mine.find((c) => c.capitalOf === owner) ?? mine[0]!;
  const settleIn = (c: City | undefined) => useGreatPerson(state, gp.id, { mode: 'settle', cityId: (c ?? capital).id });
  const use = (extra: { cityId?: number; at?: Coord } = {}) => useGreatPerson(state, gp.id, { mode: 'use', ...extra });
  switch (gp.kind) {
    case 'engineer': {
      const wonder = engineerCities(state, owner).find((c) => c.build?.kind === 'wonder');
      if (wonder && use({ cityId: wonder.id }).ok) return;
      settleIn(best(mine, (c) => cityYields(state, c).production));
      return;
    }
    case 'scientist':
      if (goal === 'technology' && use().ok) return;
      settleIn(best(mine, (c) => cityScienceGold(state, c).science));
      return;
    case 'merchant':
      if (goal === 'economic' && use().ok) return;
      settleIn(best(mine, (c) => cityScienceGold(state, c).gold));
      return;
    case 'artist':
      if (goal === 'culture' && use().ok) return;
      settleIn(best(mine, (c) => cityCulture(state, c)));
      return;
    case 'general': {
      const atWarNow = state.players.some((p) => p.alive && p.kind !== 'barbarian' && atWar(state, owner, p.id));
      const tile = generalTiles(state, owner)
        .map((c) => ({ c, n: state.units.filter((u) => u.owner === owner && u.x === c.x && u.y === c.y && !u.veteran && isFighter(u.type)).length }))
        .sort((a, b) => b.n - a.n)[0];
      if (atWarNow && tile && tile.n >= 2 && use({ at: tile.c }).ok) return;
      settleIn(best(mine, (c) => (c.buildings.includes('barracks') ? 1 : 0) + (c.capitalOf === owner ? 0.5 : 0)));
      return;
    }
  }
}
