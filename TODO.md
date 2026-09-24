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
  candidates — done by the coding agent (2026-09-24). Waiting for Dan's
  checks (a)–(c) below.**
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
    | B5 | Naval combat | Done. Ships attack ships with the normal odds rule (no terrain bonus at sea). **Bombard:** a ship attacks a land unit or city next to it; win = the defender dies but **the ship never moves in or captures**; lose = the ship sinks. **Walls don't count against ships** (they were already "against land attacks"). Land units can't attack ships at sea. **Ships in a city don't defend it**: a city with only ships in port counts as empty. **No naval armies** ("Ships can’t form armies"). I wasn't certain whether Civ Rev 1 allowed fleets, so I kept Q11's default. The odds panel explains bombarding and warns when a ship carries units | unit-tested; preview-verified (`bombard`: 76%, Warrior destroyed, Frigate stayed, Taxila still Mauryan) |
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
    authors are in that folder's `SOURCES.md`. **Not wired in yet:** Round
    9 Part A wires in the 9 ships, Round 10 the 5 aircraft (both with
    credits in `src/data/icons.ts`, `CREDITS.md`, and About / Credits).

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
    | Carrier | A | Carrier (Cathelineau) |
    | Fighter | B | Biplane (Quoting) |
    | Bomber | B | Carpet Bombing (Skoll) |
    | Jet Fighter | A | Jet Fighter (Delapouite) |
    | Stealth Bomber | A | Stealth Bomber (Delapouite) |
    | Helicopter | A | Helicopter (Delapouite) |

    **Watch-outs from the picker page, for Dan to confirm or swap:**
    - **Battleship A and Carrier A** are from the same set (a ship over wave
      lines) and look nearly identical at 22 px; the carrier's small plane
      is the only difference. Battleship B (Dreadnought) would avoid it, and
      its old conflict (a smoke plume like Ironclad A) is gone, since
      Ironclad is B.
    - **Bomber B (Carpet Bombing):** its bomb dots disappear at 22 px, so
      it may read as a plain plane shape at map size.
    - **Fighter B (Biplane)** gets busy when small.
    - Submarine A (flat cigar) was flagged as looking like Fighter A, but
      Fighter is B, so that's fine.
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

## Current Objective (Focus Area)

### Round 8 — Naval (ships, sea techs, and transports) + icon candidates for ships and planes

**Status: done by the coding agent (2026-09-24).** Per-item report under
"Round 8" in Completed Tasks. Waiting for Dan's checks (a)–(c), especially
**his ship and aircraft icon picks** (Round 9 Part A wires the ship icons
in). The item list below is kept as it was assigned.

**Goal:**
- Close the gap Dan found: the game has an ocean but nothing can cross it.
- Add the missing sea techs and a full set of ships, with transports that
  carry land units, naval combat, bombarding, Harbors, and an AI that
  settles and invades overseas.
- Put ship **and** aircraft icon candidates in front of Dan in one picker
  page, so both sets are chosen before they're needed.

**Items for the coding agent. Report status on each one individually:**

0. **Commit the updated docs first:** `CLAUDE.md` and `TODO.md` as their own
   commit, then re-read them.

**Part A — Icon candidates for ships and aircraft (Dan approves before
anything is wired in)**

A1. **Candidates:** from game-icons.net (CC BY 3.0), choose **2–3
    candidates** for each new unit type:
    - ships (B2): Galley, Caravel, Frigate, Ironclad, Transport, Destroyer,
      Battleship, Submarine, and Carrier;
    - **aircraft for round 10:** Fighter, Bomber, Jet Fighter, Stealth
      Bomber, and Helicopter;
    - they must be easy to tell apart at map size, from each other and from
      the 15 land icons already in use.

A2. **Picker page**, `docs/ship-air-icon-candidates.html`, working like the
    round 6 page:
    - self-contained, with the SVGs inlined;
    - A/B/C labels;
    - each candidate shown large, and at map size **white on a colored
      disc**, the way the game now draws icons;
    - the author credit under each;
    - tap to pick, with picks remembered on the device;
    - "n of 14 picked", Next unpicked, and Copy my picks / Share.

    Keep the SVGs in `docs/ship-air-icon-candidates/` with a `SOURCES.md`.

A3. **Until Dan picks, ships use their letter glyphs** (the existing
    fallback). The next round wires in the ship icons, and round 10 wires in
    the aircraft icons.

**Part B — Naval (Civ Rev 1 spirit; all numbers in data, placeholders)**

B1. **Sea techs:** add **Map Making** (Ancient), **Seafaring** (Ancient or
    Medieval), **Navigation** (Medieval), and **Magnetism** (Medieval),
    with sensible prerequisites and our own descriptions:
    - keep the tree valid;
    - check whether the Industrial/Modern ship techs you need already exist
      (Steam Engine, Combustion, Electronics, Flight…) and add only what's
      missing;
    - re-run `npm run sim` and keep the era pacing near the round 6 targets.
      Report before and after.

B2. **Ship units**, with attack, defense, moves, sight, and **cargo
    capacity** in data. For example:
    - Galley (Map Making): **coast tiles only**, carries 2;
    - Caravel (Navigation): open ocean, carries 3;
    - Frigate (Magnetism): combat, carries 2;
    - Ironclad (Steam Engine): coast-heavy combat;
    - Transport (Industrial era): no attack, carries 8;
    - Destroyer (Combustion): fast;
    - Battleship (late Industrial or Modern): strong;
    - Submarine: strong attack, weak defense, **seen only by adjacent
      units**;
    - Carrier (Flight): carries air units in round 10. For now it's just a
      strong defensive ship.

    Pick sensible stats and techs, and list them in the report.

B3. **Where ships go:**
    - ships move only on water;
    - **Galleys can't enter deep ocean**, only `coast` tiles, which the map
      already has;
    - a ship can enter a friendly coastal city, i.e. dock there;
    - **only coastal cities** (next to water) can build ships, and the
      build list hides ships elsewhere.

B4. **Carrying land units, touch-first:**
    - **boarding:** select a land unit and tap an adjacent friendly ship
      with room (or the ship in the same city). The unit boards and uses up
      its move;
    - **cargo moves with the ship.** The ship shows a cargo count badge,
      and its panel lists the cargo, where tapping one selects it;
    - **unloading:** select a cargo unit and tap an adjacent land tile. It
      costs that unit's move;
    - no unloading onto enemy units, and no **attacking from a ship**;
    - unloading next to or into an **empty** enemy city captures it, if
      you're at war (the normal capture rule);
    - **if the ship is destroyed, its cargo dies with it;**
    - if a docked ship's city is captured, the ships and their cargo in it
      are destroyed.

B5. **Naval combat:**
    - ships attack ships using the normal odds rule;
    - **bombard:** a ship can attack land units or a city on an adjacent
      coastal tile. Win: the defender dies, but the ship never moves in or
      captures. Lose: the ship dies;
    - land units can't attack ships at sea;
    - ships in a city don't defend it; land units do;
    - armies of 3 ships are **not** allowed. That's a land-only mechanic,
      unless Civ Rev 1 had naval armies (say what you chose).

B6. **Harbor building** (needs Seafaring, coastal cities only): +1 food on
    worked water tiles. Check water tiles' base yields while you're there,
    so coastal cities are worth founding.

B7. **The map needs other landmasses:**
    - check that map generation makes **several landmasses** often enough
      that ships matter, i.e. not one big continent every time;
    - report what share of seeds give each civ its own landmass, what share
      give shared continents, and whether there are small empty islands
      worth settling;
    - tune the data if needed, keeping every civ's start fair.

B8. **The AI uses the sea:**
    - when its landmass has no good sites left, the AI builds a ship, ferries
      a **Settler plus an escort** to a good site on another landmass, and
      founds a city;
    - when at war with an overseas civ, it can ship an attack force (armies
      when possible) and land it next to a target city;
    - it keeps a ship or two for coastal defense once rivals have ships;
    - it stays deterministic;
    - **report from the sim:** overseas cities founded, naval invasions,
      ships per civ at turns 100 and 200, and whether **domination wins**
      now happen, since they never did in round 7.

B9. **Save migration v6 → v7:** no ships exist, and the new techs are
    unknown. Backups are kept as usual.

B10. **Dev scenarios, each with a note:**
     - `board-unload`: load a Settler and a Warrior, sail, and unload;
     - `galley-coast`: a Galley can't enter deep ocean;
     - `naval-battle`: with odds;
     - `bombard`: a ship attacks a coastal unit and doesn't move in;
     - `ship-sunk-cargo`: cargo is lost with the ship;
     - `amphibious-capture`: unload into an empty enemy city;
     - `harbor`: a food change;
     - `ai-overseas`: watch an AI ferry a settler over a few turns;
     - `all-ships`: one of each ship, for Dan's icon check next round.

B11. **Unit tests:**
     - the new techs, and the tree staying valid;
     - water-only movement and the Galley coast rule;
     - coastal-only building;
     - boarding and unloading, cargo moving with the ship, and cargo
       capacity;
     - cargo dying with its ship;
     - ships lost with a captured city;
     - naval combat and bombard (no capture);
     - no attacking from a ship;
     - amphibious capture;
     - the Harbor;
     - submarine visibility;
     - the AI ferrying settlers (deterministic);
     - the v6 → v7 migration;
     - every new scenario;
     - `pace.test.ts` still passing.

**Done means:**
- every item (0, A1–A3, B1–B11) is reported individually;
- tests pass;
- it's preview-verified on desktop and in iPad emulation;
- the epoch repo is **pushed**, and the play server is **restarted**
  (standing rules).

Dan then:
- (a) picks ship and aircraft icons on the picker page;
- (b) tries the naval scenarios;
- (c) in a real game, builds a Galley or Caravel and carries a Settler to
  another landmass.

**Open questions (defaults in bold; the coding agent proceeds on the default
unless Dan decides otherwise):**
- **Q1 — Working title:** **"Epoch" as a codename for now.**
- **Q11 — Naval armies:** **no**, since armies are land-only, unless Civ Rev
  1 had them.
- **Q12 — Unit icon style:** **white icon on the owner's colored disc** (as
  built in round 7, matching the picker page Dan chose from).

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

- **Go live in the hub. Deferred by Dan** until the game is further along.
  He tests on the iPad over the local network until then. `netlify.toml` is
  already in place. Steps when he's ready:
  1. The `epoch` repo is already pushed every round (Dan's standing
     instruction, from round 6).
  2. Dan creates a Netlify site from the `epoch` repo. Netlify reads
     `netlify.toml`, so no build settings need typing. Dan picks the site
     name.
  3. Add the Epoch card to `game-hub/games.js` with the **real** URL, then
     commit, and push the hub when Dan says. The hub must not be pushed
     before the Netlify site exists.
- **Order after round 7 — DECIDED by Dan (2026-09-24):**
  - **Round 8:** Naval — done (see Completed Tasks).
  - **Round 9, M7:** barbarians, villages, artifacts, resources, Great
    People, and huts.
  - **Round 10:** Air.
  - **Then:** M8 and M9.
- **Round 9 — Milestone 7: barbarians, villages, artifacts, resources,
  Great People, and huts** (the barbarian part is Dan's spec, 2026-09-24):
  - **Villages:** barbarians live in **stationary villages**. A village
    gains **flags** over time, and **at 4 flags it sends a unit out** and
    resets. Barbarians stay near home or attack from their village, and
    occasionally go after nearby civ units or **unguarded cities**. They're
    relatively weak, even at higher difficulties.
  - **Taking a village, Dan's rule:** the player **chooses**:
    - **Destroy it for a random reward**: most often gold (30, 40, or
      50); occasionally a Horseman, a Settler, a Galley (coastal villages
      only), or a free tech. It also **reveals a resource** on that tile;
    - **or settle it** as a **new city at population 1**.
  - **Ancient artifacts (Dan's generic version, not Civ Rev's named
    relics):**
    - when taking a village, **with either choice (confirmed by Dan)**,
      there's a random chance to find an ancient artifact;
    - it grants **free technology**: usually 1 tech, and rarely a leap of
      2–3, possibly advanced depending on the era;
    - odds and counts are in data, and the names are generic ones of our
      own (e.g. "Ancient Tablets", "Lost Library Scrolls", "Forgotten Star
      Chart").
  - **Map resources (new system):** special tiles with a yield bonus, e.g.
    Iron or Aluminum on hills, Rubber or Game in forests, Wheat, Fish,
    Gold, and so on, all in data. Some are visible from the start, and some
    stay **hidden until revealed** (e.g. by destroying a village). Worked
    tiles use the bonus, and the AI tile choice accounts for it.
  - **Great People:** they add culture and can speed up wonders.
  - **Exploration huts.**
  - Possibly culture borders and city flipping.
- **Round 9, Part A:** wire in Dan's ship icon picks (recorded under Round
  8 in Completed Tasks, 2026-09-24; two watch-outs there for Dan to
  confirm first).
- **Round 10 — Air:** (the aircraft icons were picked in round 8)
  - **Flight finally unlocks something:** a Fighter (Flight), a Bomber
    (Flight, or a new **Advanced Flight** tech), a Jet Fighter (Advanced
    Flight), and a Stealth Bomber or similar (a late tech). Maybe a
    Helicopter.
  - Air units are range-based: each must end its move in a friendly city
    or on a Carrier.
  - Fighters intercept. Bombers attack but **can't capture** cities.
  - An **Airport** building.
  - The AI uses air units.
  - Dan picks the icons first.
  - Nuclear weapons: **not planned** unless Dan asks.
- **Leader portraits (Dan may make these with AI image tools).** Plan
  for them in M8: each leader gets an optional `portrait` image path in
  the data, with a placeholder (initials on the civ color) until Dan
  supplies art. They show on first contact, in diplomacy, and in demands.
  When M8 is scoped, tell Dan the exact size and format (e.g. square
  PNG/WebP, about 512 px).
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
- **Pushing — standing instruction from Dan (2026-09-24):**
  - **until Epoch's Netlify site exists, push the `epoch` repo to GitHub at
    the end of every round**, as the last step before restarting the play
    server;
  - nothing deploys from it yet;
  - **once Dan connects Netlify, this stops**, and pushing goes back to
    "only when Dan says," because a push would then deploy;
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
