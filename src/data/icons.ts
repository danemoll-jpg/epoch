// Unit icon credits. Every icon is from game-icons.net under CC BY 3.0, which requires
// crediting each author. A unit's `icon` (units.ts) names a file in src/assets/icons/
// (`<icon>.svg`) and an entry here; the About / Credits screen and CREDITS.md list these.
// Swapping an icon: drop the new SVG into src/assets/icons/, point the unit at it, and add
// its credit here (tests/icons.test.ts checks all three line up).

export interface IconCredit {
  /** The icon's name on game-icons.net. */
  title: string;
  author: string;
  url: string;
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
};
