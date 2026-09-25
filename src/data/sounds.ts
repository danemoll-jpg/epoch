// Sound events (Round 13, D1). Dan makes the files himself (ElevenLabs) and drops them into
// src/assets/sounds/ with exactly these names; docs/SOUNDS.md is his list. A missing file
// plays nothing, and a file that arrives needs no code change: the next build picks it up.
// `during` says when a sound may play: 'yours' only for things you do or that happen to you on
// your turn; 'aiTurn' also for the few things worth hearing from the AIs' turns.

export type SoundId =
  | 'tap'
  | 'unit-move'
  | 'found-city'
  | 'city-grows'
  | 'building-done'
  | 'tech-learned'
  | 'era-reached'
  | 'combat-win'
  | 'combat-loss'
  | 'war-declared'
  | 'wonder-built'
  | 'victory'
  | 'defeat'
  | 'new-turn';

export interface SoundEvent {
  id: SoundId;
  file: string;
  /** Ideal length, in words, for Dan. */
  length: string;
  /** The feel, in one line, for Dan (and his ElevenLabs prompt). */
  feel: string;
  /** Plays even for news from the AIs' turns (war on you, a city lost). */
  aiTurn?: boolean;
  /** Higher plays first when several happen at once (at most two play after End Turn). */
  priority: number;
}

export const SOUND_EVENTS: SoundEvent[] = [
  { id: 'tap', file: 'tap.mp3', length: '0.1–0.3 s', feel: 'A soft wooden click when you select a unit or open a city.', priority: 0 },
  { id: 'unit-move', file: 'unit-move.mp3', length: '0.3–0.6 s', feel: 'A light footstep or rustle as a unit moves.', priority: 1 },
  { id: 'found-city', file: 'found-city.mp3', length: '1–2 s', feel: 'A hopeful short fanfare, hammers and a cheer: a new city.', priority: 6 },
  { id: 'city-grows', file: 'city-grows.mp3', length: '0.5–1 s', feel: 'A gentle rising chime: a city got bigger.', priority: 2 },
  { id: 'building-done', file: 'building-done.mp3', length: '0.5–1.5 s', feel: 'A satisfying stone-and-wood thunk with a small bell: something finished.', priority: 3 },
  { id: 'tech-learned', file: 'tech-learned.mp3', length: '1–1.5 s', feel: 'A bright “aha” sparkle: a discovery.', priority: 5 },
  { id: 'era-reached', file: 'era-reached.mp3', length: '1.5–2 s', feel: 'A grand, short brass swell: a new age begins.', priority: 8 },
  { id: 'combat-win', file: 'combat-win.mp3', length: '0.5–1.5 s', feel: 'A clash of steel, then a short triumphant hit.', priority: 7 },
  { id: 'combat-loss', file: 'combat-loss.mp3', length: '0.5–1.5 s', feel: 'A clash of steel, then a low, falling tone. Also plays when you lose a city.', aiTurn: true, priority: 7 },
  { id: 'war-declared', file: 'war-declared.mp3', length: '1–2 s', feel: 'War drums and a low horn: someone declared war on you.', aiTurn: true, priority: 9 },
  { id: 'wonder-built', file: 'wonder-built.mp3', length: '1.5–2 s', feel: 'A choir-like shimmer: you finished a wonder of the world.', priority: 8 },
  { id: 'victory', file: 'victory.mp3', length: '3–6 s', feel: 'A full, joyful fanfare: you won the game.', priority: 10 },
  { id: 'defeat', file: 'defeat.mp3', length: '3–6 s', feel: 'A slow, somber horn line: the game is lost.', aiTurn: true, priority: 10 },
  { id: 'new-turn', file: 'new-turn.mp3', length: '0.3–0.8 s', feel: 'A very soft, calm cue: your turn again.', priority: 0 },
];

export const SOUNDS: Record<SoundId, SoundEvent> = Object.fromEntries(SOUND_EVENTS.map((e) => [e.id, e])) as Record<SoundId, SoundEvent>;

/** Optional music: calm, loopable tracks the engine crossfades between. */
export const MUSIC_FILES = ['music-1.mp3', 'music-2.mp3', 'music-3.mp3'];

export const SOUND_RULES = {
  /** Every effect is scaled so its loudness (RMS) is about this (0–1), never clipping. */
  targetRms: 0.12,
  /** Gain is never raised above this, so a nearly silent file isn't blown up into noise. */
  maxGain: 4,
  /** At most this many effects after one End Turn, this far apart (ms). */
  maxPerTurn: 2,
  spacingMs: 450,
  /** Music crossfade length (s), and how loud music is next to effects at the same volume. */
  crossfadeSec: 4,
  musicLevel: 0.5,
};
