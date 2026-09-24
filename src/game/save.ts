// Save format. Pure: turning state into a string and back, with a version check and
// migrations for older saves. Where the string is stored (localStorage) is the UI's
// business; see src/ui/storage.ts.

import { BUILDINGS } from '../data/buildings';
import type { TechId } from '../data/techs';
import { UNITS } from '../data/units';
import { STATE_VERSION, type GameState } from './types';

/** Bump together with STATE_VERSION whenever the state shape changes. */
export const SAVE_VERSION = STATE_VERSION;

export interface SaveFile {
  saveVersion: number;
  /** Wall-clock ms when saved, for display only. Never used by game rules. */
  savedAt: number;
  state: GameState;
}

export type LoadResult =
  | { kind: 'ok'; state: GameState; savedAt: number; migratedFrom?: number }
  | { kind: 'incompatible'; saveVersion: unknown }
  | { kind: 'corrupt'; error: string };

export function serializeGame(state: GameState, savedAt: number): string {
  const file: SaveFile = { saveVersion: SAVE_VERSION, savedAt, state };
  return JSON.stringify(file);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

type Raw = Record<string, any>;

/**
 * Migrations, keyed by the version they upgrade FROM. Each one edits the raw parsed state
 * in place to the next version's shape. Add one whenever STATE_VERSION is bumped and an old
 * save can reasonably be carried forward; without one, that version's saves are refused.
 */
const MIGRATIONS: Record<number, (s: Raw) => void> = {
  // Milestone 2 → 3: the tech tree. Nobody knows any techs yet and nothing is being
  // researched; science already earned stays banked in the pool, ready to spend. A city
  // building something that now needs a tech goes back to "choose something" (its stored
  // production is kept, so nothing is lost).
  2: (s) => {
    for (const p of s.players as Raw[]) {
      p.techs = [];
      p.researching = null;
    }
    const needs = (b: Raw): TechId | undefined =>
      b.kind === 'unit' ? UNITS[b.id as keyof typeof UNITS]?.requires : BUILDINGS[b.id as keyof typeof BUILDINGS]?.requires;
    for (const c of s.cities as Raw[]) {
      if (c.build && needs(c.build)) c.build = null;
    }
  },
};

/** Just enough shape checking that a damaged save starts a new game instead of crashing. */
function shapeError(s: Record<string, unknown>): string | undefined {
  const map = s.map;
  if (!isObject(map) || !Array.isArray(map.tiles)) return 'missing map';
  if (typeof map.width !== 'number' || typeof map.height !== 'number') return 'bad map size';
  if (map.tiles.length !== map.width * map.height) return 'map size mismatch';
  if (!Array.isArray(s.players) || s.players.length === 0) return 'missing players';
  if (!Array.isArray(s.units) || !Array.isArray(s.cities) || !Array.isArray(s.log)) return 'missing lists';
  if (typeof s.turn !== 'number' || typeof s.rngState !== 'number' || typeof s.nextId !== 'number') {
    return 'missing counters';
  }
  if (typeof s.currentPlayer !== 'number' || !s.players[s.currentPlayer]) return 'bad current player';
  if (!s.players.every((p) => isObject(p) && Array.isArray(p.techs))) return 'missing techs';
  return undefined;
}

export function deserializeGame(text: string): LoadResult {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch (e) {
    return { kind: 'corrupt', error: String(e) };
  }
  if (!isObject(file)) return { kind: 'corrupt', error: 'not an object' };
  const from = file.saveVersion;
  const state = file.state;
  if (typeof from !== 'number' || from > SAVE_VERSION) return { kind: 'incompatible', saveVersion: from };
  if (!isObject(state)) return { kind: 'corrupt', error: 'missing state' };
  if (state.version !== from) return { kind: 'incompatible', saveVersion: state.version };
  if (from < SAVE_VERSION) {
    // Check the whole chain exists before touching anything.
    for (let v = from; v < SAVE_VERSION; v++) {
      if (!MIGRATIONS[v]) return { kind: 'incompatible', saveVersion: from };
    }
    const preErr = shapeErrorBeforeMigration(state);
    if (preErr) return { kind: 'corrupt', error: preErr };
    try {
      for (let v = from; v < SAVE_VERSION; v++) {
        MIGRATIONS[v]!(state);
        state.version = v + 1;
      }
    } catch (e) {
      return { kind: 'corrupt', error: `migration failed: ${String(e)}` };
    }
  }
  const err = shapeError(state);
  if (err) return { kind: 'corrupt', error: err };
  const savedAt = typeof file.savedAt === 'number' ? file.savedAt : 0;
  const result: LoadResult = { kind: 'ok', state: state as unknown as GameState, savedAt };
  if (from < SAVE_VERSION) result.migratedFrom = from;
  return result;
}

/** The lists a migration walks must exist, or it would throw halfway through. */
function shapeErrorBeforeMigration(s: Record<string, unknown>): string | undefined {
  if (!Array.isArray(s.players) || !s.players.every(isObject)) return 'missing players';
  if (!Array.isArray(s.cities) || !s.cities.every(isObject)) return 'missing cities';
  return undefined;
}
