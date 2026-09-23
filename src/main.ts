import './ui/style.css';
import { RULES } from './data/rules';
import { createGame } from './game/newGame';
import { App } from './ui/app';
import { preventBrowserGestures } from './ui/input';

// URL options for testing: ?seed=123 for a reproducible map, ?players=5 for a full table.
const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
// Picking a fresh seed is UI, not game logic, so the clock is fine here.
const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : Date.now() % 1_000_000_000;
const playersParam = Number(params.get('players'));
const playerCount =
  Number.isInteger(playersParam) && playersParam >= 1 && playersParam <= RULES.maxPlayers
    ? playersParam
    : RULES.milestone1Players;

preventBrowserGestures();
const app = new App(createGame({ seed, playerCount }));

// Debug handle for diagnosing device-only bugs (e.g. from Safari's Web Inspector).
(window as unknown as { __epoch: unknown }).__epoch = { app, seed };
console.info(`Epoch: seed ${seed}, ${playerCount} players`);
