import './ui/style.css';
import { RULES } from './data/rules';
import type { Scenario } from './dev/scenarios';
import { createGame } from './game/newGame';
import type { GameState } from './game/types';
import { App, type AppOptions } from './ui/app';
import type { SetupChoice } from './ui/setup';
import { preventBrowserGestures } from './ui/input';
import { loadOrStart } from './ui/storage';

// URL options for testing: ?seed=123 for a reproducible map, ?players=5 for a full table,
// ?new to ignore the autosave and start fresh. Without ?new, a saved game always resumes
// (and ?seed / ?players only apply to new games).
// Dev server only: ?scenario=<id> loads a hand-made test scenario (see src/dev/scenarios.ts).
// A scenario is never autosaved, so the real game is untouched; drop ?scenario to go back.
const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const playersParam = Number(params.get('players'));
const playerCount =
  Number.isInteger(playersParam) && playersParam >= 1 && playersParam <= RULES.maxPlayers
    ? playersParam
    : RULES.defaultPlayers;

/** A new game: from the New Game screen (Round 11: your civ, or random, and 1–4 rivals), else the URL's options. */
function newGame(choice?: SetupChoice): GameState {
  // Picking a fresh seed is UI, not game logic, so the clock is fine here.
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : Date.now() % 1_000_000_000;
  return createGame({
    seed,
    playerCount: choice ? choice.rivals + 1 : Math.min(playerCount, RULES.defaultPlayers),
    civ: choice?.civ,
    difficulty: choice?.difficulty,
    mapSize: choice?.mapSize,
  });
}

async function boot(): Promise<void> {
  let state: GameState | undefined;
  let notice: string | undefined;
  const opts: AppOptions = { newGame };

  // import.meta.env.DEV is false in the production build, so Vite drops this branch and the
  // dev/scenarios chunk entirely (scripts/check-dist.mjs verifies it after every build).
  if (import.meta.env.DEV) {
    const dev = await import('./dev/scenarios');
    opts.devScenarios = dev.SCENARIOS.map((s) => ({ id: s.id, title: s.title }));
    const id = params.get('scenario');
    if (id) {
      const scenario: Scenario | undefined = dev.findScenario(id);
      if (scenario) {
        state = scenario.build();
        opts.scenario = { id: scenario.id, title: scenario.title, note: scenario.note };
        // Round 13: some scenarios open a screen straight away, or show every tip afresh.
        opts.opens = scenario.opens;
        opts.freshTips = scenario.freshTips;
        // Round 14: the era-music scenario plays sound, with a music switch in its note.
        opts.scenarioSound = scenario.sound;
        opts.musicSwitch = scenario.musicSwitch;
        opts.autosave = false;
        console.info(`Epoch: ${dev.SCENARIO_MARKER}: loaded "${id}" (not saved)`);
      } else {
        notice = `No dev scenario called “${id}”; showing your game.`;
      }
    }
  }

  if (!state) {
    // Resume the autosave, or start fresh; a save that gets replaced is always backed up first.
    // Round 13: the main menu opens first (except with ?new, which goes straight into a new game).
    const menu = !params.has('new');
    const start = loadOrStart({ forceNew: params.has('new'), newGame, now: Date.now(), saveFresh: !menu });
    state = start.state;
    notice = [notice, start.notice].filter(Boolean).join(' ') || undefined;
    if (!start.autosave) opts.autosave = false;
    if (start.placeholder) opts.placeholder = true;
    if (menu) opts.opens = 'mainMenu';
  }

  preventBrowserGestures();
  opts.notice = notice;
  const app = new App(state, opts);

  // Debug handle for diagnosing device-only bugs (e.g. from Safari's Web Inspector).
  (window as unknown as { __epoch: unknown }).__epoch = { app, seed: state.seed };
  console.info(`Epoch: seed ${state.seed}, ${state.players.length} players, turn ${state.turn}`);
}

void boot();
