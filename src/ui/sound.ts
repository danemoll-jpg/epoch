// The sound engine (Round 13, D3): Web Audio. Files come from src/assets/sounds/ (bundled by
// Vite; whatever is there at build time). A missing file plays nothing. iPad Safari won't
// start audio until the player touches the page, so the engine unlocks on the first tap or
// key. Nothing plays while the page is hidden. Every rule about when and how loud is in
// soundLogic.ts; this file only loads, decodes, and plays.

import { SOUNDS, SOUND_RULES, type SoundId } from '../data/sounds';
import { effectiveGain, measure, musicTrackFor, normalizeGain, soundAllowed, type MusicContext, type SoundContext } from './soundLogic';
import type { Settings } from './settings';

/** File name → bundled URL, for every sound file present at build time. */
const FILES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/sounds/*.mp3', { query: '?url', import: 'default', eager: true })).map(([path, url]) => [
    path.replace(/^.*\//, ''),
    url,
  ]),
);

/** Round 14: any music file in this build (About / Credits then credits Suno). */
export function musicPresent(): boolean {
  return Object.keys(FILES).some((f) => f.startsWith('music-'));
}

/** Which sound files this build has (for About / Credits and the Settings screen). */
export function soundFilesPresent(): string[] {
  return Object.keys(FILES).sort();
}

interface Loaded {
  buffer: AudioBuffer;
  gain: number;
}

export class SoundEngine {
  private ctx: AudioContext | undefined;
  private unlocked = false;
  private readonly loaded = new Map<string, Promise<Loaded | undefined>>();
  private music: { src: AudioBufferSourceNode; gain: GainNode; file: string } | undefined;
  /** Round 14: the menu, or the player's era (picks the track). */
  private musicContext: MusicContext = 'menu';
  private musicTimer: number | undefined;
  private queueTimer: number | undefined;

  constructor(
    private readonly settings: () => Settings,
    private readonly scenario: boolean,
  ) {
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx?.suspend();
      else if (this.unlocked) void this.ctx?.resume();
      this.updateMusic();
    });
  }

  private context(): SoundContext {
    return { settings: this.settings(), hidden: document.hidden, unlocked: this.unlocked, scenario: this.scenario };
  }

  /** The first tap: create (or resume) the audio context. Safari only allows it inside a gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
      if (!this.unlocked) {
        // A silent blip inside the gesture is what really unlocks older iOS Safari.
        const b = this.ctx.createBuffer(1, 1, 22050);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.start(0);
        this.unlocked = true;
        this.updateMusic();
      }
    } catch (e) {
      console.warn('Epoch: audio unavailable', e);
    }
  }

  private load(file: string): Promise<Loaded | undefined> {
    const url = FILES[file];
    if (!url || !this.ctx) return Promise.resolve(undefined);
    let p = this.loaded.get(file);
    if (!p) {
      const ctx = this.ctx;
      p = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          const m = measure(buffer.getChannelData(0));
          return { buffer, gain: normalizeGain(m.rms, m.peak) };
        })
        .catch((e) => {
          console.warn(`Epoch: couldn't load ${file}`, e);
          return undefined;
        });
      this.loaded.set(file, p);
    }
    return p;
  }

  /** Plays one effect now (if the settings and the page allow it). */
  play(id: SoundId): void {
    if (!soundAllowed(this.context(), 'sfx') || !this.ctx) return;
    const ctx = this.ctx;
    void this.load(SOUNDS[id].file).then((l) => {
      if (!l || !soundAllowed(this.context(), 'sfx')) return;
      const src = ctx.createBufferSource();
      src.buffer = l.buffer;
      const g = ctx.createGain();
      g.gain.value = effectiveGain(this.settings(), 'sfx', l.gain);
      src.connect(g).connect(ctx.destination);
      src.start();
    });
  }

  /** Plays a short list one after another (End Turn's news), a moment apart. */
  playSequence(ids: SoundId[]): void {
    if (this.queueTimer !== undefined) clearTimeout(this.queueTimer);
    const [first, ...rest] = ids;
    if (!first) return;
    this.play(first);
    if (rest.length) this.queueTimer = window.setTimeout(() => this.playSequence(rest), SOUND_RULES.spacingMs);
  }

  /** Round 14 (C1): the menu or the player's era; a different track crossfades in. */
  setMusicContext(context: MusicContext): void {
    if (context === this.musicContext) return;
    this.musicContext = context;
    this.updateMusic();
  }

  /** Starts, stops, switches, or re-levels the music to match the settings, the page, and the context. */
  updateMusic(): void {
    const allowed = soundAllowed(this.context(), 'music');
    const file = musicTrackFor(this.musicContext, Object.keys(FILES));
    if (!allowed || !file || !this.ctx) {
      this.stopMusic();
      return;
    }
    if (this.music && this.music.file === file) {
      // Already playing (a slower load of another track, if any, is no longer wanted).
      this.wanted = file;
      this.music.gain.gain.value = this.musicGain(file);
      return;
    }
    // Already on its way: don't start it twice.
    if (this.wanted === file) return;
    // A new track (or none playing): crossfade to it.
    void this.startTrack(file);
  }

  private musicGains = new Map<string, number>();

  private musicGain(file: string): number {
    return effectiveGain(this.settings(), 'music', this.musicGains.get(file) ?? 1);
  }

  /** Which track is starting (so a slow load that's been overtaken doesn't start). */
  private wanted: string | undefined;

  /**
   * Plays `file`, fading in over whatever played before; `fade` seconds before it ends, it
   * starts again, crossfading into itself (the loop). A decoded track takes a lot of memory,
   * so only the tracks playing are kept.
   */
  private async startTrack(file: string): Promise<void> {
    if (!this.ctx) return;
    this.wanted = file;
    const l = await this.load(file);
    if (this.wanted !== file) return;
    if (!l || !soundAllowed(this.context(), 'music')) {
      // Not playing after all (missing, or the page went quiet): let a later call try again.
      this.wanted = this.music?.file;
      return;
    }
    this.musicGains.set(file, l.gain);
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = l.buffer;
    const gain = ctx.createGain();
    const fade = Math.min(SOUND_RULES.crossfadeSec, l.buffer.duration / 3);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.musicGain(file), now + fade);
    src.connect(gain).connect(ctx.destination);
    src.start();
    const old = this.music;
    this.music = { src, gain, file };
    if (old) this.fadeOut(old, fade);
    // Forget decoded music no longer playing (an era track is tens of MB decoded).
    for (const k of [...this.loaded.keys()]) if (k.startsWith('music-') && k !== file) this.loaded.delete(k);
    if (this.musicTimer !== undefined) clearTimeout(this.musicTimer);
    this.musicTimer = window.setTimeout(() => {
      if (this.music?.file === file) void this.startTrack(file);
    }, Math.max(1, l.buffer.duration - fade) * 1000);
  }

  private fadeOut(m: { src: AudioBufferSourceNode; gain: GainNode }, sec: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.setValueAtTime(m.gain.gain.value, now);
    m.gain.gain.linearRampToValueAtTime(0, now + sec);
    try {
      m.src.stop(now + sec + 0.05);
    } catch {
      // Already stopped.
    }
  }

  private stopMusic(): void {
    this.wanted = undefined;
    if (this.musicTimer !== undefined) clearTimeout(this.musicTimer);
    this.musicTimer = undefined;
    if (this.music) this.fadeOut(this.music, 0.5);
    this.music = undefined;
  }
}
