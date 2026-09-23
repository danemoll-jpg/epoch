// Builds a fresh game from a seed. Player 0 is the human; the rest are AI. A player's id is
// always its index in state.players.

import { CIVS } from '../data/civs';
import { RULES } from '../data/rules';
import { UNITS } from '../data/units';
import { updateExplored } from './fog';
import { findStartPositions, generateMap } from './mapgen';
import { hashSeed, shuffle } from './rng';
import type { GameMap, GameState, Player, Unit, Coord } from './types';

export interface NewGameOptions {
  seed: number;
  /** Total players including the human. Defaults to the Milestone 1 count (2). */
  playerCount?: number;
  width?: number;
  height?: number;
}

const MAX_MAP_ATTEMPTS = 30;

export function createGame(opts: NewGameOptions): GameState {
  const playerCount = opts.playerCount ?? RULES.milestone1Players;
  if (playerCount < 1 || playerCount > RULES.maxPlayers || playerCount > CIVS.length) {
    throw new Error(`playerCount must be 1..${Math.min(RULES.maxPlayers, CIVS.length)}`);
  }
  const width = opts.width ?? RULES.mapWidth;
  const height = opts.height ?? RULES.mapHeight;
  const rng = { rngState: hashSeed(opts.seed) };

  // Regenerate (deterministically, continuing the same RNG) until everyone has a start.
  let map: GameMap | undefined;
  let starts: Coord[] = [];
  for (let attempt = 0; attempt < MAX_MAP_ATTEMPTS; attempt++) {
    map = generateMap(rng, { width, height });
    starts = findStartPositions(map, rng, playerCount, RULES.minStartDistance);
    if (starts.length >= playerCount) break;
  }
  if (!map || starts.length < playerCount) throw new Error('Could not place all players');

  const civs = shuffle(rng, [...CIVS]).slice(0, playerCount);
  const players: Player[] = civs.map((civ, i) => ({
    id: i,
    civId: civ.id,
    kind: i === 0 ? 'human' : 'ai',
    explored: new Array<number>(width * height).fill(0),
    citiesFounded: 0,
    alive: true,
  }));

  const state: GameState = {
    version: 1,
    seed: opts.seed,
    rngState: rng.rngState,
    turn: 1,
    currentPlayer: 0,
    map,
    players,
    units: [],
    cities: [],
    nextId: 1,
    log: [],
  };

  players.forEach((p, i) => {
    const start = starts[i]!;
    for (const type of RULES.startingUnits) {
      const unit: Unit = {
        id: state.nextId++,
        type,
        owner: p.id,
        x: start.x,
        y: start.y,
        movesLeft: UNITS[type].moves,
      };
      state.units.push(unit);
    }
    updateExplored(state, p.id);
  });
  return state;
}
