// Save format. Pure: turning state into a string and back, with a version check. Where the
// string is stored (localStorage) is the UI's business; see src/ui/storage.ts.

import { STATE_VERSION, type GameState } from './types';

/** Bump together with STATE_VERSION whenever the state shape changes incompatibly. */
export const SAVE_VERSION = STATE_VERSION;

export interface SaveFile {
  saveVersion: number;
  /** Wall-clock ms when saved, for display only. Never used by game rules. */
  savedAt: number;
  state: GameState;
}

export type LoadResult =
  | { kind: 'ok'; state: GameState; savedAt: number }
  | { kind: 'incompatible'; saveVersion: unknown }
  | { kind: 'corrupt'; error: string };

export function serializeGame(state: GameState, savedAt: number): string {
  const file: SaveFile = { saveVersion: SAVE_VERSION, savedAt, state };
  return JSON.stringify(file);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

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
  if (file.saveVersion !== SAVE_VERSION) return { kind: 'incompatible', saveVersion: file.saveVersion };
  const state = file.state;
  if (!isObject(state)) return { kind: 'corrupt', error: 'missing state' };
  if (state.version !== STATE_VERSION) return { kind: 'incompatible', saveVersion: state.version };
  const err = shapeError(state);
  if (err) return { kind: 'corrupt', error: err };
  const savedAt = typeof file.savedAt === 'number' ? file.savedAt : 0;
  return { kind: 'ok', state: state as unknown as GameState, savedAt };
}
