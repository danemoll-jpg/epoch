// Builds small hand-made game states. Used by the unit tests (so rule tests don't depend on
// generated maps) and by the dev scenarios, so a scenario and its test build the same state.
// Dev/test only: nothing in the production game imports this.

import type { DifficultyId } from '../data/difficulty';
import type { TerrainId } from '../data/terrain';
import { UNITS, type UnitTypeId } from '../data/units';
import { newDiplomacy, table } from '../game/diplomacy';
import { allAtWar, noWars, setAlwaysAtWar } from '../game/war';
import { addBarbarianUnit, newBarbarianPlayer } from '../game/barbarians';
import { newSpaceProgram } from '../game/victory';
import { refreshWorkedTiles } from '../game/yields';
import { STATE_VERSION, type City, type GameState, type Unit, type Village } from '../game/types';

const LEGEND: Record<string, TerrainId> = {
  g: 'grassland', p: 'plains', f: 'forest', h: 'hills',
  m: 'mountains', d: 'desert', c: 'coast', o: 'ocean',
};

/**
 * rows like ['ggg', 'gmo'] — one letter per tile. Two players, player 0 human. Everyone has
 * met and is at war (the Milestone 4 setup most rule tests want) unless `peace` is set;
 * `met: false` starts with nobody met (and at peace).
 */
export function makeState(
  rows: string[],
  opts: { players?: number; exploreAll?: boolean; peace?: boolean; met?: boolean; barbarians?: boolean; difficulty?: DifficultyId } = {},
): GameState {
  const height = rows.length;
  const width = rows[0]!.length;
  const tiles = rows.flatMap((r) => [...r].map((ch) => ({ terrain: LEGEND[ch]! })));
  const players = opts.players ?? 2;
  const civs = ['babylon', 'maurya', 'mali', 'inca', 'franks'];
  const state: GameState = {
    version: STATE_VERSION,
    seed: 1,
    rngState: 12345,
    turn: 1,
    currentPlayer: 0,
    map: { width, height, tiles },
    players: Array.from({ length: players }, (_, i) => ({
      id: i,
      civId: civs[i]!,
      kind: i === 0 ? ('human' as const) : ('ai' as const),
      explored: new Array<number>(width * height).fill(opts.exploreAll === false ? 0 : 1),
      citiesFounded: 0,
      alive: true,
      gold: 0,
      science: 0,
      scienceRate: 60,
      techs: [],
      researching: null,
      culture: 0,
      space: newSpaceProgram(),
      greatPeople: 0,
      greatPeopleCultureBase: 0,
      uniquesUsed: [],
      dissolvedUntil: null,
      challenge: null,
      shipsBuilt: [],
    })),
    units: [],
    cities: [],
    nextId: 100,
    atWar: opts.peace || opts.met === false ? noWars(players) : allAtWar(players),
    diplomacy: { ...newDiplomacy(players), met: opts.met === false ? table(players, false) : allAtWar(players) },
    aiPlans: Array.from({ length: players }, () => null),
    aiFerries: Array.from({ length: players }, () => null),
    log: [],
    victory: null,
    keepPlaying: false,
    warned: [],
    villages: [],
    greatPeople: [],
    greatPeopleNames: [],
    religions: [],
    religionTechsLapsed: [],
    difficulty: opts.difficulty ?? 'normal',
    mapSize: 'normal',
  };
  if (opts.barbarians) addBarbarians(state);
  return state;
}

/**
 * Adds the barbarian player (Round 9) last, at war with everyone and never met. Returns its id.
 * States from makeState have no barbarians unless asked, so older tests are unchanged.
 */
export function addBarbarians(state: GameState): number {
  const id = state.players.length;
  const n = id + 1;
  state.players.push(newBarbarianPlayer(id, state.map.tiles.length));
  const grow = <T>(t: T[][], fill: T) => {
    for (const row of t) row.push(fill);
    t.push(Array.from({ length: n }, () => fill));
  };
  grow(state.atWar, false);
  setAlwaysAtWar(state.atWar, id);
  const d = state.diplomacy;
  grow(d.met, false);
  grow(d.peaceTurn, null);
  grow(d.warStart, null);
  grow(d.opinion, 0);
  grow(d.warLosses, 0);
  grow(d.lastDemand, null);
  grow(d.lastPeaceOffer, null);
  state.aiPlans.push(null);
  state.aiFerries.push(null);
  return id;
}

/** Adds a barbarian village with its fortified defender (needs addBarbarians first). */
export function addVillage(state: GameState, x: number, y: number, extra: Partial<Village> = {}, garrison: UnitTypeId | null = 'warrior'): Village {
  const v: Village = { id: state.nextId++, x, y, flags: 0, progress: 0, takenBy: null, ...extra };
  state.villages.push(v);
  if (garrison) addBarbarianUnit(state, garrison, v, v.id, true);
  return v;
}

export function addUnit(
  state: GameState,
  type: UnitTypeId,
  owner: number,
  x: number,
  y: number,
  extra: Partial<Unit> = {},
): Unit {
  const unit: Unit = {
    id: state.nextId++, type, owner, x, y,
    movesLeft: UNITS[type].moves, veteran: false, fortified: false, army: false, carriedBy: null,
    ...extra,
  };
  state.units.push(unit);
  return unit;
}

/** Adds a city directly (no settler needed) and reassigns worked tiles. */
export function addCity(
  state: GameState,
  owner: number,
  x: number,
  y: number,
  extra: Partial<City> = {},
): City {
  const city: City = {
    id: state.nextId++,
    name: extra.name ?? 'City' + state.nextId,
    owner,
    x,
    y,
    foundedTurn: state.turn,
    size: 1,
    food: 0,
    production: 0,
    build: null,
    focus: 'balanced',
    buildings: [],
    wonders: [],
    capitalOf: null,
    worked: [],
    greatPeople: [],
    ...extra,
    founder: extra.founder ?? owner,
    religion: extra.religion ?? null,
  };
  state.cities.push(city);
  refreshWorkedTiles(state);
  return city;
}
