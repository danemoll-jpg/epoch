// The sound engine's rules (Round 13, D3), kept apart from Web Audio so they're unit-tested:
// when a sound may play, how loud, and which few sounds an End Turn earns. The engine itself
// (src/ui/sound.ts) only loads files and plays what these functions allow.

import { MUSIC, SOUNDS, SOUND_RULES, type SoundId } from '../data/sounds';
import type { EraId } from '../data/techs';
import { eraIndex, playerEra } from '../game/tech';
import type { GameState } from '../game/types';
import type { Settings } from './settings';

export interface SoundContext {
  settings: Settings;
  /** The page is hidden (another tab, the iPad's home screen): nothing plays. */
  hidden: boolean;
  /** Safari has let audio start (after the first tap). */
  unlocked: boolean;
  /** A dev scenario is loaded: silent unless Settings allows it. */
  scenario: boolean;
}

/** May an effect ('sfx') or the music play right now? */
export function soundAllowed(ctx: SoundContext, kind: 'sfx' | 'music'): boolean {
  if (!ctx.unlocked || ctx.hidden) return false;
  if (ctx.scenario && !ctx.settings.scenarioSound) return false;
  return kind === 'sfx' ? ctx.settings.sfxOn && ctx.settings.sfxVolume > 0 : ctx.settings.musicOn && ctx.settings.musicVolume > 0;
}

/**
 * The gain that brings a file to the target loudness: RMS up or down to `targetRms`, but never
 * so loud its peak clips, and never more than `maxGain` (a near-silent file stays quiet).
 */
export function normalizeGain(rms: number, peak: number): number {
  if (!(rms > 0) || !(peak > 0)) return 1;
  return Math.min(SOUND_RULES.maxGain, SOUND_RULES.targetRms / rms, 0.99 / peak);
}

/** RMS and peak of some samples (one channel is enough for a sound effect). */
export function measure(samples: ArrayLike<number>): { rms: number; peak: number } {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  return { rms: samples.length ? Math.sqrt(sum / samples.length) : 0, peak };
}

/** The final gain: the file's normalizing gain × the Settings volume (music a bit quieter). */
export function effectiveGain(settings: Settings, kind: 'sfx' | 'music', normGain: number): number {
  const vol = (kind === 'sfx' ? settings.sfxVolume : settings.musicVolume) / 100;
  return normGain * vol * (kind === 'music' ? SOUND_RULES.musicLevel : 1);
}

/** What the human had before End Turn, to tell what happened during it. */
export interface TurnSnapshot {
  techs: number;
  era: number;
  /** City id → size, for the human's cities. */
  sizes: Record<number, number>;
  /** City id → buildings count, for the human's cities. */
  buildings: Record<number, number>;
  wonders: number;
  alive: boolean;
  victory: boolean;
}

export function snapshot(state: GameState, human: number): TurnSnapshot {
  const me = state.players[human]!;
  const mine = state.cities.filter((c) => c.owner === human);
  return {
    techs: me.techs.length,
    era: eraIndex(playerEra(me)),
    sizes: Object.fromEntries(mine.map((c) => [c.id, c.size])),
    buildings: Object.fromEntries(mine.map((c) => [c.id, c.buildings.length])),
    wonders: mine.reduce((n, c) => n + c.wonders.length, 0),
    alive: me.alive,
    victory: !!state.victory,
  };
}

/**
 * The sounds one End Turn earns, most important first and at most SOUND_RULES.maxPerTurn:
 * your own news (a tech or an era, a city grew, a building or wonder done), plus the few AI
 * events worth hearing (war declared on you, a city of yours lost). The end of the game has
 * its own sound, played by the end screen, so it isn't listed here. With nothing else, the
 * soft new-turn cue.
 */
export function turnSounds(before: TurnSnapshot, after: TurnSnapshot, news: { warOnYou: boolean }): SoundId[] {
  const out: SoundId[] = [];
  if (news.warOnYou) out.push('war-declared');
  const lost = Object.keys(before.sizes).some((id) => !(id in after.sizes));
  if (lost) out.push('combat-loss');
  if (after.era > before.era) out.push('era-reached');
  else if (after.techs > before.techs) out.push('tech-learned');
  if (after.wonders > before.wonders) out.push('wonder-built');
  else if (Object.entries(after.buildings).some(([id, n]) => n > (before.buildings[Number(id)] ?? n))) out.push('building-done');
  if (Object.entries(after.sizes).some(([id, n]) => n > (before.sizes[Number(id)] ?? n))) out.push('city-grows');
  // The game just ended: its fanfare (from the end screen) is all you should hear.
  if (after.victory !== before.victory || after.alive !== before.alive) return [];
  out.sort((a, b) => SOUNDS[b].priority - SOUNDS[a].priority);
  return out.length ? out.slice(0, SOUND_RULES.maxPerTurn) : ['new-turn'];
}

/** Where the player is, for the music: the main menu / New Game screen, or a game in an era. */
export type MusicContext = 'menu' | EraId;

/**
 * Round 14 (C1): the track to play, from the files this build has (`present`): the era's own
 * track in a game, else the theme; on the menu, the theme. The theme is `music-theme.mp3`, or
 * Round 13's `music-1.mp3` when that's all there is. Undefined: no music at all.
 */
export function musicTrackFor(context: MusicContext, present: readonly string[]): string | undefined {
  const has = (f: string) => present.includes(f);
  if (context !== 'menu') {
    const era = MUSIC.eras[context];
    if (era && has(era)) return era;
  }
  if (has(MUSIC.theme)) return MUSIC.theme;
  if (has(MUSIC.legacyTheme)) return MUSIC.legacyTheme;
  return undefined;
}
