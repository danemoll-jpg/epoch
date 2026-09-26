// Save format. Pure: turning state into a string and back, with a version check and
// migrations for older saves. Where the string is stored (localStorage) is the UI's
// business; see src/ui/storage.ts.

import { BUILDINGS } from '../data/buildings';
import { FOUNDING_TECHS } from '../data/religion';
import type { TechId } from '../data/techs';
import { RULES } from '../data/rules';
import { DIFFICULTIES } from '../data/difficulty';
import { MAP_SIZES } from '../data/mapSizes';
import { UNITS } from '../data/units';
import { newDiplomacy } from './diplomacy';
import { newBarbarianPlayer } from './barbarians';
import { placeResources } from './resources';
import { placeVillagesAndHuts } from './villages';
import { setAlwaysAtWar } from './war';
import { STATE_VERSION, type Coord, type GameMap, type GameState } from './types';

/** Bump together with STATE_VERSION whenever the state shape changes. */
export const SAVE_VERSION = STATE_VERSION;

export interface SaveFile {
  saveVersion: number;
  /** Wall-clock ms when saved, for display only. Never used by game rules. */
  savedAt: number;
  state: GameState;
  /** Round 16: which cloud slot this game syncs with, if any. Outside the state: no rule reads it. */
  cloud?: CloudLink;
}

/**
 * Round 16: a saved game's link to its cloud copy. It rides in the save file (not the game
 * state), so a backup keeps it too, and a restored backup is compared with the cloud like any
 * other copy (never silently overwriting a newer one).
 */
export interface CloudLink {
  /** A random id for this game, the same on every device that has played it. */
  gameId: string;
  /** Its cloud slot (s1..s5), once it has been uploaded. */
  slot?: string;
  /** Whose cloud that slot is in (a Firebase user id). */
  uid?: string;
  /** The cloud revision this copy is based on: the one it last wrote or took (0: none). */
  syncedRev: number;
  /** Changed on this device since `syncedRev`. */
  dirty: boolean;
  /** The player deleted its cloud copy: this game stays on this device only. */
  localOnly?: boolean;
}

export type LoadResult =
  | { kind: 'ok'; state: GameState; savedAt: number; migratedFrom?: number; cloud?: CloudLink }
  | { kind: 'incompatible'; saveVersion: unknown }
  | { kind: 'corrupt'; error: string };

export function serializeGame(state: GameState, savedAt: number, cloud?: CloudLink): string {
  const file: SaveFile = cloud ? { saveVersion: SAVE_VERSION, savedAt, state, cloud } : { saveVersion: SAVE_VERSION, savedAt, state };
  return JSON.stringify(file);
}

function readLink(v: unknown): CloudLink | undefined {
  if (!isObject(v) || typeof v.gameId !== 'string' || typeof v.syncedRev !== 'number' || typeof v.dirty !== 'boolean') return undefined;
  const link: CloudLink = { gameId: v.gameId, syncedRev: v.syncedRev, dirty: v.dirty };
  if (typeof v.slot === 'string') link.slot = v.slot;
  if (typeof v.uid === 'string') link.uid = v.uid;
  if (v.localOnly === true) link.localOnly = true;
  return link;
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
  // Round 8 → Round 9: barbarians, villages, resources, huts, and Great People. Resources
  // come from the seed for the whole map (what a new game with that seed would have; a
  // hidden one already under a city stays hidden until revealed). The barbarians join as the
  // last player, at war with everyone; villages and huts go only on tiles no civ has explored
  // yet, so nothing appears where Dan has already looked. Culture counts toward Great People
  // only from now on, so nobody gets a backlog at once. Nobody has settled one.
  7: (s) => {
    const players = s.players as Raw[];
    const map = s.map as Raw;
    const n = players.length;
    for (const p of players) {
      p.greatPeople = 0;
      p.greatPeopleCultureBase = p.culture ?? 0;
    }
    for (const c of s.cities as Raw[]) c.greatPeople = [];
    s.villages = [];
    s.greatPeople = [];
    s.greatPeopleNames = [];
    // Where each civ started: its capital, else its oldest unit (for fair resources near it).
    const starts: Coord[] = players.map((p) => {
      const city = (s.cities as Raw[]).find((c) => c.capitalOf === p.id) ?? (s.cities as Raw[]).find((c) => c.owner === p.id);
      const unit = (s.units as Raw[]).filter((u) => u.owner === p.id).sort((a, b) => a.id - b.id)[0];
      return city ? { x: city.x, y: city.y } : unit ? { x: unit.x, y: unit.y } : { x: -99, y: -99 };
    });
    placeResources(map as GameMap, s.seed as number, starts.filter((c) => c.x >= 0));
    // The barbarian player, last, at war with everyone; every table grows by one.
    const barb = n;
    players.push(newBarbarianPlayer(barb, map.width * map.height) as unknown as Raw);
    const grow = <T>(t: T[][], fill: T): T[][] => {
      for (const row of t) row.push(fill);
      t.push(Array.from({ length: n + 1 }, () => fill));
      return t;
    };
    s.atWar = grow(s.atWar as boolean[][], false);
    setAlwaysAtWar(s.atWar as boolean[][], barb);
    const d = s.diplomacy as Raw;
    grow(d.met, false);
    grow(d.peaceTurn, null);
    grow(d.warStart, null);
    grow(d.opinion, 0);
    grow(d.warLosses, 0);
    grow(d.lastDemand, null);
    grow(d.lastPeaceOffer, null);
    (s.aiPlans as unknown[]).push(null);
    (s.aiFerries as unknown[]).push(null);
    const explored = (i: number) => players.some((p, id) => id !== barb && p.explored?.[i] === 1);
    placeVillagesAndHuts(s as unknown as GameState, starts.filter((c) => c.x >= 0), (i) => !explored(i));
  },
  // Round 9 → 10: aircraft and the Airport. Nothing to change: no aircraft exist yet, nobody
  // knows Advanced Flight (a new tech), and no city has airlifted anything (`airliftTurn` is
  // simply absent). Any unit with an unknown type would have been refused long before this.
  8: () => {},
  // Round 10 → 11 (Milestone 8): leaders. Every civ keeps its civ (the legacy Babylon, Maurya,
  // and Inca included; they have no bonuses). Bonuses are read from the civ and its current era,
  // so Mali and the Franks get theirs at once, era bonuses for eras already reached are simply
  // on, and nothing is paid out retroactively; no starting tech is granted. Each city's founder
  // is its owner, except a captured capital, which remembers whose it was. Nobody has used a
  // once-per-game action or named a National Challenge; ships already afloat count as built.
  // The new buildings become available by tech like any other.
  9: (s) => {
    for (const p of s.players as Raw[]) {
      p.uniquesUsed = [];
      p.dissolvedUntil = null;
      p.challenge = null;
      const ships = new Set<string>();
      for (const u of s.units as Raw[]) if (u.owner === p.id && UNITS[u.type as keyof typeof UNITS]?.domain === 'sea') ships.add(u.type);
      p.shipsBuilt = [...ships];
    }
    for (const c of s.cities as Raw[]) c.founder = typeof c.capitalOf === 'number' ? c.capitalOf : c.owner;
  },
  // Round 11 → 12: religion and roads. No religions yet and no city follows one; a founding
  // tech some civ already knows doesn't found anything after the fact (it lapses), but the
  // next one nobody knows yet can still be founded. No roads anywhere and no Missionaries
  // (none could exist). Theology is a new tech, simply unknown.
  10: (s) => {
    s.religions = [];
    const known = new Set<string>();
    for (const p of s.players as Raw[]) for (const t of (p.techs as string[]) ?? []) known.add(t);
    s.religionTechsLapsed = FOUNDING_TECHS.filter((t) => known.has(t));
    for (const c of s.cities as Raw[]) c.religion = null;
    for (const t of (s.map as Raw).tiles as Raw[]) delete t.road;
  },
  // Round 12 → 13: difficulty levels and map sizes. Every game so far was played at today's
  // balance on today's map, which are Normal and Normal.
  11: (s) => {
    s.difficulty = 'normal';
    s.mapSize = 'normal';
  },
  // Round 19 Part A: no wins after the game was decided yet; the log's running count starts at
  // what it holds.
  12: (s) => {
    s.laterWins = [];
    s.logCount = Array.isArray(s.log) ? (s.log as unknown[]).length : 0;
  },
  // Round 19 Part C: no spy reports yet.
  13: (s) => {
    for (const p of s.players as Raw[]) p.intel = [];
  },
};

/** What each migration brought, for the "your game was updated" notice. Keyed like MIGRATIONS. */
export const MIGRATION_NOTES: Record<number, string> = {
  2: 'the tech tree',
  3: 'combat and armies',
  4: 'diplomacy',
  5: 'wonders, culture, and victory',
  6: 'ships and the sea',
  7: 'barbarians, villages, resources, huts, and Great People',
  8: 'aircraft and Airports',
  9: 'leader bonuses and new buildings',
  10: 'religion, Missionaries, and roads',
  11: 'difficulty levels and map sizes (yours is Normal on a Normal map)',
  12: 'bigger news: victory warnings, era and wonder cards, and the news log',
  13: 'spies',
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
  if (!Array.isArray(s.villages) || !Array.isArray(s.greatPeople) || !Array.isArray(s.greatPeopleNames)) return 'missing villages';
  if (!s.cities.every((c) => isObject(c) && Array.isArray(c.greatPeople))) return 'missing Great People';
  if (!s.cities.every((c) => isObject(c) && typeof c.founder === 'number')) return 'missing founders';
  if (!s.players.every((p) => isObject(p) && Array.isArray(p.uniquesUsed) && Array.isArray(p.shipsBuilt))) return 'missing leader state';
  if (!Array.isArray(s.religions) || !Array.isArray(s.religionTechsLapsed)) return 'missing religions';
  if (!s.cities.every((c) => isObject(c) && (c.religion === null || typeof c.religion === 'number'))) return 'missing city religions';
  if (typeof s.difficulty !== 'string' || !Object.hasOwn(DIFFICULTIES, s.difficulty)) return 'missing difficulty';
  if (typeof s.mapSize !== 'string' || !Object.hasOwn(MAP_SIZES, s.mapSize)) return 'missing map size';
  if (!Array.isArray(s.laterWins) || typeof s.logCount !== 'number') return 'missing later wins';
  if (!s.players.every((p) => isObject(p) && Array.isArray(p.intel))) return 'missing spy reports';
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
  const cloud = readLink(file.cloud);
  if (cloud) result.cloud = cloud;
  return result;
}

/** The lists a migration walks must exist, or it would throw halfway through. */
function shapeErrorBeforeMigration(s: Record<string, unknown>): string | undefined {
  if (!Array.isArray(s.players) || !s.players.every(isObject)) return 'missing players';
  if (!Array.isArray(s.cities) || !s.cities.every(isObject)) return 'missing cities';
  if (!Array.isArray(s.units) || !s.units.every(isObject)) return 'missing units';
  return undefined;
}
