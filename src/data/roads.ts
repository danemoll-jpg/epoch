// Roads and railroads (Round 12), Civ Rev style: bought with gold from a city, laid at once
// along the best land path to another city, with no worker units. Roads belong to no one:
// everyone moves on them, a captured area keeps them, and they can't be pillaged. The
// Railroad tech upgrades a civ's roads to rails for free (Q25). Rules: src/game/roads.ts.

export const ROADS = {
  /** Gold per tile that doesn't have a road yet (cities always count as road). */
  goldPerTile: 10,
  /** "Build road to…" lists cities within this many tiles (Chebyshev). */
  maxDistance: 12,
  /**
   * Moving from a road (or city) tile to another costs this much of a move, and a rail one
   * this much: a 1-move unit covers 3 road tiles, or 10 rail tiles, a turn.
   */
  roadMoveCost: 1 / 3,
  railMoveCost: 1 / 10,
  /** A worked road (or rail) tile: +trade. A worked rail tile also: +production. City centers aren't counted. */
  roadTrade: 1,
  railProduction: 1,
  /** The tech that turns roads into rails. */
  railTech: 'railroad' as const,

  // ---- the AI ----
  ai: {
    /** It links its own cities up to this far apart. */
    linkDistance: 8,
    /** Gold it keeps back (on top of its usual reserve) before buying a road. */
    reserve: 40,
    /** At war, it also lays a road toward its war target from its nearest city, up to this far. */
    warDistance: 10,
    /**
     * Round 15 (B4): from this turn on, linking its own cities comes before rush-buying: one
     * link a turn costing at most `priorityMaxCost`, with only the usual gold reserve kept back
     * (an AI saving for the economic win buys it too; roads add trade).
     */
    priorityFromTurn: 50,
    priorityMaxCost: 80,
  },
};
