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

* **Milestone 2 — Cities, economy, and autosave — done. CONFIRMED by Dan
  on iPad (2026-09-23)**, including growth and starvation through the
  round 3 dev scenarios.
  - Dan's M2 test game was wiped during round 3. It was a throwaway, and
    Dan doesn't mind. The likely cause was a dev-server live reload, which
    led to round 4's save-safety items.
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

* **Round 3 — M2 wrap-up + Milestone 3 (tech tree) — done. APPROVED by
  Dan after testing on iPad (2026-09-23)**, including the dev scenarios.
  - **A1 (hub reset) was blocked by the agent's permission check.** It's
    left as an optional Dan action (see Current Objective). It's harmless:
    two local commits that cancel out, never pushed.
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

* **Round 4 — Save safety + Milestone 4 (combat and armies) — done. Dan
  tested on iPad (2026-09-24): scenarios and attacking verified.**
  - **Feedback, handled in round 5:**
    - winning the last fight at a city should capture it (A2);
    - Legions couldn't form an army in his real game (A3);
    - he wants a play server he doesn't have to start (A1).
  - The Victory panel still hasn't been seen on screen (A4).
  - **Result:** 187 unit tests passing (65 new). Type-check and production
    build are clean, and the dev-code leak check passes on both `dist/` and
    `dist-play/`. Preview-verified on desktop and in iPad-sized touch
    emulation (768×1024 portrait, 1024×768 landscape). Nothing pushed.
  - **Per-item status (coding round 4):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`5157fdc`), then re-read both. Nothing from last round's report was dropped | n/a |
    | A1 | Stable `play:lan` build | Done. `npm run play:lan` type-checks, builds into its **own folder `dist-play/`** (so my `npm run build` checks never touch Dan's running game), runs the dev-code leak check on it, then serves it with `vite preview --host` on **port 4173**. The served page has no Vite live-reload client, so editing code changes nothing until Dan restarts `play:lan`. `npm run play` is the same, localhost only. `dev:lan` is unchanged for quick checks. **Different port = different saved game in Safari** (saves are per address), so dev reloads can never touch the play save; that also means a game started on `dev:lan` doesn't show up in `play:lan`. Scenarios are dev-only, so they aren't in `play:lan` (`?scenario=` is ignored there) | Ran `npm run play:lan` end to end (served 200 on localhost and listed both LAN addresses). Preview-verified the `dist-play` build: no Vite client, version 4 game, no dev menu, Restore a backup present. Confirmed `npm run build` leaves `dist-play/` untouched (file times unchanged) |
    | A2 | Never throw a save away | Done. Before the saved game is replaced by anything other than its own next autosave, its exact text is copied to `epoch.autosave.backup.1` (older ones shift to `.2`, `.3`; the oldest past 3 is dropped). Each backup stores when and why it was kept; the list reads the turn, save date, and version from inside the save. **Paths that back up:** incompatible version, corrupt data, failed migration, an exception while loading, a successful upgrade (the pre-upgrade save is kept), New Game, `?new`, and restoring a backup (the replaced game is kept). If a backup can't be written (storage full), the old save is **left in place** and the new game isn't autosaved, with a notice saying so. The notice says a backup was kept and where to find it. **☰ → Restore a backup** is in the production build too: each entry shows turn, date saved, version (and "will be updated" for older ones), when and why it was kept, and a Restore button with an on-screen confirm. An entry that can't be loaded says why in plain words ("It's from version 99 of Epoch, which this version can't read." / "It's damaged and can't be read.") and has no Restore button. Hidden while a dev scenario is loaded | unit-tested (`tests/storage.test.ts`: every discard path writes a backup of the exact text; the cap of 3; unloadable backups listed with reasons; restore round-trips and keeps the replaced game; restore and startup both refuse to overwrite when the backup can't be written). Preview-verified: a real v3 save was upgraded with its original kept, then restored through the menu (and upgraded again), then New Game, giving 3 backups with the right reasons |
    | A3 | What wiped Dan's M2 game | Done (short look). See the finding below | Code and history read |
    | B1 | Everyone at war | Done. `state.atWar[a][b]` (symmetric, all true except yourself) lives in state, so M5 can add peace. Combat and capture check it ("You are at peace with them") | unit-tested |
    | B2 | Combat resolution | Done in `src/game/combat.ts`. The attacker wins with probability `A / (A + D)` (the one function `winChance`), using the seeded RNG. The loser is destroyed; no hit points. The winner (either side) becomes a veteran with a 50% chance (`RULES.combat.veteranChancePct`). Attacking uses up the attacker's turn and clears its fortify; **the attacker stays where it is** (capturing is a separate move). 0-attack units (Settlers) can't attack | unit-tested (formula, determinism, loser removed on both sides, veteran rate over 400 fixed seeds, error cases) |
    | B3 | Modifiers | Done, all in data: terrain `defensePct` (hills +50%, forest +25%) in `terrain.ts`; fortified +50%, veteran +50% (either side), in a city +25%, army ×3 in `RULES.combat`; Walls +100% (its `defenseBonusPct` in `buildings.ts`, city defenders vs land attacks). **Bonuses add up** (hills + fortified + veteran = +150%, so ×2.5). Each is listed by name in the odds panel | unit-tested (each modifier and the stacking); preview-verified (`fortified` and `walls` scenarios show the lists) |
    | B4 | Stacks | Done. The unit with the highest effective defense fights (ties: oldest). If it loses, only it dies. The odds panel says so when there are others on the tile | unit-tested |
    | B5 | Attack flow on touch | Done. With a unit selected, tapping an **adjacent** enemy opens the odds panel: big win % (green / gold / red), your unit vs their best defender, each side's base value, every bonus, the total, and big **Attack** / **Cancel** buttons (56 px). Nothing happens without Attack; Cancel, a backdrop tap, or Esc closes it. Tiles the selected unit can attack get a **red outline**. Afterwards: a green or red flash on the tile (~1 s) plus a toast, e.g. "Your Legion defeated the Spearman (64%). Your Legion is now a veteran ★". A unit that can't attack gets a reason ("A Settler can't attack") | unit-tested (the tap rule); preview-verified on desktop and in portrait/landscape emulation (attack won, attack lost, Cancel changes nothing) |
    | B6 | Fortify | Done. A **Fortify** button on the unit panel (not for Settlers). It ends the unit's turn; the unit stays fortified across turns until it moves or attacks. Next Unit and the End Turn pulse skip fortified units. On the map: a small shield on the unit's disc; 🛡 in the city panel's unit list | unit-tested; preview-verified |
    | B7 | Armies of 3 | Done. **Form Army** appears only when 3 units of the selected unit's type (not already armies, not Settlers) share its tile. The army is one unit with 3× attack and defense (`armyMultiplier` in data), the same moves (the lowest of the three's moves left), veteran if any member was. It can't be split, and it dies whole if it loses. On the map: a thick gold ring and a "×3" tag | unit-tested; preview-verified (`army` scenario: 75% → 90%) |
    | B8 | Capturing cities | Done. A land unit with attack > 0 stepping into an adjacent enemy city with **no units in it** captures it: new owner, −1 population (never below 1), Walls destroyed (other buildings kept), production reset to 0 with nothing chosen. Your city panel opens so you can pick a build. **Capitals:** `City.capitalOf` marks a civ's first city; it keeps pointing at the original owner after a capture (for M6 domination). Capturing a capital logs "Babylon captured Pataliputra, the Mauryan capital!" | unit-tested; preview-verified (`capture` scenario) |
    | B9 | Elimination | Done. A civ with no cities and no units is eliminated (logged; skipped in the turn order). If you're eliminated, AI turns stop and a **Defeated** panel shows with New Game. If every rival is gone, a **Victory** panel shows. Both have "Look at the map" to dismiss. Both are derived from `alive`, so they come back after a reload | unit-tested (you, one rival, all rivals, units-only civs survive); preview-verified (`defeat` scenario). The Victory panel itself was not seen in the preview, only its rule in tests |
    | B10 | Barracks | Done: units built with Barracks start as veterans (from M2), and the veteran bonus now applies in combat | unit-tested |
    | B11 | AI combat | Done in `ai.ts` (`tryCombat`): a unit that isn't its city's only defender first **captures** an adjacent undefended enemy city, else attacks the adjacent enemy it has the best odds against if those are **≥ 60%** (`aiAttackMinChancePct`). A city's only defender **fortifies** and stays home. **Three of a kind on one tile form an army** at the start of the AI's turn. Settlers never attack (0 attack). Deterministic; same actions as the player | unit-tested (threshold both sides of 60%, capture, fortify, army, settler, a 60-turn 5-civ game is identical twice) |
    | B12 | Combat events and fog | Done. Log entries now carry an optional `other` player (the defender, or the civ that lost a city). A fight your units are in always shows, even if your unit died and the tile is out of sight; other fights follow the M2 rule | unit-tested |
    | B13 | Save migration v3 → v4 | Done. `STATE_VERSION` is 4. `MIGRATIONS[3]`: fortified and army off, everyone at war, each civ's first city (earliest founded, then lowest id) becomes its capital. v2 saves go 2 → 3 → 4 in one load. The pre-upgrade save is kept as a backup (A2). The notice names what changed ("updated for combat and armies") | unit-tested; preview-verified (a real v3 save left in the preview browser from round 3 came back upgraded, turn 8, with its original in backup slot 1) |
    | B14 | Dev scenarios | Done: `combat` (Legion vs Spearman, 57%), `fortified` (fortified veteran Spearman on hills: 7.5 defense, 35%), `walls` (Catapult vs a walled city: 6.75 defense, 47%), `army` (3 Archers → Form Army, 75% → 90%), `capture` (attack a walled capital's Warrior at 64%, then move the second Legion in), and `defeat` (End Turn: three Legions take your last city, and the Defeated panel shows). Each note says what to do and what should happen, and each note's odds are computed from the rules, not typed in | unit-tested (each note's numbers and outcome through the real actions); preview-verified (all six on desktop; `walls` also in portrait emulation) |
    | B15 | Unit tests | Done: 65 new, 187 total. `tests/combat.test.ts` (38): odds formula and every modifier, best defender, loser destroyed and stack survives, veteran chance on fixed seeds, fortify cleared by moving, armies (only 3 of a type, strength, dies whole), capture (owner, size, Walls, capital flag, settlers can't), elimination (you, all rivals), Barracks, AI threshold and determinism, v3 → v4. `tests/storage.test.ts` (15): backups. `tests/scenarios.test.ts` (+12): the new scenarios | `npm test` |

  - **A3 finding (what wiped Dan's M2 game):** most likely the dev-server
    live reload, as suspected. It can't be proven from git, because round 3
    is a single commit (`79fa89e`), so the in-between states of the code
    aren't recorded. But the code path is clear: in both M2 and round 3
    code, a save that didn't load cleanly (`incompatible` or `corrupt`) went
    straight to `newGame()` + `saveToStorage()` in the same moment, with no
    backup. Vite reloads the whole page whenever a source file is saved
    (the app has no hot-update handlers), so Dan's iPad on `dev:lan`
    reloaded after every edit. While M3 was being written there were
    windows where `STATE_VERSION` was already 3 (or the load check already
    required `techs`) but the M2 → M3 migration didn't exist yet. Any reload
    in such a window would have treated the M2 save as unreadable and
    replaced it with a turn 1 game. **A related thing I saw this round:** a
    page still running *old* code also autosaves its in-memory game on
    `pagehide`. The preview browser's leftover round 3 tab wrote a v3 save
    one second before the new code loaded. This time the new code upgraded
    it and kept the original as a backup. A1 (a play build that never
    reloads) and A2 (a backup before anything is replaced) cover both.
  - **Dan's iPad checks for this round** (from "Done means"):
    - (a) Run `npm run play:lan` on the PC and open
      `http://<PC-IP>:4173/` on the iPad. Play there. It won't change while
      code is being edited; after a code update, stop it and run it again.
      It's a separate saved game from `dev:lan` (a different port), so it
      starts fresh.
    - (b) On `dev:lan`: ☰ → Dev scenarios → `Combat odds`, `Attack a
      fortified veteran`, `Attack a walled city`, `Form an army`, `Capture a
      city`, `Defeat`. Each should do what its purple note says.
    - (c) In a real game, tap an enemy next to one of your units and check
      that the odds panel makes sense before you attack.
  - **Decisions worth reviewing:**
    - Bonuses add rather than multiply (hills +50% and fortified +50% make
      +100%, not ×2.25).
    - The attacker never moves into the tile it attacked. Taking a city with
      one defender needs a second unit, or a second turn.
      **→ CHANGED by Dan (2026-09-23): when an attack kills the last
      defender in an enemy city, the winning unit advances into the city
      and captures it right away.** Open-field wins still stay put. This is
      queued for the next round.
    - Fortifying works at once and ends the unit's turn. There's no "takes
      a turn to dig in".
    - A city on hills gets both bonuses (hills +50% and city +25%).
    - Settlers defend with 1 and can be killed; they aren't captured.
    - A captured civ doesn't get a new capital (no palace move). `capitalOf`
      keeps pointing at the original owner.
    - A civ with only units left and no cities is still alive.
    - AIs are at war with each other too, and they fight.
    - The combat scenarios start from a fixed, "fair" RNG state (first roll
      about 0.48). The default test state rolls 0.98 first, which made every
      scenario's first attack lose, including a 90% army attack.
    - Toasts sit above overlays (from round 3), so the fight messages can
      cover the top of the Defeated panel for ~3 seconds.
  - **Also changed:**
    - A home Warrior in the combat scenarios starts fortified, so the
      front-line unit is the one selected when the scenario loads.
    - Tapping a visible enemy (with nothing selected) also names the unit
      and its strengths. Tapping terrain shows its defense bonus.
    - The unit panel shows attack and defense (×3 for an army).
    - New Game's confirm now says your game will be kept as a backup.
    - New files: `src/game/combat.ts` (odds, attack, fortify, armies),
      `src/game/conquest.ts` (capture, elimination), and `src/game/war.ts`.
    - `.claude/launch.json` gained `epoch-play-verify` (port 4176, serves
      `dist-play/`). `dist-play/` is git-ignored.
  - **Observed, not fixed:**
    - Late in a game the AI piles up defenders, because it builds its best
      defender once it runs out of buildings. Seed 33, 5 civs, turn 120:
      154 units and 31 armies. AI turns still take ~13 ms. For the M5 AI
      work.
    - In simulations where the human never moves, the AI wiped them out by
      turn 50–86. That's expected when everyone is at war. But an AI veteran
      Spearman (1.5 attack) will attack a Warrior at exactly 60%, so early
      raids may feel harsh. It's tunable in data.
    - You can only capture a city from the tile next to it. Tapping a
      farther enemy city says "Can't reach that tile".
    - Walls aren't drawn on the map (placeholder art). The odds panel lists
      them when you attack a walled city.

* **Round 5 — Combat follow-ups + Milestone 5 (5 civs, diplomacy, a
  smarter AI) — done by the coding agent (2026-09-24). Dan: all scenarios
  passed on the iPad (2026-09-24), and the play server was reached at
  10.0.0.224:4173.** A real-game diplomacy check needs a New Game, because
  his play save migrated from M4 is at war with everyone. Nothing pushed.
  - **Result:** 231 unit tests passing (44 new). Type-check and production
    build are clean, and the dev-code leak check passes on `dist/` and
    `dist-play/`. Preview-verified on desktop and in iPad-sized touch
    emulation (1024×768 landscape, 768×1024 portrait). The play server is
    running this build (A1).
  - **Per-item status (coding round 5):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`7d400bd`), then re-read both. Nothing from last round's report was dropped | n/a |
    | A1 | Keep the play server current | Done. Standing rule followed: at the end of this round, after tests and the docs commit, `npm run play:lan` was started **as its own background process** (not tied to this chat session), serving this build on port 4173. Addresses: see "Play server" below | Fetched the page over both LAN addresses after starting it (HTTP 200, version 5 build) |
    | A2 | Winning an attack on a city captures it | Done. When an attack kills a city's **last** defender, the winner moves in and captures it at once, with the same capture rules (owner, −1 size, Walls gone, capital flag kept, elimination check). The attacker's turn still ends. An open-field win stays put. Only land units with attack > 0 can attack at all, so only they capture. The odds panel says "It's X's last defender: if you win, your Legion moves in and takes the city", and the city panel opens after a capture. `CombatReport.capturedCityId` reports it. The `capture` scenario now needs one Legion (note updated). The AI uses the same attack, so its captures follow the rule too, and its war plan marches on a city and attacks it | unit-tested (`capture`, `victory`, and `ai-war` scenario outcomes); preview-verified (`capture`: one Legion took Pataliputra and its panel opened) |
    | A3 | "Legions can't form an army" | Done. **Reproduced the rules first: they were fine.** Three Legions inside a city form an army through the real action, and the old path (city panel → tap a unit row → the unit panel shows Form Army) also worked in a fresh scenario. **Likely cause: the button was hard to reach.** Tapping a city tile always opens the city panel, which hides the unit panel (where Form Army and Fortify live). The "Units here" list sat at the very bottom of the city panel, below the long build list. Fortified units are also skipped by Next Unit, so the Legions couldn't be selected any other way. **Fix:** "Units here" is now the first section of the city panel, each row says "tap to select", and when 3 of a type are there a **Form <Type> army** button appears right in that list. New scenario `army-in-city` | unit-tested (`army-in-city` outcome); preview-verified in landscape emulation (Form Legion army in the city panel → "Legion army ×3") |
    | A4 | `victory` scenario | Done. Your Legion army next to the last rival's only city (one Warrior, 91%). Attack → the army moves in → the rival is eliminated → the **Victory panel shows** | unit-tested; preview-verified (the Victory panel was seen on screen for the first time) |
    | B1 | 5 civs by default | Done. `RULES.defaultPlayers = 5` (replaces `milestone1Players`). `?players=` still works | unit-tested; preview-verified (a new game had 5 civs) |
    | B2 | Meeting civs | Done. `state.diplomacy.met` (symmetric). Two civs meet the first time either one's unit or city sees the other's (checked after every move, founding, capture, and turn start). First contact shows a **"You have met Maurya, led by Ashoka"** panel with Diplomacy / OK. Unmet civs don't appear in diplomacy. **Event rule finished:** log entries can carry `publicText` (civ-level news: eras, wars, treaties, trades, eliminations), shown to anyone who has met a civ involved; map-level news (a city founded, a fight) still needs the tile in sight. Entries also carry `otherText` so the victim reads "Franks declared war on you!" | unit-tested; preview-verified (`first-contact`) |
    | B3 | War and peace | Done. New games start at peace (`atWar` all false; newly met civs stay at peace). At peace, attacks are refused ("You are at peace with Maurya. Declare war in Diplomacy first") and so is entering their city ("You are at peace with Maurya"). **Declare War** is an action with an on-screen confirm. **Propose Peace** gets accepted or refused at once. After a treaty, war can't be declared for `minPeaceTurns` (15); the screen shows "treaty holds until turn N". The AI declares war and makes peace on its own (B8). Declarations and treaties are logged and announced | unit-tested; preview-verified (`peace`, `ai-war`) |
    | B4 | AI personalities | Done. Each leader in `civs.ts` has `aggression` and `tradeWillingness` (1–5): Hammurabi 2/4, Ashoka 1/4, Mansa Musa 2/5, Pachacuti 4/2, Charlemagne 5/2. They feed war choice, peace answers, demands, trade prices, and swap fairness | unit-tested |
    | B5 | Diplomacy screen | Done. **🤝 Diplomacy** in the top bar (shows "· N at war"). Met civs are listed with color, leader, War/Peace badge, and attitude. The detail shows relation (with treaty lock), attitude (friendly/neutral/hostile from recent events), city count, and rough military ("Stronger than yours"…). Actions: Declare War (confirm step) or Propose Peace; **Trade Techs** (pick one of their techs you can learn, then pay their gold price or swap one of yours they can learn); **Give 25/50/100 gold**. Every answer shows as a green ✓ or red ✗ line with a one-line reason in our own words. Side-by-side in landscape, stacked in portrait, 52 px close button, backdrop/Esc closes | preview-verified in 1024×768 landscape and 768×1024 portrait emulation |
    | B6 | AI demands | Done. A stronger (≥ 1.5× military), aggressive (aggression ≥ 3) or hostile AI may demand gold (half your gold, 20–150) or a tech. You get a **Tribute demanded** panel: Give or Refuse (it can't be closed without answering; unanswered at End Turn counts as a refusal). Refusing drops their opinion by 4, which raises their war score. Caps: not before turn 20, **once per 25 turns per civ**, a 12% roll, and only one demand waiting at a time | unit-tested (cap over 200 turns, refusal raises war score); preview-verified (`demand`: Refuse → attitude Hostile) |
    | B7 | Tech trading | Done. AIs trade only techs they have for techs they lack, or sell for gold. Never while at war or hostile. The receiver learns at once (era news too), and the giver keeps it. A tech can only go to a civ that knows its prerequisites (so the tree stays consistent). AI-to-AI swaps happen occasionally (15% × willingness/5 per AI turn), when both think the swap is fair; they're logged as "X and Y traded knowledge" and shown if you've met either | unit-tested; preview-verified (`tech-trade`: Bronze Working for Pottery, then Granary in the build list) |
    | B8 | AI competence | Done; see numbers below. **Expansion:** the city target is land tiles ÷ living civs ÷ 10 (3–10 cities; 6 on the default map), while a valid site is known within 8 tiles; 2 settlers under way at once (1 with one city). **Defender cap:** 1 defender per city while expanding, 2 after, 3 in a border city at war. The best defenders stay home (armies never do unless alone). Unit production is capped (defenders + 0.5 attackers per city in peace, 1.5 at war); past buildings and caps it builds nothing and stores production. Spare gold (above 40) rush-buys settlers and buildings. **War on purpose:** a war plan per AI (`state.aiPlans`) picks the closest known enemy city, gathers a force (3 units, an army counts 3) at its nearest own city, then marches and attacks with the odds rule. It declares war only on a met civ it's ≥1.3× stronger than, within 12 tiles, one war at a time, and only if its best attack as an army beats their best fortified city defender ≥55% of the time. **Peace when losing:** `peaceDesire` (weaker, losing more than it took, war weariness, opinion, low aggression). It stays deterministic (a 100-turn 5-AI game is identical twice). The research priority now includes Archery and Iron Working | unit-tested (war/peace choices both ways, determinism, sim city count and unit cap); sim numbers below |
    | B9 | Early-game fairness | Done. Peace on meeting, plus `aiGraceTurns` = 20: no war declarations on (and no demands of) the human before turn 20 | unit-tested |
    | B10 | Save migration v4 → v5 | Done. `STATE_VERSION` 5. Pairs whose units/cities see each other right now count as met; **relations carry over as they are** (M4 had everyone at war, so a migrated game stays at war with everyone, met or not, until peace is made). No treaties, opinions, offers, or plans yet. v2 and v3 saves chain through. The pre-upgrade save is kept as a backup | unit-tested; preview-verified (the preview browser's old v4 save loaded as v5, with "Upgraded from version 4" in backup slot 1) |
    | B11 | Dev scenarios | Done: `first-contact`, `peace`, `demand`, `tech-trade`, `ai-war` (plus A3's `army-in-city` and A4's `victory`). Dice-dependent ones (`demand`, `ai-war`) find their own fixed dice at load (`withDice`: the first RNG state for which one End Turn gives the result), so they always show it. Notes compute their numbers and reasons from the rules | unit-tested (each outcome); preview-verified (all seven) |
    | B12 | Unit tests | Done: 44 new, 231 total. `tests/diplomacy.test.ts` (30): contact (units, cities, both ways), peace blocks attacks and city entry, declaring war and its log texts, the treaty lock, AI peace answers both ways and repeatable, early-war refusal, war score both ways plus grace, treaty, and "can't win" cases, deterministic declaration, AI-AI peace, peace offers with cooldown, demand conditions and caps, paying and refusing, expiry at End Turn, tech-trade rules (prerequisites, swap, gold price, hostile/war refusal, stingy AI), gifts, event visibility with "met", the AI city count and unit cap in a 100-turn sim, and v4 → v5 (and v2 → v5). `tests/scenarios.test.ts`: the 7 new scenarios and the updated `capture` | `npm test` |

  - **B8 numbers** (all-AI simulation, 5 civs, seeds 8/13/21/33/42, 120
    turns; averages per civ):

    | | Round 4 AI | Round 5 AI |
    |---|---|---|
    | Cities at turn 50 | 3.9 | 4.8 |
    | Cities at turn 100 | 4.1 (capped at 4) | 5.8 |
    | Units at turn 120 | 32.1 (up to 57) | 18.1 |
    | Wars declared per game | 0 (everyone always at war) | 2.4 |
    | Peace treaties per game | 0 | 1.4 |
    | Cities captured per game | 3.0 | 1.8 |
    | Civs eliminated by turn 120 | 0 | 0.2 |
    | Time per round of AI turns | 12 ms | 5 ms |

    With a human who founds a capital, builds its best defender, and
    fortifies (and does nothing else), the first war on the human came on
    turns 55, 66, 79, and 101 in four seeds (none in the fifth), and the
    human was eliminated in 1 of 5 by turn 120. A human who builds nothing
    at all gets attacked around turns 28–36 and usually loses.
  - **Play server (A1):** running `npm run play:lan` on port 4173. This PC
    has two LAN addresses. **The iPad reaches http://10.0.0.224:4173/**
    (the Ethernet one; confirmed by Dan 2026-09-24). The Wi-Fi address,
    192.168.0.214, doesn't work from the iPad. It was started as a
    separate background process so it survives this chat session ending.
    It stops if the PC restarts, sleeps long enough to drop the network, or
    someone closes the Node process. **Simplest fix if it's down:** start a
    new coding round; the agent restarts it at the end of each round.
  - **Decisions worth reviewing:**
    - Relations in a migrated M4 game stay "everyone at war", as the item
      said. Dan's play save is from `play:lan`, so it'll be at war with
      every civ, met or not, until he makes peace (Ashoka and Mansa Musa
      accept easily after a few turns).
    - Attitude is always Hostile while at war.
    - An AI declares war only if it could actually take a city (its best
      attack as an army beats your best fortified city defender ≥ 55%). So
      a human with Spearmen is safe from Warrior-only rivals.
    - A tech can only be traded to someone who knows its prerequisites.
    - Peace offers and demands you don't answer count as refused when you
      end your turn. The panels can't be closed without an answer.
    - AI tech prices in gold are high (value × 1.5 × markup 1.0–1.6), e.g.
      54 gold for Pottery early on. Swaps are the practical way to trade.
    - Offer texts name the leader ("Charlemagne of Franks demands…").
  - **Also changed:**
    - The top bar has **🤝 Diplomacy** on its first line, so the second
      line doesn't slide under the city panel in landscape.
    - New `src/game/diplomacy.ts`. `learnTech` (tech.ts) is shared by
      research, trades, and tribute. New `clearBuild` action (the AI's
      "build nothing").
    - Eliminations are civ-level news now (shown to anyone who met them).
  - **Observed, not fixed:**
    - Research is still slow (Q7), which limits AI wars: until Archery or
      Iron Working, the "could it win" check keeps most AIs at peace.
    - Some civs stay at 1–3 cities when boxed in on a small landmass. That's
      the map, not a bug.
    - Grammar with plural civ names ("Franks declared war on you!") reads
      a little oddly. Leader names are used in the offer panels.

* **Round 6 — Icon candidates, research pace, mixed stacks, message
  grammar — done (2026-09-24).** Dan picked the icons (below), and
  **verified mixed stacks on the iPad.** Research pace is checked by the
  simulation, not by Dan (it's hard to judge by hand). He can glance at
  the era in the top bar: Medieval should come around turn 60–70.
  - **Result:** 241 unit tests passing (10 new). Type-check and production
    build are clean, and the dev-code leak check passes. Preview-verified
    on desktop and in iPad-sized emulation (1024×768 landscape, 768×1024
    portrait). No save change: `STATE_VERSION` stays 5, and saved games
    pick up the new numbers as they are.
  - **Per-item status (coding round 6):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`d9c99c7`), then re-read both. Nothing from last round's report was dropped | n/a |
    | A1 | Icon candidates | Done. **43 icons from game-icons.net**, 3 per unit, except Chariot and Catapult (2 each; nothing else fit). Picked for bold shapes that read at 22–31 px, and so no two unit types look alike. SVG text was fetched from the site's GitHub source (`game-icons/icons`) | Each icon fetched and checked to be a real single-shape SVG |
    | A2 | Preview page | Done: **`docs/icon-candidates.html`** (142 KB, one self-contained file; nothing loads from the web). One section per unit, candidates labeled **A / B / C**. Each one is shown large (96 px), and at real map size on grass tiles: the 31 px open-field disc and the 22 px in-city disc, in blue (Babylon) and purple (Franks). Each has its icon name and "by <author> · game-icons.net · CC BY 3.0" under it, with an overview strip of all candidates at the end. Light and dark mode, no sideways scroll on phone or iPad width. The SVGs are kept in `docs/icon-candidates/` (`<unit>-<letter>.svg`) with `SOURCES.md` (file, icon, author, source URL, license). **Picker (added on Dan's request):** tap a candidate to pick it (tap again to undo), picks are remembered on the device, and a bottom bar shows "n of 15 picked", **Next unpicked**, **Copy my picks**, and **Share** (iPad share sheet). The copied text reads "Settler: B (Farmer)" and so on, ready to paste into the chat. **Watch-outs when picking:** Musketman A and Rifleman B are both long guns and look alike small, so don't pick both. Horseman A looks like a chess knight | Every icon reference resolves in the page, and only plain credit links point to the web. Viewed in the preview browser at tablet width |
    | A3 | Stop there | Done. No icons are wired into the game. The renderer now draws every unit mark through one `drawGlyph` function (C0), so next round's icon swap touches only that | n/a |
    | B1 | Pace targets | **Done: on target.** Numbers below | `npm run sim` (5 seeds, 300 turns) |
    | B2 | Data levers | Done, data only; no rule changes. **(1) Tech cost** `16 + 10·k + 0.6·k² + 4·(tier−1)` → **`14 + 6·k + 4·(tier−1)`** (k = techs known). The squared term was the main problem: income levels off by mid-game (cities stop at about size 4–5 in a radius-1 work area), so a quadratic cost made late techs take 20+ turns. Tech 50 now costs about 320, down from about 2,000. **(2) City center trade** +1 → **+2**, which speeds up the early game, when there are few citizens. **(3) Library** +50% → **+100% science**, so libraries matter more once cities stop growing. Not touched: terrain yields, growth, the science rate | unit-tested (cost formula); sim |
    | B3 | AI wars stay sensible | Done. By turn 120 (per game, average of 5 seeds): **2.6 wars declared, 1.0 peace treaties, 0 eliminations**, against round 5's 2.4 / 1.4 / 0.2. Faster research doesn't cause constant wars or early eliminations | sim |
    | B4 | Tests | Done. Tests that hard-coded tech costs or trade now read them from data (`tech.test.ts`, `cities.test.ts`), with one test that fixes the round 6 numbers. **New `tests/pace.test.ts`:** 3 seeds × 260 turns (about 4 s). It checks the median era turns loosely (Medieval 45–80, Industrial 95–160, Modern 165–235), that someone finishes the tree by turn 260 in every game, and at most 1 elimination per game by turn 120. `npm run sim` prints the full report (`scripts/pace-report.sim.ts`, kept out of `npm test`) | `npm test` |
    | C0 | Mixed stacks | Done. **Map:** when a tile holds more than one unit type (yours, or a rival's in sight), a **second, smaller disc of another type peeks out behind** the top one (upper left; straight up in a city), with its own letters, next to the count badge. The one behind is the strongest other defender. **Unit panel:** when the selected unit shares its tile, it shows "**Mixed** 4 units here: 1 Warrior, 3 Legions", a button for **every unit** (type, army ×3, ★, 🛡, moves; the selected one is outlined; tap to select), and a **Form <Type> army** button for **every type with 3 on the tile**, not just the selected unit's type (the old single Form Army button is gone). The city panel uses the same rule. **Tapping a rival stack** says what's in it: "Mauryan mixed stack: 1 Spearman, 1 Archer". It works with icons later: the unit's look is drawn only in `drawGlyph`. New scenario **`mixed-stack`** (Dan's case: a Warrior on top of 3 Legions, and a rival Spearman + Archer). Pure helpers in `src/game/stack.ts` | unit-tested (`tests/stack.test.ts`, `mixed-stack` outcome); preview-verified on desktop and in 1024×768 / 768×1024 emulation: both discs drawn, the list selects units, Form Legion army worked with the Warrior selected, the rival tap listed both units |
    | C1 | Plural civ names | Done. **Style: the civ's proper form**, not the leader, because era, capture, and elimination news reads oddly with a person's name. "**The Franks declared war on you!**", "The Inca have been eliminated", "You refused the Franks' demand", "Charlemagne of the Franks demands…", and "You have met the Franks, led by Charlemagne". Singular names stay as they were ("Babylon declared war on you!"). Data: `article: 'the'` and `plural: true` on Franks and Inca in `civs.ts`. Helpers in `conquest.ts`: `civName` (mid-sentence), `CivName` (starts a sentence), `civPossessive`, `civVerb` (has/have, is/are). Every message and dialog line that names a civ uses them. Labels and lists keep the bare name ("Franks") | unit-tested (3 new tests: war news for all three viewers, offer text and the possessive, a plural elimination) |

  - **Dan's icon picks (2026-09-24), from the page's picker.** Files are
    `docs/icon-candidates/<unit>-<letter>.svg`; authors are in `SOURCES.md`:

    | Unit | Pick | Icon (author) |
    |---|---|---|
    | Settler | A | Old Wagon (Delapouite) |
    | Warrior | B | Caveman (Delapouite) |
    | Archer | A | Bowman (Lorc) |
    | Spearman | A | Spartan (Lorc) |
    | Horseman | B | Horse Head (Delapouite) |
    | Chariot | A | Chariot (Cathelineau) |
    | Legion | A | Centurion Helmet (Delapouite) |
    | Catapult | A | Catapult (HeavenlyDog) |
    | Pikeman | A | Pikeman (Delapouite) |
    | Knight | A | Mounted Knight (Skoll) |
    | Musketman | B | Blunderbuss (Lorc) |
    | Cannon | A | Cannon (Lorc) |
    | Rifleman | B | Lee Enfield (Skoll) |
    | Artillery | B | Mortar (Delapouite) |
    | Tank | B | Tank (Lorc) |

    Checked side by side at both map sizes (31 px and 22 px): every file
    exists, and no two picks look alike. Archer and Pikeman are the closest
    (both standing figures), but the bow and the pike tell them apart.
    **Not wired in yet**, per A3: the next round implements this set, plus
    the About / Credits screen and `CREDITS.md`.

  - **B1 numbers** (all-AI simulation, 5 civs, seeds 8/13/21/33/42):

    | | Before (round 5 data) | After | Target |
    |---|---|---|---|
    | Medieval era, median civ | turn 102 | **turn 67** (first: 58) | 50–70 |
    | Industrial era, median civ | not reached by 250 (first: 208) | **turn 115** (first: 106) | 120–150 |
    | Modern era, median civ | never | **turn 207** (first: 167) | 180–220 |
    | First civ to finish the tree | never (best: 27 of 50 techs at 250) | **turns 210, 219, 219, 230, 292** (median 219) | ~250 |
    | Average techs at turns 25 / 50 / 100 / 150 / 200 / 250 | 1.9 / 4.6 / 9.9 / 14.4 / 17.6 / 20.1 | 3.0 / 7.3 / 18.2 / 28.2 / 35.8 / 41.0 | |
    | Wars / peace treaties / eliminations by turn 120, per game | 2.4 / 1.4 / 0.2 | 2.6 / 1.0 / 0 | |

    Industrial comes about 5 turns early, and Modern is on target. I
    couldn't make Industrial later without also delaying the finish: the
    AI researches the shallowest techs first, so eras follow the tech
    count, and income levels off late. Seed 33 finishes the tree late (292),
    with a boxed-in, low-trade civ. I left both for the M9 balance pass.
  - **Decisions worth reviewing:**
    - Tech cost has no squared term any more. Each tech costs 6 more than
      the last (plus 4 per tier of depth). Tech-trade gold prices follow
      the cost, so they're lower too.
    - Library +100% science (Civ Rev's Library is +50%; ours is higher
      because our cities stay small).
    - Civ names in messages rather than leader names (C1).
    - The second disc shows another *type* only. Two Legions and a Legion
      army count as one type on the map, but the panel lists them
      separately ("1 Legion army, 2 Legions").
  - **Also changed:**
    - `src/dev/sim.ts`: an all-AI simulation (era turns, techs over time,
      wars, peace, eliminations), used by the pace test and `npm run sim`.
    - The `army-in-city` note now says to use the city panel's Form Legion
      army button.
  - **Observed, not fixed:**
    - AIs pile up gold they never spend: 1,000–2,600 by turn 250, with the
      science rate fixed at 60%. An AI that raised its science rate or spent
      more would research faster. That's an AI behavior change, not data,
      so I left it for the balance pass.
    - City growth levels off around size 4–5 (a radius-1 work area, and
      grassland only feeds its own worker). It's the main brake on late
      income.
  - **Pushed** to `origin/main` at the end of the round (`07fdd44`), and the
    play server was restarted with this build at http://10.0.0.224:4173/.
  - **Follow-ups after the round report (2026-09-24, same session):**
    - **Picker on the icon page (Dan's request):** instead of typing a list,
      Dan taps one candidate per unit; a bottom bar counts the picks, and
      **Copy my picks** / **Share** give him the list to paste. Picks are
      remembered on the device. Preview-verified at iPad size (picking,
      undo, count, saved picks, copied text). The clipboard itself was only
      checked by hand-off to Dan, who used it successfully. `b033636`.
    - **Dan's picks recorded** (table above) and checked side by side at
      map size. `e43c14b`.
    - Game code didn't change, so the play server wasn't restarted (it's
      already serving this round's build).

* **Round 7 — Unit icons in the game + Milestone 6 (wonders, culture, and
  victory) — done (2026-09-24). Dan reviewed it and moved on to round 8.**
  He didn't report the individual checks (a)–(c); any issues he finds
  later get their own item.
  - **Result:** 308 unit tests passing (67 new). Type-check and production
    build are clean, and the dev-code leak check passes. Preview-verified on
    desktop and in iPad-sized touch emulation (1024×768 landscape, 768×1024
    portrait). **Save format 6** (a v5 game is upgraded, with the original
    kept as a backup). Package version is now 0.7.0 (shown on the About
    screen).
  - **Per-item status (coding round 7):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`295219d`), then re-read both. Nothing from last round's report was dropped | n/a |
    | A1 | Wire in the 15 icons | Done. Dan's picks copied from `docs/icon-candidates/` into **`src/assets/icons/<icon-name>.svg`** (e.g. `old-wagon.svg`). They're bundled into the game's JavaScript as text (Vite `?raw`), so nothing is ever loaded from the web. Each unit in `units.ts` has an **`icon`** field naming its file; the letters stay as `glyph`, the fallback | unit-tested (`tests/icons.test.ts`: every unit's file exists, is one `currentColor` shape with no web links, every type looks different, every used icon is credited in data and in CREDITS.md, and nothing unused is credited); production build checked (icons inside the JS bundle) |
    | A2 | Map drawing | Done, in `drawGlyph` only (`renderer.ts`) plus `src/render/icons.ts`. Each icon is rasterized once per icon, color, and pixel size (rounded to 4 device px, so pinch-zoom doesn't make a bitmap per frame) and cached; while a new size loads, the nearest ready size is scaled, and the letters show only until the first one loads, or if an icon is missing. **Drawn white on the owner's colored disc**, exactly as on the picker page Dan chose from (see "Decisions" below). The army ring and ×3, the fortified shield, the count badge, the selection ring, and the mixed-stack second disc (with its own icon) are all unchanged | preview-verified (`all-units` scenario on desktop and 1024×768 emulation: every icon drawn, army ring, shield, mixed stack) |
    | A3 | Icons in the UI | Done. The icon on a small owner-colored disc appears in: the unit panel, its stack list, the city's "Units here", the build list (units), **both sides of the odds panel**, the tech screen's unlocks, and About / Credits. **The diplomacy military summary shows no units** (it's a phrase like "Stronger than yours"), so there's nothing to put an icon on there | preview-verified (odds panel had 2 icons, build list 2, About 15) |
    | A4 | Credits | Done. **`CREDITS.md`** lists each used icon: unit, icon name, author, source link, CC BY 3.0. **☰ → About / Credits** (in every build) shows "Epoch (working title) · version 0.7.0 · save format 6", a one-line description, and the same 15 credits, each with its icon and a source link, plus links to game-icons.net and the license. Credit data lives in `src/data/icons.ts`; the test keeps it, the files, and CREDITS.md in step. Authors: Delapouite, Lorc, Cathelineau, HeavenlyDog, Skoll | unit-tested; preview-verified in 768×1024 portrait (15 rows, scrolls inside the dialog, no sideways scroll) |
    | A5 | `all-units` scenario | Done. One of each of the 15 unit types in two rows north and south of your capital (table order), plus a Legion army, a veteran Spearman, a fortified Pikeman, a mixed stack (a Musketman with two Archers), and four rival units in their color. Everyone is at peace, so nothing fights | unit-tested (outcome); preview-verified |
    | B1 | Culture | Done. Each city makes culture per turn from its buildings (**the Temple: 1**) and its wonders (2–12 each). It's added to the civ's `culture` total at the end of its turn and never goes down. Shown on the victory screen (total and +per turn for every civ you've met), in diplomacy (a new Culture line), and in the city panel (the city's own per turn). Not in the top bar. No borders or flipping | unit-tested; preview-verified |
    | B2 | Wonders | Done: **13 wonders plus 2 victory wonders** in `src/data/wonders.ts` (our own descriptions and effects). Ancient: Pyramids (+25% production), Hanging Gardens (+2 food), Colossus (+100% gold), Oracle (5 culture). Medieval: Great Library (+100% science), Great Wall (free Walls in every city you hold), War Academy (all new units veterans), Grand Bazaar (+25% gold everywhere), Grand Cathedral (8 culture). Industrial: Royal Observatory (+25% science everywhere), Grand Workshop (+25% production everywhere). Modern: Broadcast Tower (12 culture), Global Network (+50% science everywhere). Each is tech-unlocked, **one per world**, built in a city like a building, and **can't be bought**. A wonder stays with its city if it's captured. **The race rule:** when someone finishes a wonder, every other city building it keeps its production and asks for a new choice ("Maurya finished the Colossus first. Babylon keeps its 43 production; choose something new."), and it's gone from every build list. Completions are **world news** for everyone who has met the builder. The build list marks wonders ("Wonder, one per world", plus "someone else is building it too" when a rival is), the city panel lists the city's wonders, and the victory screen has a "Wonders of the world" list (who built each, if you've met them) | unit-tested (uniqueness, the race, can't buy, every kind of effect, captured wonders, data sanity); preview-verified (`wonder`, `wonder-race`) |
    | B3 | The four victories | Done in **`src/game/victory.ts`, one function each**: `dominationWon`, `cultureWon`, `economicWon`, `technologyWon`, checked by `checkVictory` after every action and every player's turn (the player whose turn it is first, then the rest). **Domination:** hold every rival's original capital (`capitalOf`); an eliminated rival counts, so the old "every rival eliminated" win is now a domination win. **Culture:** reach **4000** culture, then build the **World Council** (needs Philosophy). **Economic:** have **5500** gold, then build the **Global Exchange** (needs Economics). **I chose production** for it, like any wonder; the treasury must still hold the goal when it's finished (it waits otherwise). **Technology:** learn Space Flight, build **3 parts** (180 production each, buyable) **in your capital** (the city whose `capitalOf` is you), tap **🚀 Launch spaceship** (city panel or victory screen), and it **arrives at the start of turn launch + 12**, winning. If your capital is captured first, the ship and its parts are lost (world news). The launch is world news. First to meet any condition wins; if a rival wins, you lose. Numbers are in `src/data/victory.ts` | unit-tested (each victory both ways; arrival timing; loss on capture; first win kept; a rival winning) |
    | B4 | Victory progress screen | Done: **🏆 in the top bar** (next to Diplomacy) and **☰ → Victory progress**. One card per civ: you first, then every other civ. Each shows Domination (rival capitals held, n/4), Culture (total/4000, +per turn, and "building the World Council" when they are), Economic (gold/5500, same for the Global Exchange), and Technology (not started · n/50 techs / Space Flight known / building n/3 parts / **Launched: arrives on turn N** in orange), each with a bar. **Civs you haven't met show as "Unknown civ"** in grey (no name or color); eliminated ones say so. A rules strip at the top explains all four, and "Wonders of the world" is at the bottom. Cards sit side by side in landscape and stack in portrait; only the body scrolls | preview-verified (1024×768 and 768×1024: no sideways overflow, every button ≥ 44 px) |
    | B5 | Victory and defeat screens | Done, replacing the M4 panels. **Win:** 🏆, "Culture victory!", "You won on turn N: you built the World Council after reaching 4000 culture." **A rival wins:** "Defeat", "Maurya won a technology victory on turn 201: their spaceship arrived. The game is theirs." Both have a stats table (cities, techs, wonders, culture, gold) for the winner and you, and **New Game** / **Keep playing**. **Keep playing** is an action (`keepPlaying`, saved in the game): it closes the screen, stops all victory checks for the rest of that game, and the win stays on record (the victory screen says so). **Eliminated:** "Defeated", with New Game / Look at the map, as before. In a dev scenario, New Game reads "Back to my game" | unit-tested (Keep playing); preview-verified (`win-culture` → Keep playing → End Turn: stays closed; `lose-space`; `win-domination`; `win-space`) |
    | B6 | Near-win warnings | Done. At the end of each round, `issueWarnings` checks every civ you've met: **a spaceship launched** ("… arrives on turn N. Capture X, their capital, before then to stop it."), **culture or gold past 75%** of its goal, or **holding all but one rival capital**. Each shows once as a **"Close to winning!" panel** with a Victory progress button (a relaunch after a loss warns again). Unmet civs never trigger one. Stored in the save (`warned`), so a reload doesn't repeat them | unit-tested (74% no / 75% yes, launch text, domination, once only, unmet civs); preview-verified (`near-win-warning`) |
    | B7 | AI goes for victories | Done. **`src/game/aiGoals.ts`:** each AI leans toward one victory from its personality plus its progress (weights in `RULES.ai.victory`): **Hammurabi → technology, Ashoka → culture, Mansa Musa → economic, Pachacuti and Charlemagne → domination**. The goal picks its first building (Library / Temple / Marketplace / Barracks), whether wonders come before buildings (culture) or after, and war keenness (+2 war score and twice the peacetime attackers for domination). **Every AI builds wonders**, one at a time in its most productive city, and builds a **victory wonder or spaceship part as soon as it can**, and **launches at once**. **Gold hoarding fixed:** spare gold rush-buys buildings, settlers, spaceship parts, and (at war) units; when gold piles up past 150 + 20 per city the science rate goes to 100%, and back to 60% once it drops to 80. An AI going for the economic win sets science to 30% and doesn't spend below the goal. Still deterministic | unit-tested (leanings, progress shifting the lean, victory wonder and spaceship choice, launch, rich AI spends and raises science, economic AI saves); sim below |
    | B8 | Save migration v5 → v6 | Done. `STATE_VERSION` 6. Culture 0, no spaceship, no wonders in any city, nobody has won, no warnings given. v2–v4 saves chain through. The pre-upgrade save is kept as a backup as usual, and the notice says "updated for wonders, culture, and victory" | unit-tested; preview-verified (the preview browser's real v5 save loaded as v6, with "Upgraded from version 5" in the backups) |
    | B9 | Dev scenarios | Done: `wonder`, `wonder-race`, `win-domination`, `win-culture`, `win-economic`, `win-space`, `lose-space`, `stop-launch`, `near-win-warning` (plus A5's `all-units`). Each note says what to do and what should happen, with its numbers (goals, odds, turns) computed from data | unit-tested (each outcome through the real actions); preview-verified (all except `win-economic`, which shares its code path with `win-culture` and is covered by its test) |
    | B10 | Unit tests | Done: 67 new, 308 total. New `tests/victory.test.ts` (30): culture adding up; wonder uniqueness, the race rule, no buying, every kind of effect, captured wonders; each victory both ways; spaceship parts, launch, arrival timing, and loss on capture; first win kept; Keep playing; warning thresholds, once only, unmet civs; AI leanings, victory wonder and spaceship choice, launch, gold spending, economic saving; v5 → v6 and v2 → v6. `tests/icons.test.ts` (17). `tests/scenarios.test.ts`: the 10 new scenarios. **`pace.test.ts` still passes, and now also checks that every sim game has a winner, never before turn 150** (the sim records the first win and plays on, so the era numbers still cover the whole tree). Three older tests were updated for the new rules: Pottery now also unlocks Hanging Gardens; in a 2-civ test, taking the only rival capital is now also a domination win; and Maurya (culture) now starts a wonder before its buildings | `npm test` |

  - **B7 simulation** (`npm run sim`, all-AI, 5 civs, seeds 8/13/21/33/42,
    300 turns):

    | Seed | Winner | Victory | Turn |
    |---|---|---|---|
    | 8 | Franks | Technology | 246 |
    | 13 | Babylon | Technology | 210 |
    | 21 | Mali | Economic | 223 |
    | 33 | Babylon | Culture | 221 |
    | 42 | Mali | Economic | 179 |

    **No game ends before turn 150** (earliest 179, median 221, toward the
    ~250 target). Three victory types appear; **domination never happened**
    in these runs (see "Observed" below). Research pace is still on target
    after the AI started spending its gold: median Medieval turn 69,
    Industrial 122, Modern 198 (targets 50–70, 120–150, 180–220); the first
    civ finishes the tree on turns 191–215. Wars 2.0 / peace 0.6 /
    eliminations 0.2 per game by turn 120. **Tuning done:** the first run had
    culture wins on turns 144–169, so the culture goal went 1500 → 4000, gold
    2500 → 5500, spaceship parts 120 → 180 production, travel 10 → 12 turns.
  - **Dan's iPad checks for this round** (from "Done means"), on `dev:lan`
    for the scenarios and `play:lan` for a real game:
    - (a) ☰ → Dev scenarios → **All unit icons**: every icon should be
      clear at map size, including pinch-zoomed out. Then in a real game,
      check the icons read well.
    - (b) The victory scenarios (**Win: domination / culture / economic /
      spaceship arrives**, **Lose: rival spaceship**, **Stop a spaceship**,
      **Near-win warning**, **Wonder finishes**, **Wonder race lost**), and
      🏆 Victory progress.
    - (c) ☰ → **About / Credits**.
  - **Decisions worth reviewing:**
    - **Icon color:** the item said "draw each icon in the owner's color on
      the unit disc". An owner-colored icon on an owner-colored disc would be
      invisible, so the icon is **white on the owner's colored disc**, as on
      the picker page Dan chose from. The code takes a color, so switching to
      e.g. a white disc with a colored icon is a one-line change.
    - Wonders can't be bought; spaceship parts can.
    - The Global Exchange is paid for in production. The 5500 gold is only
      needed in the treasury when it's started and finished; it isn't spent.
    - The two victory wonders also need a tech (World Council: Philosophy;
      Global Exchange: Economics).
    - The spaceship is built only in your **original** capital. There's still
      no palace move, so a civ that has lost its capital can't build or launch
      one until it takes the capital back.
    - A ship "arrives on turn N" means at the start of turn N, before anyone
      moves that turn.
    - Domination doesn't require holding your own capital; eliminated rivals
      count as held. In a 2-civ game, taking the rival's capital wins at once.
    - Wonders go with their city when it's captured (the new owner gets the
      effects).
    - The Temple gives 1 culture per turn. Wonders give 2–12.
    - The AI's lean is recomputed every turn from personality plus progress,
      so a civ that falls behind or races ahead can change goals. Technology's
      base is 3.5 so Hammurabi (whose economic base ties at 3) doesn't flip
      to economic the moment he has some gold.
  - **Also changed:**
    - New files: `src/data/victory.ts` (goals, spaceship, warning line, the
      spaceship-part "project"), `src/data/icons.ts`, `src/game/victory.ts`,
      `src/game/wonders.ts`, `src/game/aiGoals.ts`, `src/render/icons.ts`,
      `src/assets/icons/`, `CREDITS.md`, `tests/victory.test.ts`,
      `tests/icons.test.ts`.
    - A build item can now be a unit, building, **wonder**, or **project**
      (the spaceship part). `completionBlocker` takes the state.
    - `applyAction` checks for a win after every successful action; new
      actions `launchSpaceship` and `keepPlaying`.
    - `vite.config.ts` injects the package version (`__APP_VERSION__`);
      `tsconfig.json` has `resolveJsonModule` for that.
    - The city panel shows the city's culture, its wonders, and (in the
      capital, once Space Flight is known) the spaceship with a Launch
      button.
    - `npm run sim` now prints each game's winner and each civ's goal,
      culture, gold, science rate, parts, and wonders.
  - **Observed, not fixed:**
    - **Domination never won in the sim.** The conquest-minded AIs
      (Charlemagne, Pachacuti) fight a few wars but rarely take capitals,
      and late in the game their lean drifts to technology as their tech
      count grows. Worth a look in the balance pass, or with M8 leaders.
    - The earliest win was Mali's economic win on turn 179 (seed 42, an
      8-city Mali). Still well past 150.
    - In the preview browser, screenshots of the page came back as a zoomed
      corner (a device-pixel-ratio quirk of the pane), so most layout checks
      were done by measuring the page (overflow, sizes, tap targets) rather
      than by eye. The map icons were seen on screen.

* **Round 8 — Naval (ships, sea techs, transports) + ship and aircraft icon
  candidates — done. APPROVED by Dan (2026-09-24).** Icons were picked,
  the Carrier was trimmed, fleets were added, and the ship icons were
  wired in early.
  - **Result:** 354 unit tests passing (46 new). Type-check and production
    build are clean, and the dev-code leak check passes. Preview-verified on
    desktop and in iPad-sized touch emulation (768×1024). **Save format 7**
    (a v6 game is upgraded, with the original kept as a backup). Package
    version 0.8.0.
  - **Per-item status (coding round 8):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`ca262d8`), then re-read both. Nothing from last round's report was dropped (the lines removed were the old Round 7 task list) | n/a |
    | A1 | Ship and aircraft icon candidates | Done. **35 candidates from game-icons.net** for the 14 types: Galley, Caravel, Destroyer, Submarine, Fighter, Bomber, and Stealth Bomber have 3; Frigate, Ironclad, Transport, Battleship, Carrier, Jet Fighter, and Helicopter have 2 (the site has few ship and plane icons; Carrier B and Helicopter B are stand-ins, see the page's notes). Authors: Delapouite, Cathelineau, Lorc, Skoll, Pierre Leducq, Quoting | Each file checked to be one `currentColor` shape; page checked below |
    | A2 | Picker page | Done: **`docs/ship-air-icon-candidates.html`** (about 156 KB, self-contained), built like the round 6 page: A/B/C labels, each candidate large (96 px) and at map size **white on the owner's disc** (31 px and 22 px, blue and purple). **Ships sit on ocean-colored tiles, aircraft on grass and ocean.** Author credit under each; tap to pick (tap again to undo), picks remembered on the device (its own key, so the old page's picks stay); "n of 14 picked", **Next unpicked**, **Copy my picks** ("Galley: B (Trireme)"), **Share**. A "Watch out" note under each unit, and an overview strip that also shows the 15 land icons in use for comparison. SVGs in `docs/ship-air-icon-candidates/` with `SOURCES.md` | Viewed in a preview browser (by a helper agent): picking, undo, saved picks, copied text; no sideways scroll at 375 and 550 px; bar buttons 44 px. Every candidate file is on the page |
    | A3 | Ships use letters until Dan picks | Done. Ships have no `icon` yet, so the map and panels draw their letters (Ga, Cv, Fr, Ic, Tr, De, Bs, Su, Cr). Nothing from the page is wired in. The icon test now covers land units only, and checks that no ship has an icon yet | unit-tested; preview-verified (`all-ships`) |
    | B1 | Sea techs | Done. **Map Making** (Ancient, tier 2, needs Alphabet), **Seafaring** (Medieval, tier 3, Pottery + Map Making), **Navigation** (Medieval, tier 4, Seafaring + Astronomy), **Magnetism** (Medieval, tier 5, Navigation + Iron Working), with our own descriptions. **54 techs now.** The later ship techs already existed (Steam Engine, Industrialization, Combustion, Automobile, Flight), so nothing else was added. A boxed-in AI researches Map Making, Seafaring, and Navigation first. Pace before/after below | unit-tested (tree valid, tiers = depth); `npm run sim` |
    | B2 | Ship units | Done, 9 ships (numbers below), with attack, defense, moves, sight, and **cargo** in `units.ts` (new fields `domain`, `cargo`, `coastOnly`, `stealth`) | unit-tested |
    | B3 | Where ships go | Done. Ships move only on water, 1 move per tile; **a Galley only on coast tiles** ("A Galley can’t leave the coast"); a ship can dock in its own **coastal** city (not an enemy's). **Only coastal cities build ships and Harbors**; the build list hides them elsewhere and `setBuild` says "Needs a coastal city" | unit-tested; preview-verified (`galley-coast`: highlights are coast only) |
    | B4 | Carrying land units, touch-first | Done. **Boarding:** select a land unit and tap a friendly ship next to it with room (it can also walk several tiles and board at the end), or in a city use the unit panel's **⚓ Board the Galley** button. Boarding uses up the unit's move. **Cargo moves with the ship.** The ship's disc gets a **teal cargo badge** (the black stack badge no longer counts cargo); its panel says "cargo 2/2" and lists the cargo (⚓ aboard; tap to select). **Unloading:** select a cargo unit (tap the ship's tile again to cycle to it) and tap an adjacent land tile; it costs the unit's move. In port there's a **Go ashore here** button. No unloading onto enemy units; **no attacking from a ship**; unloading into an empty enemy city at war captures it. **A sunk ship takes its cargo with it** (message says so); **ships and cargo in a captured city are lost** (logged). Next Unit and the End Turn pulse skip cargo | unit-tested; preview-verified with real taps on desktop (board both, sail, badge, unload the Settler) |
    | B5 | Naval combat | Done. Ships attack ships with the normal odds rule (no terrain bonus at sea). **Bombard:** a ship attacks a land unit or city next to it; win = the defender dies but **the ship never moves in or captures**; lose = the ship sinks. **Walls don't count against ships** (they were already "against land attacks"). Land units can't attack ships at sea. **Ships in a city don't defend it**: a city with only ships in port counts as empty. **No naval armies** ("Ships can’t form armies"). I wasn't certain whether Civ Rev 1 allowed fleets, so I kept Q11's default. **→ Changed by Dan the same day: naval armies ("fleets") are in; see below.** The odds panel explains bombarding and warns when a ship carries units | unit-tested; preview-verified (`bombard`: 76%, Warrior destroyed, Frigate stayed, Taxila still Mauryan) |
    | B6 | Harbor | Done. Needs Seafaring, coastal cities only, cost 60, **+1 food on every water tile the city works** (and the automatic tile picker counts it). **Water yields checked and left as they are:** coast 1/0/2, ocean 1/0/1. Without a Harbor a water tile doesn't feed its worker; with one, coast (2/0/2) beats grassland (2/0/1) and ocean equals it, so the Harbor is what makes a coastal city grow. The AI builds it after the Library | unit-tested; preview-verified (`harbor`: food +0 → +3) |
    | B7 | Several landmasses | Done, and **it needed tuning.** Before: in **76 of 100 seeds all 5 civs started on one continent**, no seed gave every civ its own landmass, and only 22% had an empty island. **Change (data in `RULES.map`):** water channels are cut along the lines halfway between 3–4 random continent centers, and no civ starts on a landmass under 20 tiles. After (100 seeds): **all on one continent 6%**; start landmasses 1/2/3/4/5 distinct = 6/33/46/15/0 seeds, so **most games put civs on 2–3 landmasses, some shared**; **every civ alone: 0%** (5 civs rarely each get their own continent on a 32×24 map); **an empty island with room for a city in 58% of seeds** (room for 2+ cities in 33%). Fairness: every civ's home landmass has at least 20 land tiles, and the 10th-percentile civ has 27 city-site tiles | unit-tested (40 seeds: ≤ 20% all-together, ≥ 30% empty island); `npm run sim` prints it |
    | B8 | AI uses the sea | Done, in new **`src/game/aiNaval.ts`**. **Boxed in** (below its city target with no site it can walk to; open sites now count per landmass): research the sea techs, build a boat in its first port, explore the coast. **Settling overseas:** once it knows a good site on another landmass its ship can reach, the port builds a Settler, the Settler and an **escort** board, the ship sails next to the site, they land, and the city is founded. **Invading:** when its war target is on a landmass where it has no city, its force gathers at a port, boards (**armies count as one**), sails next to the target, and lands next to it (or straight into it if empty); a log line "The Inca landed troops near Metz!" (you always see it when it's your city). A civ at war with no target in sight sends a boat to look. **Coastal defense:** once a met rival has ships, it keeps up to 2 warships in port, attacking enemy ships (or bombarding) nearby at ≥ 60% odds. Voyages may be planned through unexplored water, like land paths. Still deterministic. Sim numbers below | unit-tested (ferry founds overseas, identical twice; boxed-in research; ships only in ports); `ai-overseas` preview-verified; sim |
    | B9 | Save migration v6 → v7 | Done. `STATE_VERSION` 7: no unit is aboard a ship (`carriedBy: null`), no AI has a sea plan (`aiFerries`), the new techs are simply unknown. v2–v5 saves chain through. The pre-upgrade save is kept as a backup as usual; the notice says "updated for ships and the sea" | unit-tested (v6 → v7, v2 → v7) |
    | B10 | Dev scenarios | Done, all 9: `board-unload`, `galley-coast`, `naval-battle` (57%), `bombard` (76%), `ship-sunk-cargo`, `amphibious-capture`, `harbor`, `ai-overseas`, `all-ships`. Odds and food numbers in the notes are computed. `all-units` now shows the 15 land units only (ships have `all-ships`) | unit-tested (each outcome); preview-verified: `board-unload`, `bombard`, `all-ships`, `ai-overseas`, `harbor` (the others through their tests only) |
    | B11 | Unit tests | Done: 46 new, 354 total. New **`tests/naval.test.ts`** (27): sea techs and tree, ship data, water-only movement, the Galley rule, docking, coastal-only building, boarding (adjacent, by walking, in port), cargo moving and capacity, unloading and its limits, no attacking from a ship, land can't attack ships, tapping selects the ship first, naval combat with cargo lost, bombard (no capture, no Walls), a lost bombard, ships lost with a captured city, amphibious capture, no naval armies, submarine visibility, the Harbor, the landmass stats, the AI ferrying a settler (deterministic), boxed-in research, ships only in ports, v6 → v7 and v2 → v7. `tests/scenarios.test.ts`: the 9 new scenarios. **`pace.test.ts` still passes.** Three older tests changed: the tech count range (40–50 → 40–60); the M1 AI test now checks the *starting* Settler founded a city (on the new map the AI builds a second Settler by turn 10); `all-units` expects land units only | `npm test` |

  - **Ship stats** (placeholders, all in `units.ts`):

    | Ship | Tech | Cost | Att | Def | Moves | Sight | Cargo | Notes |
    |---|---|---|---|---|---|---|---|---|
    | Galley | Map Making | 30 | 1 | 1 | 3 | 1 | 2 | coast only |
    | Caravel | Navigation | 40 | 1 | 2 | 3 | 2 | 3 | open ocean |
    | Frigate | Magnetism | 50 | 4 | 3 | 4 | 2 | 2 | fights and carries |
    | Ironclad | Steam Engine | 60 | 7 | 5 | 4 | 1 | 0 | strong attacker for its era (bombarding coasts) |
    | Transport | Industrialization | 50 | 0 | 4 | 5 | 1 | 8 | no attack |
    | Destroyer | Combustion | 60 | 8 | 6 | 6 | 2 | 0 | fast |
    | Battleship | Automobile | 120 | 16 | 12 | 4 | 2 | 0 | strong |
    | Submarine | Combustion | 70 | 14 | 3 | 4 | 2 | 0 | seen only from next to it |
    | Carrier | Flight | 100 | 2 | 14 | 4 | 2 | 0 | strong defense; carries planes in round 10 |

  - **B1 pace, before → after** (`npm run sim`, all-AI, 5 civs, seeds
    8/13/21/33/42, 300 turns):

    | | Before (round 7) | After (round 8) | Target |
    |---|---|---|---|
    | Medieval era, median civ | 69 | **63** (first: 39) | 50–70 |
    | Industrial era, median civ | 122 | **119** | 120–150 |
    | Modern era, median civ | 198 | **185** | 180–220 |
    | First to finish the tree, per seed | 193, 194, 191, 215, 212 (50 techs) | 196, 195, 169, 195, 197 (54 techs) | ~250 |
    | Winners | turns 179–246 (Tech ×2, Econ ×2, Culture) | **turns 201–232** (Tech ×4, Econ ×1) | none before 150 |
    | Wars / peace / eliminations by turn 120, per game | 2.0 / 0.6 / 0.2 | 1.8 / 1.4 / 0 | |

    Medians stay on target (Industrial one turn early). The first civ to
    enter the Medieval era is earlier (39): a boxed-in civ now goes for
    Seafaring, a cheap Medieval tech. The new maps give a little more
    growth (Harbors, overseas cities), which offsets the 4 extra techs.
  - **B8 simulation** (same runs): **overseas cities founded: 1.6 per
    game** (8 in 5 games: Maurya 3, Franks 3, Babylon 1, Mali 1); **naval
    invasions: 0.2 per game** (1 landing in 5 games); **ships per civ: 0.4
    at turn 100 (max 1), 1.6 at turn 200 (max 3)**. **Domination wins: still
    none** (Technology ×4, Economic ×1). Invasions are rare because AI wars
    are rare (about 2 per game) and mostly between neighbors on the same
    landmass. When I forced an overseas war at turn 130 in 4 seeds, the
    attacker scouted by sea, shipped its force (a Catapult army among
    them), and landed next to the enemy city in 3 of 4 (one sea battle on
    the way: an Incan Frigate sank a Frankish Galley at 80%).
  - **Dan's ship and aircraft icon picks (2026-09-24), from the picker
    page.** Files are `docs/ship-air-icon-candidates/<unit>-<letter>.svg`;
    authors are in that folder's `SOURCES.md`. **All wired in:** the 9 ships
    in Round 9 Part A, the 5 aircraft in Round 10 (credited in
    `src/data/icons.ts`, `CREDITS.md`, and About / Credits).

    | Unit | Pick | Icon (author) |
    |---|---|---|
    | Galley | C | Drakkar (Delapouite) |
    | Caravel | A | Caravel (Delapouite) |
    | Frigate | B | Schooner Sailboat (Pierre Leducq) |
    | Ironclad | B | Paddle Steamer (Delapouite) |
    | Transport | A | Cargo Ship (Delapouite) |
    | Destroyer | B | Speed Boat (Delapouite) |
    | Battleship | A | Battleship (Cathelineau) |
    | Submarine | A | Submarine (Delapouite) |
    | Carrier | A, **trimmed** (`carrier-a-trimmed.svg`) | Carrier (Cathelineau), modified: waves removed, cropped |
    | Fighter | B | Biplane (Quoting) |
    | Bomber | B | Carpet Bombing (Skoll) |
    | Jet Fighter | A | Jet Fighter (Delapouite) |
    | Stealth Bomber | A | Stealth Bomber (Delapouite) |
    | Helicopter | A | Helicopter (Delapouite) |

    **Watch-outs from the picker page:**
    - **Battleship A and Carrier A** look nearly identical at 22 px. Dan
      kept both (the B options are worse) and chose to **edit the Carrier**
      (2026-09-24): `docs/ship-air-icon-candidates/carrier-a-trimmed.svg`
      drops the wave lines and is cropped a little larger, so it reads as a
      flat deck with a plane while the Battleship keeps its three waves.
      Comparison at map size: `docs/carrier-trim-candidates.html`
      (**http://10.0.0.224:4173/docs/carrier-trim-candidates.html**). **Use
      the trimmed file when wiring in the Carrier**, credited as "modified"
      (CC BY 3.0 allows it; say so in `CREDITS.md` and About / Credits).
      **Approved by Dan (2026-09-24): use the modified one.**
    - **Bomber B (Carpet Bombing):** its bomb dots disappear at 22 px, so
      it may read as a plain plane shape at map size.
    - **Fighter B (Biplane)** gets busy when small.
    - Submarine A (flat cigar) was flagged as looking like Fighter A, but
      Fighter is B, so that's fine.
  - **Naval armies — DECIDED by Dan (2026-09-24, Q11 → yes), done the same
    day:** three ships of one type on a tile form a **fleet**, exactly like a
    land army: ×3 attack and defense, the gold ring and ×3 tag, one unit
    that can't split and sinks whole. **A fleet carries three ships' worth
    of cargo** (e.g. 3 Galleys → 6), and it takes over whatever the three
    ships were carrying. Messages and buttons say "fleet" for ships ("Form
    Frigate fleet", "Frigate fleet ×3"). The AI forms fleets the same way
    (three of a kind on a tile). New scenario **`fleet`** (odds 57% → 80%).
    Unit-tested (fleet strength, cargo kept and ×3 capacity; the scenario);
    preview-verified on desktop (Form Frigate fleet → "attack 12 · defense
    9 · cargo 1/6"). 357 tests pass.
  - **Dan's checks for this round:**
    - (a) On the iPad, open **http://10.0.0.224:4173/docs/ship-air-icon-candidates.html**
      (the play server now also serves the picker pages; the Netlify build
      never gets them). Pick one per unit, then Copy my picks or Share and
      paste the list into the chat.
    - (b) On `dev:lan`: ☰ → Dev scenarios → the nine **Ships: …** /
      **Harbor** / **All ships** scenarios; each should do what its note says.
    - (c) In a real game on `play:lan`: research Map Making, build a Galley
      in a coastal city, and carry a Settler to another landmass.
  - **Decisions worth reviewing:**
    - **Boarding and going ashore each use up the unit's move**, so a unit
      that boards can't land the same turn. A ship can sail the turn its
      cargo boards.
    - **Ships can "Stay"** (the Fortify button reads Stay for ships): Next
      Unit skips them until they move. There's no defense bonus for ships.
    - Units aboard a ship docked in a city **don't defend the city**, and
      they're lost with the ships if it falls.
    - **The Galley's sea is the coast:** it can cross narrow channels (all
      coast) but not open ocean. The map's channels are often narrow enough
      for a Galley.
    - **Ironclad isn't coast-only.** I read "coast-heavy" as "strong at
      bombarding coasts" and gave it a high attack for its era; making it
      coast-only is one field (`coastOnly: true`).
    - **Water tile yields unchanged** (coast 1/0/2, ocean 1/0/1); the Harbor
      is what makes them worth working.
    - **Landmass = land you can walk across.** Mountains are impassable, so
      two areas joined only by mountains count as two landmasses.
    - An AI settles overseas only on a landmass where it has no city yet;
      after that, that island's own city builds Settlers for it.
    - The AI's "could I take a city" war check (bestAttack) now counts land
      units only, since ships can't capture.
    - A submarine hidden from you also doesn't count for first contact.
  - **Also changed:**
    - New files: `src/game/naval.ts` (ship rules), `src/game/aiNaval.ts`
      (the AI at sea), `src/dev/landmass.ts` (B7 stats), `tests/naval.test.ts`,
      `docs/ship-air-icon-candidates.html` and its folder.
    - `findPath`, `reachableThisTurn`, and the AI's exploration are
      unit-aware (ships path over water). New actions `board` and `unload`.
    - `npm run sim` also prints overseas cities, landings, ships per civ, and
      the landmass stats.
    - Log entries have a new kind, `landing`.
    - `build:play` also copies the picker pages (`docs/*-candidates.html`)
      into `dist-play/docs/` (`scripts/copy-pickers.mjs`), so the play server
      serves them to the iPad.
  - **Observed, not fixed:**
    - **Domination still never wins in the sim**, and AI wars are rare and
      local, so naval invasions are rare in all-AI games (0.2 per game).
      Worth a look in the balance pass: more wars or a keener conquest AI
      would use the new invasion code more.
    - The preview pane's screenshots were drawn in one corner again under
      iPad emulation, so taps there missed. The iPad-size checks were done
      by measuring (no sideways overflow, all unit-panel buttons 44 px) and
      by pressing the real buttons from the page; the full tap-by-tap
      boarding check was done at desktop size.

* **Round 9 — Milestone 7: barbarians, villages, artifacts, resources, huts,
  and Great People — done. APPROVED by Dan (2026-09-24)**, map icons
  picked. Round 10 wires the icons in.
  - **Result:** 413 unit tests passing (47 new). Type-check and production
    build are clean, and the dev-code leak check passes. Preview-verified on
    desktop and in iPad-sized touch emulation (768×1024). **Save format 8**
    (a v7 game is upgraded, with the original kept as a backup). Package
    version 0.9.0. Pushed; play server restarted (see the end of this entry).
  - **Per-item status (coding round 9):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`b8c9df7`), then re-read both. Nothing from last round's report was dropped: the removed lines were the old Round 8 task list, and the "Part A done early" note moved to Next Steps | n/a |
    | A1 | Map icon picker page | Done: **`docs/map-icon-candidates.html`** (251 KB, self-contained), built like the round 8 page, with **72 game-icons.net candidates, 3 for each of 24 subjects**: the barbarian village, the hut, a barbarian unit badge, the 15 resources, the 5 Great People, and the artifact. Each is shown at map size on the terrain it sits on (village with 0/2/4 flags; resources in the tile corner, on a dark badge and in plain color; Great People on a gold disc and in a panel; the artifact in a discovery panel). Tap to pick, picks saved on the device (its own key, `epoch.mapIconPicks`), "n of 24 picked", Next unpicked, Copy my picks, Share, and a "Watch out" note under look-alikes. SVGs and `SOURCES.md` (every author) in `docs/map-icon-candidates/`. **Weak spots:** game-icons.net has no silk, aluminum, or rubber icons, so those three are stand-ins (cloth; can/bar/sheet; tire/boot/ball). Until Dan picks, the game draws placeholders (below) | Checked in a preview browser by a helper agent: every candidate shows, pick/undo, picks survive a reload, copied text, no sideways scroll at 375 px, bar buttons 44 px. **Not opened on the iPad yet** |
    | B1 | Barbarian faction | Done. A special player, **always last** in `players`, kind `'barbarian'`, always at war with everyone (`setAlwaysAtWar`). Never met (contact skips it), so it's not in diplomacy; war can't be declared on it or peace made. It **can't win**, isn't a rival for domination, and is **never eliminated**. The AI doesn't count it as "a war" (so barbarians don't block AI wars or put an AI on a war footing). Near-black discs with a **red rim** on the map | unit-tested; preview-verified |
    | B2 | Villages | Done. Placed at the start on land a city could stand on: **one per 50 land tiles, 3–8** (about 6 on the default map), **≥ 6 tiles from every civ start**, ≥ 5 apart, each with a **fortified barbarian Warrior** and a **+50% "Barbarian village" defense** bonus. **Flags:** a flag every **3 turns** from **turn 10**, and at **4 flags** a unit comes out on a free tile next to it (villages start with 0–2 flags, so the first units appear around turns 16–22). **At most 2 units out** per village (then its flags wait at 4). Spawns follow the **world's era = the median civ's**: Ancient Warrior/Warrior/Archer, Medieval Archer/Horseman/Legion; **no flags once the median civ is Industrial**. **Behavior:** units stay within **4 tiles** of home; attack an adjacent civ unit at **≥ 45%** odds; **35%** of turns head for a civ unit or an unguarded city within 4 tiles; else wander. A garrison that dies is replaced by the next unit out. **Barbarians never capture:** they can't walk into a city, and **raid** an unguarded one next to them: **25% of the owner's gold (5–60) and 1 population, never below size 1**, then stay outside; a city can't be raided again for **6 turns**. Killing a city's last defender also raids instead of capturing. The raided civ gets a message ("Keep a unit in your cities to stop raids"). All numbers in `src/data/barbarians.ts` | unit-tested; preview-verified (`village-spawn`, `barbarian-raid`, and 60 turns of a real game) |
    | B3 | Taking a village | Done, Dan's rule. Kill the last defender (the winner moves in, like taking a city) or walk into an empty village, and a **choice panel** opens (it can't be dismissed): **Destroy it** (a random reward: gold 30/40/50, weights 22/18/14; Horseman 12; Settler 10; Galley 10, only for a coastal village with Map Making, else re-rolled; free tech 8; plus any **hidden resource** under it is revealed) or **Settle <next city name>** (a size-1 city on that tile with the civ's next name). **Settling is allowed even inside the normal 3-tile minimum distance**; the panel says so when it applies. **Artifacts: 20% either way**; 1 tech 80%, 2 techs 14%, 3 techs 6%. The first tech is what you're researching (else a random one you could research); a leap's extra ones are the **deepest** you can reach. Our own names ("Ancient Tablets", "Lost Library Scrolls", "Forgotten Star Chart", "Bronze Astrolabe"… 10 in data), shown in an **"Ancient artifact!"** panel with the techs. **The AI takes villages too**: a free unit goes for a known village (or hut) within 6 tiles on its landmass when it has no war plan, attacking a held one only at ≥ 60%. It **settles** a village that isn't within 3 tiles of a city, scores ≥ 20 as a site, while it's below its city target; otherwise it destroys. Deterministic. **World news:** "The Franks destroyed a barbarian village" / "…settled a barbarian village as Metz", shown if you've met them. A village left unchosen at End Turn counts as Destroy | unit-tested (reward weights over 400 fixed seeds; the Galley rule both ways; settle within the minimum distance; artifact rate and 1–3 techs over 500 seeds each way; AI choice, identical twice); preview-verified (attack → panel → Destroy: 50 gold; walk in → Settle Ur → artifact panel) |
    | B4 | Map resources | Done: **15 kinds** in `src/data/resources.ts` (bonus on top of terrain): Wheat (plains +2 food), Cattle (grassland +1 food +1 prod), Game (forest +2 food), Fish (coast +2 food), Whales (ocean/coast +1/+1/+1), Oasis (desert +3 food), Spices (grassland +2 trade), Silk (forest +2 trade), Wine (plains +2 trade), Gold (hills/mountains +3 trade), Gems (hills/mountains +1 prod +2 trade), and **hidden** Iron (hills +3 prod), Aluminum (hills/mountains +3 prod +1 trade), Rubber (forest +2 prod +1 trade), Oil (desert +3 prod). **Hidden ones give nothing and don't show** until revealed: on their tile for everyone by destroying a village there, **or by a tech for that civ (I chose yes): Iron ← Iron Working, Aluminum ← Electricity, Rubber ← Industrialization, Oil ← Refining**. A village sits on a hidden resource 40% of the time when its terrain allows one. **Placement:** seeded on its own RNG stream from the game seed, 6% of tiles, at least 2 apart (about 46 on the default map), and **every civ start gets ≥ 2 visible food or production resources within 2 tiles**. Worked tiles and the city's own tile use the bonus; the automatic tile picker counts it; the AI's site score counts visible ones. On the map: a small dark badge with the resource's letters in the tile's corner (placeholder). Tapping a tile names it and its bonus; the city panel lists "Resources worked". **Bonuses only, no "needs Iron" rules (Q14)** | unit-tested (yields, picker, hidden/revealed both ways, 40-seed start fairness, same seed = same resources); preview-verified (`all-resources`, `village-resource`) |
    | B5 | Exploration huts | Done. **One per 35 land tiles, 4–12** (about 9 on the default map), not within 2 tiles of a civ start, a village, or another hut. The first civ unit to step on one gets (weights) **gold 25–50** (40), **the map within 5 tiles** (20), **a free Warrior or Horseman** (18), **a free tech** (8), or **2 barbarian Warriors next to it** (8; **never before turn 20**, never next to a city). **No artifacts from huts.** The AI walks into huts it knows within 6 tiles. On the map: a tan dome with "?" (placeholder); the result is a message | unit-tested (each result; 300 seeds before turn 20: no barbarians, no artifacts); preview-verified (`hut`, all five) |
    | B6 | Great People | Done. A civ earns one each time the culture it has made passes the next threshold: **80, 200, 400, 680, …** (first 80, +120 more each time, rising by 80). Kind is random (seeded): **Scientist, Artist, Merchant, Engineer, General**; names from our own list of historical figures (10 per kind, each used once per game). **The human gets a panel:** **Settle in a city…** (pick the city) for good: Scientist **+50% science**, Artist **+3 culture/turn**, Merchant **+50% gold**, Engineer **+25% production**, General **new units there are veterans and armies there fight 25% better**; or **Use now**: Scientist **learns a tech** (your research, else one you could research), Artist **+150 culture**, Merchant **150 gold + 75 per era**, Engineer **finishes the wonder or building a city is making** (pick the city), General **makes every unit on one tile a veteran** (pick the tile). There's also **"Decide later"** (the panel comes back next turn). The 🏆 screen shows "next Great Person in N culture"; the city panel lists settled ones. **The AI decides at once, deterministically:** an Engineer finishes a wonder it's building (else settles in its best production city); a Scientist/Merchant/Artist is used at once when it matches the AI's victory goal (tech/economic/culture) and settled otherwise; a General trains a stack of 2+ at war, else settles. Great People count toward culture only through their effects | unit-tested (thresholds, every settled and one-time effect, AI engineer, a real 150-turn game); preview-verified (`great-person` → settle in Babylon; `engineer-wonder` → Pyramids finished) |
    | B7 | Culture borders and city flipping | **Not done, as planned** (deferred to M9 or later, only if Dan wants them) | n/a |
    | B8 | Save migration v7 → v8 | Done. `STATE_VERSION` 8. **Resources come from the seed for the whole map** (what a new game with that seed would have; fair starts measured from each civ's capital). **The barbarians join as the last player**, and every table grows by one. **Villages and huts go only on tiles no civ has explored.** **Great People count only culture made from now on** (`greatPeopleCultureBase` = culture so far), so nobody gets a backlog. The pre-upgrade save is kept as a backup as usual; the notice says "updated for barbarians, villages, resources, huts, and Great People". v2–v6 saves chain through | unit-tested (v7 → v8: nothing on explored tiles, tables sized, no backlog, plays on and re-saves); preview-verified (a planted v7 save at turn 61 loaded as v8, original in backup slot 1 "Upgraded from version 7", 2 villages and 8 huts placed in unexplored corners) |
    | B9 | Dev scenarios | Done, all 9: `village-spawn`, `take-village` (67%), `village-artifact` (dice set so both choices find one), `village-resource` (Iron), `barbarian-raid`, `hut` (five huts, one of each result: a hut can carry a set result, used only by this scenario), `great-person` (Hypatia), `engineer-wonder`, `all-resources`. Odds and amounts in the notes are computed | unit-tested (each outcome); preview-verified: `take-village`, `village-artifact`, `great-person`, `engineer-wonder`, `hut`, `barbarian-raid`, `village-spawn`, `all-resources` (`village-resource` through its test only) |
    | B10 | Simulation report | Done; `npm run sim` now prints barbarians, villages, huts, artifacts, and Great People per game. Numbers below | `npm run sim` |
    | B11 | Unit tests | Done: 47 new, 413 total. New **`tests/barbarians.test.ts`** (29): the faction rules, the flag timer and spawn at 4, the grace period and late-era stop, the unit cap, units staying home, raids (never a capture, never below 1, cooldown, raid after killing the last defender), the village choice (reward weights, Galley rule, settle within the minimum distance, artifact rate and counts both ways), the AI taking a village (deterministic), resources (yields, picker, hidden/revealed, start fairness, seeded), every hut result, no early barbarians or artifacts from huts, Great People (thresholds, settled and one-time effects, the AI), the v7 → v8 migration. `tests/scenarios.test.ts`: the 9 new scenarios. **`pace.test.ts` still passes.** Older tests changed only for the extra barbarian player (player counts, migration table sizes), the new tech cost numbers, and a longer timeout on one simulation test | `npm test` |

  - **B10 simulation** (`npm run sim`, all-AI, 5 civs, seeds 8/13/21/33/42,
    300 turns), per game: **villages at start 5.8; destroyed 4.4, settled 0.4**
    (by the AIs); **barbarian units spawned 24.4 (villages and huts), killed
    28.4** (the starting garrisons count as killed too); **raids 3.2;
    eliminations caused by barbarians: 0** (in every game); **huts entered
    9.0; artifacts 0.8**. **Great People per civ by turn 150: 3.3 on average**
    (min 0, max 6). Wars 2.4, peace treaties 1.6, eliminations 0 by turn 120.
  - **Era pace, before → after** (same runs):

    | | Round 8 | Round 9 first try | Round 9 final | Target |
    |---|---|---|---|---|
    | Medieval era, median civ | 63 | 54 | **63** | 50–70 |
    | Industrial era, median civ | 119 | 105 | **125** | 120–150 |
    | Modern era, median civ | 185 | 159 | **198** | 180–220 |
    | First to finish the tree, per seed | 196, 195, 169, 195, 197 | 151–181 | **195, 214, 194, 174, 204** | ~250 |
    | Winners | turns 201–232 | turns 176–228 | **turns 193–230** (Tech ×2, Culture ×3) | none before 150 |

    **What sped it up, measured by switching each system off:** resources
    (about +20 turns faster by Industrial: both the scattered ones and the fair
    start ones), much more than free techs from huts, villages, and artifacts
    (about 1 turn) or Great People (a few turns late). **Fix, in data:** fewer
    and smaller trade resources (6% of tiles, trade bonuses cut by 1), Great
    People a little rarer, and **tech cost per tech known 6 → 8.5**
    (`TECH_COST.perKnown`), which puts every era back inside its target.
  - **Dan's checks for this round:**
    - (a) On the iPad, open
      **http://10.0.0.224:4173/docs/map-icon-candidates.html** and pick one
      per subject (24), then Copy my picks or Share and paste the list into the
      chat. Silk, Aluminum, and Rubber are stand-ins (the site has no good
      icons for them); say if you'd rather keep letters for those.
    - (b) On `dev:lan`: ☰ → Dev scenarios → the **Barbarians: …**, **Huts:
      every result**, **Great People: …**, and **All resources** scenarios;
      each should do what its note says.
    - (c) In a real game on `play:lan`: take a barbarian village and make the
      choice. Your current game is upgraded: villages and huts appear only in
      places you haven't explored yet.
  - **Dan's map icon picks (2026-09-24), from the picker page (check (a)
    done).** Files are `docs/map-icon-candidates/<subject>-<letter>.svg`;
    authors are in that folder's `SOURCES.md`. **Wired in (Round 10):** all 24
    are in `src/assets/icons/`, drawn on the map and in the panels, and
    credited in `src/data/icons.ts`, `CREDITS.md`, and About / Credits.

    | Subject | Pick | Icon (author) |
    |---|---|---|
    | Village | A | goblin-camp (Delapouite) |
    | Hut | A | hut (Delapouite) |
    | Barbarian badge | A | skull-crossed-bones (Lorc) |
    | Wheat | A | wheat (Lorc) |
    | Cattle | A | cow (Delapouite) |
    | Game | B | stag-head (Lorc) |
    | Fish | B | circling-fish (Delapouite) |
    | Whales | A | sperm-whale (Delapouite) |
    | Oasis | A | oasis (Delapouite) |
    | Spices | B | chili-pepper (Delapouite) |
    | Silk | C | kimono (Delapouite) |
    | Wine | B | wine-bottle (Delapouite) |
    | Gold | B | gold-bar (Willdabeast) |
    | Gems | A | cut-diamond (Lorc) |
    | Iron | A | anvil (Lorc) |
    | Aluminum | A | soda-can (Guard13007) |
    | Rubber | A | car-wheel (Delapouite) |
    | Oil | B | oil-drum (Skoll) |
    | Great Scientist | C | microscope (Lord Berandas) |
    | Great Artist | A | palette (Delapouite) |
    | Great Merchant | A | two-coins (Delapouite) |
    | Great Engineer | A | gears (Lorc) |
    | Great General | A | laurel-crown (Lorc) |
    | Artifact | A | amphora (Delapouite) |

    **Watch-outs from the picker page that apply to these picks:**
    - Rubber A (tire) and Great Engineer A (gears) are both ring shapes. They
      rarely appear side by side (a resource on a tile, a Great Person in a
      panel), so this is probably fine.
    - Wine B (bottle and glass) was flagged as muddy at small size.
    - Great Merchant A (coins) means much the same as Gold, but Gold is the
      bar (B), so they look different.
  - **Decisions worth reviewing:**
    - **Barbarians are a player** (always last, kind `'barbarian'`), not
      units with no owner, so combat, movement, and fog work for them
      unchanged. `?players=2` still adds them.
    - A village's Warrior (fortified, +50% village) defends at 2: a Warrior
      attacks it at 33%, a Horseman 50%, an Archer 60%, a Legion 67%.
    - A village left without a choice when you tap End Turn is **destroyed**
      (like an unanswered demand counting as refused). The panel can't be
      closed without choosing, so this only happens by reload tricks.
    - **Settling a village doesn't reveal** a hidden resource under it; only
      destroying does (or the tech).
    - Barbarians have **full map knowledge** (so they can find paths); they
      only act near home.
    - A raid shows as a message, not a panel.
    - Great People have **"Decide later"**; the AI never leaves one waiting.
    - Great Person thresholds count culture since the game started (or since
      the upgrade for Dan's game), and an Artist's one-time burst counts
      toward the next one.
    - **Tech costs went up** (8.5 per tech known instead of 6) to keep the era
      pace with the richer economy.
  - **Also changed:**
    - **AI bug fixed (found through a failing test):** the AI merged three
      Spearmen guarding a city into an army, then counted the city as short
      of defenders and built more, forever (60 Spearmen in one civ by turn
      100 on seed 33). The AI now forms armies only from attack-minded types
      (attack ≥ defense). Players can still form any army.
    - New files: `src/data/barbarians.ts`, `src/data/resources.ts`,
      `src/data/greatPeople.ts`, `src/game/barbarians.ts`,
      `src/game/villages.ts`, `src/game/resources.ts`,
      `src/game/greatPeople.ts`, `tests/barbarians.test.ts`, and the picker
      page with its folder.
    - New actions `chooseVillage` and `useGreatPerson`. `playComputerTurn` in
      `turn.ts` plays either the barbarians or a civ AI (the sim and tests use
      it). `createCity` in `city.ts` is shared by settlers and settled villages.
    - The combat result says when an attack took a village (`tookVillage`) or
      raided a city (`raided`).
    - Map placeholders: village = wooden fence around the tile with a red
      flag per flag (the flags are drawn over the unit); hut = tan dome with
      "?"; resource = dark badge with 2 letters in the corner; barbarian unit
      = near-black disc with a red rim.
    - The notice panel can show a scrolling list of choices (cities or tiles).
  - **Observed, not fixed:**
    - **The AI rarely settles villages** (0.4 per game; it mostly destroys
      them), and about 1 village per game survives into the late game. Both
      are data (`aiVillageChoice`, loot distance 6).
    - The combat message calls a barbarian unit just "the Warrior" (the
      existing message wording).
    - The preview pane again drew iPad-emulation screenshots in one corner, so
      the iPad-size checks were done by measuring (panel buttons 44–56 px, no
      sideways overflow) and by pressing the real buttons from the page.

* **Round 10 — Dan's map and aircraft icons + air units — done. ACCEPTED by
  Dan (2026-09-24).** The Bomber icon question carries over to round 11
  (Q20).
  - **Result:** 487 unit tests passing (74 new). Type-check and production
    build are clean, and the dev-code leak check passes. Preview-verified on
    desktop and in iPad-sized emulation (768×1024). **Save format 9** (a v8
    game loads unchanged, with the original kept as a backup). Package
    version 0.10.0. Pushed; play server restarted (see the end of this entry).
  - **Per-item status (coding round 10):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`8c4fb59`), then re-read both. Nothing from last round's report was dropped: the Round 9 entry and Dan's icon pick tables are intact | n/a |
    | A1 | The 24 map icons | Done. Dan's picks copied into **`src/assets/icons/`** under their icon names (`goblin-camp.svg`, `wheat.svg`…), bundled as text like the unit icons, never loaded from the web. Each resource and Great Person has an **`icon`** field in data; the village, hut, barbarian badge, and artifact are **`MAP_ICONS`** in `src/data/icons.ts`. **On the map, drawn as the picker page showed them:** the village is its icon, dark on a pale rounded square, with its **flags along the bottom right** (red for each flag it has, faint for the rest), and its garrison now sits in the lower-left corner like a unit in a city, so the village stays visible; the hut is its icon on a pale circle; a **resource is its icon, white on a small dark badge in the tile's upper-right corner**; every **barbarian unit carries a red skull badge** (upper left of its disc; the red rim stays). **In the panels:** the village choice and "Village destroyed" panels (village icon in the title), the "Ancient artifact!" panel (the amphora, gold on dark), the Great Person arrival panel and its settle/use pickers (the person's icon on a gold disc), the city panel's **Resources worked** and **Great People settled here** lists, the resource/village/hut messages when you tap a tile, and the hut, village, and artifact news messages. **Letters (and the old shapes) stay as the fallback** while an icon loads or if one is missing | unit-tested (`tests/icons.test.ts`); preview-verified on desktop (`all-map-icons`, zoomed in) and in 768×1024 emulation (village, artifact, Great Person panels; city panel resources; no sideways overflow, panel buttons 56 px) |
    | A2 | The 5 aircraft icons | Done: Fighter = Biplane (Quoting), Bomber = Carpet Bombing (Skoll), Jet Fighter, Stealth Bomber, Helicopter (Delapouite). **Bomber B at 22 px, reported, not swapped:** at the in-city size (aircraft always sit in a city or on a Carrier, so that's the size you'll see most), its bomb dots vanish and it shrinks to a **thin dash**, because the drawing only fills the top of its square. It still looks different from the boxy Fighter and the Jet Fighter, but it's the weakest aircraft icon. **Comparison page:** `docs/bomber-size-candidates.html` (all five in game at 22 and 31 px on two civ colors, plus round 8's Bomber A and C for comparison), on the iPad at **http://10.0.0.224:4173/docs/bomber-size-candidates.html** | unit-tested (bundled, credited); preview-verified (`all-aircraft` scenario and the comparison page) |
    | A3 | Credits | Done. All 29 new icons are in `src/data/icons.ts`, **`CREDITS.md`** (aircraft in the unit table, plus a new **Map icons** table), and **☰ → About / Credits** (now two lists: "Unit icons", 29, and "Map icons", 24, each with its icon). New authors: **Willdabeast, Guard13007, Lord Berandas, Quoting**, and Skoll (already credited for units). `tests/icons.test.ts` now covers **units and map things**: every used icon is bundled, one `currentColor` shape, no web links, credited in data and CREDITS.md with the right name, title, and author; no icon used twice; nothing unused credited; **every bundled file is used**; and each new author is credited | unit-tested; preview-verified (About: 29 + 24 rows, all with icons, in 768×1024) |
    | B1 | Techs | Done. **Flight** unlocks the Fighter, the Bomber, and the **Airport** (and the Carrier, as before). New **Advanced Flight** (Modern, tier 14): **Flight + Machine Tools**; it unlocks the **Jet Fighter** and the **Helicopter**. The **Stealth Bomber needs Advanced Flight and Computers** (a unit can now name a second tech, `alsoRequires`; the tech screen lists it under both). 55 techs. Era pace re-checked: **unchanged** (below) | unit-tested; `npm run sim`; `pace.test.ts` passes |
    | B2 | Base and strike | Done (`src/game/air.ts`). Every aircraft but the Helicopter is **based in one of your cities or aboard your Carrier**, with a **range** (Fighter 4, Bomber 6, Jet Fighter 6, Stealth Bomber 8). **Strike:** select it, and every tile in range with a target you can see is outlined in red; tap one for the odds panel ("Air strike?"), and Attack resolves it; the aircraft never leaves its base, so it's **back there automatically** ("…destroyed the Musketman and flew back to base"). **One action a turn.** **Rebase:** the cities and Carriers it can reach are highlighted; tapping one flies it there and uses its turn. It never stands on an open tile, so there's no fuel or crash rule. In a city with a Carrier in port, the unit panel offers **✈ Land on the Carrier** / **✈ Base it in the city**. Aircraft on a Carrier still come up in Next Unit, and "Stay" skips them | unit-tested; preview-verified (`air-strike`, `rebase`) |
    | B3 | Air combat | Done. **Bombers** (Bomber 12 attack / 3 defense; Stealth Bomber 20/6) hit hard and are weak when caught; a win destroys the defender but **aircraft never capture or move in** (the city stays theirs, empty). **Fighters** (Fighter 4 attack, **8 against aircraft**; Jet Fighter 8, **16**) make weaker strikes on ground or sea and are what intercepts. **Interception:** when an aircraft or a Helicopter strikes a tile, the target's owner's best fighter whose base is within **its** range of that tile fights it first (fighter's anti-air strength vs the attacker's defense, the same odds formula). Fighter wins: the attacker is shot down and the strike never happens; fighter loses: the fighter is lost and the strike goes ahead. A message says which, either way, and the **odds panel warns first** ("Their Fighter can intercept: it shoots your Bomber down 73% of the time… Overall: 18%"). **Stealth:** the fighter loses 50% strength against a Stealth Bomber (`evadePct` in data). **Aircraft never defend a tile**, so ground units and ships can't attack them; a land unit simply walks into a city held only by aircraft and takes it, and **the aircraft there are lost** ("…lost 2 aircraft on the ground at X"); **aircraft aboard a sunk Carrier are lost**. **No air armies** (Q16). Walls don't count against aircraft (they're for land attacks) | unit-tested; preview-verified (`intercept`, `bomber-no-capture`) |
    | B4 | Carriers | Done. A Carrier carries **3 aircraft** (`airCargo` in data; a Carrier fleet, 9). Aircraft rebase onto it in range, strike from it, and move and sink with it. Its panel says "aircraft 1/3" and the stack list "✈ Carrier aircraft 1/3: 1 Bomber"; its map badge counts what's aboard | unit-tested; preview-verified (`rebase`: Bomber onto the Carrier, sailing with it) |
    | B5 | Helicopter | Done. Advanced Flight; 10 attack, 4 defense, **5 moves**, sight 2. It **moves like a land unit over any terrain, water and mountains too, 1 move a tile**, can end its turn anywhere, never boards ships, and **can't capture cities** ("Helicopters can't capture cities"; after a win it stays where it is). It **can be intercepted** when it attacks, and fighters use their anti-air strength against it | unit-tested; preview-verified (`helicopter`: over the mountain, lake, and forest; the Musketman destroyed; Taxila stays Mauryan) |
    | B6 | Airport | Done: Flight, cost 80. **Aircraft built there start as veterans** (Barracks no longer does that for aircraft; land units and ships still get it from Barracks). **Airlift:** once a turn, one land unit in a city with an Airport flies to another of your cities with an Airport (**✈ Airlift…** in the unit panel, then pick the city); it arrives with no moves left. The city panel shows whether the airlift is used. The AI builds Airports last in its building order and doesn't airlift | unit-tested; preview-verified (`airlift`) |
    | B7 | The AI's air power | Done (`src/game/aiAir.ts`). **Fighters for defense** once it has Flight, in border (a met rival within 6 tiles) and coastal cities, one per city at most (0.5 per such city in all). **At war with a plan: bombers** (its strongest), 0.5 per city. **Each turn, before its land units move**, every aircraft strikes the best target in range whose **overall odds (not shot down × winning) are at least 60%**, the war plan's target city and enemies next to its own units first; with nothing to strike, it **rebases toward the plan's target city**. Deterministic (same state, same turn). Numbers in `RULES.ai.air`. **Sim (below): aircraft per civ at turn 220 = 2.0 on average (max 9); 27 strikes and 0.2 intercepts per game; still no domination wins** | unit-tested (strike choice, holding back under fighter cover, rebasing, builds, a whole AI turn twice); `npm run sim` |
    | B8 | Save migration v8 → v9 | Done. `STATE_VERSION` 9. Nothing needs changing: no aircraft exist yet, nobody knows Advanced Flight, and no city has airlifted (`airliftTurn` is simply absent). The notice says "updated for aircraft and Airports"; the pre-upgrade save is kept as a backup as usual | unit-tested (v8 → v9 loads, plays 3 turns, re-saves) |
    | B9 | Dev scenarios | Done, all 9, each with a computed note: `air-strike`, `intercept` (73%), `rebase`, `carrier-sunk`, `bomber-no-capture`, `helicopter`, `airlift`, `all-aircraft`, `all-map-icons`. The fights use set dice so the note's promise always holds. Aircraft strike only what you can see, so the strike scenarios have a Warrior keeping the target in sight | unit-tested (each outcome); preview-verified: `air-strike`, `intercept`, `rebase`, `airlift`, `helicopter`, `all-aircraft`, `all-map-icons` (`carrier-sunk` and `bomber-no-capture` through their tests) |
    | B10 | Unit tests | Done: 74 new, 487 total. New **`tests/air.test.ts`** (25): the techs and tree, the Stealth Bomber's two techs, range and visibility, one strike a turn and the return, no capture, no Walls against air, aircraft not defending and lost with a captured city or a sunk Carrier, rebasing (city, Carrier, capacity 3, range, not to open tiles), boarding in port and striking from a Carrier, interception (best fighter in range, bombers don't, out of range doesn't, stealth, both outcomes), Helicopters intercepted and ground attacks not, Helicopter movement and no capture, Airport veterans, the airlift once a turn, the AI (strike, holding back, rebasing, builds, deterministic), no air armies, v8 → v9. `tests/icons.test.ts` rewritten for units and map icons. `tests/scenarios.test.ts`: the 9 new scenarios. **`pace.test.ts` still passes.** Older tests changed only for the tech count (54 → 55) | `npm test` |

  - **Simulation** (`npm run sim`, all-AI, 5 civs, seeds 8/13/21/33/42, 300
    turns): **Medieval era (median civ) 63, Industrial 124, Modern 194**
    (Round 9: 63, 125, 198; targets 50–70, 120–150, 180–220). First to finish
    the tree, per seed: 218, 201, 188, 200, 209. **Winners: turns 178–234**
    (Technology ×2, Culture ×2, Economic ×1); none before turn 150. **Air per
    game: 27 strikes, 0.2 intercepts, 9.4 city captures; aircraft per civ at
    turn 220: 2.0 on average (max 9). Domination wins: 0 of 5**, so air power
    alone doesn't make them appear. Wars 3.4 per game, peace treaties 2.
    Most strikes come from two of the five games (seeds 13 and 42: 76 and 57
    strikes, each with a long late war); intercepts are rare, probably
    because the AI's odds rule already skips targets under enemy fighter
    cover.
  - **Dan's checks for this round:**
    - (a) On `dev:lan`: ☰ → Dev scenarios → **All map icons** and **All
      aircraft**: check the icons, then a real game on `play:lan`. For the
      Bomber at small size, also open
      **http://10.0.0.224:4173/docs/bomber-size-candidates.html** and say if
      you'd like a different Bomber (A or C are shown).
    - (b) The **Air: …** scenarios; each should do what its note says.
    - (c) If not done yet: take a barbarian village in a real game and make
      the choice.
  - **Decisions worth reviewing:**
    - **Aircraft strike only what you can see** (a Bomber's range is 6, but
      it sees 2 from its base). A scout, a nearby unit, or a city's sight
      makes a target strikable.
    - **The Helicopter is a hovering land unit:** it stands on the map, so it
      defends its tile and can be attacked by ground units and ships like any
      unit (otherwise a Helicopter alone on a tile could never be removed).
      "Ground units can't attack aircraft" applies to based aircraft, which
      never stand on open tiles anyway.
    - **Interception needs the fighter's base within the fighter's own range
      of the target**, and a fighter can intercept any number of times a turn
      (as long as it survives). Only the target's owner's fighters intercept.
    - **Barracks don't make aircraft veterans**; the Airport does (land units
      and ships keep getting it from Barracks).
    - Fighters can also strike ground or sea targets (4 / Jet 8); bombers
      can't intercept.
    - The AI's fighters also rebase toward the front at war; it doesn't use
      Helicopters on purpose (the Artillery ties it on attack and is cheaper,
      so it rarely builds one), doesn't airlift, and doesn't use Carriers for
      aircraft.
    - **Advanced Flight = Flight + Machine Tools.**
    - A barbarian village's garrison is now drawn in the corner, like a unit
      in a city, so the village icon shows; its flags moved to the bottom
      right.
  - **Also changed:**
    - New files: `src/game/air.ts` (rebase, airlift, range),
      `src/game/aiAir.ts` (the AI in the air), `tests/air.test.ts`,
      `docs/bomber-size-candidates.html`, and the 29 icons.
    - `naval.ts` now also says what kind of unit something is (`isAir`,
      `hovers`, `isAircraft`, `canCapture`) and holds the Carrier helpers
      (`aircraftOf`, `airCapacity`, `carriedBy`). `cargoOf` is land cargo
      only.
    - New actions `rebase` and `airlift`; a `move` order for an aircraft is a
      rebase. Log kinds `strike` and `intercept`. The combat report has
      `airStrike` and `interception`.
    - The odds panel's modifier list shows negative bonuses with a minus sign.
    - `npm run sim` prints the air numbers (strikes, intercepts, captures,
      aircraft at turn 220, domination wins).
  - **Observed, not fixed:**
    - Domination still never wins in the sim.

* **Round 11 — Milestone 8: Dan's 12 leaders, starting techs, bonuses,
  portraits, choosing your civ, and domination — done. APPROVED by Dan
  (2026-09-24).** The readings the agent chose (peace = any met civ at
  peace; Versailles' gold empire-wide; Hatshepsut's wonders in her cities)
  stand unless Dan says otherwise. England, Rome, and Russia winning
  nothing is a balance item for M9.
  - **Result:** 585 unit tests passing (98 new). Type-check and production
    build are clean, and the dev-code leak check passes. Preview-verified on
    desktop and in iPad-sized touch emulation (768×1024 portrait and
    1024×768 landscape). **Save format 10** (a v9 game loads, with the
    original kept as a backup). Package version 0.11.0. Pushed; play server
    restarted (see the end of this entry).
  - **Mid-round addition from Dan:** his 12 portraits (512×512 PNG) were in
    `docs/portraits-incoming/`. They're now in `src/assets/portraits/`,
    renamed by civ id (the table is in `docs/PORTRAITS.md`), and the incoming
    folder is gone. Each leader has a **`portraitFocus`** (face center x, y
    and a zoom) in `src/data/civs.ts`; at **48 px and under** the game zooms
    in on the face. Checked on `docs/portraits.html` (Kim Jong Un, Merkel,
    Yushchenko, and JFK zoom 2.2×; the rest 1.8–2×).
  - **Per-item status (coding round 11):**

    | # | Item | Status | Verified by |
    |---|------|--------|-------------|
    | 0 | Commit docs first | Done (`be78388`), then re-read both. Nothing from last round's report was dropped | n/a |
    | A1 | 12 civs | Done in `src/data/civs.ts`: Dan's 12 with grammar (`the Franks` plural, `the United States` singular), adjective, a distinct color (and distinct from the barbarians), 13–14 city names each (no name used by two civs), `aggression`/`tradeWillingness`, **`lean`** (primary/secondary, exactly Dan's table), and **`startTech`** (exactly Dan's table). **Starting techs come without prerequisites**; trading, research, the tech screen, and the AI all handle it (a known tech's prerequisites stay researchable; a starting tech can only be traded to a civ that knows its prerequisites). Babylon, Maurya, and the Inca are **`legacy`**: kept for old saves, never offered or drawn, no bonuses. Mali and the Franks keep their ids and colors, with the new bonuses | unit-tested (`tests/leaders.test.ts`: roster, table, grammar, legacy, starting-tech rule); `starting-tech` scenario |
    | A2 | Bonuses | Done. Every bonus is **typed data** (`src/data/leaders.ts`, 45 small effect kinds) switched on by **one function** (`effects()` in `src/game/leaders.ts`: start + drawback always, each era's bonus once reached). Entering an era logs **"Medieval bonus: Legions. …"** (a toast). **Final table below, with the numbers I changed.** Unique actions: Pilgrimage, Dissolution, National Challenge, Return a liberated city (`src/game/uniques.ts`); Versailles (a wonder) and the Moonshot (a project) are built like any other. The AI uses them all | unit-tested: **every bonus and drawback** is checked against Babylon (no bonuses) in the same state; the unique actions and projects both ways (allowed, refused, once only) |
    | B1 | New buildings | Done: Courthouse, Cathedral, Colosseum, University (needs Library), Bank (needs Marketplace), Factory, Power Plant (needs Factory), Research Lab (needs University), Stock Exchange (needs Bank), with the table's techs. New building field **`needs`** and effects `productionPct`, `gold`, `capturedFood`. **Courthouse "captured cities recover faster" = +1 food in a city you took** (so it regrows). The AI builds all 9 (`AI_BUILDING_ORDER`). Icons stay text. Era pace re-checked (below) | unit-tested (prerequisites, each effect, AI order); `pace.test.ts` passes |
    | C1 | New Game setup screen | Done (`src/ui/setup.ts`): ☰ → New Game (and the end screen's New Game) open it. **12 civ cards** (portrait, leader, civ, color, starting tech, starting bonus); tap one to see **all its bonuses** at the top; **🎲 Random civ**; **Rivals − / +** (1–4, default 4); **Start**. Rivals are drawn at random (seeded) from the rest (`drawCivs`). The old game is backed up first (as before). Cards reflow: 3 columns in landscape, 2 in portrait. A **leader button** in the top bar (your portrait, civ, leader) opens your bonuses (reached ones bright, later ones dim) and the unique action buttons | unit-tested (choice, rivals 1–4, seeded, no repeats, random); preview-verified on desktop and in 768×1024 and 1024×768 emulation (picked Kim Jong Un, 2 rivals, Start: North Korea + Ukraine + Germany, knowing Archery) |
    | C2 | Portraits | Done. `src/ui/portraits.ts` bundles `src/assets/portraits/<civ-id>.png` or `.webp` (a `.webp` wins); the placeholder is the initials on the civ color in a circle. Shown on the **civ cards, first contact, Diplomacy (list and detail, with their bonuses), demands and offers, the victory progress cards, the victory and defeat screens, the Return-a-city panel, the leader panel, and the top bar**. **`docs/PORTRAITS.md`** covers size, format, framing, the exact file names (all 12 listed), where to drop files, and the focus/zoom setting | unit-tested (every portrait present is square and ≥256 px; all 12 in place and listed in PORTRAITS.md; focus values sane; crop formula; initials); preview-verified (`portraits` scenario: Diplomacy list at 40 px, detail at 96 px) |
    | C3 | `docs/portraits.html` | Done: all 12 at every size the game uses (128, 96, 64, 48, 40, 36, 28), the full picture with the focus point marked, and the placeholder. `build:play` copies it and the pictures into `dist-play/docs/`: **http://10.0.0.224:4173/docs/portraits.html**. `python scripts/make-portraits-page.py` refreshes its data from civs.ts; a test fails if they drift | unit-tested (data matches); preview-verified (dev server) |
    | D1 | Personalities | Done. Goals now come from the **lean**: primary 8, secondary 5, others 2, plus 3 × progress, and **a tie goes to the primary lean** (a conqueror whose secondary is technology no longer flips at a full tree). The conquerors are **Caligula, Charlemagne, Kim Jong Un** (primary), with **Peter and Bolívar** secondary. **Deterrence** lowers every other AI's war score against Kim by 10 and its demand chance to a quarter | unit-tested (each starts on its primary; no drift; deterministic 30-turn replay; Deterrence −10) |
    | D2 | Domination | Done: **domination wins happen** (sim below). Conquerors now: go to war at 1.1× strength (0.9× against a **runaway** leader, one ≥60% toward a culture or gold win, +3 war score); fight up to **3 wars** at once, and a war on a civ with **no cities left** no longer counts (it used to block every new war); stay at war while it goes their way (−2 peace desire, half war weariness); gather 5 before marching (or march at once when 4× stronger); accept 45% odds; build 3× the wartime attackers; research arms first; aim for **rival capitals** (and the runaway's cities), preferring targets on their own landmass; keep scouting by land and sea while any rival is unmet; and sail with 5. **Rule change: meeting a civ reveals where its capital is** (that tile is marked explored), for you and the AI; without it, North Korea fought Egypt for 60 turns without ever finding its capital. **Pacing (like the grace period):** before turn 160 a conqueror's plan isn't drawn to the *last* capital it needs (one game ended at t118 without it). **Victory goals raised:** culture 4000 → **6000**, gold 5500 → **9000** (the new culture buildings and bonuses made those wins land around t170) | `pace.test.ts` now also plays seed 122 to a domination win (after t150); `npm run sim -- leaders` |
    | E1 | Migration v9 → v10 | Done: civs kept (legacy ones too); Mali and the Franks get their bonuses, legacy civs none; era bonuses for eras reached are on with **no payout**; **no starting tech** granted; the new buildings unlock by tech; each city's `founder` is its owner, except a captured capital, which remembers whose it was; no unique used, no Challenge; ships afloat count as built (Peter's discount). Backups as always | unit-tested (v9 → v10 with the three legacy civs, a captured capital, new buildings, plays on) |
    | E2 | Dev scenarios | Done, 11 new: `new-game-setup` (opens the screen), `starting-tech`, `era-bonus`, `caligula-buy-wonder`, `mansa-pilgrimage`, `henry-dissolution`, `bolivar-liberate`, `jfk-challenge`, `versailles`, `deterrence`, `portraits`. Every number in their notes is computed. `ai-war` gained three Legions (Charlemagne, now a conqueror, marches with 5) | unit-tested (`tests/scenarios.test.ts`, 139); preview-verified on desktop: `new-game-setup`, `portraits`, `bolivar-liberate` (captured whole, returned, Mali friendly), `mansa-pilgrimage` (via the leader panel), `jfk-challenge` (19 → 28 science) |
    | E3 | Unit tests | Done: 98 new (`tests/leaders.test.ts` 75, scenarios 22, pace 1). Roster; starting-tech rule; every bonus and drawback; unique actions and projects; buildings; rival drawing; the civ choice; portraits; personalities; a domination win in the sim; v9 → v10; every new scenario; `pace.test.ts` passes | `npm test`: 585 pass |

  - **Final bonus table** (what's in `src/data/leaders.ts`; **bold** = a
    number or reading I chose or changed):

    | Leader | Start | Ancient | Medieval | Industrial | Modern | Unique / drawback |
    |---|---|---|---|---|---|---|
    | Hatshepsut | Wonders −15% | Meeting a civ +30 gold; +1 gold/turn per met civ (max 5); **Round 12: +1 gold per worked road tile** | Each wonder **in her cities** +3 culture, +2 gold | Harbors, Marketplaces −50% | +25% gold | Land units +10% (not Settlers or ships) |
    | Caligula | Rush-buy −25% | +3 culture per fight won | Military units −20% | Buys wonders at 2× (only him) | Armies/fleets +25% | −10% gold |
    | Charlemagne | Captures keep size and all buildings (Walls too) | Mounted units (Horseman, Chariot, Knight) start veteran | Captured cities +2 culture | 8+ cities: +1 production each | +2 culture per fight won | — |
    | Mansa Musa | +1 gold per worked resource tile | Desert +1 trade; Oasis, Gold ×2 | Culture buildings −33% to rush-buy; **Pilgrimage** | Capital +50% gold | +25% gold | Pilgrimage: all gold (min 200) → 1.5× culture, **every met civ +3 opinion**, once |
    | Henry VIII | Great People −20% culture | Temples, Cathedrals +1 culture | **Dissolution**: 40 gold per Temple/Cathedral, their culture −50% for 20 turns, once; **Round 12: national church** (capital, needs a Temple, once) | Gifts ×2 opinion; **peace desire +1.5** | +25% culture | Breaking a treaty: **every civ that met him −2 opinion** (and world gossip) |
    | Louis XIV | Wonders +50% culture | Wine, Silk, Spices, Gems, Gold +1 culture | Capital +1 culture, +1 gold per wonder | **Versailles** (**cost 220, needs Economics**, capital only): +10 culture, **+25% gold empire-wide**, +25% production on wonders there | +25% culture | −50% culture while a rival holds his capital |
    | Peter the Great | Techs a met civ knows −25% | Ships in coastal cities +25% production | First ship of each type −50% | +2 science per met civ | +25% science while behind a met civ | — |
    | Simón Bolívar | Liberation: +100 culture, +50 gold, keeps size | +25% attack vs civs with more cities | Return a liberated city: +150 culture, peace, **opinion → friendly (+6)**, only that turn | Captured cities +2 culture | +25% culture | −5% gold per captured city beyond 3 |
    | John F. Kennedy | +10% science | Libraries, Universities −25% | First into an era: +50 culture | National Challenge: +50% science on one tech | **Moonshot (cost 250, Rocketry)**: +200 culture, +25% science; spaceship parts −50% production, **+100 gold each** | — |
    | Viktor Yushchenko | Plains +1 food | Traded tech +20 science; AIs' willingness +1 | +2 science per met civ ahead | **+5% science per met civ at peace (max +20%)** (was 10%/30% per treaty) | +50 culture when losing a city or a war ends | — |
    | Angela Merkel | Buildings −10%; **Round 12: roads −50% gold** | City defenders +25% | Raids steal half; no starvation shrink | Factories +2 gold; +10% production | +25% science with a Factory | — |
    | Kim Jong Un | Military-unlocking techs −25% | City defenders +25% | Military units −15% | Siege units and bombers +25% attack | Deterrence: **AI war score −10, demands ×¼** | −10% science and gold; AIs' willingness ×½ |

    **Readings I chose (tell me if you want them different):** "peace
    treaty" = any met civ you're at peace with (formal treaties only follow
    a war, so they're rare); Versailles' +25% gold is empire-wide;
    Hatshepsut's wonder bonus counts every wonder in her cities.
  - **Sim (D2), 5 civs drawn from the 12, played to the first win:**
    - **First 10 seeds (101…164):** culture 4, economic 3, technology 2,
      **domination 1** (North Korea, t173). Wins t183–238 except that one;
      none before 150.
    - **20 seeds:** culture 10, economic 4, technology 4, **domination 2**
      (North Korea t173, the Franks t227). Win turns 173–242, median 211.
      Wins by civ (wins/games): Ukraine 4/11, France 3/10, Gran Colombia
      3/10, Egypt 2/9, Germany 2/9, Franks 2/8, USA 2/8, North Korea 1/8,
      Mali 1/5, England 0/6, Rome 0/7, Russia 0/9. Nobody dominates;
      Ukraine is the strongest (I cut its peace science from 10%/30% to
      5%/20% after it won 4 of 8).
    - **Pace (`npm run sim`, seeds 8/13/21/33/42, 300 turns):** median
      Medieval 61, Industrial 138, Modern 211 (targets 50–70, 120–150,
      180–220); first full tree t173 (per seed 173–217, earlier than the
      old ~250). Victories: culture ×2, economic ×3, t175–238.
  - **Other changes worth knowing:**
    - `techCost(state, playerId, tech)` and `itemCost(state, city, item)`,
      `buyCost(state, city)` now take the state (leader discounts).
      `empireIncome` returns culture too and applies empire-wide leader
      percents after the cities' totals.
    - New state: `City.founder`, `City.capturedTurn`; `Player.uniquesUsed`,
      `dissolvedUntil`, `challenge`, `shipsBuilt`. Log kind `leader`.
    - New actions: `pilgrimage`, `dissolution`, `setChallenge`,
      `returnCity`.
    - Units have `mounted` and `siege` flags.
    - `npm run sim` reports also go to `sim-report.txt` (git-ignored):
      Vitest 5 hides a passing test's console output. `npm run sim --
      leaders` (SEEDS=20 for more) is the victory-mix report.
  - **Observed, not fixed:**
    - England, Rome, and Russia won none of their games in the 20-seed run.
      Rome is a conqueror that often loses its wars early; worth a look in
      the balance pass.
    - The full tree now finishes earlier (t173–217) than the old ~250
      target, because the new science buildings speed late research. Era
      medians are still on target.

* **Round 12 — Religion + Roads and railroads — done, APPROVED by Dan (2026-09-25).** The agent's report follows, moved here from Current Objective.

**Round 12 report (coding agent, 2026-09-24): done. APPROVED by Dan (2026-09-25)**, with religion icons picked and wired in.
Version 0.12.0, save format 11. `npm test`: **655 pass** (70 new: 31 in
`tests/religion.test.ts`, 19 in `tests/roads.test.ts`, 20 in the scenario
suite). Lint and build clean; the dev-code check passes.

| # | Item | Status | Verified by |
|---|------|--------|-------------|
| 0 | Commit docs first | Done (`7875083`), then re-read both. Nothing from last round's report was dropped | n/a |
| A1 | Icon picker page | Done: `docs/religion-road-icon-candidates.html` (+ folder, `SOURCES.md`), same format as before, picks saved under `epoch.religionIconPicks`. **Missionary** 3 candidates; **8 religion symbols**, 2 each (Sun disc, Flame, Star, Eye, Tree, Spiral, **Mountain**, Wave); **holy-city marker** 3. **Moon became Mountain**: every moon icon on game-icons.net is a crescent. No real-world religious symbols (crosses, crescents, hexagrams, etc. left out on purpose; laurels left out too, since they're close to the Great General's). The page's "Watch out" notes flag look-alikes (Star A = the capital star; Star B and Holy city A are both four-point sparkles). Until the picks are wired in: "Mi" for the Missionary, colored dots with a letter for religions | Page loads in the dev server (130 SVG previews, no console errors); served by the play server at http://10.0.0.224:4173/docs/religion-road-icon-candidates.html |
| B1 | Founding | Done. Founding techs **Mysticism, Astronomy, Philosophy, Monotheism, and a new Medieval Theology** (Monotheism + Feudalism; the tree is 56 techs). The first civ to know one founds a religion in its capital (or its biggest non-holy city), the holy city; **5 at most** (Q24). **Change from the plan: one religion per civ** (`RELIGION.maxPerCiv`, 1; set it to 5 for the literal rule): in the first sim the tech leader founded all 5 in every game, so a civ that has one leaves the next founding tech to the next civ that knows it. Checked when a tech is learned and at each player's end of turn (so France, starting with Mysticism, founds once it has a city). **Naming:** a panel with a text field (16 px, so iPad Safari doesn't zoom), **Suggest** (cycles our invented names), and **Found it**; it can't be dismissed without a name. The AI names from `RELIGION_NAMES` (16 invented names; a test checks none names a real religion). Each religion gets one of 8 colors/symbols | unit-tested; `found-religion` preview-verified on desktop (typed a name, Suggest, Found it) |
| B2 | Spread | Done. One religion per city or none. **Passive spread once a game turn** (seeded): pressure from each city of a religion within 4 tiles = (5 − distance) + size/3 + Temple 1 + Cathedral 2 + **road link 2**, doubled from the holy city; chance = pressure × 1%, max 15%. A follower switches only when another religion pushes at least twice as hard, at half the chance; **holy cities never switch**. **Missionary** (30 production, 2 moves, 0/0, **2 spreads**): needs a city that follows a religion, and Monotheism **or that religion's founding tech**; carries its city's religion; ✦ Spread converts the city it's in or next to (yours, or a met civ's at peace); uses its moves, gone after the last spread. **Great Artist:** "Convert a city…" to your religion | unit-tested; `missionary`, `religion-spread`, `shared-faith` preview-verified (Missionary tapped in 768×1024 emulation) |
| B3 | Effects | Done, Dan's numbers: holy city **+3 culture, +2 gold, +1 gold per follower city anywhere (max +8)** for whoever holds it; follower cities **Temple +1, Cathedral +2** culture; capitals sharing a religion **+2 opinion**, different **−1** (computed live, never stored: `opinionOf`); the diplomacy detail has a **Faith** row ("Shares your faith (+2 opinion)" / "Different faith (−1 opinion)"). A Missionary or Great Artist converting a city its founder doesn't own: **+20 gold, +10 culture** to the founder (passive spread pays nothing, or the gold would pile up). Capturing a holy city moves its income; the founder is kept for the name. No religious victory | unit-tested; `holy-city-income`, `shared-faith` preview-verified (Neutral → Friendly after the spread) |
| B4 | Henry VIII | Done: **👑 Found a national church** in the leader panel (England, Medieval, a Temple somewhere, capital not already a holy city, once). London becomes the holy city of his own religion (on top of the 5), and the naming panel opens with its own line. World news: "England's king broke with the old priests and founded his own church. The courts of the world are scandalized (and a little jealous)"; his own: "The King needed a divorce, so the King founded a church…". It counts as his one religion. The AI Henry uses it when he has no religion. Dissolution unchanged | unit-tested; `henry-national-church` preview-verified |
| B5 | UI | Done: city panel **Religion** line (dot, name, "holy city", the +culture/+gold it brings, "All religions…"); **Religion screen** from ☰ → Religions, the city panel, or Diplomacy ("Religions of the world…"): rules, a card per religion (founder, turn, tech or "national church", holy city, followers, "Yours"), what's still to be founded. **Map:** a small dot in the religion's color (with its letter) in a city's lower-right corner (units sit lower-left), a **gold ring** on a holy city; no tinting | preview-verified on desktop, 768×1024 and 1024×768 emulation (`all-religion-symbols`) |
| B6 | AI | Done: founds automatically; in peacetime builds a Missionary (**2 out at most**) when its religion has a target within 10 tiles; targets its own cities first, then friends (a civ it dislikes is skipped, a capital preferred: shared faith = +opinion); **a rival's city that already has a faith is left alone** (AIs converting each other back and forth made 87 Missionaries in one game). Deterministic | unit-tested (incl. a 70-turn all-AI replay, identical twice) |
| C1 | Buying roads | Done: city panel **"Build road to…"** (8 nearest: your cities and met civs' at peace, within 12 tiles), each with its gold cost (**10 per tile without a road**); laid at once along the cheapest explored land path (no water or mountains; fewest new tiles, then straight). Cities count as road | unit-tested; `build-road` preview-verified (40 gold, road drawn, "joined by road") |
| C2 | Movement | Done: road to road costs **1/3 of a move**; everyone uses roads; pathing (`findPath`), reachable tiles (the highlight), and the AI all use it. Moves can now be fractional; the HUD shows "⅔" | unit-tested; `road-speed` preview-verified |
| C3 | Railroads | Done: learning **Railroad upgrades roads for free** (Q25): every road tile whose nearest city is yours, then again each of your turns (roads near cities you take or found); roads you buy after are rails. **Rails cost 1/10 of a move** (not "free in your territory"). A city counts as rail once its owner knows Railroad. **+1 production** on worked rail tiles | unit-tested; `railroad` preview-verified (4 tiles upgraded; Warrior to York and back, 0.5 each way) |
| C4 | Road trade | Done: a worked road or rail tile **+1 trade** (city centers don't count) | unit-tested |
| C5 | Ownership | Done: roads belong to no one, captured areas keep them, **no pillaging** (Q26) | unit-tested (an enemy moves on your road) |
| C6 | Leader hooks | Done through the bonus system: **Merkel** (start bonus) roads −50% gold; **Hatshepsut** (Ancient "Envoys and caravans") +1 gold per worked road tile. Bonus table above updated (and Henry's national church) | unit-tested |
| C7 | AI roads | Done: one road a turn with spare gold (its usual reserve + 40): at war, from its city nearest the war target toward it (up to 10 tiles); else the **cheapest missing link** between two of its cities up to 8 apart. Deterministic | unit-tested |
| C8 | Map drawing | Done: roads thin brown lines between tile centers, rails darker with ties (ties from 20 px up); under resources, cities, and units | preview-verified at several zooms |
| D1 | Migration v10 → v11 | Done: no religions; a founding tech any civ already knows **lapses** (the Religion screen lists it); the next unknown one can still be founded; no roads, no Missionaries; backups as always | unit-tested (v10 save with Mysticism known: Mysticism founds nothing, Astronomy does, it plays on) |
| D2 | Dev scenarios | Done, all 10: `found-religion`, `missionary`, `religion-spread`, `holy-city-income`, `shared-faith`, `henry-national-church`, `build-road`, `road-speed`, `railroad`, `all-religion-symbols`. Every number in a note is computed | unit-tested (each outcome); 9 of 10 preview-verified (`religion-spread` only by its test) |
| D3 | Sim report | Done (`npm run sim`, numbers below) | `npm run sim` |
| D4 | Unit tests | Done: all the listed areas, plus the migration and every scenario; `pace.test.ts` passes | `npm test`: 655 pass |

- **Sim (`npm run sim`), after the changes below:**
  - **Pace** (seeds 8/13/21/33/42, 300 turns): median Medieval 64, Industrial
    143, Modern 198, tree 250 (Round 11: 61 / 138 / 211). First full tree
    t170–197.
  - **Religions:** 4.2 per game (4, 4, 4, 4, 5), five different founders in
    most games (e.g. Ukraine t66 Mysticism, Gran Colombia t88, Rome t159,
    Egypt t194). England's national church came at t43 and t83 in the two
    games it was in. **Theology was never used** (by then every civ that
    reaches it has a religion). **83% of cities follow a religion at turn
    150** (124 of 149). Missionaries: 13.6 a game.
  - **Roads per civ:** 2.4 tiles at turn 100 (max 14), 8.3 at turn 200 (max
    36). Most AIs spend their gold on rush-buying first, so roads come late
    and unevenly.
  - **Victories:** pace seeds: culture ×5, t177–237. `npm run sim -- leaders`
    (seeds 101…164): **culture 5, economic 3, domination 1 (North Korea
    t163), technology 1**, wins t163–205, median 194 (Round 11: culture 4,
    economic 3, tech 2, domination 1, t183–238). **No win before turn 150**
    (earliest t163).
- **Changes made to keep the pace (please check):**
  - **Culture goal 6000 → 7000**: religion adds culture everywhere (holy
    cities, follower Temples and Cathedrals), and culture wins had moved
    about 20 turns earlier.
  - **AI domination pacing made firm:** before turn 160 an AI won't take
    the city that would win it domination at once (the last rival capital
    it needs, or the last city of the last rival), **only when that rival is
    another AI**; the human gets no such protection. Without it North Korea
    won by domination at t130 in seed 122.
  - **One religion per civ** (B1 above) and slower passive spread (1% per
    pressure, max 15%; it was 2%/25% in the first run, which converted 87%
    of cities by t150 anyway).
- **Readings I chose (tell me if you want them different):** rails 1/10 of
  a move rather than free; "your roads" for the Railroad upgrade = roads
  whose nearest city is yours; the conversion reward only for a Missionary
  or Great Artist, not passive spread; a founder is paid for converting any
  city it doesn't own (a rival's, or a third civ's); the Missionary is
  0 attack / 0 defense with 2 moves; a road can go to a met civ's city at
  peace; the national church counts as Henry's one religion.
- **Observed, not fixed (for M9's balance pass):** culture is still the most
  common win (5 of 10, and all 5 pace seeds); the AI builds few roads early;
  Theology goes unused with one religion per civ (the Religion screen still
  lists it as "still to be founded").
- **Dan, next:** (a) pick icons on
  http://10.0.0.224:4173/docs/religion-road-icon-candidates.html (Copy my
  picks, and paste them to the planning session); (b) try the 10 scenarios
  (☰ → Dev scenarios, on `dev:lan`); (c) found and name a religion in a real
  game, and buy a road. Note: in a game saved before this round, Mysticism
  (and any founding tech someone already knows) won't found anything; the
  next founding tech nobody knows yet still does.

- **Dan's religion icon picks (2026-09-25), from
  `docs/religion-road-icon-candidates.html`: wired in the same day** (Dan
  said go ahead). The Missionary uses the robe; each religion's symbol is
  drawn white on its color in a disc in the city's **lower-right** corner
  (not bottom-left as on the picker, because the garrison's disc sits
  lower-left and would cover it); the holy-city badge is gold on a dark
  disc in the **top-right** corner (moved left of the "!" badge when that
  shows). Panels show the same disc, and the badge beside it for a holy
  city. Credited in `src/data/icons.ts`, `CREDITS.md`, and About / Credits
  (**Carl Olsen** is a new author). Tests: 665 pass (the icon suite checks
  all 63 icons). Preview-verified at 768×1024 (`all-religion-symbols`, the
  Religion screen). The picks:

  | Subject | Pick | File | game-icons.net icon | Author |
  |---|---|---|---|---|
  | Missionary | B, Robed figure | `missionary-b.svg` | robe | Lorc |
  | Sun disc | A, Sun | `sun-a.svg` | sun | Lorc |
  | Flame | A, Flame | `flame-a.svg` | flame | Carl Olsen |
  | Star | A, Five-point star | `star-a.svg` | round-star | Delapouite |
  | Eye | A, Eye | `eye-a.svg` | semi-closed-eye | Lorc |
  | Tree | B, Pine | `tree-b.svg` | pine-tree | Lorc |
  | Spiral | B, Vortex | `spiral-b.svg` | vortex | Lorc |
  | Mountain | B, Peaks | `mountain-b.svg` | peaks | Lorc |
  | Wave | A, Breaking wave | `wave-a.svg` | big-wave | Lorc |
  | Holy city | B, Pillar of light | `holy-city-b.svg` | expanded-rays | Lorc |

  From the picker's notes: Star A is the same shape as the capital star,
  but they sit in opposite corners of the city (capital star top left, a
  religion's disc bottom right), so they don't clash; the holy-city badge
  has rays like the Sun disc, but it's gold on dark and the religion disc
  is white on color.


* **Round 13 — M9 part 1: menu, difficulty, map sizes, guide, and sound — done, APPROVED by Dan (2026-09-25).** Dan's feedback: **Large looked small overall**, which led to round 14 Part A. The agent's report follows, moved from Current Objective.

**Round 13 report (coding agent, 2026-09-25): done. APPROVED by Dan (2026-09-25)**, who checked everything and has his main theme music in. Version
0.13.0, save format 12. Tests: **718 pass** (`npm test`, `pace.test.ts`
included); `npm run build` clean, with the dev-code leak check passing.

| # | Item | Status | Verified by |
|---|------|--------|-------------|
| 0 | Commit docs first | Done (`b2ce6ac`), then re-read both. Nothing from last round's report was dropped | n/a |
| A1 | Main menu | Done. Shown when the game opens: an **EPOCH** wordmark (serif text in the accent gold, with a subtitle; no image), **Continue** (portrait, leader and civ, turn, era, difficulty, map size; hidden when there's no saved game), **New Game** (→ the setup screen), **How to Play**, **Almanac**, **Settings**, **Restore a backup**, **About / Credits**, the version, and in dev builds a folded "Dev scenarios" list. ☰ has a new **Main menu** item (autosaves first). **With no saved game**, the map behind the menu is a stand-in that is never saved, and New Game replaces it without making a backup (so the backup list doesn't fill with empty turn-1 games). `?new` still goes straight into a new game, skipping the menu. Notices (offers, war) wait behind the menu and show on Continue | unit-tested (startup rules); preview-verified on desktop, 768×1024 and 375×812 emulation (`main-menu`; a real v10 dev save upgraded and continued) |
| A2 | Settings | Done, saved on the device under `epoch.settings` (tips seen under `epoch.tipsSeen`), never in a game save: **sound effects on/off + volume**, **music on/off + volume** (−/+ in steps of 10; the row says how many sound files the build has), **animation speed** Normal/Fast, **Confirm End Turn** (on by default: "End your turn? N units can still move", with Keep playing / End Turn), **text size** Normal/Large (every font size scales by 1.18 in menus and panels; the map's own labels don't change), **first-game tips** on/off + "Show tips again", and in dev builds **Sound in dev scenarios**. From the main menu and ☰. **Reading:** computer turns are already instant, so animation speed changes how long the combat flash (900 → 450 ms) and news toasts stay | unit-tested (persistence, apart from saves, damaged values); preview-verified (Large text applies at once and is written to `epoch.settings`; Confirm End Turn asks with 2 units ready) |
| B1 | Difficulty | Done, **Novice / Normal / Veteran / Legendary** (Q27), in `src/data/difficulty.ts`, picked on the setup screen (with a line saying what changes), stored in the save, shown on the 🏆 screen's status line, the end screen, the main menu's Continue, and the New Game toast. Numbers as planned; they ride the leader-bonus system as empire-wide percents (so they stack with leader bonuses). **Readings:** "less/more aggressive" = the AI's aggression **toward you** −1.5 (Novice), +0.5 (Veteran), +1 (Legendary), not toward each other; "war earlier" = an AI may declare war on you from **turn 12** on Legendary (Normal 20; Novice 30); demands: Novice from turn 60, Legendary from 15. Legendary AIs start with the extra Warrior and Settler. Normal is exactly today's game (a test checks a Normal game equals one made before this round, seed for seed) | unit-tested (every level's percents, aggression, demand and war turns, starting units); preview-verified (Legendary + Small game started from the setup screen) |
| B2 | Map size | Done, `src/data/mapSizes.ts`: **Small** 24×18, up to 3 rivals (2–3 continents); **Normal** 32×24, up to 4 (today's); **Large** 44×32, **up to 5** (4–5 continents; `RULES.maxPlayers` is now 6). Villages and huts already follow the land area; each size now has its own caps (Small 2–5 villages / 3–8 huts, Normal 3–8 / 4–12, Large 5–13 / 6–20); resources are a chance per tile, so they scale on their own; start spacing and the smallest start landmass per size. The rivals count follows the size on the setup screen. **Victory goals scale for Large only (×1.25: culture 8750, gold 11250)**: without it Large games ended around turn 169. Large's iPad-sized check below | unit-tested (each size: grid, villages, huts, resource share, fair starts, landmass, spacing; rival caps; goals); preview-verified (`large-map` at 768×1024) |
| C1 | How to Play | Done: 9 short pages (moving and founding, cities, research and eras, combat/armies/fleets, ships and aircraft, diplomacy, villages/huts/Great People, religion and roads, **the four ways to win**) with the game's own icons and numbers read from the data; a page list plus Back / Next; names are links to their Almanac cards. From the main menu and ☰ | unit-tested (topics, links resolve); preview-verified on desktop and 768×1024 (`how-to-play`) |
| C2 | Almanac | Done: **160 cards** made from the data (30 units, 17 buildings, 16 wonders, 2 projects, 56 techs, 15 resources, 5 Great People, 12 leaders, 4 difficulty levels, 3 map sizes): stats, tech, cost, effects, prerequisites, unlocks, leads-to, reveals, starting tech of; leader cards show every bonus. Search (every word must match; names first), category chips, cross-links with ‹ Back. **Opens from anywhere:** an ⓘ button beside every build-list item, the tech screen's name and unlock links, and How to Play's links | unit-tested (a card for every data entry, every link resolves, search); preview-verified (search "rome" → Caligula; ⓘ on a build item; the tech screen link; 375×812) |
| C3 | First-game tips | Done: 7 one-time tips (welcome/found a city, first city, first tech (a starting tech doesn't count), first contact, first war, first barbarian village in sight, first Great Person), one at a time in a small green card under the top bar (not modal): **Got it** / **No more tips**. Seen tips are kept per device; Settings turns them off or shows them again. A dev scenario keeps its own list | unit-tested; preview-verified (`first-game-tips`: the whole sequence, and the device's list untouched) |
| D1 | Sound list + folder | Done: `src/assets/sounds/` (empty except a README) and **`docs/SOUNDS.md`**: the 14 events with exact file names, ideal length, the feel, **and a starting ElevenLabs prompt for each**, plus the format (MP3, trimmed, no need to level volume), the optional `music-1..3.mp3`, and where the settings are. A missing file plays nothing; new files need no code change | unit-tested (the doc lists every file in `src/data/sounds.ts`) |
| D2 | `docs/sounds.html` | Done: a Play button per event and per music track, "missing" for absent files, duration and loudness shown, the same normalization as the game, a volume slider, "Play all". The play server serves it at **http://10.0.0.224:4173/docs/sounds.html** with the files copied to `docs/sounds/` (`copy-pickers.mjs`); on the dev server it reads `src/assets/sounds/`. Settings links to it on the play server and in dev | unit-tested (lists every file, same numbers as the game); preview-verified (14 rows, "missing"; with a temporary test tone: "✓ 0.30 s … raised ×4.00"; the test file was removed) |
| D3 | Sound engine | Done (`src/ui/sound.ts`, rules in `soundLogic.ts`): Web Audio; **unlocks on the first tap or key**; effects and music each follow their on/off and volume; every file normalized to one loudness (RMS target, never clipping, at most ×4); **nothing plays while the page is hidden** (the audio context is suspended); **silent in dev scenarios** unless the dev setting allows; music crossfades between tracks (4 s). Hooks: select/open city (tap), move, found city, combat win/loss, End Turn news (**at most 2**, most important first: war on you, a city lost, a new era or tech, a wonder or building, a city grew; otherwise the soft new-turn cue; from the AIs' turns only war on you and a city lost), victory/defeat on the end screen. About / Credits shows "Sound effects generated with ElevenLabs" once any file exists | unit-tested (gates, volumes, normalization, End Turn picks); preview-verified: with a temporary WAV named `tap.mp3`, the engine loaded, decoded, and normalized it and the audio context was running after a tap. **Not heard by me** (no audio here, and there are no real files yet) |
| E1 | Migration v11 → v12 | Done: old games get Normal and a Normal map; backup kept as always; a v12 save missing either field is refused as damaged, not guessed | unit-tested; preview-verified (a real v10 dev save went v10 → v11 → v12 and continued) |
| E2 | Dev scenarios | Done, all 7: `main-menu`, `settings`, `difficulty-legendary-start`, `large-map` (60 turns played by the AI, whole map revealed, End Turn toasts its time), `almanac`, `how-to-play`, `first-game-tips`. Scenarios can now open a screen (`opens`) or show tips afresh (`freshTips`); `new-game-setup` uses `opens` too | unit-tested (each outcome); all 7 preview-verified |
| E3 | Unit tests | Done: `tests/round13.test.ts` (difficulty per level, map sizes, settings, Almanac coverage, sound rules, tips, the migration, startup) plus the 7 scenario outcomes; `pace.test.ts` passes at Normal | `npm test`: 718 pass |

- **Difficulty sim (`npm run sim -- difficulty`, seeds 101…150, 8 games of 5
  civs each; player 0 is a stand-in AI with the player's side of the level):**

  | Level | Victory mix | Win turns | Median | Stand-in wins |
  |---|---|---|---|---|
  | Novice | culture 4, economic 2, technology 1, domination 1 | 162–255 | **199** | **5 of 8** |
  | Normal | culture 3, economic 3, domination 1, technology 1 | 163–205 | **192** | 0 of 8 |
  | Legendary | technology 5, culture 2, economic 1 | 149–182 | **162** | 0 of 8 |

  Normal matches Round 12 (median 194 on the leaders report). On Legendary
  every AI is boosted, so someone wins ~30 turns sooner and one game ended
  at t149 (before the usual "no win before 150"). In a real game that's
  the pressure the level is meant to bring; flag for Round 15 if it feels
  too short.
- **Map-size sim (`npm run sim -- sizes`, same seeds, each with its most
  rivals):** Small (3 rivals): domination 3, culture 4, economic 1;
  t161–240, **median 196**. Large (5 rivals, goals ×1.25): culture 6,
  economic 1, technology 1; t169–219, **median 188** (before the ×1.25:
  median 169). Culture is even more dominant on Large (Round 15's balance
  item).
- **Large on iPad-sized emulation (768×1024; my desktop PC, DPR 1):**
  - **Frame rate:** a full redraw of the `large-map` scenario (turn 61, 45
    cities, 150 units, whole map revealed) takes **3.9 ms** at normal zoom
    and **6.6 ms** zoomed out to the whole map, far inside a 60 fps frame.
  - **AI turn time:** End Turn took **100–150 ms** around turns 61–66 in
    the browser. In the Node sim, Large averages **277 ms per game turn**
    over whole games, and one heavy game averaged 671 ms late on.
  - **Not measured on a real iPad.** The iPad draws at DPR 2 and has a
    slower CPU, so expect End Turn up to roughly 1–2 s late in a big Large
    game. Dan, please try `large-map` (it toasts the time) and a real Large
    game.
- **Readings I chose (tell me if you want them different):** difficulty
  aggression applies toward you only; Novice also keeps war off you until
  turn 30; Large allows 5 rivals (6 civs); goals scale only on Large; with
  no saved game the main menu has no Continue and the map behind it isn't
  saved; Confirm End Turn is **on** by default; animation speed can't speed
  up computer turns (they're instant), so it shortens flashes and toasts;
  "city lost" uses the combat-loss sound (the list has no separate one).
- **Dan, next:** (a) make the sounds from `docs/SOUNDS.md` (it has a
  starting prompt for each), drop them in `src/assets/sounds/`, and check
  them on http://10.0.0.224:4173/docs/sounds.html after the next play-server
  restart; (b) try the main menu, Settings, How to Play, and the Almanac;
  (c) start a Novice or Legendary game on a Small or Large map; (d) on
  `dev:lan`, try `large-map` for smoothness and End Turn time.


* **Round 14 — M9 part 2: bigger maps, art pass, era music — done, APPROVED by Dan (2026-09-25).** Terrain A (Painted), city style B (Bold buildings), and all building and wonder icons are picked and wired in. The agent's report follows, moved from Current Objective.

**Round 14 report (coding agent, 2026-09-25): done. APPROVED by Dan (2026-09-25).**
Version 0.14.0, save format still 12 (nothing in the state changed, so no
migration). Tests: **754 pass** (`npm test`, `pace.test.ts` included; 34 new);
`npm run build` clean, dev-code leak check passing on `dist/` and `dist-play/`.

| # | Item | Status | Verified by |
|---|------|--------|-------------|
| 0 | Commit docs first | Done (`a218edf`), then re-read both. Nothing from last round's report was dropped | n/a |
| A1 | Huge and Epic | Done. **Huge 64×44, Epic 80×56**, both up to 5 rivals, in `mapSizes.ts` and on the New Game screen (5 sizes). **Epic is offered everywhere**; on a touch device (an iPad) picking it shows "Epic runs best on a computer…", on a computer a plain note that big maps have the longest turns. Scaled: continents (5–6 on Huge, 6–7 on Epic), villages (8–20 / 10–26), huts (10–30 / 12–38), resources (a chance per tile, so they follow the area), start spacing (11 / 13), the smallest start landmass (30 / 36), fair starts (Round 13's per-size test now covers both). **Victory goals and tech costs, calibrated in the sim** (8 games each, table below): Huge ×1.65 goals (culture 11550, gold 14850) and techs +35%; Epic ×1.5 (10500, 13500) and techs +25%. The tech change is a new per-size `techCostPct`, 0 on Small/Normal/Large | unit-tested (sizes, caps, fair starts, goals, tech cost, the touch note); preview-verified (setup screen at 1024×768 and in phone emulation for the touch note) |
| A2 | Maps that feel big | Done. **(1) Default view:** a game opens at about **12×9 tiles** around your capital (85 px tiles on a 1024×768 iPad; was 52). **(2) Zoom-out cap:** pinching out stops at **40 tiles across the longer side, never under 28 px** (was 22 px with no area cap). **(3) Minimap** (top right, under ☰): the explored world in terrain colors, fog dimmed, every known city as a dot in its owner's color, and a gold frame for the view; **tap to jump, drag to pan**; 🗺 folds it (a device setting, `minimap`); hidden while the city panel covers that corner in landscape. **(4) Landmasses on Huge and Epic:** continents of different sizes (a random head start per continent center), wider channels, and 5 / 8 **chains of small islands** in the open sea. Small, Normal, and Large maps are unchanged (the new rules are off for them) | unit-tested (default view, cap, minimap maths, landmass shapes on 6 seeds each); preview-verified at 1024×768 (`minimap`, `huge-map`) |
| A3 | Performance | Done. **(1) Web Worker:** End Turn runs in `src/ui/turnWorker.ts` on a copy of the game; the page shows **"Rivals are moving…"** by the End Turn button (held meanwhile; other actions wait with a toast), and the map still pans and zooms. The worker loads when the game opens, so the first End Turn doesn't wait for it. If a worker can't start or fails, the same job runs on the page. **(2) Speed-ups** (profiled a turn-180 Huge game): unit path search is now A* with a heap and per-search lookups of cities and units (it re-sorted its whole list at every step and scanned every unit and city for every neighbor: half of all AI time); leader bonuses are cached by the techs list instead of working out the era on every tile yield (a sixth of AI time); road paths use the same heap (same results as before); visibility marks tiles with plain loops. **Same late Huge game: 629 → 143 ms per game turn** (4.4×). **(3) Drawing:** only on-screen tiles were drawn already; the terrain is now **pre-drawn in chunks** (about 512 device px each) once the zoom holds, redrawn only when you explore beside them. **(4) Timings:** table below; `huge-map` and `epic-map` scenarios for Dan's iPad | unit-tested (worker job gives the identical game over 5 End Turns; a failing job reports instead of throwing; paths still cheapest, checked against brute force with roads, rails, and rivals; ship paths stay at sea; a late Huge End Turn under 1.5 s in Node); preview-verified (worker in the dev server and in the real play build; "Rivals are moving…" shown and End Turn held; frame times below). **Not measured on a real iPad** |
| B1 | Terrain style picker | Done: **`docs/terrain-style-candidates.html`**. Three complete styles drawn in code (`src/render/art.ts`), plus today's look for comparison: **A Painted** (a tint that drifts slowly across the map, shaded hills, tree clusters, sandy shores, lighter shallows, **shimmering water**), **B Storybook** (bright colors, **bold outlines along every coast**, lollipop trees, outlined mountains, a cactus now and then, like the portraits), **C Clean flat** (muted colors, small geometric marks, no gradients). Each shows the same demo map (every terrain, a coast and an island, cities, units, an army, a ship, resources, a hut, a barbarian village, a road, a railroad, fog) **at 3 zoom levels (26, 46, 76 px)**, drawn by the game's own renderer (the page bundles it), so what Dan sees is what the game draws. Picker: Pick buttons, a "together" view of both picks, Copy my picks / Share (with the http fallback the other pages have). **Not wired as the default: Dan hasn't picked yet**, so the game keeps today's look; dev builds can switch (☰ → Art style) | preview-verified at 1100 px (all styles, both city styles, picking); the page is built by `node scripts/make-art-page.mjs` |
| B2 | City looks | Done, **on the same page**. Looks by size in data (`src/data/cityLooks.ts`): **village 1–3, town 4–7, city 8–12, metropolis 13+** (3, 5, 7, 9 buildings), and **by the owner's era** (huts, stone and tile, brick and chimneys, glass towers). Two candidates: **A Little towns** (soft houses on a neutral patch ringed in the owner's color, an owner's pennant) and **B Bold buildings** (outlined, roofs in the owner's color). The size is a small badge; the capital star, religion disc, holy-city badge, and "!" stay on top. **Walls are drawn** (a stone wall with corner towers) in every style, **including today's look, which the game shows now** | unit-tested (thresholds); preview-verified (`city-growth-looks`, `walls-drawn`, the page) |
| B3 | Building icon picker | Done: **`docs/building-icon-candidates.html`**: **3 candidates for each of the 17 buildings**, a **generic wonder** icon (3), and **2 for each of the 16 wonders** (86 icons from game-icons.net, CC BY 3.0, in `docs/building-icon-candidates/` with `SOURCES.md`; made by `node scripts/make-building-icons-page.mjs`). Each is shown large, in a build-list row (28 px), and as a small chip, with overview grids; the same picker as the other icon pages (`epoch.buildingIconPicks`). Wired in after Dan picks | preview-verified (the page, picking) |
| B4 | Title art | Done, the code half; **I recommend Dan make the picture** with an AI image generator. **`docs/TITLE-ART.md`**: 2048×1536 landscape (plus an optional 1536×2048 portrait), JPG under 800 KB, no text in it, dark overall, interest at the sides (the middle is darkened for the menu), and a starting prompt. Drop `title-background.jpg` in `src/assets/title/` and the main menu shows it, no code change. The **wordmark** is now beaten gold (a gradient through the letters) | preview-verified (the wordmark at 1024×768); the picture hook was not seen (no picture yet) |
| C1 | Music per era | Done. `music-theme.mp3` on the **main menu and the New Game screen**; in a game, **your era's track**, crossfading (4 s) at a new era; each track **loops by crossfading into itself**; a missing era track plays the theme; **`music-1.mp3` stands in for a missing theme**. Only the playing track stays decoded (an era track is tens of MB decoded). `docs/SOUNDS.md` and `docs/sounds.html` list the five files (the page shows which are present before anything plays); About / Credits says **"Music generated with Suno."** Dan's 19 files are committed (his `music-industrial.mp3.mp3` renamed to `music-industrial.mp3`); nothing is named `music-1.mp3`, so no rename is needed | unit-tested (the track choice and every fallback); preview-verified (the engine played Ancient, then crossfaded to Medieval after End Turn reached the Medieval era; the play build's sounds page shows 5 of 5; the credits line). **Not heard by me** (no audio here) |
| D1 | Save migration | **Not needed:** nothing in the saved state changed (the minimap and art choice are device or view state; map sizes are data). `STATE_VERSION` stays 12; a Huge or Epic game saves and loads | unit-tested |
| D2 | Dev scenarios | Done, all 7: `huge-map` and `epic-map` (late games at turn 151 from saved fixtures, all revealed; End Turn toasts its time), `minimap`, `city-growth-looks`, `walls-drawn`, `terrain-styles`, `era-music` (sound on in this one, with Theme / Ancient / Medieval / Industrial / Modern / Game buttons in its note) | unit-tested (each outcome); preview-verified (all 7) |
| D3 | Unit tests | Done: `tests/round14.test.ts` (20) and the 7 scenario outcomes; `pace.test.ts` passes | `npm test`: 754 pass |

- **End Turn timing table.** Node on this PC (`npm run sim -- perf`, 2 games
  per size, 250 turns, the most rivals). "End Turn" = your cities' end of turn,
  then every rival and the barbarians (your own moves aren't counted):

  | Map | turns 1–50 | 51–100 | 101–150 | 151–200 | 201–250 | slowest turn |
  |---|---|---|---|---|---|---|
  | Normal 32×24, 4 rivals | 8 ms | 15 ms | 19 ms | 26 ms | 36 ms | 64 ms |
  | Large 44×32, 5 rivals | 10 ms | 41 ms | 79 ms | 128 ms | 142 ms | 239 ms |
  | Huge 64×44, 5 rivals | 14 ms | 44 ms | 61 ms | 100 ms | 138 ms | 326 ms |
  | Epic 80×56, 5 rivals | 16 ms | 44 ms | 57 ms | 103 ms | 195 ms | 384 ms |

  In the browser at iPad size (1024×768, this PC, DPR 1), End Turn from tap to
  your turn again (the worker's time plus copying the game both ways):
  **Large** (`large-map`, t62) 52–61 ms; **Huge** (`huge-map`, t151) 69–189 ms;
  **Epic** (`epic-map`, t151) 131–199 ms (199 ms was the first End Turn, with
  the worker already loaded; before that change the first one took 557 ms).
  The longest the page itself stood still during an End Turn: 66–86 ms (the
  copy back). **Frames:** 2–5 ms on the Huge map with the pre-drawn terrain
  (about 15 ms for the one frame that redraws the chunks after a zoom).
  **Before the speed-ups** (the same turn-180 Huge game, 20 turns, in Node):
  629 ms per game turn; after: 143 ms.
  **iPad estimate:** Round 13 guessed an iPad at 2–3× slower than this PC and
  DPR 2. That puts late Huge at roughly 0.3–0.5 s typical and 1 s at worst,
  and Epic at 0.4–0.6 s typical, 1.2 s at worst: under the 1.5 s target, and the
  screen doesn't freeze either way. **Only Dan can confirm it** (`huge-map`,
  `epic-map`). Epic stays labeled "best on a computer" on the iPad as
  planned; the numbers say it may not need the label (Dan's call after timing).
- **Victory calibration** (`npm run sim -- sizes`, seeds 101…150, the most rivals):

  | Map | Goals | Techs | Victory mix | Win turns | Median |
  |---|---|---|---|---|---|
  | Huge, first try | ×1.25 | as Normal | culture 7, economic 1 | 169–243 | 185 |
  | Epic, first try | ×1.25 | as Normal | economic 7, culture 1 | 173–192 | 181 |
  | **Huge (kept)** | **×1.65** | **+35%** | technology 3, culture 3, economic 2 | 176–217 | **198** |
  | **Epic (kept)** | **×1.5** | **+25%** | culture 5, economic 3 | 192–215 | **207** |

  Why: every civ reaches its 10-city cap on a big map (6 on Normal), so
  culture, gold, and science all come faster. (The first tries also had
  narrower channels; the kept rows are on today's maps.)
- **Readings I chose (tell me if you want them different):** Epic is offered on
  every device (labeled on touch devices), per Q29; the tech cost goes up on
  Huge and Epic only (the older sizes are untouched); the zoom-out cap is 40
  tiles across the longer side and at least 28 px; the minimap folds instead of
  being turned off in Settings; walls are drawn now in today's look too; while
  the rivals move you can pan and zoom but not act; the art switch is dev-only
  (the game shows today's look until you pick); the title picture is yours to
  make (`docs/TITLE-ART.md`).
- **Note on the path search:** A* can pick a different path of the same cost
  than the old search, so the same seed now plays slightly differently (Normal
  included). The pace test passes; one test's allowance (units per city in a
  seed-33 game) went from 3 to 4 extra. Normal's pace is unchanged:
  `npm run sim -- leaders` (seeds 101…164) gives culture 5, technology 3,
  economic 1, domination 1, wins t176–213, **median 189** (Round 12: 194;
  Round 13's Normal difficulty row: 192).
- **Dan, next:** (a) pick on the play server:
  http://10.0.0.224:4173/docs/terrain-style-candidates.html (one terrain
  style, one city style) and
  http://10.0.0.224:4173/docs/building-icon-candidates.html (34 subjects), and
  paste the Copy my picks text to the planning session; (b) on `dev:lan`, open
  ☰ → Dev scenarios → "Map size: late in a Huge game" (and the Epic one) on the
  iPad and on the PC and read the End Turn toast; play a Huge game on either;
  (c) listen: the main menu plays the theme, a game your era's track
  (`era-music` jumps through them); (d) optionally, make the title picture from
  `docs/TITLE-ART.md`.

- **Dan's art picks (2026-09-25), from `docs/terrain-style-candidates.html`:
  Terrain A (Painted), City style B (Bold buildings). Wired in the same day**
  as the game's look (`DEFAULT_ART` in `src/render/art.ts`), in every build.
  The old look stays in the code as "Old" on the dev-only ☰ → Art style
  switch, with the other candidates, for comparison. The painted water
  shimmers: the map redraws about 8 times a second while the page is showing
  (about 3–5 ms a frame on this PC). Preview-verified at 1024×768
  (`huge-map`); 754 tests pass. **Still waiting:** the building icon picks
  (`docs/building-icon-candidates.html`) and the iPad timings.

- **Dan's building icon picks (2026-09-25), from
  `docs/building-icon-candidates.html`: wired in the same day.** Buildings:
  Granary B Barn, Barracks A Barracks, Walls B Defensive wall, Library A
  Bookshelf, Marketplace A Shop, Temple C Egyptian temple, Harbor B Anchor,
  Airport B Departing plane, Courthouse A Gavel, Cathedral A Church, Colosseum A
  Arena, University A Graduate cap, Bank C Money stack, Factory A Factory, Power
  Plant C Lightning, Research Lab C Flask, Stock Exchange A Chart. Wonders:
  generic A Columns, Pyramids B Great pyramid, Hanging Gardens B Fruit tree,
  Colossus A Statue, Oracle A Crystal ball, Great Library B Scroll, Great Wall A
  Castle, War Academy A Sword altar, Grand Bazaar A Pavilion, Grand Cathedral A
  Domed cathedral, Royal Observatory A Observatory, Grand Workshop A Gear and
  hammer (Dan first picked B Anvil, then swapped it, since that's Iron's map icon),
  Broadcast Tower A Radio tower, Global Network A Servers, World Council A
  World, Global Exchange B Paying money, Versailles B Crown. Shown in the city
  panel's build list, its Buildings list (as chips) and Wonders list, and on
  the Almanac cards; credited in `src/data/icons.ts` (`BUILDING_ICONS`,
  `WONDER_ICONS`, `GENERIC_WONDER_ICON`), `CREDITS.md`, and About / Credits.
  789 tests pass; preview-verified at 1024×768
  (`huge-map`: build rows, building chips, wonder list, Almanac cards).

* **Round 15 — M9 part 3: the name, balance, Add to Home Screen, offline, and go-live prep — done, APPROVED by Dan (2026-09-25).** Balance leftovers (North Korea, Russia, and the Franks still weak; no domination on Huge or Epic; Huge leans economic; Legendary leans technology) are queued as a later balance round in Next Steps. The agent's report follows, moved from Current Objective.

**Round 15 report (coding agent, 2026-09-25): done. APPROVED by Dan (2026-09-25).**
Version 0.15.0, save format still 12 (nothing in the saved state changed, so
no migration; old saves load as they are). Tests: **818 pass** (`npm test`,
`pace.test.ts` and the new `balance.test.ts` included); `npm run build` clean,
dev-code leak check passing on `dist/` and `dist-play/`.

| # | Item | Status | Verified by |
|---|------|--------|-------------|
| 0 | Commit docs first | Done (`369a51d`), then re-read both. Nothing from last round's report was dropped | n/a |
| A1 | The name in one place | Done. **`src/data/game.ts`** (`GAME`): name "Epoch: From Stone to Stars", short name "Epoch", wordmark EPOCH, subtitle "From Stone to Stars", tagline, and the icon blue. `index.html` has only `%GAME_…%` placeholders, filled at build and in dev by `scripts/pwa-plugin.ts`: `<title>`, the top bar's short name, the wordmark and subtitle (now a proper serif subtitle, pale gold, under the big gold EPOCH), About's heading. About says "Epoch: From Stone to Stars · version 0.15.0" (no more "working title"); How to Play's first page and the first tip ("Welcome to Epoch!") use it; the manifest's `name`/`short_name` come from it; GO-LIVE.md and the hub card use the full name. Saves and settings keys stay `epoch.*` | unit-tested (placeholders, the build fills them, guide, tip, manifest, GO-LIVE); preview-verified (title screen at 1024×768 and 768×1024, the tab title) |
| B1 | Victory mix | Done, as data (no rule changes). **Culture goal 7000 → 8000, gold goal 9000 → 13000** (the gold rise follows B4: roads bring trade); **each size can now set its own culture and gold percent** (`culturePct`/`goldPct` in `mapSizes.ts`): Small 115/60, Large 125/115, Huge 175/150, Epic 145/160; **conquerors a bit bolder** (`RULES.ai.victory`: strength ratio 1.1 → 1.0, attack force 5 → 4, attack odds 45 → 40%, war offense ×3 → ×4). Result below: **culture is at most 40% on every size** (it was 60% on Small, 55% on Normal); **no kind above 40% except Huge (economic 45%)**; domination appears on Small, Normal, and Large but **not on Huge or Epic** (6 civs, capitals overseas; it never did there). I tried the Victory wonders later in the tree and much bolder conquerors; neither helped, so they're not in | `npm run sim -- matrix` (20 games per row); unit-tested (the goals per size) |
| B2 | Weak leaders | Done. **Rome** 6 → 9 wins (0.62 → 0.93 of its fair share): Ancient Triumphs also makes military units 15% cheaper, Medieval Legions adds armies +25%, the drawback is −5% gold (was −10%). **England** was no longer weak in the matrix (1.37× before this round's other changes, 1.08× after), so unchanged. **Russia** 3 → 7 (0.25 → 0.58): met techs −35% (was −25%), Western advisers +4 science per met civ (was +2), Modernization +35% (was +25%). Also: the **Franks** Paladins make military units 10% cheaper (0.54 → 0.62); **North Korea**'s drawback is −5% science and gold (was −10%) but it still won only 1 of 54 (**flagged: still weak**); the strong ones trimmed: **France** Splendor +25% wonder culture (was +50%; 1.61 → 1.10), **the United States** Ingenuity +5% science (was +10%) and Moonshot parts 25% cheaper (was half; 1.93 → 1.44), **Ukraine** Partners +4% per civ up to +12% (was +5%/+20%; 1.66 → 1.58). **Every leader is under 2× its fair share** (highest Ukraine 1.58×). Table below | matrix (140 games); unit-tested (every changed bonus) |
| B3 | Legendary pacing | Done: the AIs get **+25% production, +20% science, +10% gold** (was +30% each), and **Legendary's culture and gold goals are 15% higher** (new `goalPct` in `difficulty.ts`, read by `victoryGoals(size, difficulty)`). **First win t163** over 20 games (was t140), median 185 (was 163); the stand-in player won 0 of 20 (hard as before) | matrix; unit-tested |
| B4 | AI roads | Done: from **turn 50**, an AI buys one road a turn linking two of its own cities (up to 8 tiles apart), costing **up to 80 gold**, **before** rush-buying anything, keeping only its usual reserve (an AI saving for the economic win buys too) (`ROADS.ai.priorityFromTurn`, `priorityMaxCost`). **Roads per civ, Normal: 2.6 → 9.8 tiles at t100, 7.8 → 11.6 at t200**; every size in the table below | matrix; unit-tested (`ai-roads` scenario outcome) |
| B5 | Theology | Done: **Theology now unlocks the Grand Cathedral** (it was Monotheism's), and it still founds a religion for a civ that has none. Chosen over "+culture from Cathedrals" because B1 wanted less culture, not more | unit-tested; `theology` preview-verified |
| B6 | Tree length | **Decided: keep it.** Pace (`npm run sim`, 5 seeds × 300 turns): era medians **Medieval 68, Industrial 130, Modern 204** (targets 50–70, 120–150, 180–220); the **first** civ finishes the tree at t167–184, the **median** civ at t240. Games end at a median of ~t200, so a longer tree would only push technology wins later than the others and the games past 2–3 hours. The ~250 target fits the median civ, not the leader | `npm run sim`; `pace.test.ts` |
| B7 | Full sim matrix | Done: table below. New `npm run sim -- matrix` (every size at Normal with its most rivals, plus Novice and Legendary on the Normal map; 20 games each, to the first win; JSON per row; `TUNE=` tries numbers without editing data) | `npm run sim -- matrix` |
| C1 | Add to Home Screen | Done. **Web app manifest** (from `GAME`): name, short name "Epoch", description, `display: standalone`, `orientation: any`, `start_url`/`scope` `/`, theme and background **#001f57** (the icon's blue; the menu's own dark looked flat against the icon). **Dan's icons** moved to `public/icons/` (192, 512, maskable 512, Apple touch 180, favicons 48 and 32; the 1024 master to `docs/app-icon/`, not shipped); `docs/app-icon-incoming/` removed; `index.html` links the manifest, the Apple touch icon, and the favicons, plus `apple-mobile-web-app-title` "Epoch" and a translucent status bar. Safe areas were already honored (`viewport-fit=cover`, every edge panel uses the insets). **`docs/APP-ICON.md`** says where the files live and how to replace them | unit-tested (manifest, every icon exists at its size); preview-verified (icon files served, favicon); **not on an iPad**: Add to Home Screen needs Dan (the Netlify site is best, see C2) |
| C2 | Offline and updates | Done. **Service worker** (`src/pwa/sw-template.js`, written to `sw.js` by the build with this version's file list): it caches the page, code, icons, portraits, and sound effects on first load, and **the music the first time each track plays** (21 MB, not up front). **Updates:** a new version installs in the background and **waits**; the game shows **"Update available: tap to reload"** under the top bar and never reloads by itself; tapping saves the game first (and waits if the rivals are moving). Checked on load, every 30 minutes, and when the game comes back into view. Saves and backups live in localStorage, which the worker never touches. **Dev server: never registered. Play server: browsers allow a service worker only on https or localhost, so on `http://10.0.0.224:4173` it simply doesn't run** (the play server behaves exactly as before); it runs on Netlify (https) and on localhost. `netlify.toml` has no-cache headers for `sw.js`, `index.html`, and the manifest, and long caching for `/assets/`. **Sizes:** the whole build is **28.6 MB**: to start, **0.7 MB** (page 16 KB, code 517 KB (179 KB gzipped), styles 33 KB); cached for offline in the background **7.7 MB** (37 files, mostly the 12 portraits at ~0.45 MB each); music **20.9 MB** on demand. **First load** (the play build on this PC, localhost, the first visit, before the service worker had cached anything): page ready in **0.28 s**, everything loaded in 2.9 s (with 7 sims running on the CPU); a reload from the cache 0.09 s | unit-tested (the worker run against a fake browser: install, offline, music, takes over only when asked, drops old caches; the page's update rules); preview-verified on the built game at localhost: 37 files cached, **then with the server stopped the game still opened and started a new game**; the banner via `update-available` |
| C3 | UI polish | Done. Fixed: (1) **the top bar ran under the minimap** in portrait with Large text: the minimap now moves down below the top bar when they'd meet; (2) **🤝 Diplomacy shows just 🤝** on narrow screens (under 600 px, or under 900 px with Large text), so the top bar stays two lines on a portrait iPad; (3) **toasts, tips, and the update banner sit just under the top bar** however tall it is (they were at a fixed 104 px, overlapping the top bar's second line at Large text); (4) **a toast no longer covers a first-game tip** (it lines up under it); (5) **with the city panel open in landscape, the top bar wraps before the panel** instead of running under it (at 800×600 its science-rate buttons were hidden), and **toasts center on the map beside the panel**; (6) **with a full screen open** (tech, diplomacy, victory, settings…) **toasts move to the bottom edge** instead of covering its first rows; (7) **the leader button is 44 px tall** like every other button (was 36); (8) the title's subtitle. Checked every visible button at 1024×768: all ≥ 44 px. Phones (375 px) work but the top bar is tall with Large text; not a target device | preview-verified at 1024×768 and 768×1024 (iPad sizes, Normal and Large text), 800×600 and 1600×1000 (desktop), 375×812 |
| D1 | Production build | Done: `npm run build` has no dev code (the check passed), the manifest, `sw.js`, and the icons are in `dist/`, and everything is credited: `CREDITS.md` now also lists the sounds (ElevenLabs), the music (Suno), the portraits and app icon (Dan's), and fonts (none bundled); About says the portraits and app icon were made for the game by Dan. `netlify.toml`: Node 24 pinned, cache headers added, SPA redirect kept. **`docs/GO-LIVE.md`**: Dan's steps in order (create the site, pick the name, check on the PC, Add to Home Screen and the offline check on the iPad, the hub card, telling the planning session, rollback) | `npm run build`; unit-tested (GO-LIVE names the game) |
| D2 | Hub card | Drafted in `docs/GO-LIVE.md` step 5: id `epoch`, name "Epoch: From Stone to Stars", a tagline, icon 🏛️ (the hub uses emoji), accent `#4a7fd6`, tags solo / strategy / 2–3 hours, and a placeholder URL to replace. **The hub repo was not edited or pushed** (read only, to copy the card format) | n/a |
| D3 | IP review | Done. **"Civilization" appears nowhere in the game** (searched the source's shipped text and the built `dist/`; "Civ Rev" appears only in code comments, which the build strips; checked). No Firaxis/2K names. Unit, building, wonder, and tech names are historical or generic; all leader bonus names and texts are our own. Every icon is credited (game-icons.net, CC BY 3.0); sounds, music, portraits, and app icon credited as above. **Living people in the roster (a note for Dan; no change): Angela Merkel (Germany), Viktor Yushchenko (Ukraine), Kim Jong Un (North Korea).** Found and fixed: About still said "(working title)". Nothing else found | searches of `src/`, `index.html`, `dist/` |
| D4 | Push rule after go-live | Done: CLAUDE.md's pushing rules now say the epoch repo is pushed every round **until Dan confirms the Netlify site is live**, and after that **only when Dan says** (commits wait, and the report says so). Technical Notes updated the same way | n/a |
| E1 | Scenarios | Done, 3 new: **`update-available`** (the banner shows under the top bar, stays while you play, tapping it says what the real game would do), **`theology`** (one End Turn from Theology; the Grand Cathedral appears in the build list), **`ai-roads`** (a rival with gold and two unlinked cities buys the road on its turn). **No `offline` scenario:** the dev server never runs the service worker, so it can't be faked honestly there; offline was checked on the built game instead (C2) | unit-tested (each outcome); all 3 preview-verified |
| E2 | Tests | Done: `tests/round15.test.ts` (22: the name everywhere, the manifest and icon sizes, the service worker against a fake browser, the update rules, the new goals), `tests/balance.test.ts` (8 Normal games: someone wins each, never before 150, no kind over 5 of 8, at least 3 kinds, no leader over half, at least 4 different winners), the 3 scenario outcomes, the changed leader tests; `pace.test.ts` passes | `npm test`: 818 pass |

- **The full sim matrix (B7), after the changes.** 20 all-AI games per row
  (seeds 101…234), each size with its most rivals, played to the first win.
  Era medians count a civ that never got there as "later" (— = most games ended
  before it). Roads = road and rail tiles near each civ's cities.

  | Row | Victory mix | Win turns | Median | Medieval / Industrial / Modern | Roads t100 / t200 | Stand-in wins |
  |---|---|---|---|---|---|---|
  | Small (3 rivals) | culture 7, domination 6, technology 4, economic 3 | 166–266 | 200 | 69 / 127 / — | 6.5 / 6.5 | 5 |
  | Normal (4 rivals) | culture 8, economic 6, technology 5, domination 1 | 162–235 | 196 | 64 / 121 / 200 | 9.8 / 11.6 | 4 |
  | Large (5) | economic 7, culture 6, technology 6, domination 1 | 168–235 | 200 | 64 / 119 / 197 | 14.3 / 17.2 | 1 |
  | Huge (5) | economic 9, technology 8, culture 3 | 179–232 | 208 | 70 / 120 / 172 | 18.4 / 20.8 | 1 |
  | Epic (5) | culture 8, economic 6, technology 6 | 186–221 | 204 | 68 / 111 / 162 | 18.0 / 19.9 | 1 |
  | Novice, Normal map | culture 9, economic 5, technology 4, domination 2 | 179–237 | 206 | 72 / 135 / — | 9.4 / 11.2 | 16 |
  | Legendary, Normal map | technology 11, culture 5, economic 3, domination 1 | 163–215 | 185 | 51 / 107 / 167 | 10.4 / 12.0 | 0 |

  **Before (the same seeds, start of this round):**

  | Row | Victory mix | Win turns | Median | Medieval / Industrial / Modern | Roads t100 / t200 |
  |---|---|---|---|---|---|
  | Small | culture 12, domination 5, technology 3 | 160–238 | 203 | 70 / 137 / — | 2.9 / 5.9 |
  | Normal | culture 11, technology 6, domination 2, economic 1 | 176–228 | 192 | 64 / 130 / 189 | 2.6 / 7.8 |
  | Large | culture 8, technology 8, economic 4 | 168–241 | 191 | 63 / 124 / 184 | 1.4 / 9.5 |
  | Huge | culture 10, economic 6, technology 4 | 176–243 | 201 | 73 / 128 / 178 | 1.3 / 12.5 |
  | Epic | culture 9, economic 9, technology 2 | 174–216 | 196 | 72 / 120 / 169 | 1.2 / 11.6 |
  | Novice | culture 10, technology 6, economic 3, domination 1 | 162–245 | 191 | 75 / 147 / — | 1.3 / 8.3 |
  | Legendary | technology 7, culture 7, economic 5, domination 1 | 140–201 | 163 | 50 / 108 / 158 | 4.3 / 10.6 |

  **Wins per leader, all 140 games** (fair share = what it would win if every
  civ in its games were equally likely to win; the civs drawn are the same
  before and after):

  | Leader | Played | Wins before | ×fair before | Wins after | ×fair after |
  |---|---|---|---|---|---|
  | Egypt (Hatshepsut) | 64 | 10 | 0.83 | 14 | 1.16 |
  | England (Henry VIII) | 54 | 14 | 1.37 | 11 | 1.08 |
  | France (Louis XIV) | 71 | 22 | 1.61 | 15 | 1.10 |
  | Franks (Charlemagne) | 68 | 7 | 0.54 | 8 | 0.62 |
  | Germany (Merkel) | 71 | 12 | 0.91 | 16 | 1.22 |
  | Gran Colombia (Bolívar) | 53 | 12 | 1.18 | 12 | 1.18 |
  | Mali (Mansa Musa) | 57 | 8 | 0.74 | 9 | 0.83 |
  | North Korea (Kim Jong Un) | 54 | 1 | 0.10 | 1 | 0.10 |
  | Rome (Caligula) | 52 | 6 | 0.62 | 9 | 0.93 |
  | Russia (Peter the Great) | 64 | 3 | 0.25 | 7 | 0.58 |
  | Ukraine (Yushchenko) | 67 | 21 | 1.66 | 20 | 1.58 |
  | United States (JFK) | 65 | 24 | 1.93 | 18 | 1.44 |

  Over all 140: culture 46, technology 44, economic 39, domination 11 (before:
  culture 67, technology 36, economic 28, domination 9).
- **Still off target (worth a look, not fixed):** Huge is 45% economic;
  Legendary is 55% technology (its pacing target is met); no domination on
  Huge or Epic; **North Korea won 1 of 54** and Russia and the Franks are still
  under their share (the conquerors struggle to finish the job); Small games
  can run long (one to t266). 20 games a row is noisy: the same numbers moved
  a row by 2–3 wins between runs.
- **Readings I chose (tell me if you want them different):** the theme color
  is the icon's blue, not the menu's dark; the hub card's emoji 🏛️ and accent
  `#4a7fd6` (on the felt, the icon blue is too dark and gold is taken); the
  update banner waits while the rivals move; Theology's new use is the Grand
  Cathedral; the victory-wonder techs stay where they were; the tree length is
  kept (B6); the portraits stay PNG (WebP would cut the offline download from
  7.7 MB to about 2.5 MB; say if you want it).
- **Heads-up:** on the play server the game can't install offline or show the
  update banner (http on the LAN; browsers only allow service workers on https),
  so those are for the Netlify site. Add to Home Screen from the play server
  still gives a full-screen icon.
- **Dan, next:** (a) look at the title screen, and a real game at Large text
  on the iPad (`http://10.0.0.224:4173/`); (b) optionally, the title picture
  (`docs/TITLE-ART.md`); (c) time `huge-map` and `epic-map` on the iPad
  (Q31); (d) when ready, follow **`docs/GO-LIVE.md`**, then tell the planning
  session the site is live (pushing becomes your call from then).

* **Round 16 — Cloud saves with Firebase, and the portraits as WebP — done and pushed (2026-09-25, live as 0.16.0), NOT yet approved.** Dan did both console steps and tested: **the PC's game reached the iPad** once the iPad was actually signed in (at first he thought it was signed in when it wasn't). He asked for a manual save and a clearer sign-in; both are in Round 16b. The agent's report follows, moved from Current Objective.

#### Round 16 report (coding agent, 2026-09-25): all items done; pushed 2026-09-25

**Before pushing, Dan does the two console steps in `docs/FIREBASE-SETUP.md`**
(publish `firestore.rules`; add `https://epoch-fsts.netlify.app/__/auth/handler`
to the OAuth client's redirect URIs). Without them the game still plays and
saves on the device, but signing in on the iPad and saving to the cloud fail.

| # | Item | Status | Verified |
|---|---|---|---|
| 0 | Docs commit, live URL, tidy sim files | Done. Docs committed first (`ab52178`). Live URL recorded in CLAUDE.md ("Where things stand") and at the top of `docs/GO-LIVE.md`. The 73 `sim-matrix-*.json` files and `sim-report.txt` moved to `sim-out/` (git-ignored); `npm run sim` writes there from now on (`simOut()` / `SIM_OUT` in `src/dev/sim.ts`). | `npm run sim -- save-size` wrote to `sim-out/`. |
| A1 | Config and loading | Done. Config in `src/data/firebase.ts`. Firebase JS SDK **12.19** (current major), modular, only in `src/cloud/firebase.ts`, loaded by a dynamic import on Sign in, or at start if the player was signed in (`epoch.cloud` flag) or is coming back from a redirect. **First load: before 553 KB / 186 KB gzipped (3 files); after 577 KB / 194 KB gzipped** (+8 KB gzipped for the sync, the menu, and the compression code; no SDK). The SDK chunk is 538 KB / 158 KB gzipped, loaded only when needed. The service worker never handles `/__/` (sign-in) or other sites (Firebase, Google), and keeps the SDK chunk only once it has been used (like the music), so players who never sign in never download it. With no config, or if Firebase can't load, the game is fully local and shows only a quiet "Cloud saves unavailable". | Unit-tested (static import graph of `main.ts` has no Firebase; SW rules). **Build check:** `check-dist.mjs` fails any build with Firebase in the first load. Preview: no Firebase request before Sign in. |
| A2 | Google sign-in on the iPad | Done. Popup in a browser tab; **redirect from the Home Screen icon** (standalone) and whenever a popup is blocked. `netlify.toml` passes `/__/auth/*` **and `/__/firebase/*`** through to `epoch-ca127.firebaseapp.com` (status 200, before the SPA rule); on `epoch-fsts.netlify.app` the `authDomain` is the site itself. That's option 3 of Firebase's current "redirect best practices" (checked today); it also says to proxy `/__/firebase/init.json`, hence the second rule. `docs/FIREBASE-SETUP.md` has the console steps. Sign-in is on the main menu and in ☰ → Settings, with Sign out; it shows the Google account's name only. "Play without signing in" stays the default. | **Tried on localhost with the real project:** tapping Sign in loaded the SDK; the pane blocked the popup, so it fell back to the redirect and reached Google's sign-in page for `epoch-ca127` (right client, `select_account`). I stopped there: signing in with Dan's account is his to do. Coming back without signing in: clean, signed out, no errors. **Not tried on the live site** (not pushed); the popup path itself isn't verified. |
| B1 | Local stays primary | Done. The device save and backups are unchanged. The cloud copy goes up in the background after End Turn (after the rivals move), on hidden, and on pagehide; one write in flight, newer requests coalesce, the newest game wins. It also checks the cloud when the game comes back into view (so the iPad picks up the PC's turns). | Unit-tested (coalescing, one in flight, a slow network never holds up End Turn). |
| B2 | Save slots | Done. Up to 5 (`s1`–`s5`). The main menu lists the game here and the cloud games together: portrait, name, civ, turn, era, difficulty, map size, "last played (when) on (device)", and "On this device", "In the cloud", or "On this device and in the cloud". Continue picks the newest (a newer cloud game opens from the cloud). Open, Rename, Delete (asks first); deleting the cloud copy of the game here keeps it here, unsynced. | Unit-tested (slot limit, menu merging); preview-verified in iPad emulation (`cloud-slots`: open, rename, delete). |
| B3 | Conflicts | Done. Each slot has a revision (+1 per write) and the writing device; each copy knows the revision it's based on and whether it changed. Same game: cloud ahead and this device unchanged → taken quietly (toast "Picked up where you left off on the iPad"); this device changed and the cloud didn't → written; both → **"Which game do you want to keep?"** with turn, time, and device for each (plus "Decide later"). The one not kept goes into `epoch.autosave.backup.N`. A restored backup counts as changed, so a newer cloud copy is never taken over it quietly. | Unit-tested (all three cases, plus offline, slot gone, account mismatch); preview-verified both choices (`cloud-conflict`). |
| B4 | Size | Done. **Epic, turn 217 (the game was won then): 243 KB raw → 15 KB gzipped**; turn 151: 232 → 14 KB. gzip via `CompressionStream` (Safari 16.4+, so any up-to-date iPad), with fflate (9 KB, its own chunk, loaded only if missing) as the fallback. **Firestore only, one document per save** (`users/{uid}/saves/{slot}`) plus a small index document per slot: 15 KB is about 1/60 of the limit, so one path for all sizes, no Storage (so no Blaze plan), no splitting. | Unit-tested (round trip both ways, the Epic fixture); `npm run sim -- save-size`. |
| B5 | Security rules | Done: `firestore.rules` (own saves only, slot ids `s1`–`s5`, revision exactly +1, the save's revision must match its entry (`getAfter`), 900 KB save, 40-character name, all else refused), plus `firebase.json`, `.firebaserc`, and `tests/firestore-rules.test.ts` (`npm run test:rules`). **The emulator can't run here:** firebase-tools needs Java 21+, and this PC has Java 8, so the rules tests are written but skipped. Dan's steps to publish are in `docs/FIREBASE-SETUP.md`. | Not run against the emulator; the same rules are mirrored and tested in the in-memory store. |
| B6 | Status mark | Done. A small ☁ mark by the game's name in the top bar while signed in (☁✓ saved, ☁… syncing, ☁⤫ offline, ☁? waiting for a choice, ☁! cloud full); tap it for the words ("Saved to cloud ✓", "Syncing…", "Offline: will sync"). ☰ and Settings show the line too ("not signed in" when signed out). A failed write retries after 2, 4, 8 … up to 60 s, and at once when the network comes back; never a pop-up. | Unit-tested; preview-verified (`cloud-offline`: ☁⤫, then ☁✓ once back). |
| C1 | Portraits as WebP | Done. Quality 90: **5.2 MB → 851 KB** for the 12 (luminance PSNR ≥ 41 dB; the small colour differences are WebP's colour subsampling). **The offline download drops from 7.7 MB to 3.1 MB.** PNG masters in `docs/portraits-master/`; `python scripts/make-portrait-webp.py` remakes the WebPs. `docs/portraits.html` shows each PNG next to its WebP (256 and 128 px, with file sizes) above the old size check. `docs/PORTRAITS.md` and the portrait test updated. | Unit-tested; checked the page on the play build (12 pairs, sizes shown). **Dan: please compare on the iPad** (http://10.0.0.224:4173/docs/portraits.html). |
| C2 | Save format | No state change, so **no `STATE_VERSION` bump**: the cloud link rides in the save file beside the state (`SaveFile.cloud`), and an old save without one loads as before. The cloud copy is the same save file gzipped, loaded through the same `deserializeGame` (so migrations apply). | Unit-tested. |
| C3 | Cloud scenarios | Done: `cloud-conflict`, `cloud-offline`, `cloud-slots`, each with a note, against a stand-in cloud (`src/dev/memoryCloud.ts`) whose backups stay in memory (the real game, backups, and sign-in flag are untouched; checked). | Preview-verified on desktop and in iPad emulation (768×1024). |
| C4 | Tests | `tests/cloud.test.ts` (35: the B3 cases, coalescing, retries and backoff, failures, slow network vs End Turn, slots and the limit, compression including the Epic save, the first-load check, the proxy config, device names, the scenarios), `tests/firestore-rules.test.ts` (5, emulator only), scenario outcomes, and the updated portrait test. **859 pass, 5 skipped (the emulator ones)**, `pace.test.ts` included. | `npm test`, `npm run build`. |

**Readings I chose (say if you want them different):**
- The cloud mark shows only while signed in (a signed-out player sees "not signed in" in ☰ and Settings, not in the top bar).
- A cloud copy the player deletes stops the game here syncing (it stays on the device); New Game starts syncing again.
- A game linked to another Google account on a shared device isn't uploaded to the new account ("Not synced (another account's game)").
- Popup on desktop and in iPad Safari tabs; redirect from the Home Screen icon (and whenever a popup is blocked).
- Cloud saves are for the live site; on the LAN play server (plain http, not an authorized domain) signing in says it doesn't work at that address.

**Heads-up:** not yet tested with a real signed-in account (needs Dan) or against the real Firestore (the rules must be published first).

**Pushed on 2026-09-25 by Dan's say-so** (`ab52178` docs, then the Round 16 commit; `main` at `9734193`), live as 0.16.0. *(Planning session's note: this line originally said "waiting to be pushed".)* Pushing deploys to https://epoch-fsts.netlify.app/.

**Dan, next:** (a) the two steps in `docs/FIREBASE-SETUP.md`; (b) say "push"; (c) on the live site, sign in on the PC and play a few turns, then on the iPad (Safari, then the Home Screen icon) continue the same game; play a turn on each without syncing to see the keep-which question; (d) compare the portraits on http://10.0.0.224:4173/docs/portraits.html.

* **Round 16b — Cloud saves polish: Save now, Save to a new cloud slot, Sync now, the sign-in-failed toast, rules tightened, and the Epoch card in the hub — done and pushed (2026-09-25, live as 0.16.1; hub `0a18c16`).** Rounds 16 and 16b await Dan's remaining checks (iPad Home Screen sign-in, the keep-which question, the portraits, republishing the rules); these are listed in Round 17's "Still open". The agent's report follows, moved from Current Objective.

#### Round 16b report (coding agent, 2026-09-25): all items done; epoch and hub pushed

| # | Item | Status | Verified |
|---|---|---|---|
| 0 | Docs commit | Done: `d8e7ae0` (CLAUDE.md, TODO.md only), then re-read both. Nothing from the Round 16 report was dropped. | n/a |
| A1 | Make signed in or not obvious | Done. **What the iPad showed:** it can't be known after the fact, because Round 16 kept no record of sign-in tries. But the code had **two silent paths**: (1) a popup closed or cancelled returned `cancelled`, and nothing was shown; (2) a **redirect** (the Home Screen icon, or Safari when a popup is blocked) that came back **without an account** had `getRedirectResult` return nothing and no error, so nothing was shown. Also, the signed-out main menu only said "Play the same game on this and your other devices" next to the button. It never said "Not signed in", and the games list only appears once you're signed in, so "none" was all there was to see. Path (2) is the likely one: going through Google's page and landing back in the game looks like success. **I reproduced it on the live site:** tap Sign in, go to Google's page, come back without signing in. It is now instrumented: every try is kept on the device and shown in ☰ → Settings → Cloud saves while signed out ("Last try: Today 8:25 PM, redirect, came back without signing in", plus Firebase's code when there is one), and logged to the console. **Fixes:** whenever a sign-in doesn't finish, a toast says **"Sign-in failed. Please try again."** (Dan's wording; known errors add the reason, e.g. "Sign-in failed: no network…"). The main menu shows **"☁ Signed in as Dan"** in a green box, with every game listed, or **"Not signed in: sign in to see your cloud games"** in an orange-edged box with the button (which reads "Signing in…" while one is under way). A successful sign-in toasts "☁ Signed in as …". With no game on the device and not signed in, the main menu adds "Looking for a game from another device? Sign in with Google." ☰ → Restore a backup starts with "Cloud games are on the main menu once you sign in. Looking for a game from another device? [Sign in with Google]", or, signed in, "☁ Your cloud games are on the main menu (signed in as …)". | Unit-tested (`signInMessage`, `accountHtml` in both states, no-game hint, "Signing in…"). Preview-verified in iPad-size emulation (`cloud-signin-fails`: the toast, the Settings line, then a successful second try). **Live site:** the redirect that came back without an account showed the toast and the Settings line. |
| A2 | Check the listed behaviors | (a) **Signing in with a game in progress uploads it: it did, but silently. Fixed:** the toast "☁ This game is now saved in the cloud too: “Henry VIII of England” (slot 2 of 5)" (new `uploaded` hook, also used for a new game's first write). (b) **After a redirect sign-in, the main menu's list refreshes by itself: it already did** (sign-in → status and slot list → the menu re-renders while it's open). Seen in the preview with the stand-in (list appeared without reopening); the real redirect needs Dan's account. (c) **The ☁ tap showing the last error and last success: it didn't** (it only toasted the status). **Fixed:** tapping ☁ opens a small panel: signed in as, status, "Last saved to the cloud: Today 9:41 PM", "Last problem (time): No network: the cloud copy will be written once you're back online." (plain words for offline, refused, too big, busy, another device saving), and **Sync now**. | Unit-tested (upload toast via `uploaded`, `lastError`/`lastOkAt`, `cloudErrorText`); preview-verified (`cloud-signin-existing-game`, `cloud-offline`). |
| A3 | Manual save | Done. **☰ → Save now** (first in the ☰ list): saves on the device at once, and when signed in writes the cloud copy right away (mid-turn too; it waits out a write already on its way and skips a retry's wait), then "Saved ✓ on this device and in the cloud", or "Saved ✓ on this device, but not in the cloud: <why>", or, signed out, "Saved ✓ on this device. Sign in on the main menu to keep it in the cloud too." **Disabled while the rivals move** (End Turn saves right after they're done). **☰ → Save to a new cloud slot…** (only while signed in): asks for a name (default "Henry VIII of England, turn 12"), saves the game as it is now as a **game of its own** (new id, so it never conflicts with this game's slot, which carries on), and counts toward the 5; when full: "The cloud is full (5 games). Delete one on the main menu first." **Sync now** is on the ☁ panel: it compares with the cloud first (so it can pick up the other device's turns, or ask which to keep), then writes. | Unit-tested (`syncNow`: mid-turn, write in flight, offline then back, during the keep-which question; `saveCopy`: new slot, name limit, full, offline). Preview-verified (`cloud-slots`: Save now, a copy into slot 5, then "full"; `cloud-offline`: Save now offline says why, and after the network returns Sync now → ☁✓; Save now disabled while `setTurnBusy(true)`, enabled after). |
| A4 | Tests and scenarios | Done. 17 new tests in `tests/cloud.test.ts` ("Round 16b"), 2 new scenario outcomes. **876 pass, 6 skipped** (the emulator tests in a plain `npm test`). **The rules tests ran against the emulator:** a portable Java 21 (Temurin JRE, unpacked into `%LOCALAPPDATA%\epoch-tools\`, no admin; the system Java 8 is untouched) and firebase-tools 15 through npx. `npm run test:rules` now does this by itself (`scripts/test-rules.mjs`). **The first run found a real gap:** an unchanged slot entry passed as a "rename", so a save could be written again at its own revision. **Fixed in `firestore.rules`** (a rename must change the name and only the name; a save document is replaced only by the next revision). **6/6 pass** with a new test for each case. **Dan: republish `firestore.rules`** (paste it into the console and Publish, as in `docs/FIREBASE-SETUP.md` step 1). The game works with either version; this closes the gap. New scenarios: **`cloud-signin-existing-game`** (signed out with a game going: sign in and it uploads, with the toast, next to the Egypt game already in the cloud) and **`cloud-signin-fails`** (the first try doesn't finish: the toast and the Settings line; the second works). **`cloud-slots`**'s note now covers Save now, Save to a new slot (and full), and the ☁ panel. | `npm test`, `npm run test:rules`, `npm run build`. |
| B1 | Live site check | Done as far as possible without Dan's account. After the push, `https://epoch-fsts.netlify.app/` served the same build as mine (`index-rPJgi3dz.js`). A tab holding 0.16.0 showed **"Update available: tap to reload"**; tapping it gave **Version 0.16.1**. **No Firebase request before Sign in.** Tapping Sign in loaded the SDK chunk (`firebase-BimUm-TC.js`). The pane blocks popups, so it fell back to the redirect through `/__/auth/handler` on our own domain (200) and reached **Google's sign-in "to continue to epoch-fsts.netlify.app"**. I stopped there. Coming back without signing in: the toast "Sign-in failed. Please try again." and the Settings line. **The rules answer:** listing someone's saves without signing in gets `403 PERMISSION_DENIED`. **Console:** one 404, `/__/firebase/init.json`. It 404s at `epoch-ca127.firebaseapp.com` itself too (the project has no Firebase Hosting site), and the sign-in handler falls back to the settings in its URL, so it's harmless noise. It was already there in Round 16. Checklist for Dan below. | Live site, in the browser pane. |
| C1 | Hub card | Done. The hub was still **2 local commits ahead** of `origin/main` (Round 2's placeholder card + its revert, net zero; Round 3's "drop both" had been blocked). I kept them on a local branch `old-epoch-placeholder` (nothing lost), reset `main` to `origin/main`, and added the card from `docs/GO-LIVE.md` step 5 at the end of `games.js`, in the same format as the others (id, name, tagline, 🏛️, `https://epoch-fsts.netlify.app/`, tags solo / strategy / 2–3 hours, accent `#4a7fd6`). **Checked locally** (served the hub folder): 13 cards (12 + Epoch), no console errors, the other 12 unchanged, and the card's Play link opened the live game. **Pushed: hub commit `0a18c16`** ("Add Epoch: From Stone to Stars to the game library"), only `games.js` (+9 lines). **The live hub `https://dansgamehub.netlify.app/` shows the card** (13 links, Epoch's pointing at the game). | Local preview and the live hub. |

**Pushed (this round only, on Dan's say-so):** epoch `main` `d8e7ae0` (docs) → `92a389a` (Round 16b code, live as 0.16.1) → the report commit after this; hub `main` → `0a18c16`. Pushing goes back to "Dan's call" from now on.

**Readings I chose (say if you want them different):**
- "Sign-in failed. Please try again." for a closed popup and for a redirect that came back without an account, as well as for unknown errors; known errors say why ("Sign-in failed: no network…").
- Save to a new cloud slot saves a **separate game** (its own id). Opening it later from the main menu makes it the game on that device, backing up whatever was there, as Open always does.
- Save now in a dev scenario writes only to the stand-in cloud and says so (scenarios never save on the device).
- Sync now is on the ☁ panel only (the ☰ has Save now).
- The version is **0.16.1**, so the About screen and the main menu show the update.

**Dan's checklist (live site: https://epoch-fsts.netlify.app/):**
1. **Republish the rules** (safety, not urgent): Firebase console → Firestore → Rules → paste `firestore.rules` → Publish.
2. **PC, browser:** open the site; if it says "Update available: tap to reload", tap it (the main menu should say **Version 0.16.1**).
3. PC: the main menu should say **"☁ Signed in as Dan"** (green box). If it says **"Not signed in"**, tap Sign in with Google and pick your account; you should see the toast "☁ Signed in as Dan".
4. PC: play a turn, then **☰ → Save now** → "Saved ✓ on this device and in the cloud". Tap the **☁ mark** by the game's name: "Last saved to the cloud: Today …".
5. PC (optional): **☰ → Save to a new cloud slot…** → Save copy → the main menu lists the copy (it uses a slot; delete it there afterwards).
6. **iPad, Safari tab:** open the site (tap Update if offered). The main menu shows plainly signed in or "Not signed in". Sign in; a Google window opens; pick the account. You should get "☁ Signed in as Dan" and see the PC's game on the main menu. **If it doesn't work, you now get "Sign-in failed. Please try again."**, and ☰ → Settings → Cloud saves shows "Last try: …" with the reason. Please tell the planning session what that line says.
7. **iPad, Home Screen icon:** the same. There, sign-in leaves for Google's page and comes back. Afterwards the main menu must say "☁ Signed in as Dan" (or the failure toast; again, note the Settings line).
8. **Hub:** https://dansgamehub.netlify.app/ ends with the Epoch card; tap Play.
9. Still open from Round 16: compare the portraits at http://10.0.0.224:4173/docs/portraits.html.


## Current Objective (Focus Area)

### Round 17 — City arrows, no accidental moves into cities, and technology icons (candidates) — done (0.17.0), committed, not pushed (Dan: wait for the tech icons); report at the end of this section

**Dan's requests (2026-09-25), from playing the live game:**
1. In a city screen, arrows to cycle through his other cities.
2. Tapping a city shouldn't accidentally move a unit.
3. Icons for the technologies.

**Pushing is Dan's call:** commit as usual, **don't push unless the relay
says to**, and list the waiting commits in the report. Never push the hub.

**Items for the coding agent. Report status on each one individually:**

0. **Commit the updated docs first:** `CLAUDE.md` and `TODO.md` as their own
   commit, then re-read them.

**Part A — Cycling through cities**

A1. **◀ ▶ arrows in the city panel's header**, either side of the city
    name:
    - they go to the previous / next of **your** cities, in a fixed order
      (founding order, the capital first), wrapping around; the map
      recenters on the new city, and the panel keeps the same tab or scroll
      section where that makes sense (e.g. the build list stays the build
      list);
    - show "3 / 12" (this city's place in the list) small under the name,
      or next to the arrows;
    - hidden with one city; 44 px tap targets; works in iPad portrait and
      landscape, and in the landscape side panel;
    - **PC:** keyboard shortcuts too (e.g. `,` and `.`, or `[` and `]`,
      whichever doesn't clash with existing keys), shown in the button's
      tooltip;
    - **a swipe** left or right on the panel's header does the same on
      touch, if it can be done without fighting the panel's scrolling;
      otherwise skip it and say so;
    - optional, if cheap: a small "needs a build" dot on the arrows' city
      count when another city is idle.

**Part B — No accidental moves when tapping a city**

B1. **Today's rule** (`src/ui/tap.ts`): with a unit selected, tapping your
    own city **moves the unit there** (it only opens the city if the unit
    can't reach it). That's what catches Dan. **New rule:**
    - with a unit selected, **tapping your own city opens the city panel**
      instead of moving, **unless the unit is on a tile next to the city**
      (a one-step move into a city is almost always intended);
    - **within the city panel**, when it was opened with a unit selected
      that can reach the city, show a clear button: **"Move [Legion] here
      (2 turns)"** (the unit's icon, name, and the turns the path takes). It
      moves the unit and closes the panel;
    - tapping any other tile moves exactly as today (no change to normal
      movement);
    - update the rule's comment, its unit tests, and How to Play / the tip
      that explains moving, if either says otherwise.

B2. **An optional safety setting, off by default (Q35):** ☰ → Settings →
    **"Tap twice to move"**: the first tap on a destination shows the path
    and turns; a second tap on the same tile moves; tapping elsewhere
    cancels. Only if it fits cleanly with the existing path preview;
    otherwise report and skip.

**Part C — Technology icons: candidates for Dan to pick (don't wire them in yet)**

C1. **`docs/tech-icon-candidates.html`**, like the earlier icon pickers
    (building, map, and religion/road icons):
    - all **56 techs**, grouped by era, each with **3 candidates (A, B, C)**
      from **game-icons.net (CC BY 3.0)**, with the author shown;
    - each candidate shown at the sizes it will actually be used (the tech
      tree card, the research picker, the top bar's research chip, and a
      toast), on the game's own panel colors;
    - pick icons that **say what the tech is** at a glance (e.g. The Wheel →
      a wheel, Writing → a quill or scroll, Railroad → a locomotive,
      Rocketry → a rocket). **Avoid reusing an icon the game already uses
      for a unit, building, wonder, resource, or map mark**; where a
      clash is unavoidable (e.g. Railroad vs the railroad map mark), say so
      on the card;
    - the icons stay single-color (tinted by the game), like the others;
    - a **"Dan's picks" summary** at the bottom Dan can fill in or just tell
      the planning session ("all A except …");
    - served on the play server at `/docs/tech-icon-candidates.html`, and
      checked in iPad-size emulation.

C2. **Where the icons will go** (plan only, for the wiring round): the tech
    tree, the research picker, the top bar's research chip, the "You
    learned …" toast, the Almanac, and the leader cards' starting tech.
    List the places in the report so the next round can wire them.

**Part D — Wrap-up**

D1. **Dev scenarios, each with a note:**
    - `city-cycle`: 5 cities, one idle; the arrows and count;
    - `tap-city-with-unit`: a Legion selected 4 tiles from your city;
      tapping the city opens it with the "Move Legion here" button; a
      Warrior next to the city moves in with one tap.

D2. **Tests:** the new tap rule (selected unit far vs next to your city;
    enemy and other tiles unchanged; aircraft unchanged), city cycling
    (order, wrap, one city, a city lost mid-cycle), the Move-here button's
    turns, the setting if built, the scenarios, and `pace.test.ts`.

**Done means:**
- every item (0, A1, B1–B2, C1–C2, D1–D2) is reported individually;
- tests pass;
- it's preview-verified on desktop and in iPad emulation;
- the commits are **listed as waiting for Dan to push**; the play server is
  restarted.

**Dan then:**
- (a) tries the arrows and the city tap on the play server
  (http://10.0.0.224:4173/, `city-cycle` and `tap-city-with-unit`);
- (b) picks the tech icons on
  http://10.0.0.224:4173/docs/tech-icon-candidates.html and tells the
  planning session;
- (c) says "push" when he wants it live.

**Still open from Round 16/16b (Dan, when convenient):** republish
`firestore.rules`; the Round 16b checklist (iPad Safari and the Home Screen
icon sign-in, the keep-which question); compare the WebP portraits.

**Open questions (defaults in bold):**
- **Q31 — Epic's label on the iPad:** **keep "best on a computer"** until Dan
  times it.
- **Q35 — "Tap twice to move" setting:** **built, off by default.**

#### Round 17 report (coding agent, 2026-09-25): all items done; committed, NOT pushed (Dan: wait for the tech icons)

| # | Item | Status | Verified |
|---|---|---|---|
| 0 | Docs commit | Done: `3b0715c` (CLAUDE.md, TODO.md only), then re-read both. **Note:** on the first try this session the two files on disk were still the Round 16b versions (no Round 17 in them), so I stopped and asked; the planning session wrote them again and I committed those. Nothing from the Round 16b report was dropped. | n/a |
| A1 | ◀ ▶ arrows in the city panel | Done. **◀ ▶ either side of the city's name** (44×44 px), **"Size 5 · 3 / 12"** under the name, and a small **orange dot** after the count when another of your cities has nothing to build (its tooltip says how many). Order: **the capital first, then founding order** (city id; a captured city keeps the id it was founded with), wrapping around. The map recenters on the new city (the same `openCity` centering as a tap, so it works beside the landscape side panel and above the portrait sheet), and **the panel keeps its scroll position**, so the build list stays the build list. Hidden with one city. A city lost while its panel is open: the arrows go on from where it stood. **PC keys:** `,` / `.` and `[` / `]` (no clash: the existing keys are Enter, B/F, N/Tab, Esc, +/−), shown in the buttons' tooltips. **Swipe: done**: a sideways swipe (≥ 60 px, mostly horizontal) on the panel's header goes to the next/previous city. The panel only scrolls up and down (`touch-action: pan-y`), so the swipe doesn't fight the scrolling. **The dot (optional): done.** | Unit-tested (order, wrap, one city, lost mid-cycle, the dot count). Preview-verified on desktop (the buttons; `,` `.` `[` `]`; scroll kept at 300 px across a cycle; swipe left/right with synthetic touch pointer events) and in iPad-size emulation, portrait 820×1180 (bottom sheet, arrows 44×44, map recentered on Nippur) and landscape 1180×820 (side panel). |
| B1 | Tapping your own city with a unit selected | Done. New rule in `src/ui/tap.ts`: with a unit selected, **tapping your own city opens it** instead of moving, **unless the unit is next to it** (any of the 8 tiles around it), which moves in with one tap as before. When the unit can get there, the panel shows **"[icon] Move Legion here (4 turns)"** at the top; it moves the unit (as far as it gets this turn, like any move), closes the panel, and if the trip takes more than one turn says "Legion is on its way: tap Babylon again next turn to carry on". The turns come from `pathTurns` (new, `movement.ts`): moves spent as `moveUnit` spends them, unexplored tiles counted as 1 so nothing hidden leaks. A unit that can't get there: the city opens without the button, as before. Other tiles, attacks, and aircraft (a city in range is still a rebase) are unchanged. The rule's comment, its old test ("moves into your city when it can get there" is now "opens … offering the move"), and **How to Play** (the moving page says so; the cities page mentions the arrows) are updated; the first-game tips didn't mention it. | Unit-tested (far/next/diagonal/unreachable, other tiles, enemy attack, enemy city, aircraft, already in the city; turns for a Legion, a Horseman, moves already spent, hills). Preview-verified in iPad landscape emulation (`tap-city-with-unit`: the tap opened Babylon with "Move Legion here (4 turns)", the Legion didn't move; the button moved it one tile and closed the panel; the Warrior next door then moved in with one tap). |
| B2 | "Tap twice to move" (Q35: built, off by default) | Done. **☰ → Settings → Tap twice to move** (On/Off, off by default, per device like the other settings). There was no path preview before (only the lit reachable tiles), so I added a small one: the first tap on a destination draws the path as gold dots, outlines the tile, and labels it **"N turns"**; a second tap on the same tile moves; tapping anywhere else cancels (and does what that tap would do); selecting another unit clears it. Attacks keep their odds panel, and "Move … here" is already a second step, so neither changes. | Unit-tested (default off, normalize, the second-tap rule). Preview-verified in iPad landscape emulation (setting on: first tap showed the path and "2 turns" and the Legion stayed; second tap moved it). |
| C1 | `docs/tech-icon-candidates.html` | Done. **All 56 techs, grouped by era (Ancient 15, Medieval 17, Industrial 13, Modern 11), 3 candidates each (168)** from game-icons.net, with the author and a link under each. Each is shown big and **at its real sizes on the game's colors**: the tech tree card (26 px on the "available" blue), the research picker (44 px, gold), the top bar's research chip (18 px), and the "You learned …" line (20 px). Picked to say what the tech is (The Wheel: stone wheel/cartwheel/wheelbarrow; Writing: quill and ink/papyrus/scroll and quill; Railroad: locomotive/rails/railway; Rocketry: rocket/rocket in flight/thruster…). **No candidate is an icon the game already uses**: the script checks every file in `src/assets/icons/` (units, buildings, wonders, resources, map marks, religion symbols) and would mark a clash on the card; there are none (e.g. Monarchy avoids the Crown, Horseback Riding the Horse head, Astronomy the Observatory, Industrialization the Factory, Flight the Biplane). Railroad has no clash: roads and rails on the map are drawn lines, not icons. No icon is offered twice. Single-color (`currentColor`), like the others. **Overview per era** at the top (your pick, or A), the usual picker bar (Copy my picks / Share, saved on the device under `epoch.techIconPicks`), and **"Dan's picks" at the bottom**: a table by era and the short form, e.g. "Technology icons: all A except Writing: B." Made by `node scripts/make-tech-icons-page.mjs` (SVGs + `SOURCES.md` in `docs/tech-icon-candidates/`). Copied to the play server by `copy-pickers.mjs` like the other `-candidates.html` pages: **http://10.0.0.224:4173/docs/tech-icon-candidates.html**. | Preview-verified on desktop and in iPad-size emulation (820×1180 and 1180×820: 168 cards, no sideways scroll; tapping picks, the count, the overview, and the summary line update). Served from the restarted play server (checked below). |
| C2 | Where the icons will go (plan for the wiring round) | Plan only, nothing wired. Add a `TECH_ICONS: Record<TechId, string>` next to `BUILDING_ICONS` in `src/data/icons.ts`, credits in `ICON_CREDITS`/`CREDITS.md`, the SVGs in `src/assets/icons/`, and extend the icon test ("every tech has a bundled, credited icon"). Then: **(1) the tech tree**: `App.renderTech` in `src/ui/app.ts` (the `.tech` buttons, ~line 2001), before `.tname`; **(2) the research picker**: the tech screen's detail pane (`App.techDetailHtml`, ~line 2013), a big icon; **(3) the top bar's research chip**: `#researchBtn`, filled in `App.refresh` (~line 3225); **(4) "You learned …"**: today that's the tech screen's message line from `openTech(\`You learned …\`)` (~line 704), not a toast, plus the artifact and hut news that name techs (`App.chooseVillage`, ~line 2163) and the free-tech toasts; **(5) the Almanac**: the tech cards and `techLink` in `src/ui/almanac.ts`; **(6) the leader cards' starting tech**: `src/ui/setup.ts` (the civ card line and "Starting tech:"). Also worth doing then: the diplomacy screen's tech trade lists (`.techPick`, ~line 2595) and the National Challenge line. | n/a (plan) |
| D1 | Dev scenarios | Done. **`city-cycle`**: Babylon (capital) and Ur, Uruk, Nippur, Lagash; Lagash has nothing to build, so its panel opens first ("5 / 5"); ▶ goes Babylon → Ur → Uruk → Nippur → Lagash and round again, the dot shows on the other four. **`tap-city-with-unit`**: a Legion 4 tiles west of Babylon, selected first; tapping Babylon opens it with "Move Legion here (4 turns)"; the Warrior next to it (east) moves in with one tap; the note also covers the Tap-twice setting. | `tests/scenarios.test.ts` outcomes for both (order, the idle city, wrap; the tap result, the button's turns matching the note, the move, the Warrior's one-tap move). Preview-verified as above. |
| D2 | Tests | Done. `tests/round17.test.ts` (18 tests: the tap rule, the Move-here turns, city cycling, the setting), 2 scenario outcomes, 1 updated tap test in `cities.test.ts`. **898 pass, 6 skipped** (the emulator rules tests, as before), `pace.test.ts` included. `npm run lint` and `npm run build` clean (check-dist OK). | `npm test`, `npm run lint`, `npm run build`. |

**Version 0.17.0.**

**Not pushed: Dan said (2026-09-25, mid-round) not to push until the new tech icons are added.** Waiting in the local `epoch` repo on `main`, ahead of `origin/main`: `3b0715c` (docs from the planning session), then the Round 17 code commit and this report commit. They go out with the tech-icon wiring round, on Dan's say-so. The hub wasn't touched.

**Readings I chose (say if you want them different):**
- "Next to the city" means any of the 8 surrounding tiles (diagonals too), since a diagonal step is also one move.
- "Move … here" moves the unit as far as it gets this turn (moves in this game are one turn at a time; there are no standing orders), and says so when the trip takes more than one turn.
- The arrows keep the panel where it was scrolled rather than jumping to a section (the city panel is one long page, not tabs).
- Tap twice covers every move (one tile or many) and aircraft rebases; attacks (odds panel) and "Move … here" already ask first, so they don't.
- The path preview's "N turns" counts the turn you're in.

**Dan then:** (a) the two scenarios aren't in the play build (scenarios are dev-only), so I also started the dev server for them: **http://10.0.0.224:5173/** → ☰ → Dev scenarios → "City arrows: go through your cities" and "Tapping your city with a unit selected" (its saved game is separate from the play server's). On the play server (http://10.0.0.224:4173/) the same features work in your real game: open a city for ◀ ▶ (or swipe across its top), and select a unit a few tiles from one of your cities, then tap the city; (b) pick the tech icons at http://10.0.0.224:4173/docs/tech-icon-candidates.html and give the planning session the "Dan's picks" line; (c) say "push" once the icons are in.

#### Round 17 follow-up (coding agent, 2026-09-25): Dan's tech icon picks wired in (0.17.1); committed, NOT pushed

Dan pasted his picks into the coding session: Alphabet: B; Bronze Working: A; Ceremonial Burial: A; Horseback Riding: C; Masonry: B; Pottery: B; Archery: C; Writing: A; Code of Laws: B; Currency: A; Iron Working: B; The Wheel: A; Mathematics: A; Mysticism: A; Map Making: A; Monarchy: B; Literacy: A; Construction: A; Astronomy: A; Seafaring: B; Navigation: A; Philosophy: B; Feudalism: A; Engineering: A; Trade: C; Chivalry: B; Monotheism: B; Banking: B; University: A; Invention: B; Magnetism: A; Theology: B; Gunpowder: C; Physics: B; Theory of Gravity: A; Metallurgy: C; Democracy: A; Economics: A; Chemistry: A; Steam Engine: A; Conscription: A; Railroad: A; Electricity: A; Industrialization: A; Corporation: A; Refining: C; Electronics: A; Machine Tools: A; Combustion: B; Automobile: B; Flight: A; Mass Production: B; Computers: B; Rocketry: A; Advanced Flight: A; Space Flight: A. All 56 are in the game, following the C2 plan:
- **Data:** `TECH_ICONS: Record<TechId, string>` in `src/data/icons.ts`, the 56 SVGs in `src/assets/icons/` (copied from `docs/tech-icon-candidates/`, shapes unchanged), credits in `ICON_CREDITS`, a **Technology icons** table in `CREDITS.md`, and a "Technology icons" list on ☰ → About / Credits (`usedIcons` group `'Techs'`). Authors: Lorc, Delapouite, Caro Asercion, Skoll.
- **Where they show:** the tech tree cards (22 px), the tech screen's detail heading (44 px, gold) and its "Requires" list, the top bar's research button (in place of 🔬 while researching; 🔬 stays for "Choose research"), the "You learned … Choose what to research next." line (gold), the "Researching …" toast, **every "learned …" news toast** (research, trade, tribute, hut, village, artifact, Great Person: `learnedTech` in `src/ui/text.ts` finds the tech from the wording, so no state change and no save-version bump), the Almanac's tech cards and every tech link in it, the New Game screen's civ cards and "Starting tech:", the leader panel's "started with" and National Challenge line, and the diplomacy screen's tech trades.
- **Tests:** every tech has a bundled, credited icon, all different, none shared with a unit, building, wonder, resource, or map icon (`tests/icons.test.ts`); `learnedTech` reads every way the game words it (`tests/round17.test.ts`). **956 pass, 6 skipped** (the emulator tests); lint and build clean. The first load is 690 KB (235 KB gzipped), up from 592 / 198 KB, because the icons are bundled like the others.
- **Verified:** preview in iPad-size emulation (landscape and portrait): the `tech` scenario's End Turn showed the gold Writing icon in "You learned Writing", all 56 tree cards with icons, the 44 px heading, the research button and toast, a "learned Currency" news toast with its icon, the Almanac card and links, 56 credits on About, and the 12 civ cards' starting techs. No console errors.
- **Not pushed** (Dan's instruction was to push once the tech icons are in; the push itself is still his call). Waiting on `main`: `3b0715c`, `62ec120`, `b9df793`, and this follow-up's commit.

## Next Steps (Do Not Start Yet)

All of these are deferred for **sequencing only**. Each depends on the
milestone before it. None has been decided against.

- **Unit icons, step 2 — DONE in Round 7** (see Completed Tasks); this
  entry is kept only until the planning session reconciles it: wire Dan's 15 picks into the game (the SVGs are already in
  `docs/icon-candidates/`), drawn in `drawGlyph` in `renderer.ts`, which is
  the only place a unit's mark is drawn. Keep the letters as a fallback
  while an icon loads. Also add the **About / Credits** screen and
  `CREDITS.md`, crediting each icon's author (CC BY 3.0 requires it; the
  authors are Delapouite, Lorc, Cathelineau, HeavenlyDog, and Skoll).
  Check the mixed-stack second disc and the army ring still read well with
  icons. The coding agent offered to do this right away; Dan chose to
  review first.

- **Go live — Epoch's site is LIVE at https://epoch-fsts.netlify.app/ (2026-09-25).** The hub card is live too (Round 16b C1, hub `0a18c16`, https://dansgamehub.netlify.app/). Originally: (Netlify site from the `epoch` repo, the hub card with the real URL, the hub pushed by Dan or on his say-so). Round 16 starts once he confirms the site is live.
- **Order after round 7 — DECIDED by Dan (2026-09-24):**
  - **Round 8:** Naval — done (see Completed Tasks).
  - **Round 9, M7 — done:** barbarians, villages, artifacts, resources, Great
    People, and huts.
  - **Round 10:** Air — done (see Completed Tasks).
  - **Then:** M8 and M9.
- **Round 9, Part A — DONE EARLY (2026-09-24, after Dan asked why
  `all-ships` still showed letters):** the 9 ship icons are wired in
  (`src/assets/icons/`, `icon` on each ship in `units.ts`, credits in
  `src/data/icons.ts`, `CREDITS.md`, and About / Credits). The Carrier uses
  the approved trimmed file, credited as modified (new `modified` field on
  a credit). Tests: every unit has a bundled, credited icon (366 pass).
  Preview-verified on desktop (`all-ships`: all 9 drawn, Carrier distinct
  from the Battleship). Only the aircraft icons remain (round 10).
- **Rounds 16 and 16b — Cloud saves: done and pushed** (see Completed Tasks).
- **Tech icons, step 2 — DONE** (Round 17 follow-up, 0.17.1, see Current Objective); **not pushed yet**: Dan wanted Round 17 to go out with the icons, so the waiting commits can go whenever he says "push".
- **A later balance round (after Round 16, whenever Dan wants):** from Round 15's leftovers: North Korea (1 win in 54), Russia, and the Franks under their share (conquerors struggle to finish); no domination on Huge or Epic; Huge 45% economic; Legendary 55% technology; Small games can run long (to t266). Use `npm run sim -- matrix` with more games per row (20 is noisy).
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
- **Pushing — standing instruction from Dan (2026-09-24):**
  - **until Epoch's Netlify site exists, push the `epoch` repo to GitHub at
    the end of every round**, as the last step before restarting the play
    server;
  - nothing deploys from it yet;
  - **once Dan connects Netlify, this stops**, and pushing goes back to
    "only when Dan says," because a push would then deploy (Round 15 D4:
    effective from the moment Dan confirms the site is live; CLAUDE.md's
    pushing rules say the same);
  - **the hub repo is never pushed without Dan saying so.** It's live.
- **Dev scenarios (from Round 3):** dev-only, never in the production build,
  and never allowed to overwrite the real autosave. They're how Dan checks
  hard-to-reach rules on the iPad, and new milestones should add scenarios
  for their own hard-to-reach rules.
- **Balance numbers are placeholders until Milestone 6+.** Keep them in data
  so tuning later is cheap. Research pace got a first pass in round 6 (era
  targets met in the all-AI sim; `npm run sim` prints the numbers, and
  `tests/pace.test.ts` guards them loosely).
- **Real games are played on `play:lan` (from round 4), not `dev:lan`.** The
  dev server live-reloads with half-finished code, which is what wiped
  Dan's M2 test game.
