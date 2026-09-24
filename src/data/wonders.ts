// Wonders (Round 7, Milestone 6). Each is one per world: built in a city like a building,
// unlocked by a tech, and gone from everyone's build list once someone finishes it. A wonder
// stays with its city (a captured city's wonders go to the new owner). Names are common
// historical ones; the descriptions and effects are our own. Numbers are placeholders.
//
// Effects: `culture` and the `...Pct`/`food` ones work in the wonder's own city; `empire`
// effects work in every city its owner holds; `freeBuilding` is handed out once, to every
// city the builder holds when the wonder is finished. Two wonders win the game (`victory`):
// they can only be started once the civ has reached that victory's goal (victory.ts).

import type { BuildingEffects, BuildingId } from './buildings';
import type { TechId } from './techs';

export type WonderId =
  | 'pyramids' | 'hanging_gardens' | 'colossus' | 'oracle'
  | 'great_library' | 'great_wall' | 'war_academy' | 'grand_bazaar' | 'grand_cathedral'
  | 'royal_observatory' | 'grand_workshop'
  | 'broadcast_tower' | 'global_network'
  | 'world_council' | 'global_exchange';

export interface WonderEffects extends BuildingEffects {
  /** Extra food per turn in its city. */
  food?: number;
  /** Percent more production in its city. */
  productionPct?: number;
  /** Effects in every city the owner holds. */
  empire?: { sciencePct?: number; goldPct?: number; productionPct?: number; veteranUnits?: boolean };
  /** Given once, to every city the builder holds when the wonder is finished. */
  freeBuilding?: BuildingId;
}

export interface WonderDef {
  id: WonderId;
  name: string;
  cost: number;
  summary: string;
  /** Tech needed to build it. */
  requires: TechId;
  effects: WonderEffects;
  /** Finishing it wins the game (culture or economic victory; see victory.ts). */
  victory?: 'culture' | 'economic';
}

function wonder(
  id: WonderId, name: string, cost: number, requires: TechId, summary: string, effects: WonderEffects,
  victory?: 'culture' | 'economic',
): WonderDef {
  return { id, name, cost, requires, summary, effects, victory };
}

/** In display order: by era. */
export const WONDER_LIST: WonderDef[] = [
  // ---- Ancient ----
  wonder('pyramids', 'Pyramids', 90, 'masonry', '+25% production in this city · 2 culture', { productionPct: 25, culture: 2 }),
  wonder('hanging_gardens', 'Hanging Gardens', 90, 'pottery', '+2 food in this city · 2 culture', { food: 2, culture: 2 }),
  wonder('colossus', 'Colossus', 90, 'bronze_working', '+100% gold in this city · 2 culture', { goldPct: 100, culture: 2 }),
  wonder('oracle', 'Oracle', 100, 'mysticism', '5 culture', { culture: 5 }),
  // ---- Medieval ----
  wonder('great_library', 'Great Library', 150, 'literacy', '+100% science in this city · 3 culture', { sciencePct: 100, culture: 3 }),
  wonder('great_wall', 'Great Wall', 150, 'construction', 'Free Walls in every city you hold · 2 culture', { freeBuilding: 'walls', culture: 2 }),
  wonder('war_academy', 'War Academy', 150, 'feudalism', 'New units in all your cities start as veterans · 2 culture', {
    empire: { veteranUnits: true }, culture: 2,
  }),
  wonder('grand_bazaar', 'Grand Bazaar', 170, 'trade', '+25% gold in all your cities · 3 culture', { empire: { goldPct: 25 }, culture: 3 }),
  wonder('grand_cathedral', 'Grand Cathedral', 180, 'monotheism', '8 culture', { culture: 8 }),
  // ---- Industrial ----
  wonder('royal_observatory', 'Royal Observatory', 240, 'theory_of_gravity', '+25% science in all your cities · 3 culture', {
    empire: { sciencePct: 25 }, culture: 3,
  }),
  wonder('grand_workshop', 'Grand Workshop', 260, 'industrialization', '+25% production in all your cities · 3 culture', {
    empire: { productionPct: 25 }, culture: 3,
  }),
  // ---- Modern ----
  wonder('broadcast_tower', 'Broadcast Tower', 320, 'electronics', '12 culture', { culture: 12 }),
  wonder('global_network', 'Global Network', 360, 'computers', '+50% science in all your cities · 4 culture', {
    empire: { sciencePct: 50 }, culture: 4,
  }),
  // ---- Victory wonders (need the victory's goal first; see victory.ts) ----
  wonder('world_council', 'World Council', 300, 'philosophy', 'Wins the game by culture. Needs the culture goal first', { culture: 5 }, 'culture'),
  wonder('global_exchange', 'Global Exchange', 300, 'economics', 'Wins the game by wealth. Needs the gold goal first', { goldPct: 50 }, 'economic'),
];

export const WONDERS = Object.fromEntries(WONDER_LIST.map((w) => [w.id, w])) as Record<WonderId, WonderDef>;

export const WONDER_IDS = WONDER_LIST.map((w) => w.id);
