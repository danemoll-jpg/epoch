// Game state: plain, serializable data only. No classes, functions, or DOM references —
// save/load must be JSON.stringify / JSON.parse.

import type { BuildingId } from '../data/buildings';
import type { CityFocus } from '../data/rules';
import type { TechId } from '../data/techs';
import type { TerrainId } from '../data/terrain';
import type { UnitTypeId } from '../data/units';

export interface Coord {
  x: number;
  y: number;
}

export interface Tile {
  terrain: TerrainId;
}

export interface GameMap {
  width: number;
  height: number;
  /** Row-major: index = y * width + x. */
  tiles: Tile[];
}

export type PlayerKind = 'human' | 'ai';

export interface Player {
  id: number;
  civId: string;
  kind: PlayerKind;
  /** Per-tile explored flags (1 = explored), row-major like map.tiles. */
  explored: number[];
  /** How many city names from the civ's list have been used. */
  citiesFounded: number;
  alive: boolean;
  gold: number;
  /**
   * The science pool: progress toward the current research, or banked science while
   * nothing is being researched. Learning a tech takes its cost out; the rest carries over.
   */
  science: number;
  /** Percent of trade that becomes science (0–100, 10% steps); the rest is gold. */
  scienceRate: number;
  /** Known techs, in the order they were learned. */
  techs: TechId[];
  /** The tech being researched, or null when the player needs to pick one. */
  researching: TechId | null;
}

export interface Unit {
  id: number;
  type: UnitTypeId;
  owner: number;
  x: number;
  y: number;
  movesLeft: number;
  /** Veterans get a combat bonus. Built in a city with Barracks, or promoted by winning a fight. */
  veteran: boolean;
  /** Dug in for a defense bonus; cleared when the unit moves or attacks. */
  fortified: boolean;
  /** Three units of one type merged into one (combat strength × RULES.combat.armyMultiplier). */
  army: boolean;
}

export type BuildItem =
  | { kind: 'unit'; id: UnitTypeId }
  | { kind: 'building'; id: BuildingId };

export interface City {
  id: number;
  name: string;
  owner: number;
  x: number;
  y: number;
  foundedTurn: number;
  size: number;
  /** Food in the box toward the next size. */
  food: number;
  /** Production stored toward the current item (kept when there is none). */
  production: number;
  /** What the city is building, or null when it needs a choice. */
  build: BuildItem | null;
  focus: CityFocus;
  buildings: BuildingId[];
  /**
   * The player whose original capital this is (their first city), or null. It stays set when
   * the city is captured, so "capture every capital" (domination, M6) can be checked.
   */
  capitalOf: number | null;
  /**
   * Tile indices worked by citizens (not including the center). Assigned automatically by
   * refreshWorkedTiles; stored so the UI and saves see exactly what the rules used.
   */
  worked: number[];
}

/**
 * Bumped whenever the state shape changes. Older saves are migrated forward when there's a
 * migration for them in save.ts; otherwise they aren't loaded.
 * 3 = Milestone 3 (techs, research). 4 = Milestone 4 (combat: war, fortify, armies, capitals).
 */
export const STATE_VERSION = 4;

export interface GameState {
  version: number;
  seed: number;
  /** Current seeded-RNG state; advances whenever game logic draws a random number. */
  rngState: number;
  turn: number;
  /** Index into players of whose turn it is. */
  currentPlayer: number;
  map: GameMap;
  players: Player[];
  units: Unit[];
  cities: City[];
  nextId: number;
  /**
   * atWar[a][b]: are players a and b at war? Symmetric. Everyone is at war with everyone
   * until diplomacy arrives (Milestone 5).
   */
  atWar: boolean[][];
  /** Short human-readable event log (newest last); the UI shows recent entries. */
  log: LogEntry[];
}

export interface LogEntry {
  turn: number;
  player: number;
  /** Another player involved (e.g. the defender in a fight): they always see the entry too. */
  other?: number;
  text: string;
  /** Where it happened, so the UI can hide rival events the viewer can't see. */
  x?: number;
  y?: number;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
  /** Set by an attack: what happened, for the UI's result message. */
  combat?: CombatReport;
}

export interface CombatReport {
  attackerWon: boolean;
  /** The attacker's win chance, 0–1, as shown before the attack. */
  chance: number;
  attackerType: UnitTypeId;
  defenderType: UnitTypeId;
  attackerArmy: boolean;
  defenderArmy: boolean;
  attackerOwner: number;
  defenderOwner: number;
  /** The defending tile. */
  x: number;
  y: number;
  /** The winner became a veteran from this fight. */
  promoted: boolean;
}
