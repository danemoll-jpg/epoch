// Icon credits. Every icon is from game-icons.net under CC BY 3.0, which requires crediting
// each author. A unit's `icon` (units.ts), a resource's (resources.ts), a Great Person's
// (greatPeople.ts), and the map features below (MAP_ICONS) each name a file in
// src/assets/icons/ (`<icon>.svg`) and an entry here; the About / Credits screen and
// CREDITS.md list them (`usedIcons`). Swapping an icon: drop the new SVG into
// src/assets/icons/, point the thing at it, and add its credit here (tests/icons.test.ts
// checks all three line up).

import { GREAT_PEOPLE, GREAT_PERSON_KINDS } from './greatPeople';
import { RESOURCES, RESOURCE_IDS } from './resources';
import { RELIGION_SYMBOLS } from './religion';
import { UNITS, UNIT_IDS } from './units';

export interface IconCredit {
  /** The icon's name on game-icons.net. */
  title: string;
  author: string;
  url: string;
  /** How we changed it, if we did (CC BY asks us to say so). */
  modified?: string;
}

export const ICON_LICENSE = { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' };
export const ICON_SITE = 'https://game-icons.net';

export const ICON_CREDITS: Record<string, IconCredit> = {
  'old-wagon': { title: 'Old wagon', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/old-wagon.html' },
  caveman: { title: 'Caveman', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/caveman.html' },
  bowman: { title: 'Bowman', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/bowman.html' },
  spartan: { title: 'Spartan', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/spartan.html' },
  'horse-head': { title: 'Horse head', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/horse-head.html' },
  chariot: { title: 'Chariot', author: 'Cathelineau', url: 'https://game-icons.net/1x1/cathelineau/chariot.html' },
  'centurion-helmet': { title: 'Centurion helmet', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/centurion-helmet.html' },
  catapult: { title: 'Catapult', author: 'HeavenlyDog', url: 'https://game-icons.net/1x1/heavenly-dog/catapult.html' },
  pikeman: { title: 'Pikeman', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/pikeman.html' },
  'mounted-knight': { title: 'Mounted knight', author: 'Skoll', url: 'https://game-icons.net/1x1/skoll/mounted-knight.html' },
  blunderbuss: { title: 'Blunderbuss', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/blunderbuss.html' },
  cannon: { title: 'Cannon', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/cannon.html' },
  'lee-enfield': { title: 'Lee Enfield', author: 'Skoll', url: 'https://game-icons.net/1x1/skoll/lee-enfield.html' },
  mortar: { title: 'Mortar', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/mortar.html' },
  tank: { title: 'Tank', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/tank.html' },
  // Ships (Dan's round 8 picks).
  'drakkar': { title: 'Drakkar', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/drakkar.html' },
  'caravel': { title: 'Caravel', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/caravel.html' },
  'shooner-sailboat': { title: 'Schooner sailboat', author: 'Pierre Leducq', url: 'https://game-icons.net/1x1/pierre-leducq/shooner-sailboat.html' },
  'paddle-steamer': { title: 'Paddle steamer', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/paddle-steamer.html' },
  'cargo-ship': { title: 'Cargo ship', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/cargo-ship.html' },
  'speed-boat': { title: 'Speed boat', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/speed-boat.html' },
  'battleship': { title: 'Battleship', author: 'Cathelineau', url: 'https://game-icons.net/1x1/cathelineau/battleship.html' },
  'submarine': { title: 'Submarine', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/submarine.html' },
  'carrier': { title: 'Carrier', author: 'Cathelineau', url: 'https://game-icons.net/1x1/cathelineau/carrier.html', modified: 'wave lines removed and cropped, so it reads differently from the Battleship' },
  // Aircraft (Dan's round 8 picks, wired in round 10).
  biplane: { title: 'Biplane', author: 'Quoting', url: 'https://game-icons.net/1x1/quoting/biplane.html' },
  'carpet-bombing': { title: 'Carpet bombing', author: 'Skoll', url: 'https://game-icons.net/1x1/skoll/carpet-bombing.html' },
  'jet-fighter': { title: 'Jet fighter', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/jet-fighter.html' },
  'stealth-bomber': { title: 'Stealth bomber', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/stealth-bomber.html' },
  helicopter: { title: 'Helicopter', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/helicopter.html' },
  // Map features, resources, Great People, and the artifact (Dan's round 9 picks, wired in round 10).
  'goblin-camp': { title: 'Goblin camp', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/goblin-camp.html' },
  hut: { title: 'Hut', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/hut.html' },
  'skull-crossed-bones': { title: 'Skull crossed bones', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/skull-crossed-bones.html' },
  wheat: { title: 'Wheat', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/wheat.html' },
  cow: { title: 'Cow', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/cow.html' },
  'stag-head': { title: 'Stag head', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/stag-head.html' },
  'circling-fish': { title: 'Circling fish', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/circling-fish.html' },
  'sperm-whale': { title: 'Sperm whale', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/sperm-whale.html' },
  oasis: { title: 'Oasis', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/oasis.html' },
  'chili-pepper': { title: 'Chili pepper', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/chili-pepper.html' },
  kimono: { title: 'Kimono', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/kimono.html' },
  'wine-bottle': { title: 'Wine bottle', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/wine-bottle.html' },
  'gold-bar': { title: 'Gold bar', author: 'Willdabeast', url: 'https://game-icons.net/1x1/willdabeast/gold-bar.html' },
  'cut-diamond': { title: 'Cut diamond', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/cut-diamond.html' },
  anvil: { title: 'Anvil', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/anvil.html' },
  'soda-can': { title: 'Soda can', author: 'Guard13007', url: 'https://game-icons.net/1x1/guard13007/soda-can.html' },
  'car-wheel': { title: 'Car wheel', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/car-wheel.html' },
  'oil-drum': { title: 'Oil drum', author: 'Skoll', url: 'https://game-icons.net/1x1/skoll/oil-drum.html' },
  microscope: { title: 'Microscope', author: 'Lord Berandas', url: 'https://game-icons.net/1x1/lord-berandas/microscope.html' },
  palette: { title: 'Palette', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/palette.html' },
  'two-coins': { title: 'Two coins', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/two-coins.html' },
  gears: { title: 'Gears', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/gears.html' },
  'laurel-crown': { title: 'Laurel crown', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/laurel-crown.html' },
  amphora: { title: 'Amphora', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/amphora.html' },
  // Round 12 (Dan's picks, 2026-09-25): the Missionary, the 8 religion symbols, the holy city.
  robe: { title: 'Robe', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/robe.html' },
  sun: { title: 'Sun', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/sun.html' },
  flame: { title: 'Flame', author: 'Carl Olsen', url: 'https://game-icons.net/1x1/carl-olsen/flame.html' },
  'round-star': { title: 'Round star', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/round-star.html' },
  'semi-closed-eye': { title: 'Semi closed eye', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/semi-closed-eye.html' },
  'pine-tree': { title: 'Pine tree', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/pine-tree.html' },
  vortex: { title: 'Vortex', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/vortex.html' },
  peaks: { title: 'Peaks', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/peaks.html' },
  'big-wave': { title: 'Big wave', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/big-wave.html' },
  'expanded-rays': { title: 'Expanded rays', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/expanded-rays.html' },
};

/** Icons for things that aren't units, resources, or Great People (Dan's round 9 picks). */
export const MAP_ICONS = {
  village: 'goblin-camp',
  hut: 'hut',
  /** The small badge on every barbarian unit. */
  barbarian: 'skull-crossed-bones',
  /** Shown in the "Ancient artifact!" panel. */
  artifact: 'amphora',
  /** Round 12: the badge on a religion's holy city (gold on dark). */
  holyCity: 'expanded-rays',
} as const;

const MAP_ICON_NAMES: Record<keyof typeof MAP_ICONS, string> = {
  village: 'Barbarian village',
  hut: 'Exploration hut',
  barbarian: 'Barbarian badge',
  artifact: 'Ancient artifact',
  holyCity: 'Holy city',
};

export type IconGroup = 'Units' | 'Map';

/** Every icon the game uses, with what it stands for, in the order the credits list them. */
export function usedIcons(): { group: IconGroup; name: string; icon: string; unit?: (typeof UNIT_IDS)[number] }[] {
  return [
    ...UNIT_IDS.filter((id) => UNITS[id].icon).map((id) => ({ group: 'Units' as const, name: UNITS[id].name, icon: UNITS[id].icon!, unit: id })),
    ...(Object.keys(MAP_ICONS) as (keyof typeof MAP_ICONS)[]).map((k) => ({ group: 'Map' as const, name: MAP_ICON_NAMES[k], icon: MAP_ICONS[k] })),
    ...RESOURCE_IDS.map((id) => ({ group: 'Map' as const, name: RESOURCES[id].name, icon: RESOURCES[id].icon })),
    ...GREAT_PERSON_KINDS.map((k) => ({ group: 'Map' as const, name: GREAT_PEOPLE[k].name, icon: GREAT_PEOPLE[k].icon })),
    ...RELIGION_SYMBOLS.map((r) => ({ group: 'Map' as const, name: `Religion: ${r.name}`, icon: r.icon })),
  ];
}
