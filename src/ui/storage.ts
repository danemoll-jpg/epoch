// Autosave storage: localStorage. It's synchronous, so a save made in a pagehide or
// visibilitychange handler finishes before Safari freezes or kills the tab (an async
// IndexedDB write might not). The state is small (tens of KB), well within its limits.

import { deserializeGame, serializeGame, type LoadResult } from '../game/save';
import type { GameState } from '../game/types';

const KEY = 'epoch.autosave';

export function saveToStorage(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, serializeGame(state, Date.now()));
    return true;
  } catch (e) {
    // Private browsing or storage full: keep playing, just without autosave.
    console.warn('Epoch: autosave failed', e);
    return false;
  }
}

/** The saved game, or undefined when there's no save (or storage is unavailable). */
export function loadFromStorage(): LoadResult | undefined {
  let text: string | null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    return undefined;
  }
  return text === null ? undefined : deserializeGame(text);
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
