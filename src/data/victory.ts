// The four ways to win (Round 7, Milestone 6), as in the 2008 original's spirit. The rules
// themselves live in src/game/victory.ts, one function per victory; every number is here.
// Placeholders, tuned toward a game of about 250 turns (see `npm run sim`).

import type { TechId } from './techs';

export type VictoryKind = 'domination' | 'culture' | 'economic' | 'technology';

export const VICTORY_KINDS: VictoryKind[] = ['domination', 'culture', 'economic', 'technology'];

export const VICTORY_NAMES: Record<VictoryKind, string> = {
  domination: 'Domination',
  culture: 'Culture',
  economic: 'Economic',
  technology: 'Technology',
};

/** "a culture victory", "an economic victory" (Round 19: the article follows the word). */
export function aVictory(kind: VictoryKind): string {
  const w = VICTORY_NAMES[kind].toLowerCase();
  return `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w} victory`;
}

export const VICTORY = {
  /**
   * Culture: this much culture in total, then build the World Council. Round 12: 6000 → 7000,
   * since religion (holy cities, follower Temples and Cathedrals) adds culture everywhere.
   * Round 15 (B1): 7000 → 8000 (culture was over half the wins).
   */
  cultureGoal: 8000,
  /**
   * Economic: this much gold in the treasury (when starting and finishing), then build the Global
   * Exchange. Round 15 (B1, B4): 9000 → 13000, since the AIs now link their cities by road
   * mid-game and roads bring trade.
   */
  goldGoal: 13000,
  /** Technology: build the spaceship's parts in your capital, launch it, and it arrives later. */
  spaceship: {
    requires: 'space_flight' as TechId,
    parts: 3,
    partCost: 180,
    /** Turns from launch to arrival. It arrives at the start of turn launch + travelTurns. */
    travelTurns: 12,
  },
  /** A warning shows when a rival's culture or gold passes this share of its goal. */
  warnPct: 75,
  /** Round 19 (item 9): warn when a victory wonder or a spaceship is this many turns away or less… */
  warnSoonTurns: 5,
  /** …and again every turn from this many. */
  warnEveryTurnFrom: 3,
};

export type ProjectId = 'spaceship' | 'moonshot';

/** Things a city builds that aren't units, buildings, or wonders. */
export interface ProjectDef {
  id: ProjectId;
  name: string;
  cost: number;
  requires: TechId;
  summary: string;
  /** Round 11: a leader's unique project, for this civ only (once it has the leader bonus), once per game. */
  civ?: string;
}

export const PROJECTS: Record<ProjectId, ProjectDef> = {
  spaceship: {
    id: 'spaceship',
    name: 'Spaceship part',
    cost: VICTORY.spaceship.partCost,
    requires: VICTORY.spaceship.requires,
    summary: `One of ${VICTORY.spaceship.parts} parts. Capital only. Launch it when all are built`,
  },
  // Round 11: John F. Kennedy's own project (effects in leaders.ts UNIQUE_RULES).
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot',
    cost: 250,
    requires: 'rocketry',
    summary: 'United States only, once: 200 culture and +25% science from then on',
    civ: 'usa',
  },
};

export const PROJECT_IDS = Object.keys(PROJECTS) as ProjectId[];
