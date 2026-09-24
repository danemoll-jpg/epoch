// Event log. Entries carry the tile where they happened so the UI can apply the fog rule:
// a rival's event is shown only if the viewer can currently see that tile. (Later, "has met
// that civ" will also count; see TODO.md Q2 and Milestone 5.)

import { RULES } from '../data/rules';
import { visibleTiles } from './fog';
import { tileIndex } from './grid';
import type { Coord, GameState, LogEntry } from './types';

export function addLog(state: GameState, player: number, text: string, at?: Coord): void {
  const entry: LogEntry = { turn: state.turn, player, text };
  if (at) {
    entry.x = at.x;
    entry.y = at.y;
  }
  state.log.push(entry);
  if (state.log.length > RULES.maxLogEntries) state.log.splice(0, state.log.length - RULES.maxLogEntries);
}

/**
 * The entries `viewer` should be told about: all of their own, and a rival's only when the
 * event's tile is visible to the viewer right now. Rival events with no location stay hidden.
 */
export function eventsVisibleTo(state: GameState, viewer: number, entries: LogEntry[]): LogEntry[] {
  let vis: boolean[] | undefined;
  return entries.filter((e) => {
    if (e.player === viewer) return true;
    if (e.x === undefined || e.y === undefined) return false;
    vis ??= visibleTiles(state, viewer);
    return vis[tileIndex(state.map, e.x, e.y)] === true;
  });
}
