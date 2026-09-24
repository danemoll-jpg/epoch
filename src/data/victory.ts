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

export const VICTORY = {
  /** Culture: this much culture in total, then build the World Council. */
  cultureGoal: 4000,
  /** Economic: this much gold in the treasury (when starting and finishing), then build the Global Exchange. */
  goldGoal: 5500,
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
};

export type ProjectId = 'spaceship';

/** Things a city builds that aren't units, buildings, or wonders. */
export interface ProjectDef {
  id: ProjectId;
  name: string;
  cost: number;
  requires: TechId;
  summary: string;
}

export const PROJECTS: Record<ProjectId, ProjectDef> = {
  spaceship: {
    id: 'spaceship',
    name: 'Spaceship part',
    cost: VICTORY.spaceship.partCost,
    requires: VICTORY.spaceship.requires,
    summary: `One of ${VICTORY.spaceship.parts} parts. Capital only. Launch it when all are built`,
  },
};
