// Religion (Round 12, Dan's own addition: Civ Rev 1 had none). Every number is here so tuning
// never touches logic; the rules are in src/game/religion.ts. Religions feed culture, gold, and
// diplomacy. There's no religious victory.
//
// Names and symbols are invented, never real-world religions: the AI names its religions from
// RELIGION_NAMES, and the human types a name or taps "Suggest" (which picks from the same
// list). Symbols are generic shapes: Dan's picks from docs/religion-road-icon-candidates.html
// (2026-09-25), drawn white on the religion's color; the letter stands in while an icon loads.
// The holy-city badge is MAP_ICONS.holyCity (icons.ts).

import type { TechId } from './techs';

/** The techs that let the first civ to know them found a religion, in tree order. */
export const FOUNDING_TECHS: TechId[] = ['mysticism', 'astronomy', 'philosophy', 'monotheism', 'theology'];

export interface ReligionSymbol {
  id: string;
  name: string;
  /** Drawn inside the dot while (or if) the icon can't be shown. */
  glyph: string;
  /** Its icon, src/assets/icons/<icon>.svg, credited in icons.ts. */
  icon: string;
  color: string;
}

/** One per religion, in founding order (a game has at most `maxReligions` + a national church). */
export const RELIGION_SYMBOLS: ReligionSymbol[] = [
  { id: 'sun', name: 'Sun disc', glyph: '☀', icon: 'sun', color: '#d9730d' },
  { id: 'flame', name: 'Flame', glyph: '♨', icon: 'flame', color: '#e5532d' },
  { id: 'star', name: 'Star', glyph: '★', icon: 'round-star', color: '#5b8def' },
  { id: 'eye', name: 'Eye', glyph: '◉', icon: 'semi-closed-eye', color: '#9b59b6' },
  { id: 'tree', name: 'Tree', glyph: '♣', icon: 'pine-tree', color: '#2ea44f' },
  { id: 'spiral', name: 'Spiral', glyph: '@', icon: 'vortex', color: '#17a2b8' },
  { id: 'mountain', name: 'Mountain', glyph: '▲', icon: 'peaks', color: '#8d6e63' },
  { id: 'wave', name: 'Wave', glyph: '≈', icon: 'big-wave', color: '#1f5fa8' },
];

/** Invented names for the AI's religions (and the human's "Suggest"). Never a real religion. */
export const RELIGION_NAMES: string[] = [
  'Faith of the Dawn',
  'The Ember Way',
  'Order of the Silver Star',
  'The Open Eye',
  'Keepers of the Great Tree',
  'The Turning Spiral',
  'Children of the Pale Moon',
  'The Tidewalkers',
  'The Quiet Flame',
  'Path of the Seven Winds',
  'The Golden Hearth',
  'Circle of the Morning Sun',
  'The Stone Chorus',
  'Brotherhood of the Lantern',
  'The River Covenant',
  'Watchers of the High Peak',
];

export const RELIGION = {
  /** Religions founded by being first to a founding tech (Henry VIII's national church is extra). */
  maxReligions: 5,
  /**
   * Religions one civ may found by being first to a founding tech. A civ that has its quota
   * leaves the tech to the next civ that knows it (Round 12 sim: at 5, the tech leader founded
   * every religion in every game). A national church (Henry VIII) counts too: after one, he
   * founds no other by tech.
   */
  maxPerCiv: 1,
  /** A typed name is trimmed and cut to this many characters. */
  maxNameLength: 32,

  // ---- passive spread, once a game turn (seeded) ----
  /** Cities of a religion push it on cities up to this many tiles away. */
  spreadRadius: 4,
  /**
   * Pressure a source city puts on a target: (spreadRadius + 1 − distance), + 1 per
   * `sizePerPoint` of the source's size, × `holyCityMult` from the holy city, + per building.
   */
  sizePerPoint: 3,
  holyCityMult: 2,
  templePressure: 1,
  cathedralPressure: 2,
  /** A source joined to the target by road (Round 12's roads; cities count as road). */
  roadPressure: 2,
  /** Chance (percent) a city with no religion converts = pressure × this, capped. */
  pctPerPressure: 1,
  maxChancePct: 15,
  /**
   * A city that already follows a religion switches only when another's pressure is at least
   * this many times its own religion's (its own city counts as `ownPressure`), and at this
   * share of the usual chance. Holy cities never switch.
   */
  switchPressureMult: 2,
  ownPressure: 4,
  switchChanceSharePct: 50,

  // ---- effects ----
  holyCity: { culture: 3, gold: 2, goldPerFollower: 1, maxFollowerGold: 8 },
  /** Culture a following city makes from its Temple / Cathedral. */
  followerCulture: { temple: 1, cathedral: 2 },
  /** Opinion between civs whose capitals follow the same religion, or different ones. */
  sharedFaithOpinion: 2,
  differentFaithOpinion: -1,
  /** The religion's founder, when a Missionary or Great Artist converts a city it doesn't own. */
  conversionReward: { gold: 20, culture: 10 },

  // ---- the Missionary ----
  missionaryCharges: 2,

  // ---- the AI ----
  ai: {
    /** Missionaries out at once. */
    maxMissionaries: 2,
    /** Only cities within this many tiles of the building city count as targets. */
    targetRadius: 10,
  },
};
