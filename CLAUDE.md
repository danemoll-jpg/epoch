# Project Context & Rules

Read this at the start of every session. It is the short, operational version.
`TODO.md` is the planning and history record and the source of truth for what
to work on.

## ⚠️ Never push without Dan's go-ahead
Pushing to GitHub deploys straight to the live game hub via Netlify. **Dan
decides when to push.** Commit locally as much as you like, but never run
`git push`, and never trigger a deploy any other way, unless Dan has
explicitly said to push in this session. At the end of a round, report that
the work is **ready to push** and wait.

## ⚠️ Start every round by committing updated docs
Planning happens in a separate Claude session. When the plan changes, Dan
copies the new `CLAUDE.md` and `TODO.md` into this repo's root, overwriting
the old copies. So at the **start of every round**:
1. Run `git status`. If `CLAUDE.md` or `TODO.md` has changed, commit just
   those two files first, as their own commit
   (`docs: update plan from planning session`), before touching any code.
2. Re-read both files **after** committing. The versions on disk are the
   current plan. Don't work from your memory of older versions.
3. If the new docs seem to have dropped something you reported last round
   (a status, a finding), don't restore it silently. Mention it in your
   report so it gets reconciled. Git history has the old version.

The local repo already exists (Dan created it). Don't run `git init` or
re-create it.

## What this project is
A single-player, turn-based 4X strategy game in the spirit of the original
**Civilization Revolution (2008)**, not Civ Rev 2. It uses a small map, a
simple economy, a short era-based tech tree, and fast turns. The game has its
own look, name, and text. It copies gameplay ideas only, never assets or
wording. It's published in Dan's **game hub** for family and friends, not
released publicly or sold.

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
- **Repo:** a local git repo Dan already created. Scaffold the project into
  it.
- **Hosting/deploy:** Dan's existing game hub. Pipeline: push to GitHub, then
  Netlify deploys. Pushing is Dan's call (see the top of this file). Follow
  the integration pattern the hub's other games already use (see TODO.md
  item 12). The hub also uses Firebase as its database, but this game
  doesn't use Firebase yet.
- **Backend:** none of its own. Game logic runs entirely client-side.

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
  (e.g. `moveUnit(state, unitId, to)`). This keeps rules testable and lets the
  AI use exactly the same moves as the player.
- **Use a seeded RNG, never `Math.random()` in game logic.** The same seed and
  the same actions must produce the same game. This is what makes bugs
  reproducible.
- **Content is data-driven.** Civs, leaders, units, buildings, techs, wonders,
  and terrain are defined in `src/data/` as typed data tables. Adding a leader
  or unit should mean editing data, not logic.
- **Player count is data, not hard-coded.** Everything must work for 5
  players, even while early milestones only spawn 2.
- **Touch-first input:**
  - Use Pointer Events so one code path handles mouse and touch.
  - Nothing depends on hover, right-click, or the keyboard. Keyboard
    shortcuts are desktop extras only.
  - Buttons and tap targets are at least 44×44 px.
  - Handle pinch zoom, drag pan, resize, orientation changes, and
    `devicePixelRatio`.
  - Stop Safari's double-tap zoom, page bounce, and text selection on the
    game surface.
- **Square tile grid**, as in Civ Rev, not hexes.
- **Placeholder art until an art pass:** simple shapes, colors, and letters.
  Don't spend time on visuals before the mechanics work.
- **IP guardrails (standing rule):**
  - No Firaxis/2K art, UI, text, quotes, music, or leader-bonus wording.
  - Never use the name "Civilization" (it's a trademark) in the title or UI.
  - Leaders: any historical or real figure is allowed while the game is
    shared only with family and friends. Keep all leaders in `src/data/` so
    the list can be reviewed and swapped in one place. Before any public
    release, review the list for living or recently deceased people (see
    TODO.md).
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
```
Dev URL options: `?seed=123` gives a reproducible map, and `?players=5` gives a full
5-civ game. `window.__epoch` exposes `{ app, seed }` for debugging, including from
Safari's Web Inspector on the iPad.

## Code layout
- `src/data/`: terrain, units, civs/leaders/city names, rule constants.
- `src/game/`: pure rules. `types.ts` (state), `rng.ts`, `grid.ts`, `mapgen.ts`,
  `newGame.ts`, `movement.ts`, `city.ts`, `fog.ts`, `turn.ts`, `ai.ts`, and
  `actions.ts` (the single `applyAction` entry point the UI uses).
- `src/render/`: `camera.ts` and `renderer.ts` (Canvas 2D; read-only on state).
- `src/ui/`: `app.ts` (view state, HUD, dispatch), `input.ts` (Pointer Events,
  Safari gesture guards), `style.css`.
- `tests/`: Vitest suites plus `helpers.ts` for hand-built map states.
- A player's `id` always equals its index in `state.players`.

## Hub integration (how Dan's games are deployed)
Each game is its **own GitHub repo and its own Netlify site**. The hub
(`danemoll-jpg/game-hub`) is a static launcher that links out to each game's
live URL through one entry in its `games.js`. This repo's `netlify.toml`
follows the same shape as Sole Match: `npm install && npm run build`, publish
`dist`, SPA redirect.

## Reporting back (every round)
When you finish a round of work, update `TODO.md` and this file, and commit
them with your code. Dan takes these updated files back to the planning
session, so they are your report. Give an **explicit per-item status for
every numbered item you were asked to do**: done, not done, or deferred, and
why. Say how each item was verified: unit-tested, preview-verified on
desktop, preview-verified in touch emulation, ready to push, live in the
hub, or not verified. Only Dan can mark something *confirmed on iPad*.
Don't quietly skip an item.

End each round by saying whether the work is **ready to push** and listing
the local commits waiting. Then wait for Dan to say "push." When he does,
push everything waiting in one go.

## Where things stand
**Always check `TODO.md` for the current objective before starting work.**

**Milestone 1 (playable skeleton) is built and committed locally, but not
pushed.** Items 1–11 are done, unit-tested, and preview-verified on desktop
and in iPad-sized touch emulation. Item 12 is waiting on Dan: the Netlify
site for this repo still has to be created, and the hub's card needs its
real URL and a commit. See TODO.md for the per-item report. Nothing is
confirmed on a real iPad yet.
