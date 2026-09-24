// Great People (Round 9, Milestone 7; Civ Rev spirit, our own rules). A civ earns one each
// time its culture total passes the next threshold (they rise). Each one can be settled in a
// city for a lasting bonus, or used once. Numbers are placeholders until the balance pass;
// the names are a generic list of historical figures of our own choosing.

export type GreatPersonKind = 'scientist' | 'artist' | 'merchant' | 'engineer' | 'general';

export const GREAT_PERSON_KINDS: GreatPersonKind[] = ['scientist', 'artist', 'merchant', 'engineer', 'general'];

export interface GreatPersonDef {
  kind: GreatPersonKind;
  name: string;
  /** Map/panel placeholder until Dan picks icons. */
  glyph: string;
  /** Settled in a city: what it does there, for the panel. */
  settleText: string;
  /** Used once: what it does, for the panel. */
  useText: string;
  names: string[];
}

export const GREAT_PEOPLE: Record<GreatPersonKind, GreatPersonDef> = {
  scientist: {
    kind: 'scientist', name: 'Great Scientist', glyph: 'GS',
    settleText: '+50% science in the city',
    useText: 'Learn a tech at once',
    names: ['Hypatia', 'Archimedes', 'Zhang Heng', 'Al-Khwarizmi', 'Ibn al-Haytham', 'Galileo Galilei', 'Isaac Newton', 'Marie Curie', 'Ada Lovelace', 'Srinivasa Ramanujan'],
  },
  artist: {
    kind: 'artist', name: 'Great Artist', glyph: 'GA',
    settleText: '+3 culture per turn in the city',
    useText: 'A burst of culture for your empire',
    names: ['Homer', 'Sappho', 'Li Bai', 'Murasaki Shikibu', 'Rumi', 'Michelangelo', 'William Shakespeare', 'Rembrandt', 'Ludwig van Beethoven', 'Frida Kahlo'],
  },
  merchant: {
    kind: 'merchant', name: 'Great Merchant', glyph: 'GM',
    settleText: '+50% gold in the city',
    useText: 'A big sum of gold',
    names: ['Croesus', 'Zheng He', 'Marco Polo', 'Ibn Battuta', 'Jakob Fugger', 'Cosimo de’ Medici', 'Adam Smith', 'Mayer Rothschild', 'Andrew Carnegie', 'Madam C. J. Walker'],
  },
  engineer: {
    kind: 'engineer', name: 'Great Engineer', glyph: 'GE',
    settleText: '+25% production in the city',
    useText: 'Finish the wonder or building a city is making',
    names: ['Imhotep', 'Hero of Alexandria', 'Li Chun', 'Filippo Brunelleschi', 'Mimar Sinan', 'James Watt', 'Isambard Kingdom Brunel', 'Gustave Eiffel', 'Nikola Tesla', 'Emily Roebling'],
  },
  general: {
    kind: 'general', name: 'Great General', glyph: 'GG',
    settleText: 'New units there are veterans; armies there fight 25% better',
    useText: 'Every unit on one tile becomes a veteran',
    names: ['Sun Tzu', 'Alexander', 'Hannibal', 'Julius Caesar', 'Khalid ibn al-Walid', 'Tomoe Gozen', 'Genghis Khan', 'Joan of Arc', 'Yi Sun-sin', 'Napoleon Bonaparte'],
  },
};

export const GREAT_PEOPLE_RULES = {
  /**
   * The n-th Great Person (n = 0, 1, 2…) arrives when culture earned since the civ's starting
   * point reaches first + step × n + growth × n × (n − 1) / 2.
   */
  first: 80,
  step: 120,
  growth: 80,
  // Settled bonuses (in the city it's settled in).
  scientistSciencePct: 50,
  artistCulture: 3,
  merchantGoldPct: 50,
  engineerProductionPct: 25,
  /** Armies attacking from, or defending in, a city with a settled General. */
  generalArmyPct: 25,
  // One-time effects.
  artistCultureBurst: 150,
  /** Gold: base + perEra × the owner's era index (Ancient 0). */
  merchantGoldBase: 150,
  merchantGoldPerEra: 75,
};
