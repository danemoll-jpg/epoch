// Leader bonuses (Round 11, Milestone 8). The one place that decides which of a civ's bonuses
// are on: its starting bonus and drawback always, each era's bonus once the civ has reached
// that era (Ancient from turn 1). The rules ask for effects by kind (`effectsOf`), and the
// helpers below turn them into numbers for costs, yields, combat, and diplomacy. Legacy civs
// (old saves) and the barbarians have no bonuses. The data is in src/data/leaders.ts.

import { BUILDINGS, isCultureBuilding } from '../data/buildings';
import { findCiv } from '../data/civs';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../data/difficulty';
import { LEADER_BONUSES, UNIQUE_RULES, type Bonus, type CostScope, type LeaderBonuses, type LeaderEffect, type UniqueId } from '../data/leaders';
import { ERAS, TECHS, type EraId, type TechId } from '../data/techs';
import { UNITS } from '../data/units';
import { PROJECTS } from '../data/victory';
import { WONDERS } from '../data/wonders';
import { tileIndex } from './grid';
import { visibleResource } from './resources';
import type { BuildItem, City, GameState, Player } from './types';

export type EffectKind = LeaderEffect['kind'];
export type EffectOf<K extends EffectKind> = Extract<LeaderEffect, { kind: K }>;

/** The civ's bonus table, or undefined (a legacy civ or the barbarians). */
export function leaderBonuses(civId: string): LeaderBonuses | undefined {
  const civ = findCiv(civId);
  if (!civ || civ.legacy) return undefined;
  return LEADER_BONUSES[civId];
}

function eraOf(player: Player): number {
  let best = 0;
  for (const t of player.techs) best = Math.max(best, ERAS.findIndex((e) => e.id === TECHS[t]?.era));
  return best;
}

/** Bonuses that are on for this player now, in order: start, each era reached, drawback. */
export function activeBonuses(player: Player): Bonus[] {
  const table = leaderBonuses(player.civId);
  if (!table) return [];
  const era = eraOf(player);
  const out: Bonus[] = [table.start];
  ERAS.forEach((e, i) => {
    if (i <= era) out.push(table.eras[e.id]);
  });
  if (table.drawback) out.push(table.drawback);
  return out;
}

// Cached per player object: the list only changes when the era (or the civ) does.
const cache = new WeakMap<Player, { civId: string; era: number; effects: LeaderEffect[] }>();

/** Every effect on for this player now. */
export function effects(player: Player | undefined): LeaderEffect[] {
  if (!player) return [];
  const era = eraOf(player);
  const hit = cache.get(player);
  if (hit && hit.civId === player.civId && hit.era === era) return hit.effects;
  const list = activeBonuses(player).flatMap((b) => b.effects);
  cache.set(player, { civId: player.civId, era, effects: list });
  return list;
}

export function effectsOf<K extends EffectKind>(state: GameState, p: number, kind: K): EffectOf<K>[] {
  const list = effects(state.players[p]).filter((e): e is EffectOf<K> => e.kind === kind);
  // Round 13: the difficulty level's percents ride along as empire-wide effects.
  if (kind === 'empirePct') list.push(...(difficultyEffects(state, p) as EffectOf<K>[]));
  return list;
}

// One list per level and side, made once.
const difficultyCache = new Map<string, LeaderEffect[]>();

/**
 * Round 13: the difficulty level's empire-wide percents for player `p`, as `empirePct`
 * effects: the player's numbers for player 0 (the human), the AIs' for every other civ, and
 * nothing for the barbarians. A save without a level (older tests' hand-made states) is Normal.
 */
export function difficultyEffects(state: GameState, p: number): LeaderEffect[] {
  const player = state.players[p];
  if (!player || player.kind === 'barbarian') return [];
  const level = DIFFICULTIES[state.difficulty ?? DEFAULT_DIFFICULTY];
  const side = p === HUMAN_SIDE ? 'player' : 'ai';
  const key = `${level.id}|${side}`;
  let list = difficultyCache.get(key);
  if (!list) {
    const pcts = level[side];
    list = (['production', 'science', 'gold'] as const)
      .filter((y) => pcts[y] !== 0)
      .map((y): LeaderEffect => ({ kind: 'empirePct', yield: y, pct: pcts[y] }));
    difficultyCache.set(key, list);
  }
  return list;
}

/** The player the difficulty level favors: the human is always player 0 (the sim's stand-in too). */
export const HUMAN_SIDE = 0;

/**
 * Round 13: AI `ai`'s aggression (1–5, and beyond with the level) when it weighs war or peace
 * with `target`: the difficulty level's change applies only toward the human side.
 */
export function aiAggression(state: GameState, ai: number, target: number): number {
  const base = findCiv(state.players[ai]?.civId ?? '')?.aggression ?? 3;
  return target === HUMAN_SIDE ? base + DIFFICULTIES[state.difficulty ?? DEFAULT_DIFFICULTY].aggression : base;
}

export function firstEffect<K extends EffectKind>(state: GameState, p: number, kind: K): EffectOf<K> | undefined {
  return effectsOf(state, p, kind)[0];
}

export function hasUnique(state: GameState, p: number, id: UniqueId): boolean {
  return effectsOf(state, p, 'unique').some((e) => e.id === id);
}

/** The era bonus the civ gets on entering `era` (for the toast), if any. */
export function eraBonus(civId: string, era: EraId): Bonus | undefined {
  return leaderBonuses(civId)?.eras[era];
}

/** n changed by pct percent, rounded down like every other percent bonus. */
export function applyPct(n: number, pct: number): number {
  return n + Math.floor((n * pct) / 100);
}

// ---- costs ------------------------------------------------------------------------------------

function isFighter(id: keyof typeof UNITS): boolean {
  return !UNITS[id].canFoundCity && (UNITS[id].attack > 0 || UNITS[id].defense > 0);
}

function inScope(item: BuildItem, of: CostScope): boolean {
  if (typeof of === 'object') return item.kind === 'building' && of.buildings.includes(item.id);
  switch (of) {
    case 'wonders':
      return item.kind === 'wonder';
    case 'buildings':
      return item.kind === 'building';
    case 'landUnits':
      return item.kind === 'unit' && isFighter(item.id) && UNITS[item.id].domain === 'land';
    case 'militaryUnits':
      return item.kind === 'unit' && isFighter(item.id);
    case 'spaceship':
      return item.kind === 'project' && item.id === 'spaceship';
  }
}

/** The percent the owner's bonuses change this item's production cost by. */
export function costPct(state: GameState, owner: number, item: BuildItem): number {
  let pct = 0;
  for (const e of effectsOf(state, owner, 'cost')) if (inScope(item, e.of)) pct += e.pct;
  if (item.kind === 'unit' && UNITS[item.id].domain === 'sea' && !state.players[owner]?.shipsBuilt?.includes(item.id)) {
    for (const e of effectsOf(state, owner, 'firstShipCost')) pct += e.pct;
  }
  return pct;
}

/** The base cost with the owner's bonuses (never below 1). */
export function leaderCost(state: GameState, owner: number, item: BuildItem, base: number): number {
  const pct = costPct(state, owner, item);
  return pct === 0 ? base : Math.max(1, Math.round((base * (100 + pct)) / 100));
}

/** The percent the owner's bonuses change the price of rush-buying this item by. */
export function rushBuyPct(state: GameState, owner: number, item: BuildItem): number {
  let pct = 0;
  for (const e of effectsOf(state, owner, 'rushBuy')) {
    if (!e.of || (item.kind === 'building' && isCultureBuilding(item.id))) pct += e.pct;
  }
  return pct;
}

/** Caligula: wonders can be bought, at this multiple of the usual price. Undefined for everyone else. */
export function wonderBuyMult(state: GameState, owner: number): number | undefined {
  return firstEffect(state, owner, 'buyWonders')?.mult;
}

// ---- yields ----------------------------------------------------------------------------------

/** Extra food and trade on a tile for its owner's city (terrain bonuses). */
export function terrainBonus(state: GameState, owner: number, index: number): { food: number; trade: number } {
  const out = { food: 0, trade: 0 };
  const terrain = state.map.tiles[index]?.terrain;
  for (const e of effectsOf(state, owner, 'terrainYield')) {
    if (e.terrain !== terrain) continue;
    out.food += e.food ?? 0;
    out.trade += e.trade ?? 0;
  }
  return out;
}

/** Does the owner's bonus double this tile's resource? */
export function resourceDoubled(state: GameState, owner: number, index: number): boolean {
  const r = state.map.tiles[index]?.resource;
  return !!r && effectsOf(state, owner, 'resourceDouble').some((e) => e.resources.includes(r));
}

function cityTiles(state: GameState, city: City): number[] {
  return [tileIndex(state.map, city.x, city.y), ...city.worked];
}

export function isCapital(city: City): boolean {
  return city.capitalOf === city.owner;
}

/** A city its owner took from another civ (or was given). */
export function wasCaptured(city: City): boolean {
  return city.founder !== undefined && city.founder !== city.owner;
}

/** Extra gold a turn in this city from its owner's bonuses (after the percent bonuses). */
export function leaderCityGold(state: GameState, city: City): number {
  const o = city.owner;
  let gold = 0;
  const perRes = effectsOf(state, o, 'resourceGold').reduce((s, e) => s + e.gold, 0);
  if (perRes) gold += perRes * cityTiles(state, city).filter((k) => visibleResource(state, o, k)).length;
  for (const e of effectsOf(state, o, 'wonderCityYield')) gold += e.gold * city.wonders.length;
  if (isCapital(city)) for (const e of effectsOf(state, o, 'capitalWonderYield')) gold += e.gold * city.wonders.length;
  for (const e of effectsOf(state, o, 'buildingGold')) if (city.buildings.includes(e.building)) gold += e.gold;
  // Round 12: Hatshepsut's caravans, on every worked road or rail tile (not the city's own).
  const perRoad = effectsOf(state, o, 'roadGold').reduce((s, e) => s + e.gold, 0);
  if (perRoad) gold += perRoad * city.worked.filter((k) => state.map.tiles[k]?.road).length;
  return gold;
}

/** Percent gold or science in this city from its owner's bonuses. */
export function leaderCityPct(state: GameState, city: City, key: 'goldPct' | 'sciencePct'): number {
  const o = city.owner;
  let pct = 0;
  if (key === 'goldPct' && isCapital(city)) for (const e of effectsOf(state, o, 'capitalGold')) pct += e.pct;
  if (key === 'sciencePct') for (const e of effectsOf(state, o, 'buildingSciencePct')) if (city.buildings.includes(e.building)) pct += e.pct;
  return pct;
}

/** Percent production in this city from its owner's bonuses (empire-wide, and ships in port). */
export function leaderProductionPct(state: GameState, city: City): number {
  const o = city.owner;
  let pct = 0;
  for (const e of effectsOf(state, o, 'empirePct')) if (e.yield === 'production') pct += e.pct;
  if (city.build?.kind === 'unit' && UNITS[city.build.id].domain === 'sea') for (const e of effectsOf(state, o, 'shipProduction')) pct += e.pct;
  return pct;
}

/** Extra production a turn in this city (Charlemagne's administration). */
export function leaderProductionFlat(state: GameState, city: City): number {
  let extra = 0;
  for (const e of effectsOf(state, city.owner, 'manyCitiesProduction')) {
    if (state.cities.filter((c) => c.owner === city.owner).length >= e.cities) extra += e.production;
  }
  return extra;
}

/**
 * The city's culture with its owner's bonuses, given its buildings' culture and its wonders'
 * culture (the parts some bonuses scale).
 */
export function leaderCityCulture(state: GameState, city: City, buildingCulture: number, wonderCulture: number): number {
  const o = city.owner;
  const p = state.players[o];
  let building = buildingCulture;
  for (const e of effectsOf(state, o, 'buildingCulture')) building += e.culture * city.buildings.filter((b) => e.buildings.includes(b)).length;
  // Henry's Dissolution: Temple and Cathedral culture halved for a while.
  if (p?.dissolvedUntil != null && state.turn < p.dissolvedUntil) {
    const D = UNIQUE_RULES.dissolution;
    let churches = city.buildings.filter((b) => D.buildings.includes(b)).reduce((s, b) => s + (BUILDINGS[b].effects.culture ?? 0), 0);
    for (const e of effectsOf(state, o, 'buildingCulture')) churches += e.culture * city.buildings.filter((b) => e.buildings.includes(b) && D.buildings.includes(b)).length;
    building -= churches - applyPct(churches, D.culturePct);
  }
  let wonder = wonderCulture;
  for (const e of effectsOf(state, o, 'wonderCulture')) wonder = applyPct(wonder, e.pct);
  let extra = 0;
  for (const e of effectsOf(state, o, 'wonderCityYield')) extra += e.culture * city.wonders.length;
  if (isCapital(city)) for (const e of effectsOf(state, o, 'capitalWonderYield')) extra += e.culture * city.wonders.length;
  if (wasCaptured(city)) for (const e of effectsOf(state, o, 'capturedCityCulture')) extra += e.culture;
  const lux = effectsOf(state, o, 'resourceCulture');
  if (lux.length) {
    for (const k of cityTiles(state, city)) {
      const r = visibleResource(state, o, k);
      if (r) for (const e of lux) if (e.resources.includes(r.id)) extra += e.culture;
    }
  }
  return building + wonder + extra;
}

// ---- empire-wide ----------------------------------------------------------------------------

function metLiving(state: GameState, p: number): number[] {
  return state.players.filter((q) => q.alive && q.id !== p && q.kind !== 'barbarian' && state.diplomacy.met[p]?.[q.id]).map((q) => q.id);
}

/** Does a rival hold `p`'s original capital? */
export function capitalLost(state: GameState, p: number): boolean {
  return state.cities.some((c) => c.capitalOf === p && c.owner !== p);
}

/** Empire-wide percent on gold, science, or culture from the player's bonuses and unique projects. */
export function empirePct(state: GameState, p: number, key: 'gold' | 'science' | 'culture'): number {
  const player = state.players[p];
  if (!player) return 0;
  let pct = 0;
  for (const e of effectsOf(state, p, 'empirePct')) if (e.yield === key) pct += e.pct;
  if (key === 'gold') {
    for (const e of effectsOf(state, p, 'capturedGoldPenalty')) {
      const taken = state.cities.filter((c) => c.owner === p && wasCaptured(c)).length;
      pct += e.pct * Math.max(0, taken - e.free);
    }
  }
  if (key === 'science') {
    const met = metLiving(state, p);
    for (const e of effectsOf(state, p, 'behindSciencePct')) {
      if (met.some((q) => state.players[q]!.techs.length > player.techs.length)) pct += e.pct;
    }
    for (const e of effectsOf(state, p, 'peaceSciencePct')) {
      const peace = met.filter((q) => !state.atWar[p]?.[q]).length;
      pct += Math.min(e.max, e.pct * peace);
    }
    if (player.challenge && player.researching === player.challenge && hasUnique(state, p, 'challenge')) pct += UNIQUE_RULES.challenge.sciencePct;
    if (player.uniquesUsed?.includes('moonshot')) pct += UNIQUE_RULES.moonshot.sciencePct;
  }
  if (key === 'culture') {
    for (const e of effectsOf(state, p, 'capitalLossCulture')) if (capitalLost(state, p)) pct += e.pct;
  }
  return pct;
}

/** Flat gold and science a turn from the player's bonuses (per met civ). */
export function empireFlat(state: GameState, p: number): { gold: number; science: number } {
  const out = { gold: 0, science: 0 };
  const met = metLiving(state, p);
  for (const e of effectsOf(state, p, 'goldPerMetCiv')) out.gold += Math.min(e.max, e.gold * met.length);
  const mine = state.players[p]?.techs.length ?? 0;
  for (const e of effectsOf(state, p, 'sciencePerMetCiv')) {
    const count = e.onlyAhead ? met.filter((q) => state.players[q]!.techs.length > mine).length : met.length;
    out.science += e.science * count;
  }
  return out;
}

// ---- techs ------------------------------------------------------------------------------------

/** Does learning this tech unlock a fighting unit? */
export function unlocksMilitary(tech: TechId): boolean {
  return Object.values(UNITS).some((u) => !u.canFoundCity && u.attack > 0 && (u.requires === tech || u.alsoRequires === tech));
}

/** The percent the player's bonuses change a tech's cost by. */
export function techCostPct(state: GameState, p: number, tech: TechId): number {
  let pct = 0;
  const known = effectsOf(state, p, 'metTechCost');
  if (known.length && metLiving(state, p).some((q) => state.players[q]!.techs.includes(tech))) for (const e of known) pct += e.pct;
  if (unlocksMilitary(tech)) for (const e of effectsOf(state, p, 'militaryTechCost')) pct += e.pct;
  return pct;
}

/** An AI's trade willingness toward `partner` (1–5): its own, changed by the partner's bonuses. */
export function willingnessToward(state: GameState, base: number, partner: number): number {
  let w = base;
  for (const e of effectsOf(state, partner, 'tradeWillingness')) {
    if (e.delta) w += e.delta;
    if (e.mult) w = Math.floor(w * e.mult);
  }
  return Math.max(1, Math.min(5, w));
}

// ---- unique wonders and projects --------------------------------------------------------------

/** Why this civ can't build a leader's unique wonder or project (the tech aside), or undefined. */
export function uniqueBuildError(state: GameState, city: City, item: BuildItem): string | undefined {
  const civ = item.kind === 'wonder' ? WONDERS[item.id]?.civ : item.kind === 'project' ? PROJECTS[item.id]?.civ : undefined;
  if (!civ) return undefined;
  const owner = state.players[city.owner]!;
  const name = findCiv(civ)?.name ?? civ;
  if (owner.civId !== civ) return `Only ${name} can build it`;
  const id = item.id as UniqueId;
  if (!hasUnique(state, city.owner, id)) return 'Not yet: it comes with a later era';
  if (owner.uniquesUsed.includes(id)) return 'Already built';
  if (item.kind === 'wonder' && !isCapital(city)) return 'Capital only';
  // One city at a time.
  const elsewhere = state.cities.find((c) => c.owner === city.owner && c.id !== city.id && c.build?.kind === item.kind && c.build.id === item.id);
  if (elsewhere) return `Already being built in ${elsewhere.name}`;
  return undefined;
}

/** The name of the active bonus that gives this kind of effect ("Grand armies"), for odds and messages. */
export function bonusName(state: GameState, p: number, kind: EffectKind): string {
  const player = state.players[p];
  const bonus = player ? activeBonuses(player).find((b) => b.effects.some((e) => e.kind === kind)) : undefined;
  return bonus?.name ?? 'Leader bonus';
}

/** Leader modifiers on an attack (Round 11): armies, siege weapons, and the underdog. */
export function attackMods(state: GameState, u: { owner: number; type: keyof typeof UNITS; army: boolean }, defenderOwner?: number): { label: string; pct: number }[] {
  const mods: { label: string; pct: number }[] = [];
  const o = u.owner;
  if (u.army) for (const e of effectsOf(state, o, 'armyStrength')) mods.push({ label: bonusName(state, o, 'armyStrength'), pct: e.pct });
  if (UNITS[u.type].siege) for (const e of effectsOf(state, o, 'siegeAttack')) mods.push({ label: bonusName(state, o, 'siegeAttack'), pct: e.pct });
  if (defenderOwner !== undefined && state.players[defenderOwner]?.kind !== 'barbarian') {
    const count = (p: number) => state.cities.filter((c) => c.owner === p).length;
    for (const e of effectsOf(state, o, 'attackVsBigger')) {
      if (count(defenderOwner) > count(o)) mods.push({ label: bonusName(state, o, 'attackVsBigger'), pct: e.pct });
    }
  }
  return mods;
}

/** Leader modifiers on a defense (Round 11): armies, and units defending in their own city. */
export function defenseMods(state: GameState, u: { owner: number; army: boolean; x: number; y: number }): { label: string; pct: number }[] {
  const mods: { label: string; pct: number }[] = [];
  const o = u.owner;
  if (u.army) for (const e of effectsOf(state, o, 'armyStrength')) mods.push({ label: bonusName(state, o, 'armyStrength'), pct: e.pct });
  if (state.cities.some((c) => c.x === u.x && c.y === u.y && c.owner === o)) {
    for (const e of effectsOf(state, o, 'cityDefense')) mods.push({ label: bonusName(state, o, 'cityDefense'), pct: e.pct });
  }
  return mods;
}
