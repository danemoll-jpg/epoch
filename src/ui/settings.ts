// Settings (Round 13, A2): per device, in their own localStorage key, never inside a saved
// game (a backup or a New Game doesn't touch them). Every function takes the store, so the
// rules are unit-tested without a browser. Anything missing or damaged falls back to the
// default, field by field, so a newer version can add a setting without losing the others.

import type { KeyValueStore } from './storage';

export const SETTINGS_KEY = 'epoch.settings';
/** First-game tips already shown on this device (C3), kept apart so "reset tips" is simple. */
export const TIPS_SEEN_KEY = 'epoch.tipsSeen';

export type AnimationSpeed = 'normal' | 'fast';
export type TextSize = 'normal' | 'large';

export interface Settings {
  sfxOn: boolean;
  /** 0–100. */
  sfxVolume: number;
  musicOn: boolean;
  musicVolume: number;
  animationSpeed: AnimationSpeed;
  /** Ask before ending the turn while a unit can still move. */
  confirmEndTurn: boolean;
  textSize: TextSize;
  /** First-game tips (C3). */
  tips: boolean;
  /** Dev builds only: let sounds play in a dev scenario (off by default). */
  scenarioSound: boolean;
  /** Round 14: the minimap in the corner is open (it folds down to a button). */
  minimap: boolean;
  /** Round 17 (B2): the first tap on a destination shows the path; a second tap moves. */
  tapTwice: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sfxOn: true,
  sfxVolume: 80,
  musicOn: true,
  musicVolume: 50,
  animationSpeed: 'normal',
  confirmEndTurn: true,
  textSize: 'normal',
  tips: true,
  scenarioSound: false,
  minimap: true,
  tapTwice: false,
};

const browserStore = (): KeyValueStore => ({
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
});

const clampVolume = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fallback;

/** Keeps every valid field of `raw` and fills the rest from the defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const bool = (k: keyof Settings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (d[k] as boolean));
  return {
    sfxOn: bool('sfxOn'),
    sfxVolume: clampVolume(r.sfxVolume, d.sfxVolume),
    musicOn: bool('musicOn'),
    musicVolume: clampVolume(r.musicVolume, d.musicVolume),
    animationSpeed: r.animationSpeed === 'fast' || r.animationSpeed === 'normal' ? r.animationSpeed : d.animationSpeed,
    confirmEndTurn: bool('confirmEndTurn'),
    textSize: r.textSize === 'large' || r.textSize === 'normal' ? r.textSize : d.textSize,
    tips: bool('tips'),
    scenarioSound: bool('scenarioSound'),
    minimap: bool('minimap'),
    tapTwice: bool('tapTwice'),
  };
}

export function loadSettings(store: KeyValueStore = browserStore()): Settings {
  try {
    const text = store.getItem(SETTINGS_KEY);
    return normalizeSettings(text === null ? {} : JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, store: KeyValueStore = browserStore()): boolean {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function loadTipsSeen(store: KeyValueStore = browserStore()): string[] {
  try {
    const list = JSON.parse(store.getItem(TIPS_SEEN_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveTipsSeen(seen: string[], store: KeyValueStore = browserStore()): void {
  try {
    store.setItem(TIPS_SEEN_KEY, JSON.stringify([...new Set(seen)]));
  } catch {
    // No room: the tip may show again next time, which is harmless.
  }
}

/** How long the combat flash on a tile stays, in ms. */
export function flashMs(s: Settings): number {
  return s.animationSpeed === 'fast' ? 450 : 900;
}

/**
 * How long a toast stays before it fades, in ms. Round 19 (item 3): longer, and scaled to the
 * length of the text (about 20 characters a second), up to 12 seconds. A tap dismisses it sooner.
 */
export function toastMs(s: Settings, chars = 0): number {
  const base = s.animationSpeed === 'fast' ? 3000 : 4000;
  return Math.min(12000, base + chars * 50);
}
