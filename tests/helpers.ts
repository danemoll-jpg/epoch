// Builds small hand-made game states so rule tests don't depend on generated maps.

import type { TerrainId } from '../src/data/terrain';
import { UNITS, type UnitTypeId } from '../src/data/units';
import { refreshWorkedTiles } from '../src/game/yields';
import { STATE_VERSION, type City, type GameState, type Unit } from '../src/game/types';

const LEGEND: Record<string, TerrainId> = {
  g: 'grassland', p: 'plains', f: 'forest', h: 'hills',
  m: 'mountains', d: 'desert', c: 'coast', o: 'ocean',
};

/** rows like ['ggg', 'gmo'] — one letter per tile. Two players, player 0 human. */
export function makeState(rows: string[], opts: { players?: number; exploreAll?: boolean } = {}): GameState {
  const height = rows.length;
  const width = rows[0]!.length;
  const tiles = rows.flatMap((r) => [...r].map((ch) => ({ terrain: LEGEND[ch]! })));
  const players = opts.players ?? 2;
  const civs = ['babylon', 'maurya', 'mali', 'inca', 'franks'];
  return {
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
    })),
    units: [],
    cities: [],
    nextId: 100,
    log: [],
  };
}

export function addUnit(state: GameState, type: UnitTypeId, owner: number, x: number, y: number): Unit {
  const unit: Unit = { id: state.nextId++, type, owner, x, y, movesLeft: UNITS[type].moves, veteran: false };
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
    worked: [],
    ...extra,
  };
  state.cities.push(city);
  refreshWorkedTiles(state);
  return city;
}
