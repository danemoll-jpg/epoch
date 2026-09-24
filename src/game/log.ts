// Event log. Entries carry the tile where they happened so the UI can apply the fog rule:
// a rival's map-level event (a city founded, a fight) is shown only if the viewer can
// currently see that tile. Civ-level news (an era, a war declared, a treaty) has a
// `publicText` and is shown to everyone who has met one of the civs involved (Milestone 5).

import { RULES } from '../data/rules';
import { visibleTiles } from './fog';
import { tileIndex } from './grid';
import type { Coord, GameState, LogEntry } from './types';

export type LogExtra = Pick<LogEntry, 'otherText' | 'publicText' | 'kind'>;

export function addLog(state: GameState, player: number, text: string, at?: Coord, other?: number, extra?: LogExtra): void {
  const entry: LogEntry = { turn: state.turn, player, text };
  if (other !== undefined && other !== player) entry.other = other;
  if (at) {
    entry.x = at.x;
    entry.y = at.y;
  }
  if (extra?.otherText !== undefined) entry.otherText = extra.otherText;
  if (extra?.publicText !== undefined) entry.publicText = extra.publicText;
  if (extra?.kind !== undefined) entry.kind = extra.kind;
  state.log.push(entry);
  if (state.log.length > RULES.maxLogEntries) state.log.splice(0, state.log.length - RULES.maxLogEntries);
}

function hasMet(state: GameState, a: number, b: number): boolean {
  return a === b || state.diplomacy.met[a]?.[b] === true;
}

/**
 * The entries `viewer` should be told about: all of their own (including ones where they're
 * the `other` side, e.g. their unit was attacked); a rival's civ-level news if the viewer has
 * met a civ involved; and a rival's map-level event only when its tile is visible to the
 * viewer right now. Rival events with neither stay hidden.
 */
export function eventsVisibleTo(state: GameState, viewer: number, entries: LogEntry[]): LogEntry[] {
  let vis: boolean[] | undefined;
  return entries.filter((e) => {
    if (e.player === viewer || e.other === viewer) return true;
    if (e.publicText !== undefined) {
      return hasMet(state, viewer, e.player) || (e.other !== undefined && hasMet(state, viewer, e.other));
    }
    if (e.x === undefined || e.y === undefined) return false;
    vis ??= visibleTiles(state, viewer);
    return vis[tileIndex(state.map, e.x, e.y)] === true;
  });
}

/** The entry's text as `viewer` should read it. */
export function entryText(e: LogEntry, viewer: number): string {
  if (e.player === viewer) return e.text;
  if (e.other === viewer) return e.otherText ?? e.text;
  return e.publicText ?? e.text;
}
