// Difficulty levels (Round 13, M9 part 1): our own names; Normal is the balance the game has
// always had. Every number lives here. The human is always player 0; "the player" numbers
// apply to them, "the AIs" numbers to every other civ (never the barbarians). The all-AI sim
// plays player 0 as a stand-in AI that gets the player's numbers, so the report shows how the
// level tilts a game.
//
// How each part is applied:
// - production / science / gold percents: added to the civ's empire-wide percents
//   (src/game/leaders.ts `effectsOf`, as `empirePct` effects), exactly like a leader bonus;
// - aggression: added to an AI's aggression (1–5) when it weighs war or peace with the
//   player (src/game/diplomacy.ts), so it changes how the AIs treat you, not each other;
// - demandsFromTurn: no AI demands tribute from the player before this turn;
// - warGraceTurns: no AI declares war on the player before this turn;
// - extraAiUnits: every AI starts with these on top of the usual Settler and Warrior.

import { RULES } from './rules';
import type { UnitTypeId } from './units';

const GRACE = RULES.diplomacy.aiGraceTurns;

export type DifficultyId = 'novice' | 'normal' | 'veteran' | 'legendary';

export interface YieldPcts {
  production: number;
  science: number;
  gold: number;
}

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  /** Who it's for, in a few words (the setup screen). */
  forWhom: string;
  /** What changes, in one plain line (the setup screen and the Almanac). */
  summary: string;
  player: YieldPcts;
  ai: YieldPcts;
  aggression: number;
  demandsFromTurn: number;
  warGraceTurns: number;
  extraAiUnits: UnitTypeId[];
}

const NONE: YieldPcts = { production: 0, science: 0, gold: 0 };

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  novice: {
    id: 'novice',
    name: 'Novice',
    forWhom: 'First-timers',
    summary: 'You get +25% production and science; the AIs get −15%, are less warlike, and make no demands before turn 60.',
    player: { production: 25, science: 25, gold: 0 },
    ai: { production: -15, science: -15, gold: 0 },
    aggression: -1.5,
    demandsFromTurn: 60,
    warGraceTurns: 30,
    extraAiUnits: [],
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    forWhom: 'The usual game',
    summary: 'Everyone plays by the same numbers.',
    player: NONE,
    ai: NONE,
    aggression: 0,
    demandsFromTurn: GRACE,
    warGraceTurns: GRACE,
    extraAiUnits: [],
  },
  veteran: {
    id: 'veteran',
    name: 'Veteran',
    forWhom: 'A challenge',
    summary: 'The AIs get +15% production, science, and gold, and are a little more warlike.',
    player: NONE,
    ai: { production: 15, science: 15, gold: 15 },
    aggression: 0.5,
    demandsFromTurn: GRACE,
    warGraceTurns: GRACE,
    extraAiUnits: [],
  },
  legendary: {
    id: 'legendary',
    name: 'Legendary',
    forWhom: 'The brave',
    summary: 'The AIs get +30% production, science, and gold, a free Warrior and Settler, are more warlike, and may go to war with you sooner.',
    player: NONE,
    ai: { production: 30, science: 30, gold: 30 },
    aggression: 1,
    demandsFromTurn: 15,
    warGraceTurns: 12,
    extraAiUnits: ['warrior', 'settler'],
  },
};

export const DIFFICULTY_IDS: DifficultyId[] = ['novice', 'normal', 'veteran', 'legendary'];

export const DEFAULT_DIFFICULTY: DifficultyId = 'normal';
