// Tunable rule constants. Placeholders until the balance pass (Milestone 6+); keep every
// number here so tuning never touches logic.

import type { Yields } from './terrain';
import type { UnitTypeId } from './units';
import type { TechId } from './techs';

export type CityFocus = 'balanced' | 'food' | 'production' | 'trade';

export const CITY_FOCUSES: CityFocus[] = ['balanced', 'food', 'production', 'trade'];

export const RULES = {
  mapWidth: 32,
  mapHeight: 24,
  /** Most civs in any game (Round 13: a Large map fits 1 human + 5 AI; Normal stops at 5). */
  maxPlayers: 6,
  /** Players in a new game when the URL doesn't say (the human + 4 AI rivals). */
  defaultPlayers: 5,
  startingUnits: ['settler', 'warrior'] as UnitTypeId[],
  /** No city may be founded within this many tiles (Chebyshev) of another city. */
  minCityDistance: 3,
  citySight: 2,
  /** Start positions must be at least this far apart (Chebyshev) when possible. */
  minStartDistance: 7,
  /** Oldest event-log entries are dropped past this many, so saves stay small. */
  maxLogEntries: 200,

  // ---- map shape (Round 8: several landmasses, so ships matter) ----
  map: {
    /** Share of tiles that are land. */
    landShare: 0.45,
    /**
     * The map is split into this many continents (a random number in the range): water
     * channels are cut along the lines halfway between continent centers.
     */
    continentsMin: 3,
    continentsMax: 4,
    /** Continent centers are at least this many tiles apart. */
    continentSpacing: 9,
    /** How wide (in tiles) the cut between two continents is, and how deep (elevation). */
    channelWidth: 2.5,
    channelDepth: 0.5,
    /** A civ never starts on a landmass smaller than this many (walkable) tiles. */
    minStartLandmass: 20,
  },

  // ---- cities (Milestone 2) ----
  /** Chebyshev radius of tiles a city can work. 1 = the 8 surrounding tiles. */
  cityWorkRadius: 1,
  /** Extra yield on the city's own center tile, on top of its terrain. */
  cityCenterBonus: { food: 1, production: 2, trade: 2 } as Yields,
  /** Citizens with no free tile to work still eat; they yield this instead. */
  specialistYields: { food: 0, production: 0, trade: 1 } as Yields,
  foodPerCitizen: 2,
  /** Food box size to grow from `size` to `size + 1`. */
  growthBase: 10,
  growthPerSize: 5,
  /** Share of the food box kept after growing (0–100). Granary raises it. */
  foodKeptAfterGrowthPct: 0,
  /** Tile-picking weights per focus: score = food*f + production*p + trade*t. */
  focusWeights: {
    balanced: { food: 2, production: 2, trade: 1 },
    food: { food: 6, production: 1, trade: 1 },
    production: { food: 1, production: 6, trade: 1 },
    trade: { food: 1, production: 1, trade: 6 },
  } as Record<CityFocus, Yields>,
  /**
   * While a city's picks so far don't feed its citizens, each point of food on a candidate
   * tile scores this much extra. It's large on purpose: food comes first until everyone is
   * fed, then the focus decides. So no focus starves a city while food is available.
   */
  starvationGuardWeight: 100,

  // ---- empire economy ----
  /** Percent of trade that becomes science; the rest is gold. Empire-wide, 10% steps. */
  defaultScienceRate: 60,
  scienceRateStep: 10,
  startingGold: 0,

  // ---- rush-buying ----
  /** Gold to finish an item = remaining * goldPerShield + remaining² / squareDivisor. */
  rushBuy: { goldPerShield: 2, squareDivisor: 20 },

  // ---- combat (Milestone 4) ----
  // Terrain defense bonuses are in terrain.ts and the Walls bonus is in buildings.ts.
  // Bonuses add up (e.g. hills +50% and fortified +50% = +100%, so strength × 2).
  combat: {
    fortifiedPct: 50,
    /** For either side. */
    veteranPct: 50,
    /** Any unit defending in a city. */
    cityDefensePct: 25,
    /** An army's attack and defense are its unit type's × this. */
    armyMultiplier: 3,
    /** Units of one type on one tile needed to form an army. */
    armySize: 3,
    /** Chance (percent) that the winner of a fight becomes a veteran. */
    veteranChancePct: 50,
    /** The AI attacks only when its win chance is at least this (percent). */
    aiAttackMinChancePct: 60,
  },

  // ---- diplomacy (Milestone 5) ----
  // Opinion is how one civ feels about another, from −10 to +10. Events move it (below) and
  // it drifts back toward 0. Attitude: friendly at friendlyAt or more, hostile at hostileAt
  // or less (and always hostile while at war), neutral in between.
  diplomacy: {
    /** After a peace treaty, neither side may declare war for this many turns. */
    minPeaceTurns: 15,
    /** The AI won't declare war on the human, or make demands, before this turn. */
    aiGraceTurns: 20,
    opinionMin: -10,
    opinionMax: 10,
    friendlyAt: 3,
    hostileAt: -3,
    /** Each turn at war, each side's opinion of the other changes by this. */
    warOpinionPerTurn: -0.5,
    /** Otherwise, opinion moves this much toward 0 per turn. */
    opinionDecayPerTurn: 0.25,
    /** The victim's opinion of a civ that declares war on it. */
    declaredOnOpinion: -6,
    /** Both sides, when a peace treaty is signed. */
    peaceOpinion: 2,
    /** Both sides, per completed tech trade. */
    tradeOpinion: 1,
    /** A gift of gold: +1 opinion per this much gold, up to giftOpinionMax per gift. */
    goldPerOpinion: 25,
    giftOpinionMax: 4,
    /** The demanding AI's opinion of you when you pay, or refuse, its demand. */
    demandPaidOpinion: 1,
    demandRefusedOpinion: -4,
    /** An AI's opinion of you when you turn down its peace offer. */
    peaceRefusedOpinion: -1,

    // AI war decisions: an AI considers war only on a met civ it's at peace with, at least
    // warMinStrengthRatio times as strong (military strength), with a city within
    // warMaxDistance tiles of one of its own, and only one war at a time. Score =
    // (ratio − warMinStrengthRatio) × warStrengthWeight + (aggression − 3) × warAggressionWeight
    // − opinion × warOpinionWeight; each turn it declares with chance score × warChancePctPerPoint
    // percent, capped at warMaxChancePct.
    warMinStrengthRatio: 1.3,
    warMaxDistance: 12,
    warStrengthWeight: 2,
    warAggressionWeight: 1,
    warOpinionWeight: 0.4,
    warChancePctPerPoint: 4,
    warMaxChancePct: 25,
    /** ...and only if its best attack (as an army) would beat their best fortified city defender this often. */
    warMinAttackChance: 0.55,

    // AI peace decisions: see peaceDesire in diplomacy.ts for the formula. Positive = wants
    // peace. Being weaker, losing more than it has taken, war weariness, and a good opinion
    // push toward peace; aggression pushes away.
    peaceStrengthWeight: 2,
    /** Being stronger never counts for more than this against peace. */
    peaceStrengthMax: 3,
    peaceScoreWeight: 0.5,
    peaceAggressionWeight: 1,
    /** Per turn of war (up to warWearinessMaxTurns): war weariness pushes toward peace. */
    warWearinessPerTurn: 0.15,
    warWearinessMaxTurns: 40,
    peaceOpinionWeight: 0.2,
    peaceBias: 1,
    /** An AI won't agree to peace in the first turns of a war unless it's clearly losing. */
    minWarTurnsBeforePeace: 5,
    /** How much an AI must want peace before it offers it to you itself. */
    peaceOfferMinDesire: 1,
    peaceOfferCooldownTurns: 10,
    /** A city lost counts this many units in "how the war is going". */
    cityLossWeight: 4,

    // AI demands of the human: rare and capped.
    demandCooldownTurns: 25,
    demandChancePct: 12,
    demandMinStrengthRatio: 1.5,
    /** Only civs this aggressive demand (or any civ that's hostile to you). */
    demandMinAggression: 3,
    demandGoldPct: 50,
    demandGoldMin: 20,
    demandGoldMax: 150,

    // Tech trading. A tech's value is what it would cost the receiver to research.
    /** An AI's asking price in gold is value × techGoldPerScience × its markup. */
    techGoldPerScience: 2,
    /** Markup by trade willingness 1–5 (index 0 = willingness 1). */
    techMarkup: [1.6, 1.4, 1.25, 1.1, 1.0],
    /** For a swap, the AI wants the tech it gets to be worth at least this share of what it gives. */
    swapMinValueRatio: [1.3, 1.15, 1.0, 0.85, 0.75],
    /** Each AI turn, the chance (percent, × willingness / 5) that an AI trades techs with another AI. */
    aiTradeChancePct: 15,
  },

  // ---- AI (Milestone 5) ----
  ai: {
    /** City target = land tiles ÷ living civs ÷ this, clamped to the range below. */
    landTilesPerCity: 10,
    minTargetCities: 3,
    maxTargetCities: 10,
    /** Settlers in the field or in production at once: with one city, and with more. */
    settlersAtOnceFirst: 1,
    settlersAtOnce: 2,
    /** Defenders kept home per city; one more in a city near an enemy while at war. */
    defendersPerCity: 2,
    borderDefendersAtWar: 3,
    /** "Near an enemy": an enemy city within this many tiles. */
    borderDistance: 6,
    /** Offensive units kept per city in peacetime, and at war (on top of defenders). */
    offensePerCityPeace: 0.5,
    offensePerCityWar: 1.5,
    /** Units (an army counts as 3) gathered at the staging city before marching. */
    minAttackForce: 3,
    /** Gold the AI keeps before rush-buying settlers and buildings. */
    goldReserve: 40,

    // ---- the sea (Round 8; see src/game/aiNaval.ts) ----
    naval: {
      /** An overseas city site must score at least this (siteScore; the AI's home sites use 20 too). */
      minSiteScore: 20,
      /** A site's value drops this much per tile the ship must sail. */
      sitePerStep: 1.5,
      /** Sea plans are dropped after this many turns (a stuck ship). */
      maxPlanTurns: 40,
      /** A ship with a Settler aboard waits this many turns for its escort before sailing alone. */
      escortWaitTurns: 2,
      /** An invasion sails when it carries RULES.ai.minAttackForce (an army counts 3), is full, or has waited this long. */
      invadeWaitTurns: 4,
      /** Warships kept for coastal defense once a met rival has ships (never more than its coastal cities). */
      warships: 2,
      /** A warship goes after an enemy ship this close to it. */
      huntDistance: 5,
    },

    // ---- the air (Round 10; see src/game/aiAir.ts) ----
    air: {
      /** From the Modern era: fighters kept per border or coastal city (never more than one per city). */
      fightersPerCity: 0.5,
      /** At war: bombers per city. */
      bombersPerCityWar: 0.5,
      /**
       * A strike goes only when (chance no fighter stops it) × (chance to win) is at least this
       * (percent): the same odds rule as land attacks.
       */
      strikeMinChancePct: 60,
    },

    // ---- victory (Milestone 6; see src/game/aiGoals.ts) ----
    victory: {
      /** Each goal scores its personality base + this × its progress (0–1). */
      progressWeight: 3,
      /** Technology's personality base for legacy civs (the others come from aggression and trade willingness). */
      techBase: 3.5,
      /** Round 11: a leader's primary lean, its secondary, and every other goal. */
      primaryBase: 8,
      secondaryBase: 5,
      otherBase: 2,
      /** An AI going for conquest adds this to its war score. */
      dominationWarBonus: 2,
      /** ...and keeps this many times more attackers in peacetime. */
      dominationOffenseFactor: 2,
      // Round 11 (D2): conquerors that actually conquer.
      /** A conqueror considers war once it's this much stronger (others: diplomacy.warMinStrengthRatio). */
      dominationMinStrengthRatio: 1.1,
      /** ...and this much more attack force per city at war. */
      dominationWarOffenseFactor: 3,
      /** Units (an army counts 3) it gathers before marching. */
      dominationAttackForce: 5,
      /** Its peace desire, less this while the war is going its way (or even). */
      dominationStayAtWar: 2,
      /** War weariness counts this share for a conqueror. */
      dominationWearinessShare: 0.5,
      /**
       * A rival this far (0–1) toward a culture or gold win is a runaway: a conqueror gets this
       * war-score bonus against it, and goes to war with it even at a smaller strength edge.
       */
      runawayProgress: 0.6,
      runawayWarBonus: 3,
      runawayMinStrengthRatio: 0.9,
      /** Wars it may fight at once against civs that still have cities (others: one). */
      dominationMaxWars: 3,
      /** At this strength ratio over its target, it marches without gathering first. */
      dominationRushRatio: 4,
      /** It attacks at these odds or better (percent; others: combat.aiAttackMinChancePct). */
      dominationAttackMinChancePct: 45,
      /** Picking a target city: one overseas (no city of ours on its landmass) counts as this many tiles farther. */
      overseasTargetPenalty: 8,
      /** Picking a target city: a rival's capital counts as this many tiles closer. */
      dominationCapitalPull: 20,
      /**
       * Pacing (like the grace period): before this turn, the last capital a conqueror needs
       * doesn't pull its war plan, and (Round 12) no AI takes the city that would win it the
       * game at once, so AI domination wins don't come too early.
       */
      dominationPaceTurn: 160,
      /** Techs a conqueror researches first (after any urgent ones). */
      dominationResearch: [
        'bronze_working', 'horseback_riding', 'iron_working', 'masonry', 'alphabet', 'mathematics', 'the_wheel', 'code_of_laws',
        'monarchy', 'feudalism', 'currency', 'writing', 'chivalry', 'construction', 'invention', 'gunpowder', 'metallurgy',
        'university', 'banking', 'democracy', 'conscription', 'physics', 'steam_engine', 'railroad', 'industrialization',
        'machine_tools', 'electricity', 'refining', 'combustion', 'automobile', 'theory_of_gravity', 'flight',
      ] as TechId[],
      /** An AI going for the economic win sets its science rate to this, to save gold. */
      economicScienceRate: 30,
      /** Gold piling up: past richGold + richGoldPerCity × cities, the science rate goes to richScienceRate... */
      richGold: 150,
      richGoldPerCity: 20,
      richScienceRate: 100,
      /** ...and back to the default once gold falls to this. */
      poorGold: 80,
      /** The first building each goal wants (then the usual order). */
      firstBuilding: { domination: 'barracks', culture: 'temple', economic: 'marketplace', technology: 'library' },
    },
  },
};

/** Food needed in the box for a city of this size to grow. */
export function growthThreshold(size: number): number {
  return RULES.growthBase + RULES.growthPerSize * size;
}

/** Gold to rush-buy an item with this much production still missing. */
export function rushBuyCost(remaining: number): number {
  if (remaining <= 0) return 0;
  const { goldPerShield, squareDivisor } = RULES.rushBuy;
  return Math.ceil(remaining * goldPerShield + (remaining * remaining) / squareDivisor);
}
