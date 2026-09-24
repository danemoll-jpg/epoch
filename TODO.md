# Active Development Plan

Maintained jointly: Claude does planning and scoping, the coding agent does
execution. Sections stay in this order: Completed, Current Objective, Next
Steps, Technical Notes.

## Completed Tasks

* **Project scoping — done (planning only, nothing built).**
  - **Model:** original Civilization Revolution (2008), not Civ Rev 2.
  - **Look and text:** the game uses its own look, name, and text.
    Gameplay mechanics can be freely reused, but assets and wording can't.
  - **Leaders — DECIDED:** any historical or real figure is allowed while
    this is a personal build shared only with family and friends. We don't
    have to match Civ Rev's roster, and leaders it never used (e.g.
    Hammurabi, Ashoka, Mansa Musa, Pachacuti, Charlemagne) help it feel like
    its own game. Reasoning: publicity-rights and platform concerns only
    apply if the game is sold or released publicly. The list gets reviewed
    before any public release (see Next Steps).
  - **Stack:** browser game in TypeScript + Vite + Canvas 2D. Game logic is
    kept separate from rendering, and content is data-driven (see CLAUDE.md).

* **Core design decisions — DECIDED by Dan (2026-09-23).**
  - **Faithfulness:** play close to Civ Rev 1. Recreate its systems, pacing,
    and feel first. Dan's own twists come after the core works. When a rule
    is unclear, the default is "what Civ Rev 1 did."
  - **Game length:** about 2–3 hours per full game, matching Civ Rev 1. Map
    size, tech costs, and victory thresholds should be tuned toward this in
    the balance pass.
  - **Civs per game:** 5 total (Dan plus 4 AI rivals), as in Civ Rev 1. Code
    treats the player count as data, not a hard-coded 2.
  - **Multiplayer:** single-player only. Multiplayer isn't planned, but the
    pure-state design means hotseat play wouldn't be ruled out later.

* **Publishing and platform — DECIDED by Dan (2026-09-23).**
  - **Where it lives:** eventually in Dan's **game hub**, alongside other
    games he's built with Claude. Each game is its own GitHub repo and its
    own Netlify site, and the hub links out to it (see M1 hub findings below).
  - **Audience:** family and friends via the hub. Not public, not sold.
  - **Platform:** **iPad (Safari, touch) is a primary target**, equal to the
    desktop browser. Dan's main way to play is on his iPad.
  - **Pushes — Dan decides when to push.** The coding agent never pushes on
    its own. It commits locally, reports what's ready, and pushes only when
    Dan explicitly says so.

* **Doc handoff workflow — DECIDED by Dan (2026-09-23).**
  - The local repo is `C:\Users\danmo\epoch`. Dan created it.
  - **Claude → coding agent:** when the plan changes, Claude writes the
    updated `CLAUDE.md` and `TODO.md` straight into the repo root, since the
    planning session has access to that folder. The coding agent's first
    step each round is to commit those docs, then re-read them.
  - **Coding agent → Claude:** at the end of a round, the coding agent
    updates both docs as its report and commits them. Claude reads them
    back from the repo before planning the next round.
  - **Claude reminds Dan every time** it updates the docs: tell the coding
    agent to commit them first.

* **Milestone 1 — Playable skeleton — done (2026-09-23). CONFIRMED by Dan on
  his iPad**, over the local network from the dev server. Not live in the hub
  yet, by Dan's choice (see item 12).
  - **Result:** 40 unit tests passing. Type-check and production build are
    clean.
  - **What was built:** a 32×24 seeded map with all 8 terrains, and yields
    and move costs in data. Settler and Warrior units. Founding cities,
    with names from per-civ lists and a minimum distance of 3 between
    cities. A turn cycle, fog of war (unit sight 1, city sight 2), and a
    minimal AI that uses the same actions as the player. Pointer-Events
    touch and mouse input with tap, drag-pan, and pinch/wheel zoom.
    Retina scaling, and Safari gesture guards.
  - **Supports 1–5 players.** The M1 default is 2, and `?players=5` runs a
    full game.
  - **Dev extras:** `?seed=123` gives a reproducible map, and
    `window.__epoch` exposes state for debugging, including from Safari's
    Web Inspector.
  - **Per-item status (coding round 1):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done | n/a |
    | 1 | Scaffold (Vite 8, TS 7 strict, Vitest 5) | Done. `lint` = `tsc --noEmit` (no ESLint yet) | commands run |
    | 2 | Game state model | Done | unit-tested (JSON round-trip incl. mid-game, 5-player setup) |
    | 3 | Seeded map generation | Done. Value-noise continents; starts ≥7 tiles apart | unit-tested (determinism, terrains, coast rule, 5-player starts over 40 seeds) |
    | 4 | Canvas rendering | Done | preview-verified (desktop and touch emulation); **CONFIRMED on iPad** |
    | 5 | Touch and mouse input | Done. Buttons ≥44 px, Safari guards | preview-verified; **CONFIRMED on iPad** |
    | 6 | Units | Done. Forest/hills cost 2, diagonal moves allowed, no water or mountains | unit-tested; preview-verified |
    | 7 | Found city | Done. On-screen button, disabled with a reason when invalid | unit-tested; preview-verified |
    | 8 | Turn cycle | Done. End Turn pulses when no units can move | unit-tested; preview-verified |
    | 9 | Fog of war | Done | unit-tested; preview-verified |
    | 10 | Minimal AI | Done. Also runs with 4 rivals | unit-tested; preview-verified |
    | 11 | Unit tests | Done (40) | `npm test` |
    | 12 | Hub integration | **Deferred by Dan.** Findings are done and `netlify.toml` was added. Going live waits until the game is further along. Dan tests on the iPad over the local network in the meantime. | build verified locally |

  - **Hub findings (item 12):**
    - **Separate repos.** Every game is its own GitHub repo
      (`danemoll-jpg/<game>`) with its **own Netlify site**. The hub
      (`danemoll-jpg/game-hub`) is a plain static page that only links out,
      using one object per game in `game-hub/games.js`.
    - **Netlify config per game:** `netlify.toml` builds with `npm install &&
      npm run build`, publishes `dist`, and redirects `/*` to `/index.html`
      (200). Epoch copies Sole Match's version.
    - **Firebase is not used by the hub.** Individual games have their own
      Firebase client code (Sole Match for online rooms and a leaderboard,
      Mexican Train for online play, Nonogram). Epoch uses none.
    - **Correction (found in M2 item 0b):** the placeholder hub card was
      actually **committed locally** in the hub, not blocked as first
      reported. It was never pushed. It was reverted in M2, and the two
      commits get dropped in Round 3 item A1.

* **Milestone 2 — Cities, economy, and autosave — coding done (2026-09-23).
  Tested by Dan on his iPad (2026-09-23): everything he tried works.**
  - **Growth and starvation are not confirmed by play.** Growth is slow to
    reach, and the starvation guard makes starvation nearly impossible to
    trigger by hand. Both are unit-tested. Round 3 item A2 adds dev
    scenarios so Dan can see them happen on the iPad.
  - **Autosave surviving a Safari reload:** not yet explicitly confirmed.
  - "Empire HUD" means the top status bar. Plain-language names are used
    with Dan from now on.
  - Nothing pushed.
  - **Result:** 84 unit tests passing (44 new). Type-check and production
    build are clean. Preview-verified on desktop and in iPad-sized emulation
    (768×1024 portrait and 1024×768 landscape, touch).
  - **Per-item status (coding round 2):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`7ba7f72`), then re-read both | n/a |
    | 0b | Hub cleanup | Done, **but the hub was not in the state TODO described** (see note below). Reverted with `git revert`. The hub's files now match `origin/main` exactly. Nothing pushed | `git diff origin/main` is empty |
    | 1 | City growth | Done. Food box, growth, starvation (shrinks at 0, never below 1). Threshold `10 + 5×size`, 2 food per citizen, 0% kept after growth, all in `rules.ts` | unit-tested; preview-verified |
    | 2 | Worked tiles by focus | Done. Center + 1 tile per citizen, radius in data (1 = the 8 surrounding tiles). Balanced/Food/Production/Trade weights in data. A food-first "starvation guard" stops any focus from starving a city while food exists. Cities take turns picking one tile at a time (oldest first each round), so no tile is shared and new cities aren't squeezed out. Citizens with no free tile become specialists (1 trade, in data) | unit-tested; preview-verified (focus switch changes the worked tile on the map) |
    | 3 | Production | Done. One item at a time, overflow carried over, production stored while nothing is chosen, switching items keeps production (no penalty). Units repeat; after a building the city asks again. Rush-buy `ceil(2×remaining + remaining²/20)` in data; the bought item appears at end of turn | unit-tested; preview-verified |
    | 4 | Settlers cost population | Done. `popCost: 1` on the Settler in `units.ts`. A size-1 city keeps accumulating and finishes the Settler once it reaches size 2. Can't rush-buy it while too small | unit-tested |
    | 5 | Trade → science and gold | Done. One empire-wide rate, 10% steps, default 60% science, per-city split rounded, science accumulates only | unit-tested; preview-verified (HUD rate +/−) |
    | 6 | Starter buildings | Done in `src/data/buildings.ts`: Granary (keeps 50%), Barracks (veteran flag on new units, shown as ★), Walls (`defenseBonusPct` stored, unused until M4), Library +50% science, Marketplace +50% gold, Temple (placeholder `culture: 1`, no effect). No techs, no upkeep | unit-tested |
    | 7 | City screen | Done. Size, food bar + turns to grow/shrink, production bar + turns, food/production/trade totals with the science/gold split, focus picker, build list (cost, turns, effect), Buy button with cost (disabled with the reason), buildings built, units inside. 52 px close button. Side sheet in landscape, bottom sheet in portrait (the map re-centers the city above/left of the panel). Only the panel scrolls; the page still can't bounce | preview-verified desktop + iPad portrait/landscape emulation |
    | 8 | Empire HUD | Done. Turn, gold (+/turn), science (+/turn), science/gold rate with 44 px − / + buttons | preview-verified |
    | 9 | Tap on own stack | Done. **Rule:** (1) a selected unit with moves + a tap on a different tile → move there, even onto your own units or city. If it's your city and the unit can't reach it at all, open the city instead. (2) A tap on the selected unit's own tile, or with nothing movable selected → your city opens (its panel lists the units inside, and tapping one selects it), your units get selected (a repeat tap cycles the stack), or empty ground is inspected. Also added an ✕ Deselect button to the unit panel, since touch had no way to deselect | unit-tested (pure `src/ui/tap.ts`); preview-verified with real pointer events in landscape emulation |
    | 10 | AI uses city systems | Done. Build rules: no defender → Warrior; below 4 cities (counting settlers out and in production, one Settler at a time) → Settler; then buildings in data order; then Warrior. A size-1 city building a Settler switches to Food focus. An undefended city rush-buys its Warrior if it can afford it. The starting warrior explores, the capital builds its own defender, and each city's sole defender stays home. Settlers that see no valid site go exploring | unit-tested (deterministic 5-player 40-turn run; every AI reaches ≥2 cities) |
    | 11 | Fog-respecting events | Done. Log entries carry a tile. Rival events show only if that tile is visible to the player right now; own events always show. The "met civ" half waits for M5 | unit-tested; preview-verified (5-player, 30 turns: 46 rival events logged, 0 shown, all out of sight) |
    | 12 | Autosave and resume | Done. **localStorage** (`epoch.autosave`), because it's synchronous and finishes inside Safari's `pagehide`. Saves after every successful action (more than asked; a reload loses at most one tap), on `visibilitychange` → hidden, and on `pagehide`. Resumes on load with a "Resumed your game" toast. ☰ menu → New Game → on-screen confirm. `saveVersion` check: an old or damaged save starts a new game with a notice. Save is about 33 KB at turn 30 with 5 players | unit-tested (round-trip, resume continues identically, incompatible, corrupt); preview-verified (reload resumes, planted v1 save shows the notice, New Game confirm/cancel) |
    | 13 | Unit tests | Done: 44 new, 84 total (`tests/cities.test.ts`) | `npm test` |
    | 14 | iPad dev command | Done. `npm run dev:lan` (= `vite --host`), documented in CLAUDE.md. Plain `npm run dev` stays localhost-only | script added; not run from an iPad by me |

  - **Item 0b, what I found and did:** `game-hub/games.js` had **no
    uncommitted changes**. The placeholder Epoch card
    (`https://epoch-dan.netlify.app/`) had been **committed locally** as
    `00d47a9` "Add Epoch to the game library" (danmo, co-authored by Claude,
    2026-09-23 20:36), 1 commit ahead of `origin/main` and **not pushed**.
    That contradicts the M1 note that the hub commit was blocked. I reverted
    it with `git revert` (`298b281`), so the hub is now 2 commits ahead of
    origin with a net-zero diff. No other uncommitted hub changes. **Dan's
    call:** either leave it (pushing would publish an add+revert pair, which
    is harmless) or drop both local commits with
    `git reset --hard origin/main` in the hub. **Decided by Claude (Dan
    delegated it): drop both. Done in Round 3 item A1.**
  - **Placeholder numbers chosen (all in `src/data/`, tune later):** city
    center bonus +1 food / +2 production / +1 trade (with +1 production, a
    grassland capital took 10 turns per Warrior). Warrior 10, Settler 30,
    Granary/Walls 40, Barracks/Temple 30, Library/Marketplace 60. Balanced
    focus weights food 2 / production 2 / trade 1.
  - **Other decisions worth reviewing:** new units appear at end of turn
    with 0 moves and move next turn. A city with nothing chosen shows a gold
    "!" on the map, and the first such city's panel opens at the start of
    your turn. A newly founded city opens its panel for the first build
    choice. The unit panel hides while a city panel is open.
  - **Also committed:** `.claude/launch.json` had an uncommitted `--host` on
    `epoch-dev` that I didn't make (presumably for iPad testing). I kept it,
    added an `epoch-verify` config on port 5175, and committed both
    (`66492c0`). Another session's server was on 5174, so I left it alone.
  - **Observed, not fixed (balance):** AI expansion is slow, 2–4 cities per
    AI by turn 40. Production is low, and the first Settler takes ~15 turns.
    Fine for M2; revisit in the balance pass or M5.

* **Round 3 — M2 wrap-up + Milestone 3 (tech tree) — coding done
  (2026-09-23). Waiting for Dan's iPad checks (a)–(c) below.**
  - **Result:** 122 unit tests passing (38 new). Type-check and production
    build are clean, and the build now ends with a dev-code leak check.
    Preview-verified on desktop and in iPad-sized touch emulation (768×1024
    portrait, 1024×768 landscape). Nothing pushed.
  - **Per-item status (coding round 3):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`6b04831`), then re-read both. Nothing from last round's report was dropped without being reconciled | n/a |
    | A1 | Hub: drop the two local commits | **Not done: blocked.** I confirmed the hub is exactly `00d47a9` + `298b281` ahead of `origin/main`, nothing behind, the working tree clean, and no stashes. `git reset --hard origin/main` was then **refused by the session's permission check** (it counts as modifying a shared resource), so I stopped, as the item says to. The hub is unchanged: still 2 local commits, net-zero diff, not pushed. **Dan: run it yourself in `C:\Users\danmo\game-hub`, or allow it and I'll do it** | `git log origin/main..HEAD` in the hub |
    | A2 | Dev test scenarios | Done. Load with `?scenario=<id>` or ☰ menu → "Dev scenarios". The set is `grow`, `starve`, `settler`, `rich`, `tech`, plus `era` (reaching the Medieval era). Each shows a purple note banner saying what to do and what should happen, with a "Back to my game" button. **Never autosaves**: the save call is skipped entirely, so the real game can't be overwritten. Scenarios are built with `src/dev/build.ts`, the same builder the tests use (moved from `tests/helpers.ts`, which now re-exports it). **Dev only:** imported only under `import.meta.env.DEV`. `npm run build` runs `scripts/check-dist.mjs`, which fails if the scenario marker or note text appears in `dist/` | unit-tested (each scenario does what its note says after one End Turn, through the real End Turn action). Build check passes on the real build and **fails on a dev-mode build** (proves it catches a leak). Preview-verified: `starve` shrank 3 → 2, `era` reached Medieval, the real save was byte-identical before and after, and "Back to my game" returned to turn 8 |
    | A3 | Easy to add scenarios | Done. A new scenario is one array entry plus one expected-outcome entry, and the suite fails if a scenario has no outcome check. How-to in CLAUDE.md ("Adding a scenario") | unit-tested (the check itself) |
    | B1 | Tech data | Done. `src/data/techs.ts` has **50 techs**: Ancient 14, Medieval 13, Industrial 13, Modern 10. Each has 0–2 prerequisites, an era, a tier (its depth in the tree), and our own one-line description. The tree ends at **Space Flight** (for the M6 spaceship). Unlocks are declared on the unit or building (`requires`), and `techUnlocks()` reads them | unit-tested (tree validity, see B9) |
    | B2 | Research | Done. Pick from techs whose prerequisites are known. Science goes into one pool per player. At end of turn, if the pool covers the cost, the tech is learned and the overflow carries over. **At most one tech per turn.** With nothing picked, science banks. Switching keeps the pool (no penalty). Cost = `16 + 10·known + 0.6·known² + 4·(tier−1)`, all in data. No starting techs (`STARTING_TECHS = []`) | unit-tested; preview-verified |
    | B3 | Unlocks | Done. Buildings: Granary ← Pottery, Library ← Writing, Marketplace ← Currency, Barracks ← Bronze Working, Walls ← Masonry, Temple ← Ceremonial Burial. **13 new units**, with attack, defense, and moves in data: Archer, Spearman, Horseman, Chariot, Legion, Catapult, Pikeman, Knight, Musketman, Cannon, Rifleman, Artillery, and Tank. They can be built and moved; there's no combat. The build list shows "attack · defense · moves" and offers only unlocked items, and `setBuild` refuses locked ones ("Needs Writing"). Wonders: `src/data/wonders.ts` holds the data shape (`requires`, cost, effects) with an empty table, and the tech screen already lists wonder unlocks | unit-tested; preview-verified (the build list went from Settler/Warrior to also offering Granary after Pottery) |
    | B4 | Era | Done. Derived rather than stored: the latest era among known techs (Ancient with none). Shown in the top bar ("Ancient era"). Learning the first tech of a new era logs "Entered the Medieval era", which shows as a toast | unit-tested; preview-verified (`era` scenario) |
    | B5 | Tech screen | Done. Opens from the research button in the top bar. The tree is grouped by era, with "n/14 known" counts. Each tech is marked known (green), available (blue), researching (gold), or locked (grey), with turns to learn. Tapping one shows its era, cost, description, requirements (✓/✗), unlocks, and "leads to", plus a **Research this · N turns** button when it's available. Landscape: tree on the left, details on the right. Portrait: details on top, tree below. Only the two panes scroll. It has a 52 px close button, and a backdrop tap or Esc also closes it. **Prompt:** after you learn a tech, the screen opens with "You learned X. Choose what to research next." Toasts now sit above overlays, so the news isn't hidden | preview-verified on desktop and in 768×1024 portrait and 1024×768 landscape emulation (the tree scrolls, the page doesn't) |
    | B6 | HUD research readout | Done. The top-bar button reads "🔬 Writing (6)". With nothing picked, it's a pulsing gold "🔬 Choose research · 25 banked". Tapping it opens the tech screen | preview-verified |
    | B7 | AI research | Done. The AI picks the first available tech from `AI_TECH_PRIORITY` in data (Bronze Working, Pottery, Alphabet, Writing, … Gunpowder), otherwise the shallowest available one, through the same `setResearch` action as the player. It now builds its best unlocked defender instead of always a Warrior, and only unlocked buildings. No RNG is involved | unit-tested (deterministic 5-player 40-turn run; every AI learns at least one tech legally and always has research picked) |
    | B8 | Don't wipe Dan's game | Done: **M2 saves are migrated**, not discarded. `STATE_VERSION` goes 2 → 3. Players get no techs and no research. Science earned in M2 stays banked, so Dan can spend it right away. A city building something that's now locked (e.g. a Library) goes back to "choose", with its stored production kept. On load the game says "Your saved game was updated for the tech tree (turn N)…" and writes the upgraded save back. Migrations live in `MIGRATIONS` in `save.ts`, keyed by the version they upgrade from | unit-tested (a v2 save migrates, plays on, and re-saves as v3; unit builds survive; v1 and future versions are still refused); preview-verified (a planted v2 save resumed at turn 7 with 40 science banked) |
    | B9 | Unit tests | Done: 38 new, in `tests/tech.test.ts` and `tests/scenarios.test.ts`. They cover: prerequisites enforced; the cost formula; overflow, banking, and one tech per turn; switching keeps the pool; unlocks gate the build list and `setBuild`; the era calculation and announcement; AI research determinism; M2 save migration; tree validity (prerequisites exist, no cycles, every tech reachable, tiers = depth, era order); and every scenario's outcome | `npm test` |

  - **Dan's iPad checks for this round** (from "Done means"):
    - (a) ☰ → Dev scenarios → `City grows`, `City starves`, `Settler costs
      a citizen`: after End Turn, each should do what its purple note says.
      This finishes confirming M2.
    - (b) Autosave survives a Safari tab reload, if not already confirmed.
      Your M2 game should come back migrated, with its turn number and
      banked science.
    - (c) Pick research, finish a tech, and see a newly unlocked building
      in a city's build list. The `tech` scenario does this in one turn. In
      the real game, Pottery → Granary is the quickest.
  - **Also changed:**
    - The city panel in landscape now starts below the ☰ button. It used
      to cover the button, so the menu (and now the scenario list) couldn't
      be reached while a city was open.
    - `main.ts` now boots through an async function so the dev-only import
      can be dynamic.
    - The production `index.html` still contains the empty, hidden shells
      for the dev banner and dev menu. They're harmless: no scenario code
      or text ships.
  - **Decisions worth reviewing:**
    - Research uses one science pool (progress = banked science), with no
      penalty for switching.
    - At most one tech per turn, even with a big pool.
    - The next-tech prompt opens only right after a tech is learned. At
      game start and after migration there's no pop-up; the research button
      pulses gold instead.
    - Rival tech discoveries aren't announced. They have no map tile, so
      the M2 fog rule hides them.
    - Unit numbers are our own placeholders, e.g. Spearman 1/3, Pikeman
      1/4, Musketman 3/6, Rifleman 5/8, and Tank 12/8 with 3 moves.
    - Unit glyphs are now 2 letters (Ar, Sp, Kn…), drawn smaller on the
      map.
  - **Observed, not fixed (balance):** research is slow in a real game.
    With seed 8, AIs have about 2 techs by turn 25, 4 by turn 50, and 9–10
    by turn 100. At that pace, the 50-tech tree would take far longer than
    a 2–3 hour game. The main limit is low science income (small cities,
    and AIs stop at 4 cities), not just the cost formula. Both are in data.
    Tune in the balance pass, or sooner if Dan finds it slow.

## Current Objective (Focus Area)

### Round 3 — Milestone 2 wrap-up + Milestone 3 (tech tree)
**Status (coding round 3):** all items done **except A1** (hub reset
blocked by a permission check; Dan to run it or allow it). See the report
under Completed Tasks. **Waiting for Dan's iPad checks (a)–(c).**

**Goal:** close out M2's loose ends, and give Dan a way to see
hard-to-reach rules (like starvation) on the iPad on demand. Then add the
tech tree, so the science from M2 buys something. Placeholder art only.

**Items for the coding agent. Report status on each one individually:**

**Part A — M2 wrap-up**

0. **Commit the updated docs first:** `CLAUDE.md` and `TODO.md` as their own
   commit, then re-read them.

A1. **Hub repo: drop the two local commits** (the placeholder card
    `00d47a9` and its revert `298b281`):
    - first confirm the hub is *only* those two commits ahead of
      `origin/main` and the working tree is clean;
    - if so, run `git reset --hard origin/main` in the hub;
    - if anything else is there, stop and report instead;
    - don't push the hub.

    (Decided by Claude on Dan's behalf. The net change is zero either way,
    and this keeps the hub history clean.)

A2. **Dev test scenarios, loaded by URL**, e.g. `?scenario=grow`:
    - **dev server only.** They must be ignored or compiled out in the
      production build (`import.meta.env.DEV`), so they can never show up
      in the hub version. Add a test or build check that proves it;
    - **a scenario must never overwrite Dan's real autosave.** Either don't
      autosave while a scenario is loaded, or use a separate save key.
      Removing `?scenario` from the URL goes back to his real game;
    - also list the scenarios in the ☰ menu (dev only), so Dan can pick one
      by tapping on the iPad without typing URLs;
    - scenarios are built in code from hand-made states, the same way
      `tests/helpers.ts` does, and the tests should reuse them so the
      scenario and the test agree;
    - the starter set:
      - `grow`: a city that grows by 1 at the next End Turn;
      - `starve`: a size-3 city on poor land (e.g. desert, hills, and
        mountains) with a food deficit, whose food box is empty enough that
        it shrinks at the next End Turn. The starvation guard should be
        doing its best and still fail;
      - `settler`: a size-2 city finishing a Settler at the next End Turn,
        which drops to size 1;
      - `rich`: plenty of gold, to try rush-buying;
      - `tech`: research one turn from finishing (see B2);
    - each scenario shows a short on-screen note saying what to do and what
      should happen, e.g. "Tap End Turn. Rome should shrink from 3 to 2."

A3. **Keep an easy way to add scenarios.** Future milestones will add more,
    e.g. combat odds in M4. Document how in CLAUDE.md.

**Part B — Milestone 3: Tech tree**

B1. **Tech data** in `src/data/techs.ts`:
    - about 40–50 techs across **four eras**: Ancient, Medieval,
      Industrial, and Modern. That's roughly Civ Rev 1's scale;
    - each tech has prerequisites, an era, a cost tier, and what it
      unlocks;
    - use common historical tech names (Bronze Working, Writing, and so
      on). They're generic and fine to use;
    - write our own short descriptions, not Civ Rev's text;
    - the tree ends at a tech that will later unlock the spaceship, for
      M6.

B2. **Research:**
    - the player picks a current tech from the ones whose prerequisites
      are met;
    - science each turn goes into it, and overflow carries over;
    - cost rises with the number of techs known (formula in data, a
      placeholder toward a 2–3 hour game);
    - when a tech finishes, the player gets an on-screen prompt to pick the
      next one. If none is picked, science banks until one is;
    - no starting techs, unless the data says otherwise.

B3. **Unlocks:**
    - M2's buildings get tech requirements in data, e.g. Granary ←
      Pottery, Library ← Writing, Marketplace ← Currency, Barracks ← Bronze
      Working, Walls ← Masonry, Temple ← Ceremonial Burial. Pick sensibly;
    - add a first wave of **units** as unlocks, with attack, defense, and
      moves values stored in data now: e.g. Archer, Spearman/Pikeman,
      Horseman, Catapult, Knight, Musketman, and Cannon, up through a few
      Industrial/Modern ones;
    - these units can be built and moved, but **combat stays in M4**. Show
      their attack and defense values in the build list so Dan can see
      them;
    - the build list only offers what's unlocked;
    - wonders are **not** in M3 (they're M7). Leave a place in the data
      shape for them.

B4. **Era:** each player has a current era, the highest era among their
    known techs. Show it in the HUD (the top bar) and announce reaching a
    new era with a toast. Era has no other effects yet.

B5. **Tech screen, touch-first:**
    - open it from the HUD (tap the science readout, or add a button);
    - it shows the tree grouped by era, with each tech marked
      known / available / locked;
    - tapping a tech shows what it unlocks and its prerequisites, plus a
      "Research this" button when it's available;
    - it shows turns to complete at the current science rate;
    - it works in iPad portrait and landscape, only the panel scrolls, and
      it has a large close button.

B6. **HUD:** show the current research and its turns left, e.g. "Writing
    (6)". Tapping it opens the tech screen.

B7. **AI research:** simple priorities in data. For example, techs that
    unlock buildings the AI wants and a defensive unit first, then a steady
    push up the tree. It must be deterministic and use the same actions as
    the player.

B8. **Don't wipe Dan's current game:** M3 changes the state shape, so bump
    `STATE_VERSION`, but **migrate** M2 saves forward (no techs known, no
    current research) instead of discarding them, if that's straightforward.
    If migration isn't reasonable, say why. The fallback is the existing
    "new game" notice.

B9. **Unit tests:**
    - prerequisites are enforced;
    - the cost formula;
    - overflow and banking;
    - unlocks gate the build list, and buildings that need a tech can't be
      built without it;
    - the era calculation;
    - AI research is deterministic;
    - migrating an M2 save;
    - the tech tree is valid: every prerequisite exists, there are no
      cycles, and every tech is reachable.

**Done means:** every item (0, A1–A3, B1–B9) is reported individually and
tests pass. It must be preview-verified on desktop and in iPad-sized touch
emulation. **Dan then confirms on the iPad:**
- (a) the `grow`, `starve`, and `settler` scenarios behave as their
  on-screen notes say. This finishes confirming M2;
- (b) autosave survives a Safari tab reload, if not already confirmed;
- (c) he can pick research, finish a tech, and see a newly unlocked
  building in a city's build list.

Nothing gets pushed without Dan saying so.

**Open questions (defaults in bold; the coding agent proceeds on the default
unless Dan decides otherwise):**
- **Q1 — Working title:** **"Epoch" as a codename for now.**
- **Q2 — Rival event messages:** **show only what the player can see.**
  (Built in M2.)
- **Q3 — Tile management:** **automatic with a city focus.** (Built in M2.)
- **Q4 — Science/gold split:** **one empire-wide rate** (placeholder). (Built
  in M2.)
- **Q5 — Starting techs:** **none**; everyone starts from scratch. Civ-style
  games sometimes give each civ one or two starting techs, and that could
  come with the leader bonuses in M8.

## Next Steps (Do Not Start Yet)

All of these are deferred for **sequencing only**. Each depends on the
milestone before it. None has been decided against.

- **Go live in the hub. Deferred by Dan** until the game is further along.
  He tests on the iPad over the local network until then. `netlify.toml` is
  already in place. Steps when he's ready:
  1. Dan says "push," and the agent pushes this repo to `danemoll-jpg/epoch`.
     `origin` is already set, and this is the first push.
  2. Dan creates a Netlify site from the `epoch` repo. Netlify reads
     `netlify.toml`, so no build settings need typing. Dan picks the site
     name.
  3. Add the Epoch card to `game-hub/games.js` with the **real** URL, then
     commit, and push the hub when Dan says. The hub must not be pushed
     before the Netlify site exists.
- **Milestone 4 — Combat:**
  - attack vs. defense values with terrain, fortification, and veteran
    bonuses;
  - Barracks and Walls effects from M2 come into use;
  - combat odds shown before attacking;
  - **Armies:** stacking 3 identical units into one army, a signature Civ
    Rev mechanic;
  - capturing cities.
- **Milestone 5 — Full AI roster and basic diplomacy:**
  - scale up to all 4 AI rivals by default;
  - smarter AI expansion, building choices, and war/peace decisions;
  - simple diplomacy such as peace, war, and tech trading;
  - "met civs" tracking, which also feeds the event-message rule.
- **Milestone 6 — Victory conditions:**
  - Domination: capture all enemy capitals.
  - Culture: reach a culture threshold or build enough wonders.
  - Economic: stockpile gold and build the economic wonder.
  - Technology: build and launch the spaceship.

  Add a victory and defeat screen. Tune thresholds toward a 2–3 hour game.
- **Milestone 7 — Flavor systems:** Great People, wonders, barbarians, and
  exploration huts. The Temple and culture effects get filled in here or in
  M6.
- **Milestone 8 — Leader roster:** 12–16 civs, each leader with era-based
  bonuses, all in data. Any historical or real figure is allowed for
  family-and-friends use.
- **Milestone 9 — Polish:** an original art pass, sound, a main menu, and
  difficulty levels.
- **Cloud saves (optional, later).** This would let a game continue across
  devices. It would need its **own** Firebase setup in this repo, the way
  Sole Match and Mexican Train have theirs, since the hub has no Firebase.
  It's deferred until local autosave is proven on the iPad.
- **Before any public release (only if Dan decides to go beyond family and
  friends, or to sell it):** review the leader list, the name, and all art
  and text against the IP rules.
- **Multiplayer — not planned.** Dan chose single-player only.

## Technical Notes / Blockers

- **Doc sync order matters.** The docs are edited in two places: the
  planning session and the repo. Claude always reads the coding agent's
  latest committed docs from the repo before editing, then writes the
  reconciled versions back into the repo. Git history is the backstop.
- **The hub repo is shared, separate, and LIVE.** The hub is already on
  Netlify, so **pushing the hub deploys it** to family and friends right
  away. That's different from Epoch's own repo, where a push deploys
  nothing until its Netlify site exists. Any hub change needs Dan's say-so,
  and never push the hub with a card for a site that doesn't exist yet.
- **IP guardrails:** see CLAUDE.md. The rules are no copied assets or text
  and no "Civilization" in the name. Any leader is allowed while the game is
  shared only with family and friends.
- **Architecture rules that must hold:** pure game logic, serializable
  state, a seeded RNG, data-driven content, and touch-first input.
- **Player count is data, not hard-coded.** Target is 5 civs per game.
- **iPad is the real test environment.** The verification labels are
  *unit-tested*, *preview-verified (desktop)*, *preview-verified (touch
  emulation)*, *ready to push*, *live in hub*, and *CONFIRMED by Dan on
  iPad*. These are separate claims. For now, Dan's iPad testing is over the
  local network, which counts as iPad-confirmed. "Live in hub" is a
  separate claim that comes later.
- **Pushing is Dan's call, never automatic.** Until Epoch's Netlify site
  exists, an Epoch push only updates GitHub and nothing deploys. A hub
  push, though, deploys right away. Either way, it's Dan's call.
- **Dev scenarios (from Round 3):** dev-only, never in the production build,
  and never allowed to overwrite the real autosave. They're how Dan checks
  hard-to-reach rules on the iPad, and new milestones should add scenarios
  for their own hard-to-reach rules.
- **Balance numbers are placeholders until Milestone 6+.** Keep them in data
  so tuning later is cheap.
