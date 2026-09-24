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

## Current Objective (Focus Area)

### Round 5 — Combat follow-ups + Milestone 5 (full AI roster and diplomacy)
**Goal:**
- Apply Dan's feedback from round 4.
- Keep an always-current play server running for him.
- Turn the everyone-at-war placeholder into real relations with 4 AI
  rivals: meeting civs, war and peace, tech trading, and AI demands, as in
  Civ Rev 1. Make the AI a competent rival.
- Placeholder art only.

**Items for the coding agent. Report status on each one individually:**

**Part A — Follow-ups from Dan's round 4 testing**

0. **Commit the updated docs first:** `CLAUDE.md` and `TODO.md` as their own
   commit, then re-read them.

A1. **Standing rule, from this round on (also in CLAUDE.md): keep the play
    server current.**
    - at the **end of every round**, after tests pass and docs are
      committed, (re)start `npm run play:lan` so
      `http://<PC-IP>:4173/` serves the latest build;
    - Dan never has to run a command; he just opens that address on the
      iPad;
    - restart it **only at the end of a round**, never mid-round;
    - a new build may upgrade his save on load, which is fine because
      backups are kept;
    - report that it's running and give the exact LAN address;
    - if the server can't be kept running after your session ends (e.g.
      the process dies when the session closes), say so plainly in the
      report and suggest the simplest fix. Don't leave Dan with a dead
      address and no explanation.

A2. **Winning an attack on a city captures it (DECIDED by Dan):**
    - when an attack kills the **last defender in an enemy city**, the
      winning unit **moves into the city and captures it** right away,
      with the same capture rules as before (owner change, −1 population,
      Walls destroyed, and so on);
    - only land units with attack > 0 can capture, and the unit's turn
      still ends;
    - an open-field win still leaves the attacker in place;
    - update the `capture` scenario's note (one unit is now enough), and
      the AI's capture logic;
    - tests.

A3. **"Legions can't form an army"** (Dan tried in a real game):
    - the rules allow Legions. The likely cause is that the three were **in
      a city**: the unit panel (which holds Form Army and Fortify) is hidden
      while the city panel is open, and tapping a city tile opens the city
      panel;
    - reproduce it first. If that's the cause, make Form Army (and Fortify)
      reachable for units inside a city. For example, when a unit is
      tapped in the city panel's unit list, close the city panel and show
      the unit panel with its buttons. Or put the actions on the unit rows;
    - if the cause is something else, report what it was;
    - add a dev scenario `army-in-city` (3 Legions inside your city) with a
      note;
    - tests where the logic is testable.

A4. **`victory` dev scenario:** one rival with one weak city next to your
    army. Take it, and the Victory panel shows. The panel has only been
    checked in tests so far.

**Part B — Milestone 5: Full AI roster and diplomacy (Civ Rev 1 spirit)**

These are default rules, and all numbers are in data.

B1. **5 civs by default:** new games have Dan plus 4 AI rivals. `?players=`
    still works on the dev server.

B2. **Meeting civs:**
    - two civs have **met** once either one's unit or city sees the other's
      unit or city (or, later, trades or messages);
    - track it per pair in state;
    - on first contact, show a short **"You have met the <Civ> — led by
      <Leader>"** panel;
    - unmet civs don't appear in diplomacy;
    - finish the M2 event rule: rival events show if the tile is visible
      **or you've met that civ**, for civ-level news like "Babylon entered
      the Medieval era." Map-level news still needs visibility.

B3. **War and peace, replacing "everyone at war":**
    - newly met civs start at **peace**;
    - at peace, units can't attack each other or enter each other's cities;
    - **declaring war** is an explicit action with an on-screen confirm for
      Dan;
    - **peace** can be proposed and accepted or refused;
    - after a peace treaty there's a minimum number of turns before war can
      be declared again (in data);
    - the AI declares war or proposes peace based on relative military
      strength, its personality, and how the war is going (below);
    - log and announce declarations.

B4. **AI personalities, light:**
    - each leader in `src/data/civs.ts` gets an **aggression** value and a
      **trade willingness** value;
    - these feed war and peace, demands, and trade acceptance;
    - leader-specific bonuses stay in M8.

B5. **Diplomacy screen, touch-first:**
    - open it from the top bar;
    - it lists met civs with the leader name, civ color, relation (war or
      peace), attitude (friendly / neutral / hostile, derived from recent
      events), city count, and known strength (rough);
    - actions per civ:
      - Declare War / Propose Peace;
      - **Trade Techs** (swap one of yours for one of theirs, or ask for one
        in exchange for gold);
      - **Give Gold**;
    - every action gets a clear accept or refuse answer with a one-line
      reason in our own words;
    - it works in portrait and landscape, with a large close button.

B6. **AI demands, a Civ Rev flavor:**
    - occasionally a stronger, aggressive AI **demands** tribute from Dan,
      either gold or a tech;
    - Dan gets an on-screen panel with **Give** or **Refuse**, and refusing
      raises the chance of war;
    - it's rare and capped (e.g. at most once per N turns per civ, in data).

B7. **Tech trading rules:**
    - AIs only trade techs they have for techs they lack;
    - they won't give a tech to someone they're hostile with;
    - a traded tech is learned instantly by the receiver and doesn't cost
      the giver;
    - AIs also trade with each other occasionally (logged, shown if met).

B8. **AI competence, from the round 3 and round 4 observations:**
    - **expand faster:** the city target scales with map room, not a fixed
      4, and early Settlers are prioritized;
    - **stop piling up defenders:** cap the defenders per city (in data),
      and once buildings run out, build Settlers, offense, or
      rush-buy-worthy items instead of endless Spearmen;
    - **go to war on purpose:** pick a target civ (the weakest nearby, or
      the one at war), gather an attack force (armies when possible), move
      it toward a target city, and attack with the odds rule;
    - keep defenders home;
    - make peace when losing;
    - it stays deterministic;
    - report the before and after numbers from your simulation, e.g. cities
      per AI at turns 50 and 100, units per AI at turn 120, and wars
      declared.

B9. **Early-game fairness:** with peace-on-meeting, early raids now require
    a war declaration. Also keep a short **grace period** at the start
    (in data, e.g. the first 20 turns) where AIs won't declare war on Dan.

B10. **Save migration v4 → v5:**
     - pairs who can currently see each other's units or cities count as
       met;
     - existing relations carry over as they are (at war stays at war),
       so Dan's game doesn't suddenly change;
     - backups are kept as usual.

B11. **Dev scenarios:**
     - `first-contact`: move one tile to meet a civ;
     - `peace`: at war and losing, propose peace, and it's accepted;
     - `demand`: an AI demand arrives at End Turn;
     - `tech-trade`: a friendly AI with a tech you lack. Trade for it;
     - `ai-war`: watch an AI declare war and march on a city over a few
       turns;
     - each has a note.

B12. **Unit tests:**
     - contact detection;
     - peace blocks attacks and city entry;
     - declaring war;
     - the peace duration rule;
     - AI war and peace choices (deterministic, and both ways);
     - demand frequency caps;
     - tech trade rules;
     - event visibility with "met";
     - the AI city count and defender cap in a simulation;
     - the v4 → v5 migration;
     - every new scenario.

**Done means:**
- every item (0, A1–A4, B1–B12) is reported individually;
- tests pass;
- it's preview-verified on desktop and in iPad-sized touch emulation;
- the play server is running on 4173 with this build (A1).

Dan then confirms on the iPad:
- (a) the play address works without him running anything;
- (b) the new scenarios behave as their notes say;
- (c) in a real 5-civ game, meeting a civ, the diplomacy screen, and at
  least one trade or peace deal feel right.

Nothing gets pushed without Dan saying so.

**Dan's optional action outside the agent:** the two hub commits that cancel
out are still there. Run `git reset --hard origin/main` in
`C:\Users\danmo\game-hub` if you want them gone. It's harmless either way.

**Open questions (defaults in bold; the coding agent proceeds on the default
unless Dan decides otherwise):**
- **Q1 — Working title:** **"Epoch" as a codename for now.**
- **Q5 — Starting techs:** **none.**
- **Q6 — Combat model:** **one loser destroyed, no hit points.** Dan tested
  attacking and it seemed fine.
- **Q7 — Research pace:** it's far too slow for a 2–3 hour game. **Default:
  leave it for the balance pass** unless Dan finds it slow.
- **Q8 — Starting relations:** **peace when civs first meet**, with the AI
  deciding on war from there. The alternative is to start at war, as in
  M4.

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
  so tuning later is cheap. **Known issue:** research pace and AI expansion
  are far too slow for a 2–3 hour game (see the round 3 report, and Q7).
- **Real games are played on `play:lan` (from round 4), not `dev:lan`.** The
  dev server live-reloads with half-finished code, which is what wiped
  Dan's M2 test game.
