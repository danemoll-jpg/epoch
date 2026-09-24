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
    - **Loose end:** the agent added an Epoch card to `game-hub/games.js`
      with a **placeholder URL** (`https://epoch-dan.netlify.app/`). The hub
      commit was blocked, so that edit sits **uncommitted** in the hub's
      working tree. Cleanup is M2 item 0b below.

* **Milestone 2 — Cities, economy, and autosave — coding done (2026-09-23).
  Waiting for Dan to confirm on his iPad**, including autosave surviving a
  Safari tab reload. Nothing pushed.
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
    `git reset --hard origin/main` in the hub.
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

## Current Objective (Focus Area)

### Milestone 2 — Cities, economy, and autosave
**Status (coding round 2):** all items 0–14 done. See the report under
Completed Tasks. **Waiting for Dan to check on the iPad** (`npm run dev:lan`, then
open the Network URL in Safari): play a few turns, reload the tab, and
confirm the game resumes.

**Goal:** cities become the heart of the game, as in Civ Rev 1. They grow
from food, build one thing at a time, and turn trade into science and gold.
The game survives an iPad reload. Placeholder art only.

**Items for the coding agent. Report status on each one individually:**

0. **Commit the updated docs first:** `CLAUDE.md` and `TODO.md` as their own
   commit, then re-read them.

0b. **Clean up the hub's working tree:** revert the uncommitted Epoch card
    edit in `game-hub/games.js` (e.g. `git checkout -- games.js` in the hub
    repo), so a future hub push can't publish a dead link. The card gets
    re-added at go-live with the real URL. Report exactly what you reverted.
    If the hub has any *other* uncommitted changes, leave them alone and
    report them.

1. **City growth:**
   - each city has a food box;
   - surplus food (after each citizen eats) fills it, and when it's full the
     city grows by 1;
   - a food deficit empties it, and the city shrinks at 0;
   - growth thresholds, food eaten per citizen, and the food kept after
     growth are all in `src/data/`.

2. **Worked tiles, automatic with a city focus (Civ Rev style):**
   - a city always works its center tile plus one tile per citizen, inside
     its work radius;
   - the work radius is in data, defaulting to the 8 surrounding tiles;
   - tiles are picked automatically based on the city's **focus**:
     Balanced (default), Food, Production, or Trade;
   - there is no manual tile-by-tile assignment in M2;
   - two cities never work the same tile.

3. **Production:**
   - each city builds one item at a time: a unit or a building;
   - production accumulates each turn, and the item appears when it's paid
     for, with overflow carried over;
   - **rush-buy with gold**, where the cost is based on the production still
     remaining (formula in data);
   - when an item finishes, the city keeps the same item selected for units
     and prompts for a new choice after a building.

4. **Settlers cost population:** building a Settler needs city size ≥2 and
   reduces the size by 1. (Rule in data, so it's easy to change.)

5. **Trade → science and gold:**
   - each city's trade is split into science and gold by one empire-wide
     **science/gold rate**, in 10% steps, defaulting to 60% science;
   - science accumulates as a number but buys nothing until M3 (the tech
     tree);
   - gold goes to the treasury.

6. **Starter buildings, all in data, available without techs until M3:**
   - Granary: keeps part of the food box after growth;
   - Barracks: new units start as veterans (the flag is stored now and used
     in M4);
   - Walls: a defense bonus flag (used in M4);
   - Library: +science %;
   - Marketplace: +gold %;
   - Temple: the effect is a placeholder for now (contentment/culture comes
     later);
   - costs and numbers are placeholders; no building upkeep.

7. **City screen, touch-first:**
   - tap a city to open a panel showing size, the food box and turns to
     grow, production and turns to finish, food/production/trade totals,
     the focus picker, the build list, and a Buy button with its cost;
   - the panel closes with a large close button, with no keyboard needed;
   - it works in iPad portrait and landscape.

8. **Empire HUD:** show the turn number, gold total and change per turn,
   science total and change per turn, and a control to change the
   science/gold rate.

9. **Fix the tap-on-own-stack issue from M1:** when a unit is selected,
   tapping a reachable tile that holds your own units **moves** the selected
   unit there. Tapping a tile with no unit selected selects it, as before.
   Handle a city tile that also holds units sensibly: e.g. tapping a
   selected unit's own city opens the city, and the city panel lists the
   units inside. Report the rule you chose.

10. **AI uses the city systems:**
    - AI cities pick focus and production with simple rules, e.g. warriors
      for defense, settlers to expand to a few cities, and then buildings;
    - the AI's new settlers find decent sites and found cities;
    - it uses the same actions as the player.

11. **Fog-respecting event messages:** show rival events only when the
    player can see them. The rule is: the tile is currently visible to the
    player, or later, the player has met that civ. (Default; see open
    question Q2.)

12. **Local autosave and resume:**
    - save the whole state after every end of turn, and also when the page
      is hidden (`visibilitychange`/`pagehide`), because Safari can kill
      background tabs;
    - on load, resume the saved game if there is one;
    - add a **New Game** control, with an on-screen confirm rather than a
      browser `confirm()` dialog;
    - include a `saveVersion` field, and if a save is from an incompatible
      version, start a new game with a notice instead of crashing;
    - use IndexedDB or localStorage (your choice, say which); state is
      small, so either is fine.

13. **Unit tests** for:
    - growth and starvation;
    - tile selection by focus, and no shared tiles between cities;
    - production completion, overflow, and rush-buy cost;
    - the settler population rule;
    - the trade split and building percentage bonuses;
    - a save round-trip, and resuming from a save continuing identically;
    - AI city behavior (deterministic);
    - the tap rule from item 9 (as logic, if it's testable).

14. **Document the iPad local-network dev command** in CLAUDE.md, whatever
    Dan uses to reach the dev server from his iPad (e.g.
    `npm run dev -- --host`). Consider adding it as an `npm run dev:lan`
    script. Don't set Vite to listen on the network by default.

**Done means:** items 0–14 are reported individually and tests pass. It must
be preview-verified on desktop and in iPad-sized touch emulation, and ready
for Dan to check on his iPad over the local network. It counts as fully done
only when Dan confirms it on the iPad, **including autosave surviving a
Safari tab reload**. Nothing gets pushed without Dan saying so.

**Open questions (defaults in bold; the coding agent proceeds on the default
unless Dan decides otherwise):**
- **Q1 — Working title:** **"Epoch" as a codename for now.** A real name can
  come later, as long as it doesn't include "Civilization."
- **Q2 — Rival event messages:** **show only what the player can see**
  (item 11). The alternative is to keep showing all rival events as M1 did.
- **Q3 — Tile management:** **automatic with a city focus** (item 2),
  closest to Civ Rev 1 and easiest on a touchscreen. Manual tile-by-tile
  assignment could be added later as an option.
- **Q4 — Science/gold split:** **one empire-wide rate** (item 5). This is a
  placeholder until the balance pass. If Dan remembers Civ Rev 1 handling it
  differently, match that.

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
- **Milestone 3 — Tech tree:**
  - a short tree grouped into four eras (Ancient, Medieval, Industrial,
    Modern);
  - science from M2 buys techs;
  - techs unlock units, buildings, and wonders, and M2's buildings get tech
    requirements;
  - show an era indicator.
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
- **The hub repo is shared and separate.** The agent's permission guard
  blocked committing there in M1. Any hub change needs Dan's say-so, and
  never push the hub with a card for a site that doesn't exist yet.
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
- **Pushing is Dan's call, never automatic.** Until the Netlify site
  exists, a push only updates GitHub. Nothing deploys. It's still Dan's
  call.
- **Balance numbers are placeholders until Milestone 6+.** Keep them in data
  so tuning later is cheap.
