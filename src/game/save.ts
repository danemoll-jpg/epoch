// Save format. Pure: turning state into a string and back, with a version check and
// migrations for older saves. Where the string is stored (localStorage) is the UI's
// business; see src/ui/storage.ts.

import { BUILDINGS } from '../data/buildings';
import type { TechId } from '../data/techs';
import { RULES } from '../data/rules';
import { UNITS } from '../data/units';
import { newDiplomacy } from './diplomacy';
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
  // Milestone 3 → 4: combat. No unit is fortified or an army yet, everyone is at war with
  // everyone (no diplomacy until M5), and each civ's first city becomes its capital.
  3: (s) => {
    for (const u of s.units as Raw[]) {
      u.fortified = false;
      u.army = false;
    }
    const n = (s.players as Raw[]).length;
    s.atWar = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => a !== b));
    const first = new Map<number, Raw>();
    for (const c of s.cities as Raw[]) {
      c.capitalOf = null;
      const cur = first.get(c.owner);
      if (!cur || c.foundedTurn < cur.foundedTurn || (c.foundedTurn === cur.foundedTurn && c.id < cur.id)) {
        first.set(c.owner, c);
      }
    }
    for (const [owner, c] of first) c.capitalOf = owner;
  },
  // Milestone 4 → 5: diplomacy. Relations carry over as they are (at war stays at war), so
  // the game doesn't suddenly change. Pairs who can see each other's units or cities right
  // now count as met; the rest meet as usual. No treaties, opinions, or offers yet.
  4: (s) => {
    const players = s.players as Raw[];
    const n = players.length;
    const d = newDiplomacy(n);
    const w = s.map.width as number;
    const radius = (u: Raw) => (u.type ? (UNITS[u.type as keyof typeof UNITS]?.sight ?? 1) : RULES.citySight);
    const seen: Set<number>[] = players.map(() => new Set<number>());
    const things: Raw[] = [...(s.units as Raw[]), ...(s.cities as Raw[]).map((c) => ({ ...c, type: undefined }))];
    for (const t of things) {
      const r = radius(t);
      for (let y = t.y - r; y <= t.y + r; y++) {
        for (let x = t.x - r; x <= t.x + r; x++) {
          if (x >= 0 && y >= 0 && x < w && y < s.map.height) seen[t.owner]?.add(y * w + x);
        }
      }
    }
    for (const t of things) {
      for (let a = 0; a < n; a++) {
        if (a === t.owner || !seen[a]!.has(t.y * w + t.x)) continue;
        d.met[a]![t.owner] = true;
        d.met[t.owner]![a] = true;
      }
    }
    s.diplomacy = d;
    s.aiPlans = players.map(() => null);
  },
  // Milestone 5 → 6: wonders, culture, and victory. Everyone starts at 0 culture with no
  // spaceship, no city has a wonder, and nobody has won (the old "every rival eliminated"
  // win is now a domination victory, checked from here on).
  5: (s) => {
    for (const p of s.players as Raw[]) {
      p.culture = 0;
      p.space = { parts: 0, launchedTurn: null, arrivesTurn: null };
    }
    for (const c of s.cities as Raw[]) c.wonders = [];
    s.victory = null;
    s.keepPlaying = false;
    s.warned = [];
  },
  // Milestone 6 → Round 8: ships. Nobody has a ship yet, so no unit is aboard one, and the AIs
  // have no sea plans. The four new sea techs are simply unknown (research picks them up).
  6: (s) => {
    for (const u of s.units as Raw[]) u.carriedBy = null;
    s.aiFerries = (s.players as Raw[]).map(() => null);
  },
};

/** What each migration brought, for the "your game was updated" notice. Keyed like MIGRATIONS. */
export const MIGRATION_NOTES: Record<number, string> = {
  2: 'the tech tree',
  3: 'combat and armies',
  4: 'diplomacy',
  5: 'wonders, culture, and victory',
  6: 'ships and the sea',
};

/** "the tech tree and combat and armies" for a save upgraded from version `from`. */
export function migrationSummary(from: number): string {
  const parts: string[] = [];
  for (let v = from; v < SAVE_VERSION; v++) if (MIGRATION_NOTES[v]) parts.push(MIGRATION_NOTES[v]!);
  return parts.join(', then ') || 'the latest version';
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
  if (!s.players.every((p) => isObject(p) && Array.isArray(p.techs))) return 'missing techs';
  if (!Array.isArray(s.atWar) || s.atWar.length !== s.players.length) return 'missing war table';
  const d = s.diplomacy;
  if (!isObject(d) || !Array.isArray(d.met) || d.met.length !== s.players.length || !Array.isArray(d.offers)) {
    return 'missing diplomacy';
  }
  if (!Array.isArray(s.aiPlans) || s.aiPlans.length !== s.players.length) return 'missing AI plans';
  if (!s.players.every((p) => isObject(p) && typeof p.culture === 'number' && isObject(p.space))) return 'missing culture';
  if (!Array.isArray(s.cities) || !s.cities.every((c) => isObject(c) && Array.isArray(c.wonders))) return 'missing wonders';
  if (!Array.isArray(s.warned) || typeof s.keepPlaying !== 'boolean') return 'missing victory';
  if (!Array.isArray(s.aiFerries) || s.aiFerries.length !== s.players.length) return 'missing sea plans';
  if (!s.units.every((u) => isObject(u) && (u.carriedBy === null || typeof u.carriedBy === 'number'))) return 'missing cargo';
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
  if (!Array.isArray(s.units) || !s.units.every(isObject)) return 'missing units';
  return undefined;
}
