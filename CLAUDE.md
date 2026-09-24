# Project Context & Rules

Read this at the start of every session. It is the short, operational version.
`TODO.md` is the planning and history record and the source of truth for what
to work on.

## ⚠️ Pushing rules
- **Epoch repo: push at the end of every round** (Dan's standing
  instruction, 2026-09-24). After tests pass and the docs are committed,
  `git push` the `epoch` repo to GitHub, then restart the play server.
  There's no Netlify site for Epoch yet, so nothing deploys. **Once Dan
  connects Netlify, this rule ends**, and pushing goes back to "only when
  Dan says," because a push would then deploy to the live site.
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
  never gets them.
- **Each address has its own saved game.** Safari keeps `localStorage` per
  host and port, so `play:lan` (:4173) and `dev:lan` (:5173) never share or
  overwrite each other's save. That's intended.
- Plain `npm run dev` stays localhost-only. The `epoch-dev` preview config
  in `.claude/launch.json` passes `--host` (port 5174); `epoch-verify`
  (port 5175, localhost only) is for a second session to preview without
  taking 5174; `epoch-play-verify` (port 4176) serves an existing
  `dist-play/` (run `npm run build:play` first) to check the play build.

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
currently 9). **Bump `STATE_VERSION` whenever the state shape changes, and
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
is simply absent).

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
`helicopter`, `airlift`, `all-aircraft`, `all-map-icons`. The air ones use
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
- `src/data/`: terrain (yields, move cost, `defensePct`), units (cost,
  `popCost`, attack/defense/moves/sight, `requires` tech, `glyph` letters,
  `icon` file name, and Round 8's `domain` ('land'/'sea'/'air'), `cargo`,
  `coastOnly` (Galley), `stealth` (Submarine); Round 10's `range`,
  `airAttack` (strength against aircraft), `evadePct` (Stealth Bomber),
  `airCargo` (Carrier: 3), `hover` (Helicopter), `alsoRequires` (a second
  tech); 16 land units counting the Helicopter, 9 ships, 4 based aircraft),
  `icons.ts` (each used icon's CC BY 3.0 credit, `MAP_ICONS` for the
  village/hut/barbarian badge/artifact, and `usedIcons()`, the list the
  credits and the icon test use),
  buildings (`requires` tech; Walls' `defenseBonusPct`; Temple culture;
  Harbor `coastal` + `waterFood`; Round 10's Airport: `veteranAircraft`,
  `airlift`; AI building order), `techs.ts` (eras,
  the 55 techs with prereqs/era/tier/description, the tech cost formula,
  AI research priority), `wonders.ts` (13 wonders + the 2 victory wonders:
  cost, tech, city/empire effects, free building, `victory`), `victory.ts`
  (culture and gold goals, spaceship parts/cost/travel turns, warning line,
  the spaceship-part "project"), `civs.ts`
  (civs, leaders, colors, city names, each leader's `aggression` and
  `tradeWillingness`, 1–5, and message grammar: `article: 'the'` and
  `plural` for names like "the Franks"), rule constants (`rules.ts`: growth, focus
  weights, rush-buy formula, science rate, `RULES.combat` (fortify/veteran/
  city bonuses, army size and multiplier, veteran chance, AI attack
  threshold), `RULES.map` (land share, 3–4 continents and the water
  channels cut between them, minimum start landmass), `RULES.diplomacy` (treaty length, grace period, opinion
  events, AI war/peace weights, demand caps, tech prices), and `RULES.ai`
  (city target, settlers at once, defenders per city, unit caps, attack
  force, gold reserve, and `victory`: goal weights, war bonus, science-rate
  and gold-spending thresholds, each goal's first building), and `naval`:
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
- `src/game/`: pure rules. `types.ts` (state + `STATE_VERSION`), `rng.ts`,
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
- `src/assets/icons/`: the 53 icons Dan picked (29 units: 15 land, 9
  ships, 5 aircraft; 24 map icons: village, hut, barbarian badge, 15
  resources, 5 Great People, artifact; game-icons.net, CC BY 3.0; the
  Carrier's is modified), credited in `CREDITS.md` and on ☰ → About /
  Credits (a credit's `modified` field says what we changed).
- `src/dev/`: dev/test only, never in the production build. `build.ts`
  (hand-made state builder shared by tests and scenarios), `scenarios.ts`,
  and `sim.ts` (all-AI simulation: era turns, techs over time, wars; used
  by `tests/pace.test.ts` and `scripts/pace-report.sim.ts` / `npm run sim`,
  whose config is `vitest.sim.config.ts`; it also counts overseas cities,
  landings, and ships), and `landmass.ts` (how often civs share or get their
  own landmass, and empty islands; Round 8's B7 check).
- `src/ui/`: `app.ts` (view state, HUD, city panel, tech screen,
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
  (injected as `__APP_VERSION__` by `vite.config.ts`); it's 0.10.0 for
  round 10.
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

- **Milestones 1–7, naval, and air** are done: land, sea, and air units,
  wonders, culture, the four victories, diplomacy, barbarians, villages,
  resources, huts, and Great People. **Round 10** (Dan's map and aircraft
  icons, and air units) is done and waiting for Dan's checks.
- **The play server:** http://10.0.0.224:4173/.
- The epoch repo is pushed every round until Netlify is set up.

**Next (from the planning session):** M8 (the leader roster and Dan's AI
portraits), then M9 (polish). See TODO.md.

**Hub warning:** the game hub is live on Netlify, so pushing the hub repo
deploys it immediately. Never push it without Dan saying so.
