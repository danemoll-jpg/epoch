# Project Context & Rules

Read this at the start of every session. It is the short, operational version.
`TODO.md` is the planning and history record and the source of truth for what
to work on.

## ⚠️ Pushing rules
- **Epoch repo, until go-live: push at the end of every round** (Dan's
  standing instruction, 2026-09-24). After tests pass and the docs are
  committed, `git push` the `epoch` repo to GitHub, then restart the play
  server. There's no Netlify site for Epoch yet, so nothing deploys.
- **Epoch repo, after go-live (Round 15 D4): pushing is Dan's call.** From
  the moment Dan confirms the Netlify site is live (he follows
  `docs/GO-LIVE.md`, then says so), every push to `main` deploys to the
  live site, and players get the "Update available" banner. So from then
  on: commit at the end of a round as usual, **don't push unless Dan says
  to**, and say in the report that the commits are waiting to be pushed.
  Until Dan confirms, the rule above still applies. (Check TODO.md: the
  planning session records the go-live date there.)
- **Game hub repo: never push without Dan explicitly saying so.** The hub
  is live on Netlify, so a hub push deploys immediately.
- Report the push (branch, commit) in the round report.

## ⚠️ Start every round by committing updated docs
Planning happens in a separate Claude session, which writes the updated
`CLAUDE.md` and `TODO.md` directly into this repo's root. So at the **start of
every round**:
1. Run `git status`. If `CLAUDE.md` or `TODO.md` has changed, commit just
   those two files first, as their own commit
   (`docs: update plan from planning session`), before touching any code.
2. Re-read both files **after** committing. The versions on disk are the
   current plan. Don't work from your memory of older versions.
3. If the new docs seem to have dropped something you reported last round
   (a status, a finding), don't restore it silently. Mention it in your
   report so it gets reconciled. Git history has the old version.

The local repo already exists (`C:\Users\danmo\epoch`). Don't run `git init`
or re-create it.

## What this project is
A single-player, turn-based 4X strategy game in the spirit of the original
**Civilization Revolution (2008)**, not Civ Rev 2. It uses a small map, a
simple economy, a short era-based tech tree, and fast turns. The game has its
own look, name, and text. It copies gameplay ideas only, never assets or
wording. It will eventually be published in Dan's **game hub** for family and
friends, not released publicly or sold.

**Design targets (decided):**
- Play close to Civ Rev 1. When a rule is unclear, do what Civ Rev 1 did.
- A full game takes about 2–3 hours, usually spread over several sittings.
- 5 civs per game: the human player plus 4 AI rivals.
- Single-player only.
- **Primary devices: iPad (Safari, touch) and desktop browser, equally.**

## Tech Stack
- **Language:** TypeScript (strict mode).
- **Build/dev server:** Vite.
- **Rendering:** HTML5 Canvas 2D. No game engine.
- **Tests:** Vitest.
- **Targets:** iPad Safari (touch) and desktop browsers (mouse and keyboard).
- **Testing on iPad:** Dan plays on his iPad over the **local network**:
  real games on the stable `play:lan` build, quick checks of work in
  progress on `dev:lan`. Not live in the hub yet, by Dan's choice.
- **Hosting (later):** its own GitHub repo (`danemoll-jpg/epoch`) and its own
  Netlify site, linked from the game hub. `netlify.toml` is already in place.
  See "Hub integration" below.
- **Firebase:** not used. The hub doesn't use Firebase; individual games
  have their own. Epoch would only get one if cloud saves are added later.
- **Backend:** none. Game logic runs entirely client-side.

## Code Style & Architecture
- **Keep game logic separate from rendering.** All rules live in pure,
  UI-free TypeScript under `src/game/`. That includes map, units, cities,
  combat, tech, AI, and turn processing. Rendering (`src/render/`) and input
  (`src/ui/`) read state and dispatch actions. They never change state
  directly.
- **Game state is plain, serializable data.** Nothing in state should be a
  class instance or hold a function or DOM reference. Save/load has to be
  `JSON.stringify` / `JSON.parse`.
- **Every state change goes through an action or command function**
  (`applyAction` in `src/game/actions.ts`). This keeps rules testable and
  lets the AI use exactly the same moves as the player.
- **Use a seeded RNG, never `Math.random()` in game logic.** The same seed and
  the same actions must produce the same game. This is what makes bugs
  reproducible.
- **Content is data-driven.** Civs, leaders, units, buildings, techs, wonders,
  terrain, and rule constants are defined in `src/data/` as typed data
  tables. Adding a leader, unit, or building should mean editing data, not
  logic.
- **Player count is data, not hard-coded.** Everything must work for 5
  players.
- **Touch-first input:**
  - Use Pointer Events so one code path handles mouse and touch.
  - Nothing depends on hover, right-click, or the keyboard. Keyboard
    shortcuts are desktop extras only.
  - Buttons and tap targets are at least 44×44 px.
  - Handle pinch zoom, drag pan, resize, orientation changes, and
    `devicePixelRatio`.
  - Stop Safari's double-tap zoom, page bounce, and text selection on the
    game surface.
  - Never use browser `alert`/`confirm`/`prompt` dialogs. Use on-screen UI.
- **Square tile grid**, as in Civ Rev, not hexes.
- **Placeholder art until an art pass:** simple shapes, colors, and letters.
  Don't spend time on visuals before the mechanics work.
- **IP guardrails (standing rule):**
  - No Firaxis/2K art, UI, text, quotes, music, or leader-bonus wording.
  - Never use the name "Civilization" (it's a trademark) in the title or UI.
  - Leaders: any historical or real figure is allowed while the game is
    shared only with family and friends. Keep all leaders in `src/data/` so
    the list can be reviewed and swapped in one place.
- **Test game rules with unit tests** (Vitest) against real state objects.
  Don't guess whether a rule works; prove it with a test.
- **When a bug survives a couple of fixes, add instrumentation and get real
  diagnostic data before trying again.** Don't just guess harder. This
  matters especially for iPad-only bugs.

## Commands
Confirmed working (2026-09-23, Node 24, Vite 8, TypeScript 7, Vitest 5).
```
npm install      # install dependencies
npm run dev      # start local dev server
npm test         # run unit tests (Vitest, tests/**/*.test.ts)
npm run build    # type-check + production build into dist/
npm run lint     # type-check only (tsc --noEmit); no ESLint yet
npm run sim      # pace/war/victory/naval/barbarian/Great People/air report on 5 all-AI seeds + landmass stats (not part of npm test)
npm run sim -- leaders   # Round 11: victory mix and wins per leader, 10 games of 5 civs from the 12 (SEEDS=20 for more)
npm run sim -- difficulty  # Round 13: victory mix, win turns, stand-in wins at Novice/Normal/Legendary (SEEDS=, LEVELS=)
npm run sim -- sizes       # Round 13: the same at each map size with its most rivals, plus ms per turn (SIZES=)
npm run sim -- perf        # Round 14: End Turn time per map size, by stretch of turns (SIZES=, SEEDS=2, TURNS=250)
npm run sim -- map-fixtures  # Round 14: remake the late Huge/Epic saves the huge-map/epic-map scenarios load
npm run sim -- matrix        # Round 15: the full matrix (every size at Normal + Novice/Legendary on Normal, 20 games each); CONFIGS=normal,large to pick, TUNE="VICTORY.goldGoal=12000" to try numbers without editing, TAG= to keep runs apart; JSON in sim-out/sim-matrix-*.json
npm run sim -- save-size     # Round 16: the Epic save's size raw and gzipped, turn 151 → 220 (TURNS=)
npm run test:rules           # Round 16: firestore.rules against the Firestore emulator (needs Java 21+; this PC has Java 8, so not run yet)
python scripts/make-portrait-webp.py      # Round 16: remake src/assets/portraits/*.webp from docs/portraits-master/*.png
node scripts/make-art-page.mjs            # Round 14: rebuild docs/terrain-style-candidates.html after changing src/render/art.ts
node scripts/make-building-icons-page.mjs # Round 14: rebuild docs/building-icon-candidates.html (fetches missing SVGs)
```
**iPad over the local network:**
```
npm run play:lan # real games: build into dist-play/, serve it on :4173 (LAN)
npm run dev:lan  # work in progress: vite --host on :5173, live-reloads
```
Both print a `Network: http://<PC-IP>:<port>/` line; open that URL in
Safari on the iPad (same Wi-Fi). Windows may ask once to allow Node through
the firewall; allow it on private networks.
- **`play:lan` is for real games.** It type-checks, builds into its own
  `dist-play/` folder (git-ignored; `npm run build` writes `dist/` and never
  touches it), runs the dev-code leak check on it, then serves it with
  `vite preview --host --port 4173`. The page has no live reload, so code
  edits change nothing until Dan restarts `play:lan`. `npm run play` is the
  same, localhost only. Dev scenarios aren't in it. It also copies the icon
  picker pages (`docs/*-candidates.html`) into `dist-play/docs/`
  (`scripts/copy-pickers.mjs`), so the iPad opens them at
  `http://10.0.0.224:4173/docs/<page>.html`; the Netlify build (`dist/`)
  never gets them. Since Round 11 it also copies `docs/portraits.html` and
  the portraits (into `dist-play/docs/portraits/`), and since Round 13
  the sound check page `docs/sounds.html` with Dan's sound files (into
  `dist-play/docs/sounds/`). Round 14's two picker pages
  (`terrain-style-candidates.html`, `building-icon-candidates.html`) are
  `-candidates.html` pages, so they're copied the same way.
- **Sim reports also go to `sim-out/sim-report.txt`** (git-ignored, appended;
  Round 16 moved every sim file into `sim-out/`): Vitest 5 hides a passing
  test's console output, so read the file after `npm run sim`.
- **Each address has its own saved game.** Safari keeps `localStorage` per
  host and port, so `play:lan` (:4173) and `dev:lan` (:5173) never share or
  overwrite each other's save. That's intended.
- Plain `npm run dev` stays localhost-only. The `epoch-dev` preview config
  in `.claude/launch.json` passes `--host` (port 5174); `epoch-verify`
  (port 5175, localhost only) is for a second session to preview without
  taking 5174; `epoch-play-verify` (port 4176) serves an existing
  `dist-play/` (run `npm run build:play` first) to check the play build.

**Startup (Round 13): the main menu opens first.** With a saved game it
offers Continue; with none, the map behind it is a stand-in that is never
saved (`loadOrStart(..., saveFresh: false)` returns `placeholder: true`),
and New Game replaces it without a backup. `?new` skips the menu.

Dev URL options: `?seed=123` gives a reproducible map, and `?players=2`
gives a smaller game (the default is 5 civs). **The autosave wins:** if a saved game exists it resumes,
and `?seed`/`?players` only apply to new games (New Game in the ☰ menu, or
`?new`). `?new` ignores the save and starts fresh on *every* load, so
don't leave it in a bookmark. `window.__epoch` exposes `{ app, seed }` for
debugging, including from Safari's Web Inspector on the iPad.

**Autosave:** `localStorage` key `epoch.autosave` (synchronous, so it
completes inside Safari's `pagehide`). Saved after every successful action
(including End Turn), on `visibilitychange` → hidden, and on `pagehide`.
The save carries `saveVersion` (= `STATE_VERSION` in `src/game/types.ts`,
currently 12). **Bump `STATE_VERSION` whenever the state shape changes, and
add a migration** to `MIGRATIONS` in `src/game/save.ts` (keyed by the
version it upgrades from), plus a line in `MIGRATION_NOTES` for the notice,
so Dan's game carries forward. Migrated so far: 2 → 3 (M3: no techs,
science kept as banked, tech-locked builds go back to "choose"), 3 → 4
(M4: fortify/army off, everyone at war, each civ's first city becomes its
capital), 4 → 5 (M5: pairs who can see each other now count as met,
wars carry over as they are, no treaties/opinions/offers/plans yet),
5 → 6 (M6: culture 0, no wonders, no spaceship, nobody has won, no
warnings given), 6 → 7 (Round 8: no unit aboard a ship, no AI sea
plans; the four sea techs are simply unknown), and 7 → 8 (Round 9:
resources from the seed for the whole map, the barbarians added as the
last player with every table grown by one, villages and huts only on tiles
no civ has explored, and Great People counting only culture made from now
on via `greatPeopleCultureBase`), and 8 → 9 (Round 10: nothing to change;
no aircraft exist yet, Advanced Flight is unknown, and `City.airliftTurn`
is simply absent), and 9 → 10 (Round 11: every civ kept, legacy ones
included; bonuses come from the civ and its era, so no payouts and no
starting tech; each city's `founder` is its owner, except a captured
capital, which remembers whose it was; no unique used, no Challenge; ships
afloat count as built), and 10 → 11 (Round 12: no religions and no city
follows one; a founding tech any civ already knows is "lapsed"
(`religionTechsLapsed`) and founds nothing, but the next unknown one still
can; no roads; no Missionaries; Theology is simply unknown), and 11 → 12
(Round 13: `difficulty` 'normal' and `mapSize` 'normal').

**Round 14: End Turn runs in a Web Worker.** `src/ui/turnRunner.ts` sends a
copy of the state to `src/ui/turnWorker.ts`, which runs `runTurnJob`
(`src/game/turnJob.ts`: exactly `applyAction(state, endTurn)`) and posts the
new state back; the page shows "Rivals are moving…", holds End Turn, and
refuses other actions meanwhile (the map still pans). If the worker can't
start or fails, the same job runs on the page. Nothing in `src/game/` may
keep state between calls outside the game state (module caches must be
keyed by the objects they describe, as `leaders.ts` and `mapgen.ts` do), or
the worker and the page could disagree.

**Settings (Round 13)** live apart from saves, per device:
`epoch.settings` (`src/ui/settings.ts`, `loadSettings`/`saveSettings`,
store as a parameter; Round 14 added `minimap`) and `epoch.tipsSeen`
(first-game tips already shown). Dev builds also keep `epoch.devArt`
(☰ → Art style, the art candidates) on the device.
Nothing that replaces a save touches them.

**Backups: a save is never thrown away.** All startup and replace logic
is in `src/ui/storage.ts` (`loadOrStart`, `backupCurrentSave`,
`listBackups`, `restoreBackup`; each takes the store as a parameter so it's
unit-tested). Before the saved game is replaced by anything other than its
own next autosave, its exact text goes to `epoch.autosave.backup.1`, and
older backups shift to `.2` and `.3` (only 3 are kept). That covers an
incompatible version, corrupt data, a failed migration, an exception while
loading, a successful upgrade, New Game, `?new`, and restoring a backup. If
the backup can't be written, the old save stays put and the new game isn't
autosaved. ☰ → **Restore a backup** lists them in every build (hidden in a
dev scenario). Any new code path that replaces the save must call
`backupCurrentSave` first.

**Dev scenarios (dev server only):** `?scenario=<id>` loads a small
hand-made game with a hard-to-reach rule one End Turn away, with an
on-screen note saying what to do and what should happen. On the iPad, pick
one from the ☰ menu (the "Dev scenarios" list) instead of typing URLs;
"Back to my game" (in the note or the menu) drops `?scenario`. **A scenario
never autosaves**, so the real game can't be overwritten. Current set:
`grow`, `starve`, `settler`, `rich`, `tech`, `era`; (M4) `combat`,
`fortified`, `walls`, `army`, `army-in-city`, `capture`, `victory`,
`defeat`; (M5) `first-contact`, `peace`, `demand`, `tech-trade`, `ai-war`;
(round 6) `mixed-stack`; (round 7) `all-units`, `wonder`, `wonder-race`,
`win-domination`, `win-culture`, `win-economic`, `win-space`, `lose-space`,
`stop-launch`, `near-win-warning`; (round 8) `board-unload`, `galley-coast`,
`naval-battle`, `bombard`, `ship-sunk-cargo`, `amphibious-capture`,
`harbor`, `ai-overseas`, `all-ships`, `fleet`; (round 9) `village-spawn`,
`take-village`, `village-artifact`, `village-resource`, `barbarian-raid`,
`hut`, `great-person`, `engineer-wonder`, `all-resources`; (round 10)
`air-strike`, `intercept`, `rebase`, `carrier-sunk`, `bomber-no-capture`,
`helicopter`, `airlift`, `all-aircraft`, `all-map-icons`; (round 11)
`new-game-setup` (opens the New Game screen), `starting-tech`, `era-bonus`,
`caligula-buy-wonder`, `mansa-pilgrimage`, `henry-dissolution`,
`bolivar-liberate`, `jfk-challenge`, `versailles`, `deterrence`,
`portraits`; (round 12) `found-religion`, `missionary`, `religion-spread`,
`holy-city-income`, `shared-faith`, `henry-national-church`, `build-road`,
`road-speed`, `railroad`, `all-religion-symbols`; (round 13) `main-menu`,
`settings`, `difficulty-legendary-start`, `large-map` (60 AI turns on a
Large map, all revealed; End Turn toasts its time), `almanac`,
`how-to-play`, `first-game-tips`; (round 14) `huge-map`, `epic-map` (both load
a late-game save from `src/dev/fixtures/`, made by `npm run sim --
map-fixtures`; End Turn toasts its time and where it ran), `minimap`,
`city-growth-looks`, `walls-drawn`, `terrain-styles` (all three: switch styles
with ☰ → Art style, dev only), `era-music` (sound on, with a Music switch in its
note: `sound`/`musicSwitch` on a scenario); (round 15) `update-available`
(the update banner, `fakeUpdate` on a scenario), `theology` (Theology unlocks
the Grand Cathedral), `ai-roads` (an AI links its cities); (round 16)
`cloud-conflict`, `cloud-offline`, `cloud-slots` (a stand-in cloud:
`cloud: () => CloudScenario` on a scenario). A scenario can open a screen at load
(`opens: 'mainMenu' | 'settings' | 'almanac' | 'howToPlay' | 'setup'`) and
show every tip afresh (`freshTips`, without touching the device's list);
scenarios are silent unless Settings → Sound in dev scenarios. The religion ones use
`withReligion(state, p, city, name)` (founds it already named, so no
naming panel pops up). The leader ones use `asLeader(state, civId, techs)` (player 0
plays that civ; its era follows from the techs). Scenario states from
`makeState` use the legacy civs (Babylon, Maurya, Mali, Inca, Franks), so
older scenarios and tests have no leader bonuses except Mali's and the
Franks'. The air ones use
`airfield()` (the combat `battlefield()` with Flight known). **Aircraft
strike only what their owner can see**, so a strike scenario keeps a unit
next to the target. The naval ones use `seaState()` (your
island plus an eastern landmass across a coast channel or open ocean). The
round 9 ones use `withBarbarians()` (your capital plus the barbarian
player); `makeState(..., { barbarians: true })` or `addBarbarians(state)`
adds them in tests, and `addVillage` places a village with its defender. A
roll made during an action (an artifact) uses `withDiceFor(build, check)`.
A hut can carry a set result (`Tile.hutResult`), used only by the `hut`
scenario.
The combat ones start from `FAIR_DICE` (first roll about 0.48), because
`makeState`'s default RNG state rolls 0.98 first and would make every
first attack lose. A rule that happens on a dice roll at End Turn (a
demand, a war declaration) uses `withDice(build, wanted)`, which finds the
first RNG state that gives the result. Put odds and reasons in a note by
computing them (see `frontOdds`, `peaceDesire`), not by typing them. They're compiled out of
the production build: `main.ts` imports `src/dev/scenarios.ts` only inside
`if (import.meta.env.DEV)`, and `npm run build` ends with
`scripts/check-dist.mjs`, which fails the build if the scenario marker or
note text appears anywhere in `dist/`.

**Adding a scenario:**
1. Append an entry to `SCENARIOS` in `src/dev/scenarios.ts`: `id`, `title`
   (menu label), `note` ("Tap End Turn. X should …"), and `build()`, which
   makes the state with the helpers in `src/dev/build.ts` (`makeState`,
   `addCity`, `addUnit`), or with `withCapital()` in the same file for the
   usual one-city island (`diplomacyBase()` for a two-civ game at peace).
   `makeState` starts everyone met and at war (the M4 setup); pass
   `{ peace: true }` or `{ met: false }` for M5 tests.
2. Add its expected outcome to `OUTCOMES` in `tests/scenarios.test.ts`. The
   suite fails for any scenario without one, so a note can't drift from what
   the rules actually do.
Nothing else to wire up: the ☰ menu lists every entry automatically.

## Code layout
- **Round 16: cloud saves.** `src/data/firebase.ts` (the web config, `AUTH_PROXY_HOSTS`/
  `authDomainFor`, `CLOUD`: 5 slots, 900 KB save limit, 40-char names, retry
  backoff 2 s doubling to 60 s; `SLOT_IDS` s1..s5). `src/cloud/`: `sync.ts`
  (pure: `SlotMeta`, the `CloudStore` interface, `decide` = the B3 rule,
  `freeSlot`, `CloudSync`: coalesced background writes, one in flight, retries,
  `check()` on open/visible/sign-in, `keepLocal`), `compress.ts` (gzip via
  `CompressionStream`, fallback `gzipFallback.ts` = fflate, its own chunk),
  `device.ts` (`deviceLabel`: "iPad"/"PC"…, `isStandalone`), `backend.ts` (the
  `CloudBackend` interface, `loadFirebase()` = the dynamic import), and
  `firebase.ts` (**the only file that imports the SDK**: auth with popup, or
  redirect from the Home Screen icon or when a popup is blocked; the Firestore
  store: `users/{uid}/slots/{slot}` index + `users/{uid}/saves/{slot}` {rev,
  data: gzipped bytes}, written in a transaction that checks the rev).
  `src/ui/cloud.ts` (`CloudController`: sign-in/out, the signed-in flag
  `epoch.cloud` per device, the main menu's games (`menuEntries`), open/rename/
  delete, the keep-which panel `#cloudOverlay` (above the main menu), the top-bar
  mark `#cloudBadge`, the ☰ line `#menuCloud`, the Settings row). The game's
  link to its slot (`CloudLink`: gameId, slot, uid, syncedRev, dirty,
  localOnly) rides in the **save file** (`SaveFile.cloud`, outside the state,
  so no `STATE_VERSION` bump) and so in backups too. The App calls
  `cloud.markChanged()` after each successful action, `request()` after End
  Turn (once the rivals have moved), on hidden and pagehide, `check()` when the
  game comes back into view, `kick()` on `online`. Anything taken from the cloud
  or not kept goes into the backups first (`backupText`). `firestore.rules`,
  `firebase.json`, `.firebaserc` in the repo root; `docs/FIREBASE-SETUP.md`.
  `netlify.toml` proxies `/__/auth/*` and `/__/firebase/*` to
  `epoch-ca127.firebaseapp.com` (sign-in from our own domain); the service
  worker never handles `/__/`, and caches the `firebase-*`/`gzipFallback-*`
  chunks only when first used (`isCloudChunk`, like the music).
  `scripts/check-dist.mjs` fails a build with Firebase in the first load and
  prints the first-load size. Dev: `src/dev/memoryCloud.ts` (`MemoryCloudStore`
  with offline/slow/fail switches, `mockBackend`, `putSlot`); a scenario's
  `cloud()` gives the App a stand-in cloud whose backups stay in memory.
- **Round 16: portraits are WebP** (`src/assets/portraits/<civ>.webp`, quality
  90, 851 KB for 12); Dan's PNG masters are in `docs/portraits-master/`.
- Round 14: `src/data/mapSizes.ts` has Huge (64×44) and Epic (80×56; its
  `bestOnComputer` note shows on a touch device), each with `techCostPct`
  (+35% / +25%) and higher goals (×1.65 / ×1.5), and shape rules `continentWeight` (continents of
  different sizes), wider channels, and `islandChains` (off on the older
  sizes, so their maps are unchanged). `src/data/cityLooks.ts`: a city's look
  by size (village 1–3, town 4–7, city 8–12, metropolis 13+). `src/data/sounds.ts`
  `MUSIC`: the theme and one track per era (`MUSIC_FILES`), plus Round 13's
  `music-1.mp3` as the theme's fallback. `src/render/art.ts`: the terrain
  styles (`classic` = today's look, A `painted`, B `storybook`, C `flat`) and
  city styles (`classic`, A `towns`, B `bold`), drawn in code; `DEFAULT_ART` is
  what the game shows: **Dan's picks, A painted terrain and B bold buildings**
  (2026-09-25); `classic` is the old look, kept for the dev switch. `src/render/minimap.ts`
  and `camera.ts`'s `defaultTileSize` (about 12×9 tiles at the start) and
  `minTileSize` (pinch-out cap). `renderer.ts`'s `TerrainChunks` pre-draws the
  terrain in chunks once the zoom holds. `src/game/heap.ts` (the path
  searches' heap); `findPath` is A* with per-search lookups, `roadPath` uses
  the heap (same results as before). `src/dev/artDemo.ts`,
  `src/dev/artPreview.ts` (the art picker page's script), `src/dev/fixtures/`.
  `src/ui/titleArt.ts`: Dan's optional title picture (`src/assets/title/`,
  spec in `docs/TITLE-ART.md`).
- Round 13 in `src/data/`: `difficulty.ts` (`DIFFICULTIES`: the player's
  and the AIs' production/science/gold percents, aggression toward the
  human, `demandsFromTurn`, `warGraceTurns`, `extraAiUnits`; Normal =
  no change), `mapSizes.ts` (`MAP_SIZES`: grid, `maxRivals`, map shape,
  start spacing, village and hut caps, `victoryPct`; `victoryGoals(size)`
  is the one place the culture and gold goals are read: Large ×1.25), and
  `sounds.ts` (`SOUND_EVENTS`: the 14 events, file names, feel, priority,
  which may play from the AIs' turns; `MUSIC_FILES`; `SOUND_RULES`).
  `RULES.maxPlayers` is 6 (a Large map); each size caps its own rivals.
- `src/data/`: terrain (yields, move cost, `defensePct`), units (cost,
  `popCost`, attack/defense/moves/sight, `requires` tech, `glyph` letters,
  `icon` file name, and Round 8's `domain` ('land'/'sea'/'air'), `cargo`,
  `coastOnly` (Galley), `stealth` (Submarine); Round 10's `range`,
  `airAttack` (strength against aircraft), `evadePct` (Stealth Bomber),
  `airCargo` (Carrier: 3), `hover` (Helicopter), `alsoRequires` (a second
  tech); Round 12's `spreadsReligion` (the Missionary); 17 land units counting the Helicopter
  and the Missionary, 9 ships, 4 based aircraft),
  `icons.ts` (each used icon's CC BY 3.0 credit, `MAP_ICONS` for the
  village/hut/barbarian badge/artifact, and `usedIcons()`, the list the
  credits and the icon test use),
  buildings (`requires` tech; Walls' `defenseBonusPct`; Temple culture;
  Harbor `coastal` + `waterFood`; Round 10's Airport: `veteranAircraft`,
  `airlift`; AI building order), `techs.ts` (eras,
  the 56 techs with prereqs/era/tier/description (Round 12 added the
  Medieval Theology), the tech cost formula, AI research priority),
  `religion.ts` (Round 12: `FOUNDING_TECHS`, the 8 `RELIGION_SYMBOLS`
  (color, name, Dan's icon, stand-in letter), `RELIGION_NAMES` (our invented names for
  the AI and "Suggest"), and `RELIGION`: max religions 5, **one per civ**
  (`maxPerCiv`), spread radius and pressure weights, chance per pressure,
  switching, holy-city and follower yields, the faith opinion, the
  conversion reward, Missionary charges, the AI's Missionary cap),
  `roads.ts` (Round 12: `ROADS`: gold per tile, max distance, road and
  rail move costs, road trade, rail production, the rail tech, the AI's
  link distance, reserve, and war distance), `wonders.ts` (13 wonders + the 2 victory wonders:
  cost, tech, city/empire effects, free building, `victory`), `victory.ts`
  (culture and gold goals, spaceship parts/cost/travel turns, warning line,
  the spaceship-part "project"), `civs.ts`
  (civs, leaders, colors, city names, each leader's `aggression` and
  `tradeWillingness`, 1–5, message grammar: `article: 'the'` and
  `plural` for names like "the Franks"; Round 11: Dan's 12 plus the
  `legacy` Babylon/Maurya/Inca kept for old saves, `lean` (primary and
  secondary victory), `startTech`, `portraitFocus` (face x, y, zoom for
  small sizes), `PLAYABLE_CIVS`, `leaderInitials`), `leaders.ts` (Round
  11: each leader's start, era, and drawback bonuses as typed effects,
  `UNIQUE_RULES` for the Pilgrimage, Dissolution, Challenge, Return,
  Moonshot, and Round 12's national church; effect kinds `roadCost`
  (Merkel) and `roadGold` (Hatshepsut)), rule constants (`rules.ts`: growth, focus
  weights, rush-buy formula, science rate, `RULES.combat` (fortify/veteran/
  city bonuses, army size and multiplier, veteran chance, AI attack
  threshold), `RULES.map` (land share, 3–4 continents and the water
  channels cut between them, minimum start landmass), `RULES.diplomacy` (treaty length, grace period, opinion
  events, AI war/peace weights, demand caps, tech prices), and `RULES.ai`
  (city target, settlers at once, defenders per city, unit caps, attack
  force, gold reserve, and `victory`: goal weights (Round 11: primary 8,
  secondary 5, other 2), war bonus, science-rate and gold-spending
  thresholds, each goal's first building, and Round 11's conqueror tuning
  (`domination*`: strength ratio, wars at once, attack odds, force, capital
  pull, pace turn, research order; `runaway*`)), and `naval`:
  overseas site score, plan timeouts, escort and invasion waits, warships
  kept), and `air` (Round 10: fighters per border or coastal city, bombers
  per city at war, the strike odds rule)). A tech's
  unlocks are the `requires` fields on units/buildings/wonders, so adding a
  unit never touches `techs.ts`. Round 9: `barbarians.ts` (the barbarian
  "civ" `BARBARIAN_CIV`, `BARBARIANS`: village count and spacing, defense
  bonus, flag timer, grace turns, stop era, units out, spawn units by era,
  home radius, attack odds, seek chance, raids; `VILLAGE_REWARDS`;
  `ARTIFACTS`: chance, tech counts, names; `HUTS`: count, results,
  amounts), `resources.ts` (the 15 resources: terrains, bonus, `hidden`,
  `revealedBy` tech, `icon`; `RESOURCE_RULES`: chance, spacing, fair
  starts), and `greatPeople.ts` (the 5 kinds, texts, names, `icon`;
  `GREAT_PEOPLE_RULES`:
  thresholds and every effect's number). `TECH_COST.perKnown` is 8.5 since
  round 9 (was 6) to keep the era pace.
- `src/game/`: pure rules. Round 13: the difficulty level rides the
  leader-bonus system: `effectsOf(state, p, 'empirePct')` adds
  `difficultyEffects` (player 0 gets the player's side, other civs the
  AIs', the barbarians nothing), and `aiAggression(state, ai, target)`
  adds the level's aggression only toward player 0 (the human; the sim's
  stand-in). Round 12: `religion.ts` (founding and naming,
  `checkFoundings` after a tech and at each player's end of turn, passive
  spread once a game turn in `spreadReligions`, the Missionary's
  `spreadReligion`, the Great Artist's conversion, holy-city and follower
  yields, `faithOpinion`, Henry's `nationalChurch`, and the AI's
  Missionaries) and `roads.ts` (`roadAt` (a city counts as road, and as
  rail once its owner knows Railroad), `roadStepCost`, `roadPath`/
  `roadOption`/`roadTargets`/`buyRoad`, `upgradeRails` (roads whose
  nearest city is yours), `roadConnected`, and `aiBuyRoads`). Moves can
  now be fractional (1/3 on roads, 1/10 on rails): `movement.ts` spends
  them with a small tolerance, and the UI shows them with `movesText`
  ("⅔"). `diplomacy.ts`'s `opinionOf` = stored opinion + faith; read
  opinions through it. Round 11: `leaders.ts` (the one place that
  decides which leader effects are on, `effectsOf`, and the helpers for
  costs, yields, culture, science, combat mods, tech costs, trade
  willingness, and unique wonders/projects) and `uniques.ts` (Pilgrimage,
  Dissolution, National Challenge, Return a liberated city, and the AI's use
  of them). `techCost(state, p, tech)`, `itemCost(state, city, item)`, and
  `buyCost(state, city)` take the state for leader discounts; `empireIncome`
  applies empire-wide leader percents and also returns culture. `types.ts` (state + `STATE_VERSION`), `rng.ts`,
  `grid.ts`, `mapgen.ts` (continents; `landRegionIds`/`landmassAt`: which
  landmass a tile is on), `newGame.ts`, `movement.ts` (land and sea moves,
  boarding by stepping onto your ship, going ashore by stepping onto land,
  cargo moving with its ship; `boardShip`/`unloadHere` for ships in port),
  `naval.ts` (ship rules: where ships may go, coastal cities, cargo, who
  defends a tile, `removeUnit` taking cargo down with a ship; since Round
  10 also what kind a unit is: `isAir`, `hovers`, `isAircraft`,
  `canCapture`, and the Carrier's `aircraftOf`/`airCapacity`; `cargoOf` is
  land cargo only, `carriedBy` everything aboard), `air.ts` (Round 10: the
  base-and-strike model's rebase, `rebaseTargets`, range, and the Airport's
  airlift), `aiAir.ts` (the AI's aircraft: builds, strikes with the odds
  rule, rebasing toward the front), `stack.ts` (what's
  on a tile: mixed stacks, the unit peeking out behind, army candidates of
  any type), `city.ts`
  (founding), `yields.ts` (tile yields, automatic worked tiles, trade
  split, wonder effects, city/empire culture), `production.ts`
  (build/focus/rate/rush-buy actions, the tech-gated build list of units,
  buildings, wonders, and spaceship parts, and the end-of-turn city
  update), `wonders.ts` (one per world, the race rule, completion news),
  `victory.ts` (the four victories, one function each; `checkVictory`,
  called after every action and every player's turn; spaceship
  launch/loss; Keep playing; progress and near-win warnings),
  `barbarians.ts` (Round 9: `barbarianId`/`civPlayers`, the world's era,
  village flags and spawning, raids, and `runBarbarianTurn`), `villages.ts`
  (placing villages and huts, `enterTile` when a civ unit steps on one,
  `chooseVillage` destroy/settle, rewards, `freeTech`, artifacts, hut
  results, the AI's village choice), `resources.ts` (seeded placement, fair
  starts, `visibleResource`, reveal), `greatPeople.ts` (thresholds,
  `checkGreatPeople`, `useGreatPerson` settle/use, the AI's use),
  `aiGoals.ts` (which victory each AI leans toward), `aiNaval.ts` (the AI at
  sea: boxed-in exploring, sea plans in `state.aiFerries` to settle
  overseas or invade, warships in port), `tech.ts`
  (research action, end-of-turn research, eras, unlocks, AI research
  choice, `learnTech`), `combat.ts` (odds with named modifiers,
  `winChance` = the one formula, attack (a win over a city's last defender
  captures it; ships bombard and never capture; aircraft strike in range
  and never capture), `interception` and `overallChance` (Round 10),
  fortify, armies (three ships make a "fleet": ×3 strength and ×3 cargo; no
  air armies)), `conquest.ts` (city capture,
  elimination, and the civ-name helpers every message uses: `civName`
  mid-sentence, `CivName` to start one, `civPossessive`, `civVerb`), `war.ts` (the `atWar` table), `diplomacy.ts` (contact,
  declare war, peace and `peaceDesire`, opinions/attitude, tech trades and
  prices, gifts, AI offers to the human and `answerOffer`, and
  `runAiDiplomacy`: the AI's war, peace, demand, and trade choices),
  `fog.ts` (the barbarians see the whole map), `log.ts` (event log; `eventsVisibleTo`: your own and your
  `other` entries, civ-level news with `publicText` if you've met a civ
  involved, map-level news only in sight; `entryText` gives each viewer
  their wording), `turn.ts` (`playComputerTurn`: the barbarians or a civ
  AI; Great People are checked after each player's cities), `ai.ts` (build
  choice with the city target and caps, guards, explorer, war plans in
  `state.aiPlans`, going for nearby villages and huts; it forms armies only
  from attack-minded units), `save.ts`
  (serialize/deserialize with version check and migrations), and
  `actions.ts` (the single `applyAction` entry point the UI uses).
- `src/render/`: `camera.ts`, `renderer.ts` (Canvas 2D; read-only on
  state; since Round 10 Dan's map icons, drawn as on his picker page: the
  village on a pale square with its flags along the bottom right and its
  garrison in the corner, the hut on a pale circle, resources white on a
  dark corner badge, a red skull badge on barbarian units; aircraft sit in
  their city behind its ground units), and `icons.ts` (the bundled SVGs:
  bitmaps cached per icon, color, and size for the map; inline SVG for the
  panels via `iconHtml`/`unitIconHtml`). A unit's look on the map is drawn
  only in `drawGlyph` (its icon, white on the owner's color; letters while
  it loads or if it's missing).
- `src/assets/portraits/`: Dan's 12 leader portraits, `<civ-id>.webp`
  (512×512, since Round 16; the PNG masters are in `docs/portraits-master/`),
  bundled. `docs/PORTRAITS.md` explains names, size, framing, and
  the focus/zoom; `docs/portraits.html` shows each PNG next to its WebP, then every size (refresh its data
  with `python scripts/make-portraits-page.py`).
- `src/assets/sounds/`: Dan's sound files (all 14 effects, the theme, and
  the four era tracks since Round 14), named as in
  `docs/SOUNDS.md` (his list, with a starting ElevenLabs prompt for each);
  `docs/sounds.html` plays each at the game's loudness (on the play
  server: http://10.0.0.224:4173/docs/sounds.html).
- `src/assets/icons/`: the 63 icons Dan picked (30 units: 16 land counting
  the Missionary, 9 ships, 5 aircraft; 33 map icons: village, hut,
  barbarian badge, 15 resources, 5 Great People, artifact, and Round 12's
  holy-city badge and 8 religion symbols; game-icons.net, CC BY 3.0; the
  Carrier's is modified), credited in `CREDITS.md` and on ☰ → About /
  Credits (a credit's `modified` field says what we changed).
- `src/dev/`: dev/test only, never in the production build. `build.ts`
  (hand-made state builder shared by tests and scenarios), `scenarios.ts`,
  and `sim.ts` (all-AI simulation: era turns, techs over time, wars; used
  by `tests/pace.test.ts` and `scripts/pace-report.sim.ts` / `npm run sim`,
  whose config is `vitest.sim.config.ts`; it also counts overseas cities,
  landings, and ships), and `landmass.ts` (how often civs share or get their
  own landmass, and empty islands; Round 8's B7 check).
- `src/ui/`: Round 13: the main menu (`#mainMenu`, `openMainMenu`),
  Settings, How to Play, the Almanac, tips, and Confirm End Turn are in
  `app.ts` (`setupRound13`); `settings.ts` (device settings, pure with a
  store), `sound.ts` (the Web Audio engine: bundles whatever MP3s are in
  `src/assets/sounds/`, unlocks on the first tap, suspends while hidden,
  crossfades music) and `soundLogic.ts` (its rules: `soundAllowed`,
  `normalizeGain`, `effectiveGain`, `turnSounds`), `almanac.ts` (every card
  from the data; `cardLink` makes a `data-card` link any panel can use),
  `guide.ts` (How to Play pages), `tips.ts` (`dueTips`), `text.ts` (`esc`,
  `plural`, `unitSummary`). Font sizes are `calc(Npx * var(--ts))`;
  `html.largeText` sets `--ts` for Settings → Text size. Round 12 in `app.ts`: the city panel's Religion line and
  "Build road to…" list, the naming panel (notices can carry a text
  field, and a `stay` button like Suggest), the Religion screen (☰ →
  Religions, the city panel, or Diplomacy), the Missionary's ✦ Spread
  buttons, the diplomacy Faith row, Henry's 👑 button in the leader panel,
  and the Great Artist's "Convert a city…". Round 11: `setup.ts` (the New Game screen: civ cards, Random
  civ, Rivals 1–4, Start; `bonusListHtml`), `portraits.ts` (bundled
  portraits, the initials placeholder, `portraitCrop`: zoom on the face at
  48 px and under). `app.ts` (view state, HUD with the leader button and
  leader panel, city panel, tech screen with the National Challenge,
  diplomacy screen, 🏆 victory progress screen, victory/defeat screens,
  notice panels for first contact / war / AI offers / near-win warnings,
  menu with About / Credits, dev scenario banner, dispatch),
  `tap.ts` (pure tap rule, unit-tested), `storage.ts` (localStorage
  autosave, backups, startup load), `input.ts` (Pointer Events, Safari gesture guards; touch
  scrolling is allowed only inside `.scroll` elements), `style.css`.
- `tests/`: Vitest suites. `helpers.ts` re-exports `src/dev/build.ts`.
- `scripts/check-dist.mjs`: post-build check that no dev code shipped
  (takes the folder as an argument; `build:play` checks `dist-play/`).
- `docs/icon-candidates.html` + `docs/icon-candidates/`: round 6's unit
  icon candidates (game-icons.net, CC BY 3.0; `SOURCES.md` has each
  author), with the picker Dan used. The game uses its own copies of the
  15 picks in `src/assets/icons/`.
- `docs/map-icon-candidates.html` + `docs/map-icon-candidates/`: round 9's
  candidates for the village, hut, barbarian badge, 15 resources, 5 Great
  People, and the artifact (72 icons, same picker; picks saved under
  `epoch.mapIconPicks`; `SOURCES.md` has each author). Dan's picks are
  wired in (Round 10).
- `docs/religion-road-icon-candidates.html` +
  `docs/religion-road-icon-candidates/`: round 12's candidates for the
  Missionary (3), 8 religion symbols (2 each; Moon became Mountain, since
  every moon icon is a crescent), and the holy-city marker (3); picks are
  saved under `epoch.religionIconPicks`; `SOURCES.md` has each author.
  Dan's picks are wired in (2026-09-25): on the map a city's religion is
  its symbol white on the religion's color, lower right (the garrison sits
  lower left, so not bottom-left as on the picker page), and a holy city
  has the gold-on-dark badge top right (left of the "!" badge when shown).
- `docs/bomber-size-candidates.html`: round 10's check of the Bomber icon
  at map size next to the other aircraft (and round 8's Bomber A and C),
  for Dan to decide whether to swap it.
- `docs/ship-air-icon-candidates.html` + `docs/ship-air-icon-candidates/`:
  round 8's candidates for the 9 ships and 5 aircraft (35 icons, same
  picker; `SOURCES.md` has each author). Dan's picks are recorded under
  Round 8 in TODO.md; the Carrier uses `carrier-a-trimmed.svg` (waves
  removed so it doesn't look like the Battleship; compare in
  `docs/carrier-trim-candidates.html`).
- The version shown on the About screen comes from `package.json`
  (injected as `__APP_VERSION__` by `vite.config.ts`); it's 0.16.0 for
  round 16.
- **Meeting a civ reveals where its capital is** (Round 11: the tile is
  marked explored), so conquerors can find the capitals domination needs.
- **Victory goals (Round 15):** culture 8000, gold 13000 on Normal. Each
  size scales them (`victoryPct`, or its own `culturePct`/`goldPct`): Small
  9200 / 7800, Large 10000 / 14950, Huge 14000 / 19500, Epic 11600 / 20800;
  Legendary adds 15% (`goalPct` in `difficulty.ts`). Techs cost +15% on
  Large, +35% on Huge, +25% on Epic (`techCostPct`). Read the goals with
  `victoryGoals(state.mapSize, state.difficulty)`, never `VICTORY` directly
  (tests and scenarios on the Normal map may).
- **Round 15: the name is in one place,** `src/data/game.ts` (`GAME`: "Epoch:
  From Stone to Stars", short name "Epoch", the wordmark and subtitle, the
  icon blue `#001f57`, and `webManifest()`). `index.html` has `%GAME_…%`
  placeholders that `scripts/pwa-plugin.ts` fills; the same plugin serves
  and writes `/manifest.webmanifest` and, after a build, writes `sw.js` (the
  service worker, `src/pwa/sw-template.js`, with this build's version and
  file list from `src/pwa/files.ts`: everything but the music and
  `/docs/`; music is cached the first time it plays). `src/pwa/update.ts`
  registers it (built game only, https or localhost only, so **not on the
  LAN play server**, which is plain http) and shows "Update available: tap
  to reload" (`App.showUpdateBanner`); a new version waits for that tap.
  App icons are in `public/icons/` (`docs/APP-ICON.md`); `netlify.toml` has
  the cache headers. Saves and settings keys stay `epoch.*`.
- **Religion (Round 12):** the first civ to know a founding tech
  (Mysticism, Astronomy, Philosophy, Monotheism, Theology) founds a
  religion, **one per civ** (a civ that has one leaves the tech to the
  next civ that knows it); 5 at most, plus Henry VIII's national church.
  No religious victory. Round 15: Theology also unlocks the Grand Cathedral
  (it used to be Monotheism's), so it has a use once every civ has a faith.
- **Roads (Round 12):** bought from the city panel with gold, laid at once;
  everyone uses them; (Round 15) from turn 50 an AI buys one link a turn between its own cities (up to 80 gold) before rush-buying; Railroad upgrades roads near your cities to rails
  for free. **AI pacing:** before turn 160 an AI won't take the city that
  would win it domination at once when the last rival is another AI (the
  human gets no protection).
- The barbarians, when present, are always the **last** player (kind
  `'barbarian'`). Loops over civs should skip them (`civPlayers`, or
  `p.kind !== 'barbarian'`): they're always at war with everyone but never
  met, never a rival, never eliminated.
- A player's `id` always equals its index in `state.players`.

## Hub integration (how Dan's games are deployed)
Each game is its **own GitHub repo and its own Netlify site**. The hub
(`danemoll-jpg/game-hub`) is a static launcher that links out to each game's
live URL through one entry in its `games.js`. This repo's `netlify.toml`
follows the same shape as Sole Match: `npm install && npm run build`,
publish `dist`, SPA redirect.

**The hub repo is shared and separate.** Don't edit or commit there unless a
TODO item says to. Never add a hub card with a guessed URL, and never let a
hub push happen before Epoch's Netlify site exists.

## ⚠️ End every round by restarting the play server
From round 5 on, **at the end of every round** (after tests pass and the
docs are committed), (re)start `npm run play:lan` so
`http://<PC-IP>:4173/` serves the latest build. Dan plays there on his iPad
and never runs a command himself.
- Don't restart it mid-round.
- Report that it's running, with the exact LAN address.
- If it can't stay running after your session ends, say so plainly.
- Start it detached so it outlives the chat session, e.g. from PowerShell:
  `Start-Process -WindowStyle Hidden cmd -ArgumentList '/c','npm run play:lan > play-lan.log 2>&1' -WorkingDirectory C:/Users/danmo/epoch`
  (stop any old one on port 4173 first). `play-lan.log` is git-ignored.
  **Dan's iPad uses http://10.0.0.224:4173/** (the PC's Ethernet
  address; confirmed 2026-09-24). The PC's Wi-Fi address, 192.168.0.214,
  doesn't work from the iPad. Report the 10.0.0.x address, and re-check
  with `ipconfig` if it ever stops working (DHCP can change it).

## Reporting back (every round)
When you finish a round of work, update `TODO.md` and this file, and commit
them with your code. The planning session reads these files back from the
repo, so they are your report. Give an **explicit per-item status for every
numbered item you were asked to do**: done, not done, or deferred, and why.
Say how each item was verified: unit-tested, preview-verified on desktop,
preview-verified in touch emulation, ready to push, live in the hub, or not
verified. Only Dan can mark something *confirmed on iPad*. Don't quietly
skip an item.

End each round by pushing the epoch repo (see Pushing rules) and listing
what was pushed.

## Where things stand
**Always check `TODO.md` for the current objective before starting work.**

- **Everything through Round 15 is done and approved (version 0.15.0):**
  - all game systems, difficulty, map sizes up to Huge and Epic, the AI in a
    Web Worker, the minimap;
  - Dan's picked art, portraits, app icon, ElevenLabs sounds, and Suno music;
  - the name **"Epoch: From Stone to Stars"** (short name "Epoch", in
    `src/data/game.ts`), the Round 15 balance pass, Add to Home Screen,
    offline with the update banner, and `docs/GO-LIVE.md`.
- **Live since 2026-09-25 at https://epoch-fsts.netlify.app/** (Netlify, from
  `main`). Every push to `main` deploys there.
- **Round 16 (version 0.16.0): cloud saves with Firebase** (project
  `epoch-ca127`, Google sign-in, Firestore) and the portraits as WebP: done,
  **pushed 2026-09-25**, live. Dan did both console steps. Dan's first test: the PC
  game reached the iPad once he was really signed in (sync works). Round 16b
  polishes it.
- **The play server:** http://10.0.0.224:4173/.
- **Pushing is Dan's call** (see Pushing rules). Commit as usual, push only
  when told, and list the waiting commits in the report. **Round 16b: Dan
  says push the epoch repo, and add the Epoch card to the hub and push the
  hub** (TODO.md C1). That's for Round 16b only.

**Current objective: Round 16b** (see TODO.md): an unmistakable signed-in
state (Dan thought he was signed in when he wasn't), a manual "Save now"
and "Save to a new cloud slot", Sync now, visible sync errors, and the hub
card.

**Hub warning:** the game hub is live on Netlify, so pushing the hub repo
deploys it immediately. Never push it without Dan saying so.
