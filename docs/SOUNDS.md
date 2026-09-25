# Epoch sounds — the list for Dan

Round 13 (D1). You make these with **ElevenLabs** (Sound Effects) and drop the files
into **`src/assets/sounds/`** with exactly the file names below. No code change is
needed: the next build (the play server restart at the end of a round, or `npm run
play:lan`) picks them up. A missing file simply plays nothing.

Check them one by one on the iPad at
**http://10.0.0.224:4173/docs/sounds.html** (after the play server has been restarted
with the files in place). Each has a Play button, at the same loudness as in the game.

## Format

- **MP3** (iPad Safari plays it everywhere).
- Short effects **0.3–2 s**; the victory and defeat stings **3–6 s**.
- **Trimmed**: no silence at the start (the sound should begin the moment it's
  triggered). A little tail at the end is fine.
- Don't worry about volume: the game **normalizes** every file to the same loudness.
  (It won't boost a nearly silent file more than 4×, so avoid very quiet takes.)
- Mono or stereo, any sample rate.

## Sound effects (14)

| When it plays | File name | Ideal length | The feel | A starting prompt for ElevenLabs |
|---|---|---|---|---|
| You tap a unit or open a city | `tap.mp3` | 0.1–0.3 s | A soft wooden click. | "soft single wooden click, UI tap, dry, short" |
| A unit moves | `unit-move.mp3` | 0.3–0.6 s | A light footstep or rustle. | "a few light footsteps on grass, short, soft" |
| You found a city | `found-city.mp3` | 1–2 s | A hopeful short fanfare, hammers and a cheer. | "short hopeful fanfare with hammer taps and a small crowd cheer, 1.5 seconds" |
| One of your cities grows | `city-grows.mp3` | 0.5–1 s | A gentle rising chime. | "gentle rising three-note chime, warm, soft" |
| A building finishes | `building-done.mp3` | 0.5–1.5 s | A stone-and-wood thunk with a small bell. | "heavy stone block placed with a thunk, then a small bright bell" |
| You learn a tech | `tech-learned.mp3` | 1–1.5 s | A bright "aha" sparkle: a discovery. | "bright magical sparkle, discovery, short harp glissando" |
| You reach a new era | `era-reached.mp3` | 1.5–2 s | A grand, short brass swell. | "short grand brass swell, epic, new age, 2 seconds" |
| You win a fight | `combat-win.mp3` | 0.5–1.5 s | A clash of steel, then a short triumphant hit. | "sword clash followed by a short triumphant drum hit" |
| You lose a fight (or a city) | `combat-loss.mp3` | 0.5–1.5 s | A clash of steel, then a low, falling tone. | "sword clash followed by a low falling horn note, defeat" |
| Someone declares war on you | `war-declared.mp3` | 1–2 s | War drums and a low horn. | "ominous war drums with a low war horn, 2 seconds" |
| You finish a wonder | `wonder-built.mp3` | 1.5–2 s | A choir-like shimmer. | "short angelic choir swell with shimmer, wonder, 2 seconds" |
| You win the game | `victory.mp3` | 3–6 s | A full, joyful fanfare. | "joyful orchestral victory fanfare with brass and timpani, 5 seconds" |
| You lose the game | `defeat.mp3` | 3–6 s | A slow, somber horn line. | "slow somber solo horn melody, defeat, fading, 5 seconds" |
| Your turn begins (a quiet turn) | `new-turn.mp3` | 0.3–0.8 s | A very soft, calm cue. | "very soft single marimba note, calm, gentle" |

When several things happen during one End Turn, the game plays at most **two**
sounds, the most important first (war on you, then a new era, a wonder, a win or loss
in battle, a tech, a building, a city growing). A quiet turn gets `new-turn.mp3`.
From the computer players' turns you only hear war declared on you, or a city lost.

## Music (Round 14: one track per era)

| File name | Length | When it plays | The feel |
|---|---|---|---|
| `music-theme.mp3` | 1–3 min | The main menu and the New Game screen; also stands in for any era track that's missing | The game's main theme. |
| `music-ancient.mp3` | 1–3 min | In a game, while you're in the Ancient era | Drums, flutes, open fields. |
| `music-medieval.mp3` | 1–3 min | In a game, in the Medieval era | Lutes, choirs, stone halls. |
| `music-industrial.mp3` | 1–3 min | In a game, in the Industrial era | Brass and strings, steady and busy. |
| `music-modern.mp3` | 1–3 min | In a game, in the Modern era | A wide, modern orchestral sound. |

When you reach a new era, the music **crossfades** (4 seconds) to that era's track.
Each track **loops**, crossfading into itself, so it doesn't need a perfect loop point
(no big ending, though). A missing era track plays the theme instead. The game never
downloads music you don't hear, and only the track playing is kept in memory.

**Round 13's `music-1.mp3`:** if it's there and `music-theme.mp3` isn't, it plays as the
theme. Please rename it to `music-theme.mp3`.

Check them on the play server: http://10.0.0.224:4173/docs/sounds.html (it lists the
five music files and which are present).

## Where the settings are

☰ → Settings (or Settings on the main menu): sound effects on/off and volume, music
on/off and volume. The iPad plays nothing until the first tap (Safari's rule), and
nothing while the game is in the background. Dev scenarios are silent unless
"Sound in dev scenarios" is on (dev builds only).

## Credit

Once any file is in, About / Credits says "Sound effects generated with ElevenLabs."
(Round 14:) once any music file is in, it also says "Music generated with Suno."
