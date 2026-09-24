// Tech tree (Milestone 3). Four eras, 55 techs (Round 8 added four sea techs, Round 10 Advanced Flight), each with prerequisites, an era, and a
// cost tier (its depth in the tree). What a tech unlocks is declared on the thing it unlocks
// (`requires` on units, buildings, and wonders), so adding a unit never touches this file.
// Names are common historical terms; the descriptions are our own.
//
// Costs are placeholders toward a 2–3 hour game; tune in the balance pass.

export type EraId = 'ancient' | 'medieval' | 'industrial' | 'modern';

export interface EraDef {
  id: EraId;
  name: string;
}

/** In order. A player's era is the latest era among the techs they know. */
export const ERAS: EraDef[] = [
  { id: 'ancient', name: 'Ancient' },
  { id: 'medieval', name: 'Medieval' },
  { id: 'industrial', name: 'Industrial' },
  { id: 'modern', name: 'Modern' },
];

export type TechId =
  // Ancient
  | 'alphabet' | 'bronze_working' | 'ceremonial_burial' | 'horseback_riding' | 'masonry'
  | 'pottery' | 'archery' | 'writing' | 'code_of_laws' | 'currency' | 'iron_working'
  | 'the_wheel' | 'mathematics' | 'mysticism' | 'map_making'
  // Medieval
  | 'monarchy' | 'literacy' | 'philosophy' | 'construction' | 'feudalism' | 'chivalry'
  | 'engineering' | 'trade' | 'astronomy' | 'monotheism' | 'banking' | 'university'
  | 'invention' | 'seafaring' | 'navigation' | 'magnetism'
  // Industrial
  | 'gunpowder' | 'physics' | 'theory_of_gravity' | 'metallurgy' | 'democracy'
  | 'economics' | 'chemistry' | 'steam_engine' | 'railroad' | 'electricity' | 'conscription'
  | 'industrialization' | 'corporation'
  // Modern
  | 'refining' | 'electronics' | 'combustion' | 'machine_tools' | 'automobile' | 'flight'
  | 'mass_production' | 'computers' | 'rocketry' | 'space_flight' | 'advanced_flight';

export interface TechDef {
  id: TechId;
  name: string;
  era: EraId;
  /** Depth in the tree (1 = no prerequisites). Feeds the cost formula. */
  tier: number;
  prereqs: TechId[];
  /** One short line of our own. */
  description: string;
}

function tech(id: TechId, name: string, era: EraId, tier: number, prereqs: TechId[], description: string): TechDef {
  return { id, name, era, tier, prereqs, description };
}

/** In display order: by era, then roughly by tier. */
export const TECH_LIST: TechDef[] = [
  // ---- Ancient ----
  tech('alphabet', 'Alphabet', 'ancient', 1, [], 'Symbols for sounds, so words can be written down.'),
  tech('bronze_working', 'Bronze Working', 'ancient', 1, [], 'Copper and tin cast into tools and spear points.'),
  tech('ceremonial_burial', 'Ceremonial Burial', 'ancient', 1, [], 'Rites for the dead give a people shared beliefs.'),
  tech('horseback_riding', 'Horseback Riding', 'ancient', 1, [], 'Tamed horses carry riders farther and faster.'),
  tech('masonry', 'Masonry', 'ancient', 1, [], 'Cut stone stacked into walls that last.'),
  tech('pottery', 'Pottery', 'ancient', 1, [], 'Fired clay jars keep grain safe through lean seasons.'),
  tech('archery', 'Archery', 'ancient', 1, [], 'Bows strike from a distance.'),
  tech('writing', 'Writing', 'ancient', 2, ['alphabet'], 'Records outlive the people who made them.'),
  tech('code_of_laws', 'Code of Laws', 'ancient', 2, ['alphabet'], 'Rules written down apply to everyone alike.'),
  tech('currency', 'Currency', 'ancient', 2, ['bronze_working'], 'Coins make trade simple.'),
  tech('iron_working', 'Iron Working', 'ancient', 2, ['bronze_working'], 'Hotter forges turn ore into hard iron.'),
  tech('the_wheel', 'The Wheel', 'ancient', 2, ['horseback_riding'], 'Axles and wheels haul heavy loads.'),
  tech('mathematics', 'Mathematics', 'ancient', 2, ['alphabet', 'masonry'], 'Counting and measuring for builders and engineers.'),
  tech('mysticism', 'Mysticism', 'ancient', 2, ['ceremonial_burial', 'alphabet'], 'Stories of the heavens and the unseen.'),
  tech('map_making', 'Map Making', 'ancient', 2, ['alphabet'], 'Coastlines drawn on hide, so sailors can find their way home.'),

  // ---- Medieval ----
  tech('monarchy', 'Monarchy', 'medieval', 3, ['ceremonial_burial', 'code_of_laws'], 'One ruler, one crown, one realm.'),
  tech('literacy', 'Literacy', 'medieval', 3, ['writing', 'code_of_laws'], 'Reading spreads beyond a few scribes.'),
  tech('construction', 'Construction', 'medieval', 3, ['masonry', 'currency'], 'Large public works with mortar and planning.'),
  tech('astronomy', 'Astronomy', 'medieval', 3, ['mysticism', 'mathematics'], 'Charting the stars and the seasons.'),
  tech('seafaring', 'Seafaring', 'medieval', 3, ['pottery', 'map_making'], 'Sheltered harbors and fishing fleets feed coastal towns.'),
  tech('navigation', 'Navigation', 'medieval', 4, ['seafaring', 'astronomy'], 'Steering by the stars, far out of sight of land.'),
  tech('philosophy', 'Philosophy', 'medieval', 4, ['mysticism', 'literacy'], 'Asking why, and arguing about the answers.'),
  tech('feudalism', 'Feudalism', 'medieval', 4, ['monarchy', 'iron_working'], 'Land in exchange for loyalty and service.'),
  tech('engineering', 'Engineering', 'medieval', 4, ['the_wheel', 'construction'], 'Bridges, gears, and machines that multiply effort.'),
  tech('trade', 'Trade', 'medieval', 4, ['literacy', 'currency'], 'Caravans and contracts link distant cities.'),
  tech('chivalry', 'Chivalry', 'medieval', 5, ['feudalism', 'horseback_riding'], 'Armored riders sworn to a code.'),
  tech('monotheism', 'Monotheism', 'medieval', 5, ['philosophy', 'monarchy'], 'One faith that unites many peoples.'),
  tech('banking', 'Banking', 'medieval', 5, ['trade', 'monarchy'], 'Loans and ledgers put money to work.'),
  tech('university', 'University', 'medieval', 5, ['astronomy', 'philosophy'], 'Scholars gather to teach and to question.'),
  tech('invention', 'Invention', 'medieval', 5, ['engineering', 'literacy'], 'New devices from careful tinkering.'),
  tech('magnetism', 'Magnetism', 'medieval', 5, ['navigation', 'iron_working'], 'A needle that always points north, in any weather.'),

  // ---- Industrial ----
  tech('gunpowder', 'Gunpowder', 'industrial', 6, ['invention', 'iron_working'], 'A powder that burns fast enough to throw lead.'),
  tech('physics', 'Physics', 'industrial', 6, ['astronomy', 'university'], 'Motion and force, measured and predicted.'),
  tech('theory_of_gravity', 'Theory of Gravity', 'industrial', 7, ['astronomy', 'physics'], 'The same pull that drops an apple holds the planets.'),
  tech('metallurgy', 'Metallurgy', 'industrial', 7, ['gunpowder', 'university'], 'Stronger alloys cast to exact shapes.'),
  tech('democracy', 'Democracy', 'industrial', 6, ['banking', 'invention'], 'Citizens choose who governs them.'),
  tech('economics', 'Economics', 'industrial', 6, ['banking', 'university'], 'Markets studied as a system.'),
  tech('chemistry', 'Chemistry', 'industrial', 8, ['university', 'metallurgy'], 'What things are made of, and how they change.'),
  tech('steam_engine', 'Steam Engine', 'industrial', 7, ['physics', 'invention'], 'Boiling water turned into motion.'),
  tech('conscription', 'Conscription', 'industrial', 8, ['democracy', 'metallurgy'], 'Every citizen can be called to serve.'),
  tech('railroad', 'Railroad', 'industrial', 8, ['steam_engine', 'metallurgy'], 'Iron rails carry goods and people across the land.'),
  tech('electricity', 'Electricity', 'industrial', 8, ['metallurgy', 'theory_of_gravity'], 'Current through a wire, harnessed at last.'),
  tech('industrialization', 'Industrialization', 'industrial', 9, ['railroad', 'banking'], 'Factories and mass labor reshape cities.'),
  tech('corporation', 'Corporation', 'industrial', 10, ['economics', 'industrialization'], 'Companies that outlive their founders.'),

  // ---- Modern ----
  tech('refining', 'Refining', 'modern', 11, ['chemistry', 'corporation'], 'Crude oil split into useful fuels.'),
  tech('electronics', 'Electronics', 'modern', 9, ['electricity', 'engineering'], 'Circuits that switch and amplify signals.'),
  tech('machine_tools', 'Machine Tools', 'modern', 10, ['industrialization', 'conscription'], 'Precision machines that build other machines.'),
  tech('combustion', 'Combustion', 'modern', 12, ['refining', 'railroad'], 'Engines that burn fuel inside a cylinder.'),
  tech('automobile', 'Automobile', 'modern', 13, ['combustion', 'machine_tools'], 'Self-propelled vehicles on land.'),
  tech('flight', 'Flight', 'modern', 13, ['combustion', 'theory_of_gravity'], 'Heavier-than-air machines take to the sky.'),
  tech('mass_production', 'Mass Production', 'modern', 14, ['automobile', 'corporation'], 'Assembly lines turn out goods by the thousand.'),
  tech('computers', 'Computers', 'modern', 15, ['electronics', 'mass_production'], 'Machines that calculate faster than any person.'),
  tech('rocketry', 'Rocketry', 'modern', 14, ['flight', 'electronics'], 'Controlled explosions that climb past the clouds.'),
  tech('advanced_flight', 'Advanced Flight', 'modern', 14, ['flight', 'machine_tools'], 'Jet engines and spinning rotors: faster, higher, and able to hover.'),
  tech('space_flight', 'Space Flight', 'modern', 16, ['computers', 'rocketry'], 'Leaving the world behind. Opens the way to the stars.'),
];

export const TECHS = Object.fromEntries(TECH_LIST.map((t) => [t.id, t])) as Record<TechId, TechDef>;

export const TECH_IDS = TECH_LIST.map((t) => t.id);

/** The last tech in the tree. It will unlock the spaceship in Milestone 6. */
export const FINAL_TECH: TechId = 'space_flight';

/** Techs every player starts with. None, as decided (TODO Q5); leader bonuses may add some in M8. */
export const STARTING_TECHS: TechId[] = [];

/**
 * Science needed for a tech. Rises with how many techs the player already knows, plus a
 * little per tier so deep techs cost a bit more than early side branches bought late.
 * cost = base + perKnown*known + perKnownSq*known² + perTier*(tier-1), rounded.
 */
export const TECH_COST = { base: 14, perKnown: 8.5, perKnownSq: 0, perTier: 4 };

export function techCostFor(knownCount: number, tier: number): number {
  const c = TECH_COST;
  return Math.round(c.base + c.perKnown * knownCount + c.perKnownSq * knownCount * knownCount + c.perTier * (tier - 1));
}

/**
 * AI research: the first tech in this list that it can research, then (once the list is
 * used up or blocked) the available tech with the lowest tier, earliest in TECH_LIST.
 * Front-loaded with the techs behind the buildings it builds and a better defender.
 */
export const AI_TECH_PRIORITY: TechId[] = [
  'bronze_working', 'pottery', 'archery', 'alphabet', 'writing', 'iron_working', 'ceremonial_burial', 'currency', 'masonry',
  'code_of_laws', 'monarchy', 'feudalism', 'literacy', 'mathematics', 'mysticism', 'philosophy',
  'trade', 'banking', 'construction', 'engineering', 'invention', 'gunpowder',
];
