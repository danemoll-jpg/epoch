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
import { VICTORY, VICTORY_KINDS, aVictory, type VictoryKind } from '../data/victory';
import { WONDERS, type WonderId } from '../data/wonders';
import { CivName, civPossessive, civVerb } from './conquest';
import { hasMet } from './diplomacy';
import { addLog } from './log';
import { hasTech } from './tech';
import { turnsToFinish } from './production';
import type { ActionResult, City, GameState, LogRef, SpaceProgram, WarningStep } from './types';
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
 * order. Once someone has won, the game is decided; after "Keep playing" (Round 19, item 10)
 * later wins are still noticed and kept in `laterWins` for the record, but change nothing.
 */
export function checkVictory(state: GameState): void {
  if (state.victory || state.keepPlaying) {
    if (state.victory && state.keepPlaying) checkLaterWins(state);
    return;
  }
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    const p = (state.currentPlayer + i) % n;
    const kind = victoryFor(state, p);
    if (!kind) continue;
    state.victory = { winner: p, kind, turn: state.turn };
    const text = `${CivName(state, p)} won ${aVictory(kind)} on turn ${state.turn}`;
    addLog(state, p, `You won ${aVictory(kind)}!`, undefined, undefined, { publicText: text, kind: 'victory', ref: { victory: kind } });
    return;
  }
}

/** What reaching each victory looks like, for the record kept after the game was decided. */
const LATER_TEXT: Record<VictoryKind, string> = {
  technology: 'Your spaceship reached Alpha Centauri!',
  culture: `You completed the ${WONDERS.world_council.name}: a culture victory!`,
  economic: `You completed the ${WONDERS.global_exchange.name}: an economic victory!`,
  domination: 'You hold every rival capital: a domination victory!',
};

/** The same, as news for everyone else. */
function laterPublicText(state: GameState, p: number, kind: VictoryKind): string {
  switch (kind) {
    case 'technology': {
      const s = `${civPossessive(state, p)} spaceship reached Alpha Centauri`;
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    case 'culture':
      return `${CivName(state, p)} completed the ${WONDERS.world_council.name}`;
    case 'economic':
      return `${CivName(state, p)} completed the ${WONDERS.global_exchange.name}`;
    case 'domination':
      return `${CivName(state, p)} ${civVerb(state, p, 'holds', 'hold')} every rival capital`;
  }
}

/** Round 19 (item 10): wins reached after the game was decided (in "Keep playing"), once each. */
function checkLaterWins(state: GameState): void {
  const v = state.victory!;
  for (const player of state.players) {
    const p = player.id;
    if (!player.alive || player.kind === 'barbarian') continue;
    for (const kind of VICTORY_KINDS) {
      if (p === v.winner && kind === v.kind) continue;
      if (state.laterWins.some((w) => w.winner === p && w.kind === kind)) continue;
      if (!WON[kind](state, p)) continue;
      state.laterWins.push({ winner: p, kind, turn: state.turn });
      const decided = `${v.winner === p ? 'You' : CivName(state, v.winner)} won on turn ${v.turn}; this doesn't change the result.`;
      addLog(state, p, `${LATER_TEXT[kind]} ${decided}`, undefined, undefined, {
        publicText: `${laterPublicText(state, p, kind)} (the game was already decided)`,
        kind: 'victory',
        ref: { victory: kind, step: 'later' },
      });
    }
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
  step: WarningStep;
  text: string;
  /** Round 19: the same warning for a civ the viewer hasn't met, or undefined if they aren't told. */
  unknownText?: string;
  cityId?: number;
  turns?: number;
}

/** The city (of `p`'s) building this victory wonder that will finish first, and in how many turns. */
export function victoryWonderBuild(state: GameState, p: number, kind: 'culture' | 'economic'): { city: City; turns: number | undefined } | undefined {
  const id = victoryWonder(kind);
  let best: { city: City; turns: number | undefined } | undefined;
  for (const city of state.cities) {
    if (city.owner !== p || city.build?.kind !== 'wonder' || city.build.id !== id) continue;
    const turns = turnsToFinish(state, city);
    if (!best || (turns !== undefined && (best.turns === undefined || turns < best.turns))) best = { city, turns };
  }
  return best;
}

/**
 * Round 19 (item 9): about how many turns until `p` wins, if a win is on its way (a victory
 * wonder being built with the goal reached, or a spaceship in flight); undefined otherwise.
 */
export function turnsToVictory(state: GameState, p: number): number | undefined {
  const player = state.players[p]!;
  if (!player.alive) return undefined;
  const out: number[] = [];
  if (player.space.arrivesTurn !== null) out.push(Math.max(0, player.space.arrivesTurn - state.turn));
  for (const kind of ['culture', 'economic'] as const) {
    if (victoryWonderError(state, p, victoryWonder(kind))) continue;
    const b = victoryWonderBuild(state, p, kind);
    if (b?.turns !== undefined) out.push(b.turns);
  }
  return out.length ? Math.min(...out) : undefined;
}

function turnsWord(n: number): string {
  return `${n} turn${n === 1 ? '' : 's'}`;
}

/**
 * Ways `p` is close to winning right now, one per step (Round 19, item 9): 75% of a goal; the goal
 * reached; the victory wonder started (per city, so switching cities warns again); 5 turns or
 * less to go, then every turn from 3; a spaceship launched and its countdown; one rival capital
 * left. Steps with `unknownText` are also told to civs that haven't met `p`.
 */
export function victoryWarnings(state: GameState, p: number): VictoryWarning[] {
  const player = state.players[p]!;
  if (!player.alive || player.kind === 'barbarian') return [];
  const out: VictoryWarning[] = [];
  const Who = CivName(state, p);
  const has = civVerb(state, p, 'has', 'have');
  const is = civVerb(state, p, 'is', 'are');
  const unknown = 'An unknown civilization';
  const goals = victoryGoals(state.mapSize, state.difficulty);
  const space = player.space;
  if (space.launchedTurn !== null && space.arrivesTurn !== null) {
    const capital = capitalOf(state, p);
    const left = space.arrivesTurn - state.turn;
    const at = capital ? { cityId: capital.id } : {};
    out.push({
      key: `space:${p}:${space.launchedTurn}`,
      civ: p,
      kind: 'technology',
      step: 'launched',
      turns: left,
      ...at,
      text: `${Who} launched a spaceship! It arrives on turn ${space.arrivesTurn}${capital ? `. Capture ${capital.name}, their capital, before then to stop it` : ''}.`,
      unknownText: `${unknown} launched a spaceship! It arrives on turn ${space.arrivesTurn}.`,
    });
    if (left > 0 && left <= VICTORY.warnSoonTurns && state.turn > space.launchedTurn) {
      const whose = civPossessive(state, p);
      out.push({
        key: `space:${p}:${space.launchedTurn}:t${state.turn}`,
        civ: p,
        kind: 'technology',
        step: 'countdown',
        turns: left,
        ...at,
        text: `${whose.charAt(0).toUpperCase()}${whose.slice(1)} spaceship arrives in ${turnsWord(left)}${capital ? `. Only taking ${capital.name} stops it` : ''}.`,
        unknownText: `The spaceship of an unknown civilization arrives in ${turnsWord(left)}.`,
      });
    }
  }
  const pct = (v: number, goal: number) => Math.floor((v / goal) * 100);
  for (const kind of ['culture', 'economic'] as const) {
    const value = kind === 'culture' ? player.culture : player.gold;
    const goal = kind === 'culture' ? goals.culture : goals.gold;
    const unit = kind === 'culture' ? 'culture' : 'gold';
    const wonder = WONDERS[victoryWonder(kind)].name;
    if (pct(value, goal) >= VICTORY.warnPct) {
      out.push({
        key: `${kind}:${p}`,
        civ: p,
        kind,
        step: 'near',
        text: `${Who} ${has} ${value} ${unit}, ${Math.min(100, pct(value, goal))}% of the ${goal} needed. Past that, building the ${wonder} wins the game.`,
      });
    }
    if (value >= goal) {
      out.push({
        key: `${kind}-goal:${p}`,
        civ: p,
        kind,
        step: 'goal',
        text: `${Who} ${has} reached the ${unit} goal and can now build the ${wonder}. Finishing it wins the game.`,
        unknownText: `${unknown} has reached the ${unit} goal and can now build the ${wonder}. Finishing it wins the game.`,
      });
    }
    const b = victoryWonderBuild(state, p, kind);
    if (!b) continue;
    const about = b.turns !== undefined ? `: about ${turnsWord(b.turns)}` : '';
    const turns = b.turns !== undefined ? { turns: b.turns } : {};
    out.push({
      key: `${kind}-build:${p}:${b.city.id}`,
      civ: p,
      kind,
      step: 'building',
      cityId: b.city.id,
      ...turns,
      text: `${Who} ${is} building the ${wonder} in ${b.city.name}${about}.`,
      unknownText: `${unknown} is building the ${wonder}${about}.`,
    });
    if (b.turns !== undefined && b.turns <= VICTORY.warnSoonTurns) {
      const every = b.turns <= VICTORY.warnEveryTurnFrom;
      out.push({
        key: every ? `${kind}-soon:${p}:${b.city.id}:t${state.turn}` : `${kind}-soon:${p}:${b.city.id}`,
        civ: p,
        kind,
        step: every ? 'countdown' : 'soon',
        cityId: b.city.id,
        turns: b.turns,
        text: `${b.city.name} finishes the ${wonder} in about ${turnsWord(b.turns)}. Then ${Who} ${civVerb(state, p, 'wins', 'win')} the game.`,
        unknownText: `${unknown} finishes the ${wonder} in about ${turnsWord(b.turns)}, and then wins the game.`,
      });
    }
  }
  const { held, of } = capitalsHeld(state, p);
  if (of >= 2 && held === of - 1) {
    out.push({
      key: `domination:${p}`,
      civ: p,
      kind: 'domination',
      step: 'capitals',
      text: `${Who} ${civVerb(state, p, 'holds', 'hold')} ${held} of ${of} rival capitals. One more and ${civVerb(state, p, 'it wins', 'they win')} by domination.`,
    });
  }
  return out;
}

/**
 * Tells each human about civs that just got close to winning, once per event: a log entry of
 * kind 'warning' aimed at them (the UI gives it a full-screen card). Round 19: civs they haven't
 * met are told of too for the steps that would otherwise come from nowhere (a goal reached, a
 * victory wonder started or nearly done, a spaceship launched), without their name.
 */
export function issueWarnings(state: GameState): void {
  if (state.victory || state.keepPlaying) return;
  for (const viewer of state.players) {
    if (viewer.kind !== 'human' || !viewer.alive) continue;
    for (const rival of state.players) {
      if (rival.id === viewer.id) continue;
      const met = hasMet(state, viewer.id, rival.id);
      for (const w of victoryWarnings(state, rival.id)) {
        const text = met ? w.text : w.unknownText;
        if (text === undefined) continue;
        const key = `${viewer.id}>${w.key}`;
        if (state.warned.includes(key)) continue;
        state.warned.push(key);
        const ref: LogRef = { victory: w.kind, step: w.step };
        if (w.cityId !== undefined && met) ref.cityId = w.cityId;
        if (w.turns !== undefined) ref.turns = w.turns;
        addLog(state, rival.id, w.text, undefined, viewer.id, { otherText: text, kind: 'warning', ref });
      }
    }
  }
}

/**
 * Round 19 (item 9): what `viewer` can do about a rival's near win, in a line or two: take the
 * city (or the capital), declare war, or race them.
 */
export function warningAdvice(state: GameState, viewer: number, rival: number, kind: VictoryKind, cityId?: number): string {
  const me = state.players[viewer]!;
  const goals = victoryGoals(state.mapSize, state.difficulty);
  const met = hasMet(state, viewer, rival);
  const city = cityId !== undefined ? state.cities.find((c) => c.id === cityId) : undefined;
  const war = met && state.atWar[viewer]?.[rival] === true;
  let stop: string;
  if (!met) stop = 'Explore to find them: you can only fight or bargain with a civ you have met.';
  else if (kind === 'domination') stop = `Hold on to your capital${war ? '' : ' and keep the peace with them'}, and help anyone they are fighting.`;
  else if (city) stop = `${war ? 'You are at war with them: capture' : 'Declare war and capture'} ${city.name} to stop it.`;
  else stop = war ? 'You are at war with them: take their cities.' : 'Declare war and take their cities.';
  let race = '';
  if (kind === 'culture') race = `Or race them: you're at ${Math.floor((me.culture / goals.culture) * 100)}% of the culture goal.`;
  else if (kind === 'economic') race = `Or race them: you're at ${Math.floor((me.gold / goals.gold) * 100)}% of the gold goal.`;
  else if (kind === 'technology') {
    race = me.space.arrivesTurn !== null ? `Your own ship arrives on turn ${me.space.arrivesTurn}.` : `Or race them: you have ${me.space.parts} of ${VICTORY.spaceship.parts} spaceship parts.`;
  }
  return race ? `${stop} ${race}` : stop;
}
