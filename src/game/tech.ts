// Research and the tech tree (Milestone 3).
//
// Rules: a player researches one tech at a time, chosen from the techs whose prerequisites
// they know. The player's `science` is a single pool: each turn's science goes into it, and
// at the end of the turn, if it covers the current tech's cost, the tech is learned and the
// cost is taken out (the rest carries over). The player then picks the next tech; until
// they do, science keeps banking in the pool. Switching research keeps the pool (no penalty).
// One tech at most per turn. A player's era is the latest era among the techs they know.

import { BUILDINGS, BUILDING_IDS, type BuildingId } from '../data/buildings';
import {
  AI_TECH_PRIORITY,
  ERAS,
  TECHS,
  TECH_IDS,
  TECH_LIST,
  techCostFor,
  type EraId,
  type TechId,
} from '../data/techs';
import { UNITS, UNIT_IDS, type UnitTypeId } from '../data/units';
import { WONDER_LIST, type WonderDef } from '../data/wonders';
import { CivName } from './conquest';
import { addLog } from './log';
import type { ActionResult, GameState, Player } from './types';
import { empireIncome } from './yields';

export function knows(player: Player, tech: TechId): boolean {
  return player.techs.includes(tech);
}

/** True when `requires` is absent or known. */
export function hasTech(player: Player, requires: TechId | undefined): boolean {
  return requires === undefined || player.techs.includes(requires);
}

/** Why the player can't research this tech now, or undefined if they can. */
export function researchError(player: Player, tech: TechId): string | undefined {
  const def = TECHS[tech];
  if (!def) return 'Unknown tech';
  if (knows(player, tech)) return 'Already known';
  const missing = def.prereqs.filter((p) => !knows(player, p));
  if (missing.length) return `Needs ${missing.map((p) => TECHS[p].name).join(' and ')}`;
  return undefined;
}

/** Techs the player could pick right now, in tree order. */
export function availableTechs(player: Player): TechId[] {
  return TECH_IDS.filter((t) => researchError(player, t) === undefined);
}

/** Science this tech costs the player if researched next. */
export function techCost(player: Player, tech: TechId): number {
  return techCostFor(player.techs.length, TECHS[tech].tier);
}

export function eraIndex(era: EraId): number {
  return ERAS.findIndex((e) => e.id === era);
}

/** The latest era among the player's known techs (Ancient with none). */
export function playerEra(player: Player): EraId {
  let best = 0;
  for (const t of player.techs) best = Math.max(best, eraIndex(TECHS[t].era));
  return ERAS[best]!.id;
}

export function eraName(era: EraId): string {
  return ERAS[eraIndex(era)]!.name;
}

export interface TechUnlocks {
  units: UnitTypeId[];
  buildings: BuildingId[];
  wonders: WonderDef[];
}

/** What learning this tech makes available, read from the `requires` fields in data. */
export function techUnlocks(tech: TechId): TechUnlocks {
  return {
    units: UNIT_IDS.filter((u) => UNITS[u].requires === tech),
    buildings: BUILDING_IDS.filter((b) => BUILDINGS[b].requires === tech),
    wonders: WONDER_LIST.filter((w) => w.requires === tech),
  };
}

/** Techs that list this one as a prerequisite. */
export function techLeadsTo(tech: TechId): TechId[] {
  return TECH_LIST.filter((t) => t.prereqs.includes(tech)).map((t) => t.id);
}

/** Sets the current player's research. Keeps the science pool. */
export function setResearch(state: GameState, tech: TechId): ActionResult {
  const player = state.players[state.currentPlayer];
  if (!player) return { ok: false, reason: 'No such player' };
  const err = researchError(player, tech);
  if (err) return { ok: false, reason: err };
  player.researching = tech;
  return { ok: true };
}

/**
 * End-of-turn research for one player, after the turn's science has been added: learn the
 * current tech if the pool covers it, and announce a new era.
 */
export function processResearch(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player || !player.researching) return;
  const tech = player.researching;
  const cost = techCost(player, tech);
  if (player.science < cost) return;
  player.science -= cost;
  player.researching = null;
  learnTech(state, playerId, tech, `Learned ${TECHS[tech].name}`);
}

/**
 * Adds a tech to what the player knows (by research, or a trade: Milestone 5), logs it, and
 * announces a new era. Research on it stops (the pool stays banked).
 */
export function learnTech(state: GameState, playerId: number, tech: TechId, text: string): void {
  const player = state.players[playerId]!;
  if (knows(player, tech)) return;
  const eraBefore = playerEra(player);
  player.techs.push(tech);
  if (player.researching === tech) player.researching = null;
  addLog(state, playerId, text);
  const eraAfter = playerEra(player);
  if (eraAfter !== eraBefore) {
    const era = eraName(eraAfter);
    addLog(state, playerId, `Entered the ${era} era`, undefined, undefined, {
      publicText: `${CivName(state, playerId)} entered the ${era} era`,
      kind: 'era',
    });
  }
}

/**
 * Turns until the player would learn `tech` at the current science rate, starting from the
 * pool they have now (so for the current research it's the real countdown). Undefined when
 * no science is coming in and the pool doesn't cover it.
 */
export function turnsToLearn(state: GameState, playerId: number, tech: TechId): number | undefined {
  const player = state.players[playerId]!;
  const remaining = techCost(player, tech) - player.science;
  if (remaining <= 0) return 1;
  const perTurn = empireIncome(state, playerId).science;
  return perTurn > 0 ? Math.ceil(remaining / perTurn) : undefined;
}

/** AI research choice: the first available tech in `first` (urgent picks), then AI_TECH_PRIORITY, else the shallowest available. */
export function chooseAiResearch(player: Player, first: TechId[] = []): TechId | undefined {
  const available = availableTechs(player);
  if (available.length === 0) return undefined;
  const preferred = [...first, ...AI_TECH_PRIORITY].find((t) => available.includes(t));
  if (preferred) return preferred;
  // TECH_IDS order breaks ties, and the sort is stable.
  return [...available].sort((a, b) => TECHS[a].tier - TECHS[b].tier)[0];
}
