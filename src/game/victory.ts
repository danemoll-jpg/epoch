// The four victories (Milestone 6), each in one function so it can be changed on its own:
//
// - Domination: hold every rival's original capital (City.capitalOf). A rival that has been
//   eliminated counts as held, so "every rival eliminated" (Milestone 4) is still a win.
// - Culture: reach victoryGoals(state.mapSize, state.difficulty).culture culture, then build the World Council.
// - Economic: have victoryGoals(state.mapSize, state.difficulty).gold gold in the treasury, then build the Global Exchange
//   (paid in production like any wonder; the treasury must still hold the goal when it's done).
// - Technology: learn Space Flight, build the spaceship's parts in your capital, launch it,
//   and win when it arrives, VICTORY.spaceship.travelTurns later. Losing the capital before
//   then loses the ship (and any parts).
//
// The first civ to meet any condition wins (checkVictory: after every action and every
// player's turn). If a rival wins, the human loses. "Keep playing" stops the checks.
// Near-win warnings (issueWarnings) tell the human when a civ they've met gets close.

import { victoryGoals } from '../data/mapSizes';
import { VICTORY, VICTORY_KINDS, VICTORY_NAMES, type VictoryKind } from '../data/victory';
import { WONDERS, type WonderId } from '../data/wonders';
import { CivName, civPossessive, civVerb } from './conquest';
import { hasMet } from './diplomacy';
import { addLog } from './log';
import { hasTech } from './tech';
import type { ActionResult, City, GameState, SpaceProgram } from './types';
import { empireCulture } from './yields';

export function newSpaceProgram(): SpaceProgram {
  return { parts: 0, launchedTurn: null, arrivesTurn: null };
}

// ---- domination ---------------------------------------------------------------------------

/** The rivals' original capitals `p` holds (an eliminated rival counts), out of how many rivals. */
export function capitalsHeld(state: GameState, p: number): { held: number; of: number } {
  // The barbarians aren't a rival (Round 9).
  const rivals = state.players.filter((q) => q.id !== p && q.kind !== 'barbarian');
  const held = rivals.filter((r) => !r.alive || state.cities.some((c) => c.capitalOf === r.id && c.owner === p)).length;
  return { held, of: rivals.length };
}

export function dominationWon(state: GameState, p: number): boolean {
  const { held, of } = capitalsHeld(state, p);
  return of > 0 && held === of;
}

// ---- culture and economic: reach the goal, then build the victory wonder -------------------

/** The victory wonder for culture or economic. */
export function victoryWonder(kind: 'culture' | 'economic'): WonderId {
  return Object.values(WONDERS).find((w) => w.victory === kind)!.id;
}

/** Why `owner` can't start (or finish) this wonder yet: a victory wonder needs its goal first. */
export function victoryWonderError(state: GameState, owner: number, id: WonderId): string | undefined {
  const kind = WONDERS[id]?.victory;
  const p = state.players[owner]!;
  if (kind === 'culture' && p.culture < victoryGoals(state.mapSize, state.difficulty).culture) return `Needs ${victoryGoals(state.mapSize, state.difficulty).culture} culture (you have ${p.culture})`;
  if (kind === 'economic' && p.gold < victoryGoals(state.mapSize, state.difficulty).gold) return `Needs ${victoryGoals(state.mapSize, state.difficulty).gold} gold in the treasury (you have ${p.gold})`;
  return undefined;
}

/** A finished Global Exchange waits while the treasury is below the goal. */
export function victoryWonderBlocker(state: GameState, owner: number, id: WonderId): string | undefined {
  return WONDERS[id]?.victory === 'economic' ? victoryWonderError(state, owner, id) : undefined;
}

function holdsVictoryWonder(state: GameState, p: number, kind: 'culture' | 'economic'): boolean {
  const id = victoryWonder(kind);
  return state.cities.some((c) => c.owner === p && c.wonders.includes(id));
}

export function cultureWon(state: GameState, p: number): boolean {
  return holdsVictoryWonder(state, p, 'culture');
}

export function economicWon(state: GameState, p: number): boolean {
  return holdsVictoryWonder(state, p, 'economic');
}

// ---- technology: the spaceship ------------------------------------------------------------

/** The player's original capital, if they still hold it (where the spaceship is built). */
export function capitalOf(state: GameState, p: number): City | undefined {
  return state.cities.find((c) => c.capitalOf === p && c.owner === p);
}

/** Why this city can't build a spaceship part (tech aside), or undefined if it can. */
export function spaceshipError(state: GameState, city: City): string | undefined {
  if (city.capitalOf !== city.owner) return 'Only in your capital';
  const space = state.players[city.owner]!.space;
  if (space.launchedTurn !== null) return 'Already launched';
  if (space.parts >= VICTORY.spaceship.parts) return 'All parts built: launch it';
  return undefined;
}

export function addSpaceshipPart(state: GameState, city: City): void {
  const space = state.players[city.owner]!.space;
  space.parts++;
  const n = `${space.parts} of ${VICTORY.spaceship.parts}`;
  const done = space.parts >= VICTORY.spaceship.parts;
  addLog(state, city.owner, `${city.name} built spaceship part ${n}.${done ? ' Launch it from the city screen!' : ''}`, city, undefined, {
    publicText: `${CivName(state, city.owner)} ${civVerb(state, city.owner, 'has', 'have')} built spaceship part ${n}`,
    kind: 'space',
  });
}

export function launchError(state: GameState, p: number): string | undefined {
  const player = state.players[p];
  if (!player) return 'No such player';
  if (!hasTech(player, VICTORY.spaceship.requires)) return 'Needs Space Flight';
  if (player.space.launchedTurn !== null) return 'Already launched';
  if (player.space.parts < VICTORY.spaceship.parts) return `Needs all ${VICTORY.spaceship.parts} parts (${player.space.parts} built)`;
  if (!capitalOf(state, p)) return 'Your capital has been captured';
  return undefined;
}

/** Launches the current player's spaceship. It arrives at the start of turn now + travelTurns. */
export function launchSpaceship(state: GameState): ActionResult {
  const p = state.currentPlayer;
  const err = launchError(state, p);
  if (err) return { ok: false, reason: err };
  const space = state.players[p]!.space;
  space.launchedTurn = state.turn;
  space.arrivesTurn = state.turn + VICTORY.spaceship.travelTurns;
  const capital = capitalOf(state, p)!;
  addLog(state, p, `Your spaceship has launched! It arrives on turn ${space.arrivesTurn}. Keep ${capital.name} safe until then.`, capital, undefined, {
    publicText: `${CivName(state, p)} launched a spaceship! It arrives on turn ${space.arrivesTurn}`,
    kind: 'space',
  });
  return { ok: true };
}

/** The capital fell: its spaceship (launched or not) and its parts are lost. */
export function loseSpaceship(state: GameState, owner: number, capital: City): void {
  const space = state.players[owner]!.space;
  if (space.parts === 0 && space.launchedTurn === null) return;
  const launched = space.launchedTurn !== null;
  state.players[owner]!.space = newSpaceProgram();
  const text = `${civPossessive(state, owner)} spaceship was lost when ${capital.name} fell`;
  addLog(state, owner, launched ? `Your spaceship was lost when ${capital.name} fell!` : `Your spaceship parts were lost when ${capital.name} fell`, capital, undefined, {
    publicText: text.charAt(0).toUpperCase() + text.slice(1),
    kind: 'space',
  });
}

export function technologyWon(state: GameState, p: number): boolean {
  const arrives = state.players[p]!.space.arrivesTurn;
  return arrives !== null && state.turn >= arrives;
}

// ---- the check ----------------------------------------------------------------------------

/** One function per victory, in the order they're checked for each civ. */
const WON: Record<VictoryKind, (state: GameState, p: number) => boolean> = {
  domination: dominationWon,
  culture: cultureWon,
  economic: economicWon,
  technology: technologyWon,
};

/** What `p` has won, if anything (ignores whether the game is already over). */
export function victoryFor(state: GameState, p: number): VictoryKind | undefined {
  if (!state.players[p]?.alive || state.players[p]!.kind === 'barbarian') return undefined;
  return VICTORY_KINDS.find((k) => WON[k](state, p));
}

/**
 * Records the first win: the player whose turn it is is checked first, then everyone else in
 * order. Does nothing once someone has won or after "Keep playing".
 */
export function checkVictory(state: GameState): void {
  if (state.victory || state.keepPlaying) return;
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    const p = (state.currentPlayer + i) % n;
    const kind = victoryFor(state, p);
    if (!kind) continue;
    state.victory = { winner: p, kind, turn: state.turn };
    const text = `${CivName(state, p)} won a ${VICTORY_NAMES[kind].toLowerCase()} victory on turn ${state.turn}`;
    addLog(state, p, `You won a ${VICTORY_NAMES[kind].toLowerCase()} victory!`, undefined, undefined, { publicText: text, kind: 'victory' });
    return;
  }
}

/** The human keeps playing after the game has been won (by anyone): no more victory checks. */
export function keepPlaying(state: GameState): ActionResult {
  if (!state.victory) return { ok: false, reason: 'Nobody has won yet' };
  state.keepPlaying = true;
  return { ok: true };
}

// ---- progress and warnings ----------------------------------------------------------------

export interface VictoryProgress {
  capitals: { held: number; of: number };
  culture: number;
  culturePerTurn: number;
  gold: number;
  techs: number;
  space: SpaceProgram;
  /** Building the culture or economic victory wonder right now. */
  buildingWonder: { culture: boolean; economic: boolean };
}

export function victoryProgress(state: GameState, p: number): VictoryProgress {
  const player = state.players[p]!;
  const building = (kind: 'culture' | 'economic') =>
    state.cities.some((c) => c.owner === p && c.build?.kind === 'wonder' && c.build.id === victoryWonder(kind));
  return {
    capitals: capitalsHeld(state, p),
    culture: player.culture,
    culturePerTurn: empireCulture(state, p),
    gold: player.gold,
    techs: player.techs.length,
    space: player.space,
    buildingWonder: { culture: building('culture'), economic: building('economic') },
  };
}

export interface VictoryWarning {
  /** Unique per event, so each warning is given once. */
  key: string;
  civ: number;
  kind: VictoryKind;
  text: string;
}

/** Ways `p` is close to winning right now (a launched ship, culture or gold past warnPct, all capitals but one). */
export function victoryWarnings(state: GameState, p: number): VictoryWarning[] {
  const player = state.players[p]!;
  if (!player.alive) return [];
  const out: VictoryWarning[] = [];
  const Who = CivName(state, p);
  const has = civVerb(state, p, 'has', 'have');
  const space = player.space;
  if (space.launchedTurn !== null && space.arrivesTurn !== null) {
    const capital = capitalOf(state, p);
    out.push({
      key: `space:${p}:${space.launchedTurn}`,
      civ: p,
      kind: 'technology',
      text: `${Who} launched a spaceship! It arrives on turn ${space.arrivesTurn}${capital ? `. Capture ${capital.name}, their capital, before then to stop it` : ''}.`,
    });
  }
  const pct = (v: number, goal: number) => Math.floor((v / goal) * 100);
  if (pct(player.culture, victoryGoals(state.mapSize, state.difficulty).culture) >= VICTORY.warnPct) {
    out.push({
      key: `culture:${p}`,
      civ: p,
      kind: 'culture',
      text: `${Who} ${has} ${player.culture} culture, ${Math.min(100, pct(player.culture, victoryGoals(state.mapSize, state.difficulty).culture))}% of the ${victoryGoals(state.mapSize, state.difficulty).culture} needed. Past that, building the ${WONDERS[victoryWonder('culture')].name} wins the game.`,
    });
  }
  if (pct(player.gold, victoryGoals(state.mapSize, state.difficulty).gold) >= VICTORY.warnPct) {
    out.push({
      key: `economic:${p}`,
      civ: p,
      kind: 'economic',
      text: `${Who} ${has} ${player.gold} gold, ${Math.min(100, pct(player.gold, victoryGoals(state.mapSize, state.difficulty).gold))}% of the ${victoryGoals(state.mapSize, state.difficulty).gold} needed. Past that, building the ${WONDERS[victoryWonder('economic')].name} wins the game.`,
    });
  }
  const { held, of } = capitalsHeld(state, p);
  if (of >= 2 && held === of - 1) {
    out.push({
      key: `domination:${p}`,
      civ: p,
      kind: 'domination',
      text: `${Who} ${civVerb(state, p, 'holds', 'hold')} ${held} of ${of} rival capitals. One more and ${civVerb(state, p, 'it wins', 'they win')} by domination.`,
    });
  }
  return out;
}

/**
 * Tells each human about civs they've met that just got close to winning, once per event:
 * a log entry of kind 'warning' aimed at them (the UI gives it a panel).
 */
export function issueWarnings(state: GameState): void {
  if (state.victory || state.keepPlaying) return;
  for (const viewer of state.players) {
    if (viewer.kind !== 'human' || !viewer.alive) continue;
    for (const rival of state.players) {
      if (rival.id === viewer.id || !hasMet(state, viewer.id, rival.id)) continue;
      for (const w of victoryWarnings(state, rival.id)) {
        const key = `${viewer.id}>${w.key}`;
        if (state.warned.includes(key)) continue;
        state.warned.push(key);
        addLog(state, rival.id, w.text, undefined, viewer.id, { otherText: w.text, kind: 'warning' });
      }
    }
  }
}
