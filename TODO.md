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
