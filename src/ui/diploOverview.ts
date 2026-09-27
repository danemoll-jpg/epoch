// Round 22 (items 3, 4): the Diplomacy overview's pure parts: the met count (eliminated nations
// included), a nation's relation in words, its victory progress in one line, and its recent
// history with you from the news log.

import { victoryGoals } from '../data/mapSizes';
import { VICTORY } from '../data/victory';
import { everMet } from '../game/diplomacy';
import { eventsVisibleTo } from '../game/log';
import { treatyLockedUntil } from '../game/diplomacy';
import { victoryProgress } from '../game/victory';
import { atWar } from '../game/war';
import type { GameState, LogEntry } from '../game/types';
import { plural } from './text';

export interface MetSummary {
  /** Nations met, eliminated ones included. */
  met: number;
  /** Nations in the game besides you (not the barbarians). */
  of: number;
  /** How many of the ones met are gone. */
  eliminated: number;
  /** "Met 4 of 4 nations (2 eliminated)". */
  text: string;
}

export function metSummary(state: GameState, viewer: number): MetSummary {
  const met = everMet(state, viewer);
  const of = state.players.filter((p) => p.kind !== 'barbarian' && p.id !== viewer).length;
  const eliminated = met.filter((id) => !state.players[id]!.alive).length;
  const text = `Met ${met.length} of ${plural(of, 'nation')}${eliminated ? ` (${eliminated} eliminated)` : ''}`;
  return { met: met.length, of, eliminated, text };
}

/** "At war for 12 turns (since turn 40)", "At peace · treaty holds until turn 55", "Eliminated on turn 80". */
export function relationText(state: GameState, viewer: number, civ: number): string {
  const p = state.players[civ]!;
  if (!p.alive) return p.eliminatedTurn !== undefined ? `Eliminated on turn ${p.eliminatedTurn}` : 'Eliminated';
  if (atWar(state, viewer, civ)) {
    const start = state.diplomacy.warStart[viewer]?.[civ];
    if (start === null || start === undefined) return 'At war';
    const n = state.turn - start;
    return n <= 0 ? 'At war since this turn' : `At war for ${plural(n, 'turn')} (since turn ${start})`;
  }
  const lock = treatyLockedUntil(state, viewer, civ);
  return `At peace${lock !== undefined ? ` · treaty holds until turn ${lock}` : ''}`;
}

/** Their best road to victory, in a line: "Culture 45% · Gold 30% · Capitals 1 of 4 · Spaceship not started". */
export function progressLine(state: GameState, civ: number): string {
  const g = victoryProgress(state, civ);
  const goals = victoryGoals(state.mapSize, state.difficulty);
  const pct = (a: number, b: number) => `${Math.min(100, Math.floor((a / Math.max(1, b)) * 100))}%`;
  const space =
    g.space.launchedTurn !== null ? 'Spaceship launched' : g.space.parts > 0 ? `Spaceship ${g.space.parts}/${VICTORY.spaceship.parts}` : 'Spaceship not started';
  return `Culture ${pct(g.culture, goals.culture)} · Gold ${pct(g.gold, goals.gold)} · Capitals ${g.capitals.held} of ${g.capitals.of} · ${space}`;
}

/**
 * Their recent history with you: the news-log entries you were told about that involve them,
 * newest first, at most `max`.
 */
export function historyWith(state: GameState, viewer: number, civ: number, max = 8): LogEntry[] {
  const seen = eventsVisibleTo(state, viewer, state.log);
  const out: LogEntry[] = [];
  for (let i = seen.length - 1; i >= 0 && out.length < max; i--) {
    const e = seen[i]!;
    if (e.player === civ || e.other === civ) out.push(e);
  }
  return out;
}
