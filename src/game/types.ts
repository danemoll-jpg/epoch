// Game state: plain, serializable data only. No classes, functions, or DOM references —
// save/load must be JSON.stringify / JSON.parse.

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
}

export interface Unit {
  id: number;
  type: UnitTypeId;
  owner: number;
  x: number;
  y: number;
  movesLeft: number;
}

export interface City {
  id: number;
  name: string;
  owner: number;
  x: number;
  y: number;
  foundedTurn: number;
}

export interface GameState {
  version: 1;
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
  /** Short human-readable event log (newest last); the UI shows recent entries. */
  log: LogEntry[];
}

export interface LogEntry {
  turn: number;
  player: number;
  text: string;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}
