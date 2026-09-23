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
    the balance pass. Not a Milestone 1 concern.
  - **Civs per game:** 5 total (Dan plus 4 AI rivals), as in Civ Rev 1. Code
    should treat the player count as data, not a hard-coded 2.
  - **Multiplayer:** single-player only. Multiplayer isn't planned, but the
    pure-state design means hotseat play wouldn't be ruled out later.

* **Publishing and platform — DECIDED by Dan (2026-09-23).**
  - **Where it lives:** the game is published in Dan's existing **game hub**
    alongside other games he's built with Claude. Pipeline: push to GitHub,
    then Netlify deploys. The hub also uses Firebase (Dan believes) as its
    database.
  - **Audience:** family and friends via the hub. Not public, not sold.
  - **Platform:** **iPad (Safari, touch) is a primary target**, equal to the
    desktop browser. It is not a later add-on. Dan's main way to play is on
    his iPad.
  - **Pushes — Dan decides when to push.** The coding agent never pushes to
    GitHub on its own, because a push goes straight to the live hub via
    Netlify. The agent commits locally, reports that the work is ready to
    push, and pushes only when Dan explicitly says so.
  - This resolves former open questions Q2 (hosting) and Q3 (platform).

* **Doc handoff workflow — DECIDED by Dan (2026-09-23).**
  - Dan has already created the **local git repo** for the game.
  - **Claude → coding agent:** when the plan changes, Claude updates
    `CLAUDE.md` and `TODO.md` in the planning project. Dan copies them into
    the repo root. The coding agent's first step each round is to commit
    those updated docs, then re-read them.
  - **Coding agent → Claude:** at the end of a round, the coding agent
    updates both docs as its report and commits them. Dan brings them back
    to the planning session.
  - **Claude reminds Dan every time** it updates the docs: copy them down,
    and tell the coding agent to commit them first.

## Current Objective (Focus Area)

### Milestone 1 — Playable skeleton, ready for the game hub
**Goal:** open the game on Dan's iPad or a desktop browser, move units around
a generated map, found a city, end turns, and see an AI opponent doing
something. Use placeholder art only.

**Items for the coding agent. Report status on each one individually:**
0. **Commit the updated docs first:** `CLAUDE.md` and `TODO.md` as their own
   commit, then re-read them (see CLAUDE.md).
1. **Scaffold the project** into Dan's existing local repo (don't
   re-initialize it) with Vite + TypeScript (strict) + Vitest and the folder
   layout `src/game/`, `src/data/`, `src/render/`, `src/ui/`. Add a sensible
   `.gitignore` (node_modules, dist, etc.). Confirm the commands in
   CLAUDE.md.
2. **Game state model:** map, tiles, players, units, cities, turn number, and
   RNG seed, as plain serializable data. The players list must support 5
   players (1 human, 4 AI), even though Milestone 1 only spawns 2. Include a
   test that it survives a JSON round-trip.
3. **Seeded map generation:** a small square grid (around 32×24 to start) with
   terrain types (grassland, plains, forest, hills, mountains, desert, ocean,
   coast). Each terrain has food, production, and trade yields defined in
   `src/data/`. Every player gets a reasonable start location. Start
   placement should work for up to 5 players.
4. **Canvas rendering:** draw terrain as colored tiles, units as simple shapes
   or letters in the owner's color, and cities as marked squares. The canvas
   fills the screen and handles resizing and orientation changes, including
   iPad landscape and portrait. Keep it sharp on Retina screens by scaling for
   `devicePixelRatio`.
5. **Touch and mouse input, using Pointer Events for both:**
   - tap or click to select a unit, then tap or click a tile to move it;
   - drag with one finger or the mouse to pan the map;
   - pinch or the mouse wheel to zoom;
   - no feature depends on hover, right-click, or the keyboard;
   - on-screen buttons are at least 44×44 px;
   - stop Safari's double-tap zoom, page bounce, and text selection on the
     game surface.
6. **Units:** a Settler and a Warrior, defined in data. Track movement points
   and terrain movement costs, with no moving onto ocean or mountains.
7. **Found city:** a Settler can found a city on a valid tile using an
   on-screen button, which uses up the settler. Show the city's name, using
   a per-civ name list from data.
8. **Turn cycle:** a large on-screen End Turn button. A keyboard shortcut is
   a desktop extra only. Movement resets each turn and the turn counter
   advances.
9. **Fog of war:** unexplored tiles are hidden and explored-but-not-visible
   tiles are dimmed. Visibility radius comes from units and cities.
10. **One minimal AI opponent** using the same action functions as the
    player. Each turn it explores with its warrior and founds a city with its
    settler. It doesn't need to be smart. The full 4 AI rivals come in a
    later milestone.
11. **Unit tests** for movement rules, city founding, turn reset, and seeded
    map determinism (same seed gives the same map).
12. **Game hub integration. Investigate first, then integrate:**
    - read the hub's repo and **report back** how existing games are
      integrated: separate repo or a folder in the hub, build output, how
      the hub links to games, the Netlify config, and what Firebase is used
      for;
    - follow that same pattern for this game, and don't invent a new one;
    - if the pattern is unclear or doesn't fit a Vite build, stop and report
      the options rather than guessing;
    - don't use Firebase in this milestone;
    - **do not push.** Commit locally, report that the round is ready to
      push, and push only when Dan says to (see Technical Notes).

#### Coding round 1 report (2026-09-23)
Tests: **40 passing** (`npm test`). Type-check and production build are clean.
Nothing is pushed, and nothing is confirmed on a real iPad.

| # | Item | Status | Verified by |
|---|------|--------|-------------|
| 0 | Commit docs first | **Done** (`docs: update plan from planning session`), then re-read both | n/a |
| 1 | Scaffold | **Done.** Vite 8 + TypeScript 7 (strict, `noUncheckedIndexedAccess`) + Vitest 5, folders `src/game`, `src/data`, `src/render`, `src/ui`, plus `tests/`, `.gitignore`. All five commands confirmed; `lint` is `tsc --noEmit` (no ESLint yet). | commands run |
| 2 | Game state model | **Done.** Plain data (`src/game/types.ts`): map/tiles, players (explored flags per player), units, cities, turn, current player, seed + RNG state, id counter, event log. Supports 1–5 players (1 human + up to 4 AI); M1 default is 2. | unit-tested (JSON round-trip, round-trip after play, round-tripped game plays on identically, 5-player setup) |
| 3 | Seeded map generation | **Done.** 32×24, all 8 terrains, yields/move costs in `src/data/terrain.ts`. Value-noise continents with percentile thresholds; coast = water touching land. Start placement spreads players (target ≥7 tiles apart, relaxes if needed) on grassland/plains/hills in a land region of ≥15 tiles; regenerates deterministically if 5 starts don't fit. | unit-tested (determinism, all terrains, coast rule, 5-player starts across 40 seeds) |
| 4 | Canvas rendering | **Done.** Colored tiles + simple terrain marks, lettered unit discs in owner color with stack badge, city squares + name labels, reachable-tile highlight. Full-screen, resize/orientation/`visualViewport`/ResizeObserver, `devicePixelRatio` scaling (checked backing store = CSS size × DPR). | preview-verified (desktop); preview-verified (touch emulation, 820×1180 portrait and 1180×820 landscape) |
| 5 | Touch + mouse input | **Done.** Pointer Events only: tap/click to select/move, one-finger/mouse drag to pan, pinch + wheel (and trackpad pinch) to zoom. No hover/right-click/keyboard dependency. Buttons ≥44×44 (measured: 107×44, 99×44, End Turn 140×64). `touch-action: none`, no-zoom viewport, `gesturestart`/`touchmove`/double-tap/`selectstart` guards, `overscroll-behavior: none`, safe-area insets. | preview-verified (desktop mouse); touch emulation via synthetic touch PointerEvents (tap, drag, pinch) at iPad size. Safari-specific guards **not verified**, iPad only. |
| 6 | Units | **Done.** Settler + Warrior in `src/data/units.ts`. Move points, terrain costs (forest/hills 2), no water or mountains, diagonal moves; a full-move unit can always make one move. Pathing plans through unexplored tiles optimistically so it never reveals hidden terrain. | unit-tested; preview-verified |
| 7 | Found city | **Done.** On-screen Found City button (disabled with reason when invalid; keyboard B/F extra). Uses up the settler; not on water/mountains; min distance 3 from other cities; names from the civ's list in `src/data/civs.ts`. | unit-tested; preview-verified |
| 8 | Turn cycle | **Done.** Large End Turn button (pulses when no units can move); Enter is a desktop extra. Movement resets at the start of each player's turn; turn counter advances when play wraps; dead players are skipped. | unit-tested; preview-verified |
| 9 | Fog of war | **Done.** Unexplored = black; explored-not-visible = dimmed, enemy units hidden there; cities stay drawn once explored. Sight: units 1, cities 2 (data). | unit-tested; preview-verified |
| 10 | Minimal AI | **Done.** Uses the same action functions. Settler founds the capital right away (later settlers look for a decent site); warrior walks to the nearest exploration frontier. Also works with all 4 rivals (`?players=5`). | unit-tested (founds city, explores, deterministic, 5-player run); preview-verified |
| 11 | Unit tests | **Done.** Movement rules, city founding, turn reset, seeded map determinism, plus fog, state, and AI (40 tests). | `npm test` |
| 12 | Hub integration | **Partly done. Waiting on Dan.** Findings are below. Added `netlify.toml` to this repo (same pattern as Sole Match). Added the Epoch card to `game-hub/games.js`, but **the commit in the hub repo was blocked** by the agent's permission guard (a separate, shared repo), so that edit sits **uncommitted** in the hub's working tree. The card URL `https://epoch-dan.netlify.app/` is a **placeholder guess**. | build verified locally; not live |

**Hub findings (item 12):**
- **Separate repos.** Every browser game is its own GitHub repo
  (`danemoll-jpg/<game>`) with its **own Netlify site**. The hub
  (`danemoll-jpg/game-hub`) is a plain static page (no build step,
  `publish = "."`) that only links out.
- **How the hub links:** one object per game in `game-hub/games.js`
  (`id, name, tagline, icon, url, tags, accent`), rendered by `app.js` as
  cards. Nothing else changes.
- **Netlify config per game:** `netlify.toml` with
  `command = "npm install && npm run build"`, publish `dist` (or
  `packages/client/dist` for the npm-workspace games like Golf, Spades, and
  Mexican Train), plus an SPA `/* → /index.html 200` redirect. Vite fits this
  pattern directly. Epoch copies Sole Match's single-package version.
- **Firebase:** not used by the hub at all. Individual games use it (Sole
  Match: online rooms plus a leaderboard, with `firestore.rules`; Mexican
  Train: `network/firebase.ts` for online play; Nonogram: `firebase.js`).
  Each game has its own Firebase client code. Epoch uses none (per M1).

**Dan's steps to go live (in order):**
1. Say "push" so the agent pushes this repo to `danemoll-jpg/epoch`.
   (`origin` is already set; the repo is new on GitHub, so this is its first
   push.)
2. In Netlify, create a new site from the `epoch` repo. It reads
   `netlify.toml`, so there are no build settings to type. Pick the site
   name.
3. Put the real URL into the Epoch card in `game-hub/games.js` (it's already
   edited but uncommitted there), then commit and push the hub, or tell the
   agent to. Don't push the hub before the Netlify site exists, or the card
   will be a dead link.

**Known limits / notes for planning:**
- A tap on a tile holding your own unit always *selects* it. You can't yet
  move a unit onto your own stack by tapping it (units can stack; only the
  tap gesture is ambiguous). Revisit with the city screen in M2.
- No save yet, so reloading starts a new game (autosave is M2).
- Rival actions show as toasts ("Babylon founded Babylon") even when out of
  sight. That's fine for now, but decide later whether this should respect fog.
- Tapping empty explored terrain shows its yields, which is handy for
  checking the data.

**Done means:** items 0–12 are reported individually and tests pass. The game
must be **preview-verified** in a desktop browser *and* in an iPad-sized
touch emulation, and **ready to push** to the hub. It goes live when Dan
says to push. It counts as fully done only when Dan confirms it works on his
real iPad. Report those verification levels separately.

**Open questions (defaults in bold; the coding agent proceeds on the default
unless Dan decides otherwise):**
- **Q1 — Working title:** **use the codename "Epoch" in code and the UI for
  now.** A real name can come later, as long as it doesn't include
  "Civilization." This is also the name that shows in the hub.

## Next Steps (Do Not Start Yet)

All of these are deferred for **sequencing only**. Each depends on the
milestone before it. None has been decided against.

- **Milestone 2 — Cities, economy, and autosave:**
  - Food growth and city size, worked tiles, and a production queue.
  - Trade split between science and gold.
  - Buildings: granary, barracks, walls, library, marketplace, etc.
  - **Local autosave every turn and resume on load.** This was moved up from
    Milestone 9 because a 2–3 hour game gets played across several sittings
    on the iPad, and Safari can reload a backgrounded tab and lose an
    unsaved game.
- **Milestone 3 — Tech tree:** a short tree grouped into four eras (Ancient,
  Medieval, Industrial, Modern). Techs unlock units, buildings, and wonders.
  Show an era indicator.
- **Milestone 4 — Combat:** attack vs. defense values with terrain,
  fortification, and veteran bonuses, plus combat odds shown before
  attacking. **Armies:** stacking 3 identical units into one army, a
  signature Civ Rev mechanic. Capturing cities.
- **Milestone 5 — Full AI roster and basic diplomacy:** scale up to all 4 AI
  rivals. AI city expansion, building choices, and war/peace decisions.
  Simple diplomacy such as peace, war, and tech trading.
- **Milestone 6 — Victory conditions:**
  - Domination: capture all enemy capitals.
  - Culture: reach a culture threshold or build enough wonders.
  - Economic: stockpile gold and build the economic wonder.
  - Technology: build and launch the spaceship.

  Add a victory and defeat screen. Tune thresholds toward a 2–3 hour game.
- **Milestone 7 — Flavor systems:** Great People, wonders, barbarians, and
  exploration huts.
- **Milestone 8 — Leader roster:** 12–16 civs, each leader with era-based
  bonuses, all in data. Any historical or real figure is allowed for
  family-and-friends use, and the roster doesn't have to match Civ Rev's.
- **Milestone 9 — Polish:** an original art pass, sound, a main menu, and
  difficulty levels.
- **Cloud saves through the hub's Firebase.** This lets a game continue
  across devices, e.g. start on the iPad and finish on desktop. It follows
  whatever conventions the hub already uses for Firebase (item 12 will tell
  us those). It's deferred until local autosave exists and the hub's
  Firebase setup is understood.
- **Before any public release (only if Dan decides to go beyond family and
  friends, or to sell it):** review the leader list and swap out living or
  recently deceased figures. Double-check the game's name and all art and
  text against the IP rules.
- **Multiplayer — not planned.** Dan chose single-player only. Hotseat
  remains possible later if he changes his mind. Online multiplayer would
  need a server and is a much bigger project.

## Technical Notes / Blockers

- **Doc sync order matters.** The docs are edited in two places: the
  planning session and the repo. To avoid one side overwriting the other,
  always go round-trip. The coding agent reports by updating the docs, Dan
  brings those back to planning, Claude reconciles from that latest version,
  and Dan copies the result down. Claude should never edit from a stale copy
  after a coding round without first seeing the coding agent's updated
  docs. Git history in the repo is the backstop if something gets lost.
- **IP guardrails:** see CLAUDE.md. The rules are no copied assets or text
  and no "Civilization" in the name. Any leader is allowed while the game is
  shared only with family and friends, with a leader review before any
  public release. This applies to every milestone.
- **Architecture rules that must hold from day one:** pure game logic,
  serializable state, a seeded RNG, data-driven content, and touch-first
  input. Retrofitting any of these later is expensive, so they aren't
  optional for Milestone 1.
- **Player count is data, not hard-coded.** Target is 5 civs per game.
- **iPad is the real test environment.** Desktop preview and touch emulation
  don't prove it works on a real iPad. Safari has its own touch, zoom,
  viewport, and storage quirks. Verification labels are *unit-tested*,
  *preview-verified (desktop)*, *preview-verified (touch emulation)*,
  *ready to push*, *live in hub*, and *CONFIRMED by Dan on iPad*. These are
  separate claims, so don't let an earlier one stand in for a later one.
- **Pushing is Dan's call, never automatic.** Every push to GitHub triggers
  a Netlify deploy to the live hub, so the coding agent commits locally and
  waits for Dan's explicit go-ahead. When Dan says to push, it pushes
  everything that's ready in one go. Batching also keeps Netlify's build
  allowance from being used up quietly.
- **Balance numbers are placeholders until Milestone 6+.** Don't tune yields,
  costs, or combat values early. Keep them in data so tuning later is cheap.
