// Icon credits. Every icon is from game-icons.net under CC BY 3.0, which requires crediting
// each author. A unit's `icon` (units.ts), a resource's (resources.ts), a Great Person's
// (greatPeople.ts), and the map features below (MAP_ICONS) each name a file in
// src/assets/icons/ (`<icon>.svg`) and an entry here; the About / Credits screen and
// CREDITS.md list them (`usedIcons`). Swapping an icon: drop the new SVG into
// src/assets/icons/, point the thing at it, and add its credit here (tests/icons.test.ts
// checks all three line up). Round 17: each technology's icon (TECH_ICONS).

import { BUILDINGS, BUILDING_IDS, type BuildingId } from './buildings';
import { GREAT_PEOPLE, GREAT_PERSON_KINDS } from './greatPeople';
import { WONDER_LIST, type WonderId } from './wonders';
import { RESOURCES, RESOURCE_IDS } from './resources';
import { RELIGION_SYMBOLS } from './religion';
import { TECH_LIST, type TechId } from './techs';
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
  // Buildings and wonders (Dan's round 14 picks, wired in the same day).
  'gear-hammer': { title: 'Gear hammer', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/gear-hammer.html' },
  'barn': { title: 'Barn', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/barn.html' },
  'barracks': { title: 'Barracks', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/barracks.html' },
  'defensive-wall': { title: 'Defensive wall', author: 'HeavenlyDog', url: 'https://game-icons.net/1x1/heavenly-dog/defensive-wall.html' },
  'bookshelf': { title: 'Bookshelf', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/bookshelf.html' },
  'shop': { title: 'Shop', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/shop.html' },
  'egyptian-temple': { title: 'Egyptian temple', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/egyptian-temple.html' },
  'anchor': { title: 'Anchor', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/anchor.html' },
  'airplane-departure': { title: 'Airplane departure', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/airplane-departure.html' },
  'gavel': { title: 'Gavel', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/gavel.html' },
  'church': { title: 'Church', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/church.html' },
  'arena': { title: 'Arena', author: 'Sbed', url: 'https://game-icons.net/1x1/sbed/arena.html' },
  'graduate-cap': { title: 'Graduate cap', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/graduate-cap.html' },
  'money-stack': { title: 'Money stack', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/money-stack.html' },
  'factory': { title: 'Factory', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/factory.html' },
  'power-lightning': { title: 'Power lightning', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/power-lightning.html' },
  'fizzing-flask': { title: 'Fizzing flask', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/fizzing-flask.html' },
  'chart': { title: 'Chart', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/chart.html' },
  'ancient-columns': { title: 'Ancient columns', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/ancient-columns.html' },
  'great-pyramid': { title: 'Great pyramid', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/great-pyramid.html' },
  'fruit-tree': { title: 'Fruit tree', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/fruit-tree.html' },
  'colombian-statue': { title: 'Colombian statue', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/colombian-statue.html' },
  'crystal-ball': { title: 'Crystal ball', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/crystal-ball.html' },
  'scroll-unfurled': { title: 'Scroll unfurled', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/scroll-unfurled.html' },
  'castle': { title: 'Castle', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/castle.html' },
  'sword-altar': { title: 'Sword altar', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/sword-altar.html' },
  'medieval-pavilion': { title: 'Medieval pavilion', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/medieval-pavilion.html' },
  'saint-basil-cathedral': { title: 'Saint basil cathedral', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/saint-basil-cathedral.html' },
  'observatory': { title: 'Observatory', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/observatory.html' },
  'radio-tower': { title: 'Radio tower', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/radio-tower.html' },
  'server-rack': { title: 'Server rack', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/server-rack.html' },
  'world': { title: 'World', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/world.html' },
  'pay-money': { title: 'Pay money', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/pay-money.html' },
  'crown': { title: 'Crown', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/crown.html' },
  // Technologies (Dan's Round 17 picks from docs/tech-icon-candidates.html).
  'rune-stone': { title: 'Rune stone', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/rune-stone.html' },
  'sword-mold': { title: 'Sword mold', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/sword-mold.html' },
  'tombstone': { title: 'Tombstone', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/tombstone.html' },
  'cloaked-figure-on-horseback': { title: 'Cloaked figure on horseback', author: 'Caro Asercion', url: 'https://game-icons.net/1x1/caro-asercion/cloaked-figure-on-horseback.html' },
  'trowel': { title: 'Trowel', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/trowel.html' },
  'covered-jar': { title: 'Covered jar', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/covered-jar.html' },
  'arrow-flights': { title: 'Arrow flights', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/arrow-flights.html' },
  'quill-ink': { title: 'Quill ink', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/quill-ink.html' },
  'scales': { title: 'Scales', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/scales.html' },
  'coins': { title: 'Coins', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/coins.html' },
  'flat-hammer': { title: 'Flat hammer', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/flat-hammer.html' },
  'stone-wheel': { title: 'Stone wheel', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/stone-wheel.html' },
  'abacus': { title: 'Abacus', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/abacus.html' },
  'third-eye': { title: 'Third eye', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/third-eye.html' },
  'treasure-map': { title: 'Treasure map', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/treasure-map.html' },
  'imperial-crown': { title: 'Imperial crown', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/imperial-crown.html' },
  'open-book': { title: 'Open book', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/open-book.html' },
  'crane': { title: 'Crane', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/crane.html' },
  'telescope': { title: 'Telescope', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/telescope.html' },
  'sailboat': { title: 'Sailboat', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/sailboat.html' },
  'compass': { title: 'Compass', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/compass.html' },
  'think': { title: 'Think', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/think.html' },
  'hill-fort': { title: 'Hill fort', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/hill-fort.html' },
  'arch-bridge': { title: 'Arch bridge', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/arch-bridge.html' },
  'trade': { title: 'Trade', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/trade.html' },
  'black-knight-helm': { title: 'Black knight helm', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/black-knight-helm.html' },
  'holy-symbol': { title: 'Holy symbol', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/holy-symbol.html' },
  'piggy-bank': { title: 'Piggy bank', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/piggy-bank.html' },
  'diploma': { title: 'Diploma', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/diploma.html' },
  'clockwork': { title: 'Clockwork', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/clockwork.html' },
  'magnet': { title: 'Magnet', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/magnet.html' },
  'prayer': { title: 'Prayer', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/prayer.html' },
  'musket': { title: 'Musket', author: 'Skoll', url: 'https://game-icons.net/1x1/skoll/musket.html' },
  'atom': { title: 'Atom', author: 'Skoll', url: 'https://game-icons.net/1x1/skoll/atom.html' },
  'shiny-apple': { title: 'Shiny apple', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/shiny-apple.html' },
  'cannon-ball': { title: 'Cannon ball', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/cannon-ball.html' },
  'vote': { title: 'Vote', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/vote.html' },
  'pie-chart': { title: 'Pie chart', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/pie-chart.html' },
  'erlenmeyer': { title: 'Erlenmeyer', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/erlenmeyer.html' },
  'steam': { title: 'Steam', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/steam.html' },
  'brodie-helmet': { title: 'Brodie helmet', author: 'Skoll', url: 'https://game-icons.net/1x1/skoll/brodie-helmet.html' },
  'steam-locomotive': { title: 'Steam locomotive', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/steam-locomotive.html' },
  'light-bulb': { title: 'Light bulb', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/light-bulb.html' },
  'chimney': { title: 'Chimney', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/chimney.html' },
  'briefcase': { title: 'Briefcase', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/briefcase.html' },
  'oil-rig': { title: 'Oil rig', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/oil-rig.html' },
  'circuitry': { title: 'Circuitry', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/circuitry.html' },
  'drill': { title: 'Drill', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/drill.html' },
  'bright-explosion': { title: 'Bright explosion', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/bright-explosion.html' },
  'race-car': { title: 'Race car', author: 'Skoll', url: 'https://game-icons.net/1x1/skoll/race-car.html' },
  'airplane': { title: 'Airplane', author: 'Skoll', url: 'https://game-icons.net/1x1/skoll/airplane.html' },
  'cargo-crate': { title: 'Cargo crate', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/cargo-crate.html' },
  'laptop': { title: 'Laptop', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/laptop.html' },
  'rocket': { title: 'Rocket', author: 'Lorc', url: 'https://game-icons.net/1x1/lorc/rocket.html' },
  'commercial-airplane': { title: 'Commercial airplane', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/commercial-airplane.html' },
  'space-shuttle': { title: 'Space shuttle', author: 'Delapouite', url: 'https://game-icons.net/1x1/delapouite/space-shuttle.html' },
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

/**
 * Round 14: each building's icon (Dan's picks from docs/building-icon-candidates.html), shown in
 * the city panel's build list and building list, and on the Almanac cards.
 */
export const BUILDING_ICONS: Record<BuildingId, string> = {
  granary: 'barn',
  barracks: 'barracks',
  walls: 'defensive-wall',
  library: 'bookshelf',
  marketplace: 'shop',
  temple: 'egyptian-temple',
  harbor: 'anchor',
  airport: 'airplane-departure',
  courthouse: 'gavel',
  cathedral: 'church',
  colosseum: 'arena',
  university: 'graduate-cap',
  bank: 'money-stack',
  factory: 'factory',
  power_plant: 'power-lightning',
  research_lab: 'fizzing-flask',
  stock_exchange: 'chart',
};

/** Round 14: each wonder's icon (Dan's picks); one without its own gets GENERIC_WONDER_ICON. */
export const WONDER_ICONS: Partial<Record<WonderId, string>> = {
  pyramids: 'great-pyramid',
  hanging_gardens: 'fruit-tree',
  colossus: 'colombian-statue',
  oracle: 'crystal-ball',
  great_library: 'scroll-unfurled',
  great_wall: 'castle',
  war_academy: 'sword-altar',
  grand_bazaar: 'medieval-pavilion',
  grand_cathedral: 'saint-basil-cathedral',
  royal_observatory: 'observatory',
  grand_workshop: 'gear-hammer',
  broadcast_tower: 'radio-tower',
  global_network: 'server-rack',
  world_council: 'world',
  global_exchange: 'pay-money',
  versailles: 'crown',
};

/**
 * Round 17: each technology's icon (Dan's picks from docs/tech-icon-candidates.html), shown on the
 * tech screen, the top bar's research button, tech news, the Almanac, the diplomacy screen's
 * trades, and the leader cards' starting tech.
 */
export const TECH_ICONS: Record<TechId, string> = {
  alphabet: 'rune-stone',
  bronze_working: 'sword-mold',
  ceremonial_burial: 'tombstone',
  horseback_riding: 'cloaked-figure-on-horseback',
  masonry: 'trowel',
  pottery: 'covered-jar',
  archery: 'arrow-flights',
  writing: 'quill-ink',
  code_of_laws: 'scales',
  currency: 'coins',
  iron_working: 'flat-hammer',
  the_wheel: 'stone-wheel',
  mathematics: 'abacus',
  mysticism: 'third-eye',
  map_making: 'treasure-map',
  monarchy: 'imperial-crown',
  literacy: 'open-book',
  construction: 'crane',
  astronomy: 'telescope',
  seafaring: 'sailboat',
  navigation: 'compass',
  philosophy: 'think',
  feudalism: 'hill-fort',
  engineering: 'arch-bridge',
  trade: 'trade',
  chivalry: 'black-knight-helm',
  monotheism: 'holy-symbol',
  banking: 'piggy-bank',
  university: 'diploma',
  invention: 'clockwork',
  magnetism: 'magnet',
  theology: 'prayer',
  gunpowder: 'musket',
  physics: 'atom',
  theory_of_gravity: 'shiny-apple',
  metallurgy: 'cannon-ball',
  democracy: 'vote',
  economics: 'pie-chart',
  chemistry: 'erlenmeyer',
  steam_engine: 'steam',
  conscription: 'brodie-helmet',
  railroad: 'steam-locomotive',
  electricity: 'light-bulb',
  industrialization: 'chimney',
  corporation: 'briefcase',
  refining: 'oil-rig',
  electronics: 'circuitry',
  machine_tools: 'drill',
  combustion: 'bright-explosion',
  automobile: 'race-car',
  flight: 'airplane',
  mass_production: 'cargo-crate',
  computers: 'laptop',
  rocketry: 'rocket',
  advanced_flight: 'commercial-airplane',
  space_flight: 'space-shuttle',
};

/** Round 14: the icon for a wonder with none of its own. */
export const GENERIC_WONDER_ICON = 'ancient-columns';

export function wonderIcon(id: WonderId): string {
  return WONDER_ICONS[id] ?? GENERIC_WONDER_ICON;
}

export type IconGroup = 'Units' | 'Map' | 'Buildings' | 'Techs';

/** Every icon the game uses, with what it stands for, in the order the credits list them. */
export function usedIcons(): { group: IconGroup; name: string; icon: string; unit?: (typeof UNIT_IDS)[number] }[] {
  return [
    ...UNIT_IDS.filter((id) => UNITS[id].icon).map((id) => ({ group: 'Units' as const, name: UNITS[id].name, icon: UNITS[id].icon!, unit: id })),
    ...(Object.keys(MAP_ICONS) as (keyof typeof MAP_ICONS)[]).map((k) => ({ group: 'Map' as const, name: MAP_ICON_NAMES[k], icon: MAP_ICONS[k] })),
    ...RESOURCE_IDS.map((id) => ({ group: 'Map' as const, name: RESOURCES[id].name, icon: RESOURCES[id].icon })),
    ...GREAT_PERSON_KINDS.map((k) => ({ group: 'Map' as const, name: GREAT_PEOPLE[k].name, icon: GREAT_PEOPLE[k].icon })),
    ...RELIGION_SYMBOLS.map((r) => ({ group: 'Map' as const, name: `Religion: ${r.name}`, icon: r.icon })),
    ...BUILDING_IDS.map((id) => ({ group: 'Buildings' as const, name: BUILDINGS[id].name, icon: BUILDING_ICONS[id] })),
    ...WONDER_LIST.map((w) => ({ group: 'Buildings' as const, name: w.name, icon: wonderIcon(w.id) })),
    { group: 'Buildings' as const, name: 'Any other wonder', icon: GENERIC_WONDER_ICON },
    ...TECH_LIST.map((t) => ({ group: 'Techs' as const, name: t.name, icon: TECH_ICONS[t.id] })),
  ];
}
