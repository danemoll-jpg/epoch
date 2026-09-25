// Builds a fresh game from a seed. Player 0 is the human; the rest are AI. A player's id is
// always its index in state.players.

import { PLAYABLE_CIVS, findCiv, type CivDef } from '../data/civs';
import { RULES } from '../data/rules';
import { STARTING_TECHS } from '../data/techs';
import { UNITS } from '../data/units';
import { updateExplored } from './fog';
import { findStartPositions, generateMap } from './mapgen';
import { hashSeed, shuffle } from './rng';
import { newDiplomacy } from './diplomacy';
import { newSpaceProgram } from './victory';
import { noWars, setAlwaysAtWar } from './war';
import { newBarbarianPlayer } from './barbarians';
import { placeResources } from './resources';
import { placeVillagesAndHuts } from './villages';
import { STATE_VERSION, type GameMap, type GameState, type Player, type Unit, type Coord } from './types';

export interface NewGameOptions {
  seed: number;
  /** Civs including the human. Defaults to RULES.defaultPlayers (5). */
  playerCount?: number;
  /**
   * The human's civ (Round 11, the New Game screen), or undefined for a random one. The rivals
   * are drawn at random (seeded) from the rest of the playable roster.
   */
  civ?: string;
  /** Barbarians, their villages, and huts (Round 9). On unless a test turns them off. */
  barbarians?: boolean;
  width?: number;
  height?: number;
}

const MAX_MAP_ATTEMPTS = 30;

/**
 * The human's civ (the chosen one, or a random one) first, then `count − 1` rivals drawn at
 * random from the rest of the playable roster. Seeded, and never the same civ twice.
 */
export function drawCivs(rng: { rngState: number }, count: number, humanCiv?: string): CivDef[] {
  const pool = shuffle(rng, [...PLAYABLE_CIVS]);
  const human = humanCiv ? findCiv(humanCiv)! : pool[0]!;
  const rivals = pool.filter((c) => c.id !== human.id).slice(0, count - 1);
  return [human, ...rivals];
}

export function createGame(opts: NewGameOptions): GameState {
  const playerCount = opts.playerCount ?? RULES.defaultPlayers;
  if (playerCount < 1 || playerCount > RULES.maxPlayers || playerCount > PLAYABLE_CIVS.length) {
    throw new Error(`playerCount must be 1..${Math.min(RULES.maxPlayers, PLAYABLE_CIVS.length)}`);
  }
  if (opts.civ !== undefined && !PLAYABLE_CIVS.some((c) => c.id === opts.civ)) throw new Error(`Unknown civ ${opts.civ}`);
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
  // Resources (Round 9) come from the seed on their own RNG stream (see resources.ts).
  placeResources(map, opts.seed, starts);

  const civs = drawCivs(rng, playerCount, opts.civ);
  const players: Player[] = civs.map((civ, i) => ({
    id: i,
    civId: civ.id,
    kind: i === 0 ? 'human' : 'ai',
    explored: new Array<number>(width * height).fill(0),
    citiesFounded: 0,
    alive: true,
    gold: RULES.startingGold,
    science: 0,
    scienceRate: RULES.defaultScienceRate,
    // Round 11: each civ's starting tech (without its prerequisites).
    techs: civ.startTech ? [...STARTING_TECHS, civ.startTech] : [...STARTING_TECHS],
    researching: null,
    culture: 0,
    space: newSpaceProgram(),
    greatPeople: 0,
    greatPeopleCultureBase: 0,
    uniquesUsed: [],
    dissolvedUntil: null,
    challenge: null,
    shipsBuilt: [],
  }));
  // The barbarians (Round 9) play last, always at war with everyone.
  const barbarians = opts.barbarians ?? true;
  if (barbarians) players.push(newBarbarianPlayer(players.length, width * height));
  const atWarTable = noWars(players.length);
  if (barbarians) setAlwaysAtWar(atWarTable, players.length - 1);

  const state: GameState = {
    version: STATE_VERSION,
    seed: opts.seed,
    rngState: rng.rngState,
    turn: 1,
    currentPlayer: 0,
    map,
    players,
    units: [],
    cities: [],
    nextId: 1,
    atWar: atWarTable,
    diplomacy: newDiplomacy(players.length),
    aiPlans: players.map(() => null),
    aiFerries: players.map(() => null),
    log: [],
    victory: null,
    keepPlaying: false,
    warned: [],
    villages: [],
    greatPeople: [],
    greatPeopleNames: [],
    religions: [],
    religionTechsLapsed: [],
  };

  players.forEach((p, i) => {
    if (p.kind === 'barbarian') return;
    const start = starts[i]!;
    for (const type of RULES.startingUnits) {
      const unit: Unit = {
        id: state.nextId++,
        type,
        owner: p.id,
        x: start.x,
        y: start.y,
        movesLeft: UNITS[type].moves,
        veteran: false,
        fortified: false,
        army: false,
        carriedBy: null,
      };
      state.units.push(unit);
    }
    updateExplored(state, p.id);
  });
  if (barbarians) placeVillagesAndHuts(state, starts);
  return state;
}
