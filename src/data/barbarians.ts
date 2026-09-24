// Barbarians, their villages, ancient artifacts, and exploration huts (Round 9, Milestone 7,
// built to Dan's spec of 2026-09-24). Every number is a placeholder until the balance pass.
//
// - The barbarians are a special player, always at war with everyone. They can't win, aren't
//   in diplomacy, and don't count for domination or elimination.
// - Villages are placed at the start, away from civ starts, and never come back (Q15). Each
//   holds a fortified defender and gains a flag every few turns; at 4 flags it sends a unit
//   out. No spawns early in the game, and none once the world reaches a late era.
// - Barbarian units stay near their village, attack when the odds are decent, and sometimes
//   head for a civ unit or an unguarded city. They never capture a city: they raid it (Q13).
// - Taking a village: destroy it for a reward, or settle it as a size-1 city. Either way
//   there's a chance of an ancient artifact (free techs). Huts give their own small rewards,
//   never artifacts.

import type { CivDef } from './civs';
import type { EraId } from './techs';
import type { UnitTypeId } from './units';

/** The barbarians' "civ": used for their name, color, and messages. Never offered in a new game. */
export const BARBARIAN_CIV: CivDef = {
  id: 'barbarians',
  name: 'Barbarians',
  article: 'the',
  plural: true,
  adjective: 'Barbarian',
  leader: 'none',
  color: '#262626',
  aggression: 5,
  tradeWillingness: 1,
  cityNames: [],
};

export const BARBARIANS = {
  // ---- villages at the start ----
  /** One village per this many land tiles (a 32×24 map has about 350). */
  landTilesPerVillage: 50,
  minVillages: 3,
  maxVillages: 8,
  /** Kept at least this far (Chebyshev) from every civ start. */
  minDistanceFromStart: 6,
  /** ...and from each other. */
  minDistanceBetween: 5,
  /** A village's defense bonus (percent) for the unit holding it, on top of fortified and terrain. */
  villageDefensePct: 50,
  /** The defender a village starts with. */
  garrison: 'warrior' as UnitTypeId,

  // ---- flags and spawning ----
  /** A village gains a flag every this many turns... */
  turnsPerFlag: 3,
  /** ...and at this many it sends a unit out and starts again. */
  flagsToSpawn: 4,
  /** No flags (so no spawns) before this turn. */
  graceTurns: 10,
  /** No flags once the world (the median civ) reaches this era. */
  stopEra: 'industrial' as EraId,
  /** A village keeps at most this many units out; at the cap its flags wait at 4. */
  maxUnitsOut: 2,
  /** What a village sends out, by the world's era (the median civ's). Picked at random. */
  spawnUnits: {
    ancient: ['warrior', 'warrior', 'archer'],
    medieval: ['archer', 'horseman', 'legion'],
    industrial: ['legion'],
    modern: ['legion'],
  } as Record<EraId, UnitTypeId[]>,

  // ---- behavior ----
  /** Barbarian units stay within this many tiles of their village. */
  homeRadius: 4,
  /** They attack an adjacent civ unit when their odds are at least this (percent). */
  attackMinChancePct: 45,
  /** Each turn, the chance (percent) a unit heads for a civ unit or unguarded city in reach. */
  seekChancePct: 35,
  /** How far (from the unit) it looks for something to go after. */
  seekDistance: 4,

  // ---- raids (they never capture) ----
  /** A raid steals this share of the city owner's gold (within the bounds) and 1 population. */
  raidGoldPct: 25,
  raidGoldMin: 5,
  raidGoldMax: 60,
  raidPopulation: 1,
  /** A city can't be raided again for this many turns. */
  raidCooldownTurns: 6,
};

// ---- taking a village (Dan's rule) ----------------------------------------------------------

export type VillageRewardKind = 'gold30' | 'gold40' | 'gold50' | 'horseman' | 'settler' | 'galley' | 'tech';

/**
 * Destroying a village gives one of these, picked by weight. A Galley needs a coastal village
 * and Map Making; otherwise it's re-rolled. A free tech needs something left to learn.
 */
export const VILLAGE_REWARDS: { kind: VillageRewardKind; weight: number }[] = [
  { kind: 'gold30', weight: 22 },
  { kind: 'gold40', weight: 18 },
  { kind: 'gold50', weight: 14 },
  { kind: 'horseman', weight: 12 },
  { kind: 'settler', weight: 10 },
  { kind: 'galley', weight: 10 },
  { kind: 'tech', weight: 8 },
];

export const ARTIFACTS = {
  /** Chance (percent) of an artifact when a village is taken, whichever the choice. */
  chancePct: 20,
  /** How many free techs an artifact gives: usually 1, rarely a leap of 2–3. */
  techCounts: [
    { techs: 1, weight: 80 },
    { techs: 2, weight: 14 },
    { techs: 3, weight: 6 },
  ],
  /** Our own names. */
  names: [
    'Ancient Tablets',
    'Lost Library Scrolls',
    'Forgotten Star Chart',
    'Bronze Astrolabe',
    'Sealed Clay Jars',
    'Carved Calendar Stone',
    'Painted Cave Map',
    'Obsidian Mirror',
    'Gilded Codex',
    'Buried Builder’s Plans',
  ],
};

// ---- exploration huts ----------------------------------------------------------------------

export type HutResultKind = 'gold' | 'map' | 'unit' | 'tech' | 'barbarians';

export const HUTS = {
  /** One hut per this many land tiles, at the start. */
  landTilesPerHut: 35,
  minHuts: 4,
  maxHuts: 12,
  /** Not on a civ start's own tile or right next to it, nor next to a village. */
  minDistanceFromStart: 2,
  minDistanceFromVillage: 2,
  /** Results, by weight. Barbarians are re-rolled before `barbariansFromTurn`. */
  results: [
    { kind: 'gold' as HutResultKind, weight: 40 },
    { kind: 'map' as HutResultKind, weight: 20 },
    { kind: 'unit' as HutResultKind, weight: 18 },
    { kind: 'tech' as HutResultKind, weight: 8 },
    { kind: 'barbarians' as HutResultKind, weight: 8 },
  ],
  goldMin: 25,
  goldMax: 50,
  /** Map knowledge: everything within this radius of the hut is explored. */
  mapRadius: 5,
  /** A free unit: one of these, at random. */
  units: ['warrior', 'horseman'] as UnitTypeId[],
  barbariansFromTurn: 20,
  /** How many barbarians appear (next to the hut, never on a city). */
  barbarianCount: 2,
  barbarianUnit: 'warrior' as UnitTypeId,
};
