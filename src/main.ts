import './ui/style.css';
import { RULES } from './data/rules';
import { createGame } from './game/newGame';
import type { GameState } from './game/types';
import { App } from './ui/app';
import { preventBrowserGestures } from './ui/input';
import { loadFromStorage, saveToStorage } from './ui/storage';

// URL options for testing: ?seed=123 for a reproducible map, ?players=5 for a full table,
// ?new to ignore the autosave and start fresh. Without ?new, a saved game always resumes
// (and ?seed / ?players only apply to new games).
const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const playersParam = Number(params.get('players'));
const playerCount =
  Number.isInteger(playersParam) && playersParam >= 1 && playersParam <= RULES.maxPlayers
    ? playersParam
    : RULES.milestone1Players;

function newGame(): GameState {
  // Picking a fresh seed is UI, not game logic, so the clock is fine here.
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : Date.now() % 1_000_000_000;
  return createGame({ seed, playerCount });
}

let state: GameState | undefined;
let notice: string | undefined;
const saved = params.has('new') ? undefined : loadFromStorage();
if (saved?.kind === 'ok') {
  state = saved.state;
  notice = `Resumed your game (turn ${state.turn})`;
} else if (saved?.kind === 'incompatible') {
  notice = 'Your saved game is from an older version of Epoch and can’t be loaded, so a new game has started.';
} else if (saved?.kind === 'corrupt') {
  console.warn('Epoch: saved game unreadable:', saved.error);
  notice = 'Your saved game couldn’t be read, so a new game has started.';
}
if (!state) {
  state = newGame();
  saveToStorage(state);
}

preventBrowserGestures();
const app = new App(state, { newGame, notice });

// Debug handle for diagnosing device-only bugs (e.g. from Safari's Web Inspector).
(window as unknown as { __epoch: unknown }).__epoch = { app, seed: state.seed };
console.info(`Epoch: seed ${state.seed}, ${state.players.length} players, turn ${state.turn}`);
