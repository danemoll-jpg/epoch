// Leader bonuses (Round 11, Milestone 8): Dan's design, in our own words. Each of the 12 civs
// has a starting bonus, one bonus per era (it switches on when the civ enters that era; the
// Ancient one from turn 1), sometimes a unique action or project, and a few have a drawback.
// Every bonus is a list of small typed effects; src/game/leaders.ts is the one place that
// decides which are active, and the rules ask it by effect kind. Numbers are placeholders
// until balance; change the numbers, not the ideas.
//
// Dan's notes mention systems the game doesn't have; they're translated as agreed in TODO.md:
// Prestige → culture; stability/happiness → a gold or culture cost, or left out; trade
// partners → civs you've met, peace, and tech trades; nuclear deterrence → AI war reluctance.

import type { BuildingId } from './buildings';
import type { EraId } from './techs';
import type { ResourceId } from './resources';
import type { TerrainId } from './terrain';

/** What a cost change applies to. */
export type CostScope =
  | 'wonders'
  | 'buildings'
  /** Land units that fight (not Settlers). */
  | 'landUnits'
  /** Every unit that fights: land, sea, and air (not Settlers). */
  | 'militaryUnits'
  | 'spaceship'
  | { buildings: BuildingId[] };

export type UniqueId = 'pilgrimage' | 'dissolution' | 'challenge' | 'returnCity' | 'versailles' | 'moonshot' | 'nationalChurch';

export type LeaderEffect =
  // ---- costs ----
  /** Production cost of what `of` covers, +/− pct. */
  | { kind: 'cost'; of: CostScope; pct: number }
  /** The first ship of each type costs this much less (Peter). */
  | { kind: 'firstShipCost'; pct: number }
  /** Rush-buying costs +/− pct; `of: 'cultureBuildings'` limits it to buildings that make culture. */
  | { kind: 'rushBuy'; pct: number; of?: 'cultureBuildings' }
  /** Wonders can be rush-bought, at `mult` times the normal price (Caligula). */
  | { kind: 'buyWonders'; mult: number }
  /** Ships built in a coastal city get +pct production. */
  | { kind: 'shipProduction'; pct: number }
  /** Spaceship parts cost less production, but `gold` each when finished (JFK). */
  | { kind: 'spaceshipGold'; gold: number }
  // ---- yields ----
  /** Empire-wide percent on gold, science, culture, or production. */
  | { kind: 'empirePct'; yield: 'gold' | 'science' | 'culture' | 'production'; pct: number }
  /** Extra food or trade on every worked tile of this terrain. */
  | { kind: 'terrainYield'; terrain: TerrainId; food?: number; trade?: number }
  /** +gold on every worked tile with a (visible) resource. */
  | { kind: 'resourceGold'; gold: number }
  /** These resources' bonuses count twice. */
  | { kind: 'resourceDouble'; resources: ResourceId[] }
  /** +culture on every worked tile with one of these resources. */
  | { kind: 'resourceCulture'; resources: ResourceId[]; culture: number }
  /** The capital gets +pct gold. */
  | { kind: 'capitalGold'; pct: number }
  /** Per wonder in the capital: +culture and +gold. */
  | { kind: 'capitalWonderYield'; culture: number; gold: number }
  /** Per wonder in any of your cities: +culture and +gold there. */
  | { kind: 'wonderCityYield'; culture: number; gold: number }
  /** Wonders make +pct culture. */
  | { kind: 'wonderCulture'; pct: number }
  /** These buildings make +culture each. */
  | { kind: 'buildingCulture'; buildings: BuildingId[]; culture: number }
  /** This building also gives +gold. */
  | { kind: 'buildingGold'; building: BuildingId; gold: number }
  /** +pct science in cities with this building. */
  | { kind: 'buildingSciencePct'; building: BuildingId; pct: number }
  /** Cities you took from another civ make +culture a turn. */
  | { kind: 'capturedCityCulture'; culture: number }
  /** With at least `cities` cities, +production in every one. */
  | { kind: 'manyCitiesProduction'; cities: number; production: number }
  /** +gold a turn per living civ you've met, up to `max`. */
  | { kind: 'goldPerMetCiv'; gold: number; max: number }
  /** +science a turn per met civ (only those who know more techs, with `onlyAhead`). */
  | { kind: 'sciencePerMetCiv'; science: number; onlyAhead?: boolean }
  /** +pct science while another civ you've met knows more techs. */
  | { kind: 'behindSciencePct'; pct: number }
  /** +pct science per met civ you're at peace with, up to `max`. */
  | { kind: 'peaceSciencePct'; pct: number; max: number }
  /** Great People need pct less culture. */
  | { kind: 'greatPeople'; pct: number }
  /** −pct gold for each captured city you hold beyond `free`. */
  | { kind: 'capturedGoldPenalty'; pct: number; free: number }
  /** −pct culture empire-wide while a rival holds your original capital. */
  | { kind: 'capitalLossCulture'; pct: number }
  // ---- roads (Round 12) ----
  /** Roads cost pct less gold per tile (Merkel). */
  | { kind: 'roadCost'; pct: number }
  /** +gold on every worked road or rail tile in your cities (Hatshepsut). */
  | { kind: 'roadGold'; gold: number }
  // ---- techs ----
  /** Techs a met civ already knows cost pct less. */
  | { kind: 'metTechCost'; pct: number }
  /** Techs that unlock a fighting unit cost pct less. */
  | { kind: 'militaryTechCost'; pct: number }
  /** A tech received in a trade also gives +science. */
  | { kind: 'tradeScience'; science: number }
  /** AIs' willingness to trade techs with you: +delta (1–5 scale), or × mult. */
  | { kind: 'tradeWillingness'; delta?: number; mult?: number }
  // ---- one-off payouts ----
  | { kind: 'meetGold'; gold: number }
  /** Entering an era before any other civ: +culture. */
  | { kind: 'eraFirstCulture'; culture: number }
  /** Every fight you win: +culture. */
  | { kind: 'winCulture'; culture: number }
  /** Losing a city, or a war ending: +culture. */
  | { kind: 'resilience'; culture: number }
  /** Capturing a city someone else founded: +culture and +gold, and it keeps its population. */
  | { kind: 'liberation'; culture: number; gold: number }
  // ---- combat ----
  /** Cities you capture lose no population and keep every building. */
  | { kind: 'captureKeep' }
  /** Mounted units start as veterans. */
  | { kind: 'veteranMounted' }
  /** Armies and fleets fight at +pct. */
  | { kind: 'armyStrength'; pct: number }
  /** +pct attack against civs with more cities than you. */
  | { kind: 'attackVsBigger'; pct: number }
  /** Units defending in your cities: +pct. */
  | { kind: 'cityDefense'; pct: number }
  /** Siege units and bombers attack at +pct. */
  | { kind: 'siegeAttack'; pct: number }
  // ---- diplomacy ----
  /** Gold gifts count `giftMult` times; peace proposals get +peace desire (Henry). */
  | { kind: 'royalMarriages'; giftMult: number; peaceBonus: number }
  /** Declaring war on a civ you have a peace treaty with: every civ that has met you, opinion +/−. */
  | { kind: 'breakTreaty'; opinion: number }
  /** AIs are less keen on war with you (−warScore) and on demanding tribute (× demandMult). */
  | { kind: 'deterrence'; warScore: number; demandMult: number }
  // ---- barbarians and cities ----
  /** Barbarian raids steal pct as much gold. */
  | { kind: 'raidLoss'; pct: number }
  /** Your cities never shrink from starvation. */
  | { kind: 'noStarvation' }
  // ---- unique actions and projects ----
  | { kind: 'unique'; id: UniqueId };

export interface Bonus {
  /** A short name (shown in bold), e.g. "Triumphs". */
  name: string;
  /** One line, our own wording. */
  text: string;
  effects: LeaderEffect[];
}

export interface LeaderBonuses {
  start: Bonus;
  /** A unique action or project is an era bonus's `unique` effect: available from that era on. */
  eras: Record<EraId, Bonus>;
  /** Always on, from turn 1. */
  drawback?: Bonus;
}

/** The numbers for the unique actions and projects (Round 11). */
export const UNIQUE_RULES = {
  pilgrimage: { minGold: 200, culturePerGold: 1.5, opinion: 3 },
  dissolution: { goldPerBuilding: 40, buildings: ['temple', 'cathedral'] as BuildingId[], turns: 20, culturePct: -50 },
  challenge: { sciencePct: 50 },
  returnCity: { culture: 150, opinion: 6 },
  moonshot: { culture: 200, sciencePct: 25 },
  /** Round 12: Henry VIII's national church needs a Temple somewhere in his empire. */
  nationalChurch: { needs: 'temple' as BuildingId },
};

const b = (name: string, text: string, ...effects: LeaderEffect[]): Bonus => ({ name, text, effects });

/** Luxury resources (Louis's Ancient bonus). */
export const LUXURIES: ResourceId[] = ['wine', 'silk', 'spices', 'gems', 'gold'];

export const LEADER_BONUSES: Record<string, LeaderBonuses> = {
  egypt: {
    start: b('Monument builders', 'Wonders cost 15% less.', { kind: 'cost', of: 'wonders', pct: -15 }),
    eras: {
      ancient: b('Envoys and caravans', 'Meeting a new civ brings 30 gold; +1 gold a turn per civ you know (up to +5); +1 gold on every worked road tile.', { kind: 'meetGold', gold: 30 }, { kind: 'goldPerMetCiv', gold: 1, max: 5 }, { kind: 'roadGold', gold: 1 }),
      medieval: b('Royal patronage', 'Each wonder in your cities also makes +3 culture and +2 gold a turn there.', { kind: 'wonderCityYield', culture: 3, gold: 2 }),
      industrial: b('River trade', 'Harbors and Marketplaces cost half as much.', { kind: 'cost', of: { buildings: ['harbor', 'marketplace'] }, pct: -50 }),
      modern: b('Treasury', '+25% gold in every city.', { kind: 'empirePct', yield: 'gold', pct: 25 }),
    },
    drawback: b('Small army', 'Land units cost 10% more.', { kind: 'cost', of: 'landUnits', pct: 10 }),
  },
  rome: {
    start: b('Imperial purse', 'Rush-buying costs 25% less.', { kind: 'rushBuy', pct: -25 }),
    eras: {
      // Round 15 (B2): Rome lost its early wars; cheaper troops from the start, and armies that hit harder in the Medieval era.
      ancient: b('Triumphs', 'Every fight you win brings 3 culture, and military units cost 15% less.', { kind: 'winCulture', culture: 3 }, { kind: 'cost', of: 'militaryUnits', pct: -15 }),
      medieval: b('Legions', 'Military units cost 20% less, and armies fight at +25%.', { kind: 'cost', of: 'militaryUnits', pct: -20 }, { kind: 'armyStrength', pct: 25 }),
      industrial: b('Bread and circuses', 'You alone can rush-buy wonders, at twice the usual price.', { kind: 'buyWonders', mult: 2 }),
      modern: b('Grand armies', 'Armies and fleets fight at +25%.', { kind: 'armyStrength', pct: 25 }),
    },
    drawback: b('Extravagance', '5% less gold.', { kind: 'empirePct', yield: 'gold', pct: -5 }),
  },
  franks: {
    start: b('Gentle conquest', 'Cities you capture lose no population and keep every building.', { kind: 'captureKeep' }),
    eras: {
      // Round 15: the Franks won 4 of 68; their knights now cost less too.
      ancient: b('Paladins', 'Mounted units start as veterans, and military units cost 10% less.', { kind: 'veteranMounted' }, { kind: 'cost', of: 'militaryUnits', pct: -10 }),
      medieval: b('Integration', 'Cities you captured make +2 culture a turn.', { kind: 'capturedCityCulture', culture: 2 }),
      industrial: b('Administration', 'With 8 or more cities, +1 production in every city.', { kind: 'manyCitiesProduction', cities: 8, production: 1 }),
      modern: b('Legacy of empire', 'Every fight you win brings 2 culture.', { kind: 'winCulture', culture: 2 }),
    },
  },
  mali: {
    start: b('Riches of the land', '+1 gold on every worked tile with a resource.', { kind: 'resourceGold', gold: 1 }),
    eras: {
      ancient: b('Desert caravans', 'Desert tiles +1 trade; Oasis and Gold resources count double.', { kind: 'terrainYield', terrain: 'desert', trade: 1 }, { kind: 'resourceDouble', resources: ['oasis', 'gold'] }),
      medieval: b('Pilgrimage', 'Culture buildings are a third cheaper to rush-buy. Once per game: the Pilgrimage.', { kind: 'rushBuy', pct: -33, of: 'cultureBuildings' }, { kind: 'unique', id: 'pilgrimage' }),
      industrial: b('Golden capital', 'Your capital makes +50% gold.', { kind: 'capitalGold', pct: 50 }),
      modern: b('Wealth of nations', '+25% gold in every city.', { kind: 'empirePct', yield: 'gold', pct: 25 }),
    },
  },
  england: {
    start: b('Court of talent', 'Great People arrive 20% sooner.', { kind: 'greatPeople', pct: -20 }),
    eras: {
      ancient: b('Church and crown', 'Temples and Cathedrals make +1 culture.', { kind: 'buildingCulture', buildings: ['temple', 'cathedral'], culture: 1 }),
      medieval: b('Dissolution', 'Once per game: sell off the monasteries (40 gold per Temple and Cathedral), but their culture is halved for 20 turns. Also once: found a national church in your capital (needs a Temple), even if others got there first.', { kind: 'unique', id: 'dissolution' }, { kind: 'unique', id: 'nationalChurch' }),
      industrial: b('Royal marriages', 'Gold gifts count double, and AIs accept your peace offers more readily.', { kind: 'royalMarriages', giftMult: 2, peaceBonus: 1.5 }),
      modern: b('Crown jewels', '+25% culture.', { kind: 'empirePct', yield: 'culture', pct: 25 }),
    },
    drawback: b('Six wives', 'Declaring war on a civ you have a peace treaty with makes every civ cooler toward you.', { kind: 'breakTreaty', opinion: -2 }),
  },
  france: {
    // Round 15: France won 22 of 71 games; Splendor was +50%.
    start: b('Splendor', 'Wonders make 25% more culture.', { kind: 'wonderCulture', pct: 25 }),
    eras: {
      ancient: b('Fine taste', 'Wine, Silk, Spices, Gems, and Gold give +1 culture when worked.', { kind: 'resourceCulture', resources: LUXURIES, culture: 1 }),
      medieval: b('The Sun King', 'Your capital makes +1 culture and +1 gold per wonder in it.', { kind: 'capitalWonderYield', culture: 1, gold: 1 }),
      industrial: b('Versailles', 'Build Versailles, a wonder only you can build, in your capital.', { kind: 'unique', id: 'versailles' }),
      modern: b('Haute culture', '+25% culture.', { kind: 'empirePct', yield: 'culture', pct: 25 }),
    },
    drawback: b('L’état, c’est moi', 'While a rival holds your capital, culture is halved.', { kind: 'capitalLossCulture', pct: -50 }),
  },
  russia: {
    // Round 15 (B2): Russia's catch-up was too small to matter.
    start: b('Grand embassy', 'Techs a civ you’ve met already knows cost 35% less.', { kind: 'metTechCost', pct: -35 }),
    eras: {
      ancient: b('Shipyards', 'Ships built in coastal cities get +25% production.', { kind: 'shipProduction', pct: 25 }),
      medieval: b('Window on the sea', 'The first ship of each type costs half as much.', { kind: 'firstShipCost', pct: -50 }),
      industrial: b('Western advisers', '+4 science a turn for each civ you’ve met.', { kind: 'sciencePerMetCiv', science: 4 }),
      modern: b('Modernization', '+35% science while a civ you’ve met knows more techs than you.', { kind: 'behindSciencePct', pct: 35 }),
    },
  },
  gran_colombia: {
    start: b('Liberation', 'Taking a city someone else founded brings 100 culture and 50 gold, and it keeps its population.', { kind: 'liberation', culture: 100, gold: 50 }),
    eras: {
      ancient: b('Underdog', 'Units attack at +25% against civs with more cities than you.', { kind: 'attackVsBigger', pct: 25 }),
      medieval: b('Return a liberated city', 'When you take a city, you may give it back to its founder: 150 culture, peace, and a friend.', { kind: 'unique', id: 'returnCity' }),
      industrial: b('Republics', 'Cities you captured make +2 culture a turn.', { kind: 'capturedCityCulture', culture: 2 }),
      modern: b('El Libertador', '+25% culture.', { kind: 'empirePct', yield: 'culture', pct: 25 }),
    },
    drawback: b('Hard to hold', '5% less gold for each captured city beyond 3.', { kind: 'capturedGoldPenalty', pct: -5, free: 3 }),
  },
  usa: {
    // Round 15: the United States won 24 of 65 games; Ingenuity was +10%.
    start: b('Ingenuity', '+5% science.', { kind: 'empirePct', yield: 'science', pct: 5 }),
    eras: {
      ancient: b('Public libraries', 'Libraries and Universities cost 25% less.', { kind: 'cost', of: { buildings: ['library', 'university'] }, pct: -25 }),
      medieval: b('Historic milestone', 'Entering an era before anyone else brings 50 culture.', { kind: 'eraFirstCulture', culture: 50 }),
      industrial: b('National Challenge', 'Name a tech as the national goal: +50% science toward it. A new one once it’s learned.', { kind: 'unique', id: 'challenge' }),
      // Round 15: spaceship parts were half price, and the United States won 2× its share.
      modern: b('Moonshot', 'Build the Moonshot (needs Rocketry): 200 culture and +25% science. Spaceship parts cost 25% less production, but 100 gold each.', { kind: 'unique', id: 'moonshot' }, { kind: 'cost', of: 'spaceship', pct: -25 }, { kind: 'spaceshipGold', gold: 100 }),
    },
  },
  ukraine: {
    start: b('Breadbasket', 'Plains give +1 food.', { kind: 'terrainYield', terrain: 'plains', food: 1 }),
    eras: {
      ancient: b('Open doors', 'A tech received in a trade also brings 20 science, and AIs trade with you more willingly.', { kind: 'tradeScience', science: 20 }, { kind: 'tradeWillingness', delta: 1 }),
      medieval: b('Catching up', '+2 science a turn for each civ you’ve met that knows more techs than you.', { kind: 'sciencePerMetCiv', science: 2, onlyAhead: true }),
      // Round 15: Ukraine was the strongest leader over the matrix (1.5× its share); was up to +20%.
      industrial: b('Partners', '+4% science for each civ you’ve met and are at peace with (up to +12%).', { kind: 'peaceSciencePct', pct: 4, max: 12 }),
      modern: b('Resilience', 'Losing a city, or a war ending, brings 50 culture.', { kind: 'resilience', culture: 50 }),
    },
  },
  germany: {
    start: b('Engineering', 'Buildings cost 10% less, and roads half the gold.', { kind: 'cost', of: 'buildings', pct: -10 }, { kind: 'roadCost', pct: -50 }),
    eras: {
      ancient: b('Hard to knock over', 'Units defending in your cities get +25%.', { kind: 'cityDefense', pct: 25 }),
      medieval: b('Order', 'Barbarian raids steal half as much, and your cities never shrink from starvation.', { kind: 'raidLoss', pct: -50 }, { kind: 'noStarvation' }),
      industrial: b('Exports', 'Factories give +2 gold, and +10% production everywhere.', { kind: 'buildingGold', building: 'factory', gold: 2 }, { kind: 'empirePct', yield: 'production', pct: 10 }),
      modern: b('Advanced energy', '+25% science in cities with a Factory.', { kind: 'buildingSciencePct', building: 'factory', pct: 25 }),
    },
  },
  north_korea: {
    start: b('Military first', 'Techs that unlock fighting units cost 25% less.', { kind: 'militaryTechCost', pct: -25 }),
    eras: {
      ancient: b('Fortress cities', 'Units defending in your cities get +25%.', { kind: 'cityDefense', pct: 25 }),
      medieval: b('Mass mobilization', 'Military units cost 15% less.', { kind: 'cost', of: 'militaryUnits', pct: -15 }),
      industrial: b('Missiles', 'Siege units and bombers attack at +25%.', { kind: 'siegeAttack', pct: 25 }),
      modern: b('Deterrence', 'AIs are much less likely to declare war on you or demand tribute.', { kind: 'deterrence', warScore: 10, demandMult: 0.25 }),
    },
    // Round 15: North Korea won 1 game in 54; a lighter drawback.
    drawback: b('Isolation', '5% less science and gold, and AIs are half as willing to trade techs with you.', { kind: 'empirePct', yield: 'science', pct: -5 }, { kind: 'empirePct', yield: 'gold', pct: -5 }, { kind: 'tradeWillingness', mult: 0.5 }),
  },
};
