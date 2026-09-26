// Spies (Round 19, item 11). Every number the spy rules use (src/game/spies.ts). Our own words
// and numbers; placeholders until the balance pass.

import type { BuildingId } from './buildings';

export type SpyActionId = 'investigate' | 'steal' | 'sabotage' | 'incite';

export interface SpyActionDef {
  id: SpyActionId;
  name: string;
  /** One line for the button and the Almanac. */
  summary: string;
  /** The base chance to succeed, percent (investigate always succeeds). */
  basePct: number;
}

export const SPY_ACTIONS: Record<SpyActionId, SpyActionDef> = {
  investigate: { id: 'investigate', name: 'Investigate', summary: 'See the city’s buildings, what it’s building and how long, its defenders and yields, for a while. Always works.', basePct: 100 },
  steal: { id: 'steal', name: 'Steal a technology', summary: 'A chance to take a tech they know and you don’t.', basePct: 55 },
  sabotage: { id: 'sabotage', name: 'Sabotage production', summary: 'A chance to wipe out everything the city has put into what it’s building.', basePct: 60 },
  incite: { id: 'incite', name: 'Incite a revolt', summary: 'Pay gold for a chance that the city joins you. Never a capital.', basePct: 55 },
};

export const SPY_ACTION_IDS = Object.keys(SPY_ACTIONS) as SpyActionId[];

export const SPIES = {
  /** The building that guards a city against spies (and lets it see spies next to it). */
  defenseBuilding: 'courthouse' as BuildingId,
  /** Its effect on a spy's chance, and each defender's (land units in the city). */
  defensePct: -25,
  perDefenderPct: -6,
  /** A veteran spy's bonus. */
  veteranPct: 15,
  /** A spy at war with the city's owner is watched more closely. */
  atWarPct: -10,
  /** Chances never go below or above these. */
  minPct: 5,
  maxPct: 90,
  /** How long an investigation's report stays readable (turns). */
  investigateTurns: 10,
  /** Inciting: base gold + per size + per culture a turn, × (1 + closeness to its capital). */
  incite: {
    baseGold: 80,
    goldPerSize: 40,
    goldPerCulture: 12,
    /** Up to +100% for a city right next to its capital, fading to nothing at this distance. */
    capitalDistance: 12,
    /** A city in unrest (Part E's referendums) costs this share. */
    unrestPct: 50,
  },
  /** The victim's opinion of a spy's owner when the spy is caught. */
  caughtOpinion: -2,
  /** The AI: how many spies at once (from Medieval), and how far it sends them. */
  ai: {
    maxSpies: 1,
    maxSpiesLate: 2,
    lateFromTurn: 150,
    maxTargetDistance: 20,
    /** Spare gold it keeps after paying to incite. */
    inciteReserve: 150,
    /** Only cities this small are worth inciting. */
    inciteMaxSize: 4,
    /** It acts only when the chance is at least this (percent). */
    minChancePct: 45,
  },
};
