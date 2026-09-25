// Civ and leader roster. Every leader lives in this one file (and their bonuses in
// leaders.ts) so the list can be reviewed and swapped in one place before any public release
// (see CLAUDE.md IP guardrails). City names are real historical places; the first name is the
// capital.
//
// Round 11 (Milestone 8): Dan's own 12 leaders. Babylon, Maurya, and the Inca stay here only so
// older saves still load (`legacy`: never offered at New Game, and no bonuses).

import type { TechId } from './techs';
import type { VictoryKind } from './victory';

export interface PortraitFocus {
  x: number;
  y: number;
  zoom: number;
}

export interface CivDef {
  id: string;
  /** Bare name, for labels and lists ("Franks"). */
  name: string;
  /**
   * Grammar for messages. `article: 'the'` for names that read with one ("the Franks
   * declared war on you!", "the United States"); `plural` picks "have"/"were" and the
   * possessive "the Franks'". Messages use civ names (with these) rather than leader names;
   * offers name the leader.
   */
  article?: 'the';
  plural?: boolean;
  adjective: string;
  leader: string;
  /** Placeholder owner color until the art pass. */
  color: string;
  /**
   * AI personality, each 1–5. Aggression pushes toward war, demands, and fighting on; trade
   * willingness toward tech deals and fair prices.
   */
  aggression: number;
  tradeWillingness: number;
  /** The victory the AI leans toward, and its fallback (Round 11). Absent for legacy civs. */
  lean?: { primary: VictoryKind; secondary: VictoryKind };
  /** Known from turn 1, without its prerequisites (Round 11). */
  startTech?: TechId;
  /** Kept only so old saves load: never offered at New Game, and no leader bonuses. */
  legacy?: boolean;
  /**
   * Round 11: where the face is in the portrait (x, y as fractions of its width and height) and
   * how far to zoom in on it at small sizes (48 px and under), so a portrait that shows a lot
   * of body still reads as a face in a tiny circle. See docs/portraits.html.
   */
  portraitFocus?: PortraitFocus;
  cityNames: string[];
}

export const CIVS: CivDef[] = [
  // ---- Dan's 12 (Round 11) ----
  {
    id: 'egypt', name: 'Egypt', adjective: 'Egyptian', leader: 'Hatshepsut', color: '#e8c547',
    aggression: 2, tradeWillingness: 4, lean: { primary: 'economic', secondary: 'culture' }, startTech: 'masonry',
    portraitFocus: { x: 0.52, y: 0.36, zoom: 1.8 },
    cityNames: ['Thebes', 'Memphis', 'Heliopolis', 'Alexandria', 'Abydos', 'Elephantine', 'Giza', 'Edfu', 'Hermopolis', 'Avaris', 'Bubastis', 'Sais', 'Tanis', 'Dendera'],
  },
  {
    id: 'rome', name: 'Rome', adjective: 'Roman', leader: 'Caligula', color: '#9acd32',
    aggression: 5, tradeWillingness: 2, lean: { primary: 'domination', secondary: 'culture' }, startTech: 'bronze_working',
    portraitFocus: { x: 0.57, y: 0.29, zoom: 1.9 },
    cityNames: ['Rome', 'Antium', 'Capua', 'Ravenna', 'Neapolis', 'Ostia', 'Pompeii', 'Verona', 'Mediolanum', 'Brundisium', 'Aquileia', 'Florentia', 'Tarentum'],
  },
  {
    id: 'franks', name: 'Franks', article: 'the', plural: true, adjective: 'Frankish', leader: 'Charlemagne', color: '#a060d0',
    aggression: 5, tradeWillingness: 2, lean: { primary: 'domination', secondary: 'culture' }, startTech: 'horseback_riding',
    portraitFocus: { x: 0.52, y: 0.37, zoom: 1.8 },
    cityNames: ['Aachen', 'Reims', 'Tours', 'Orléans', 'Metz', 'Soissons', 'Lyon', 'Rouen', 'Worms', 'Mainz', 'Trier', 'Paderborn', 'Verdun'],
  },
  {
    id: 'mali', name: 'Mali', adjective: 'Malian', leader: 'Mansa Musa', color: '#d04a4a',
    aggression: 2, tradeWillingness: 5, lean: { primary: 'economic', secondary: 'culture' }, startTech: 'currency',
    portraitFocus: { x: 0.5, y: 0.32, zoom: 1.8 },
    cityNames: ['Niani', 'Timbuktu', 'Djenné', 'Gao', 'Walata', 'Kangaba', 'Koumbi Saleh', 'Tadmekka', 'Kaba', 'Mema', 'Kukiya', 'Dia', 'Takedda'],
  },
  {
    id: 'england', name: 'England', adjective: 'English', leader: 'Henry VIII', color: '#2f5fb3',
    aggression: 3, tradeWillingness: 4, lean: { primary: 'culture', secondary: 'economic' }, startTech: 'ceremonial_burial',
    portraitFocus: { x: 0.52, y: 0.35, zoom: 1.8 },
    cityNames: ['London', 'York', 'Winchester', 'Canterbury', 'Oxford', 'Bristol', 'Norwich', 'Lincoln', 'Exeter', 'Durham', 'Nottingham', 'Coventry', 'Dover'],
  },
  {
    id: 'france', name: 'France', adjective: 'French', leader: 'Louis XIV', color: '#58c4e8',
    aggression: 2, tradeWillingness: 3, lean: { primary: 'culture', secondary: 'economic' }, startTech: 'mysticism',
    portraitFocus: { x: 0.52, y: 0.27, zoom: 2 },
    cityNames: ['Paris', 'Versailles', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes', 'Strasbourg', 'Lille', 'Nice', 'Rennes', 'Dijon', 'Grenoble', 'Avignon'],
  },
  {
    id: 'russia', name: 'Russia', adjective: 'Russian', leader: 'Peter the Great', color: '#1f8a4c',
    aggression: 4, tradeWillingness: 3, lean: { primary: 'technology', secondary: 'domination' }, startTech: 'map_making',
    portraitFocus: { x: 0.52, y: 0.23, zoom: 2 },
    cityNames: ['St. Petersburg', 'Moscow', 'Novgorod', 'Kazan', 'Arkhangelsk', 'Smolensk', 'Tver', 'Yaroslavl', 'Voronezh', 'Astrakhan', 'Tula', 'Pskov', 'Vladimir'],
  },
  {
    id: 'gran_colombia', name: 'Gran Colombia', adjective: 'Gran Colombian', leader: 'Simón Bolívar', color: '#e060b0',
    aggression: 4, tradeWillingness: 3, lean: { primary: 'culture', secondary: 'domination' }, startTech: 'code_of_laws',
    portraitFocus: { x: 0.48, y: 0.23, zoom: 2 },
    cityNames: ['Bogotá', 'Caracas', 'Quito', 'Cartagena', 'Medellín', 'Guayaquil', 'Maracaibo', 'Cali', 'Popayán', 'Valencia', 'Panamá', 'Cúcuta', 'Mérida'],
  },
  {
    id: 'usa', name: 'United States', article: 'the', adjective: 'American', leader: 'John F. Kennedy', color: '#3b3b8f',
    aggression: 3, tradeWillingness: 4, lean: { primary: 'technology', secondary: 'culture' }, startTech: 'writing',
    portraitFocus: { x: 0.46, y: 0.23, zoom: 2.2 },
    cityNames: ['Washington', 'New York', 'Boston', 'Philadelphia', 'Chicago', 'San Francisco', 'Los Angeles', 'Houston', 'New Orleans', 'Seattle', 'Atlanta', 'Denver', 'Detroit'],
  },
  {
    id: 'ukraine', name: 'Ukraine', adjective: 'Ukrainian', leader: 'Viktor Yushchenko', color: '#e07b39',
    aggression: 1, tradeWillingness: 5, lean: { primary: 'technology', secondary: 'culture' }, startTech: 'pottery',
    portraitFocus: { x: 0.45, y: 0.27, zoom: 2.2 },
    cityNames: ['Kyiv', 'Kharkiv', 'Lviv', 'Odesa', 'Dnipro', 'Zaporizhzhia', 'Poltava', 'Chernihiv', 'Vinnytsia', 'Chernivtsi', 'Mykolaiv', 'Uzhhorod', 'Sumy'],
  },
  {
    id: 'germany', name: 'Germany', adjective: 'German', leader: 'Angela Merkel', color: '#8a929a',
    aggression: 2, tradeWillingness: 4, lean: { primary: 'economic', secondary: 'technology' }, startTech: 'the_wheel',
    portraitFocus: { x: 0.48, y: 0.27, zoom: 2.2 },
    cityNames: ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Leipzig', 'Dresden', 'Stuttgart', 'Bremen', 'Hanover', 'Nuremberg', 'Düsseldorf', 'Bonn'],
  },
  {
    id: 'north_korea', name: 'North Korea', adjective: 'North Korean', leader: 'Kim Jong Un', color: '#8a5a2b',
    aggression: 5, tradeWillingness: 1, lean: { primary: 'domination', secondary: 'technology' }, startTech: 'archery',
    portraitFocus: { x: 0.47, y: 0.25, zoom: 2.2 },
    cityNames: ['Pyongyang', 'Hamhung', 'Chongjin', 'Wonsan', 'Sinuiju', 'Kaesong', 'Nampo', 'Kanggye', 'Haeju', 'Hyesan', 'Sariwon', 'Rason', 'Kimchaek'],
  },

  // ---- Legacy (old saves only) ----
  {
    id: 'babylon', name: 'Babylon', adjective: 'Babylonian', leader: 'Hammurabi', color: '#3f7fe0', aggression: 2, tradeWillingness: 4, legacy: true,
    cityNames: ['Babylon', 'Ur', 'Uruk', 'Nippur', 'Lagash', 'Eridu', 'Kish', 'Sippar', 'Larsa', 'Borsippa'],
  },
  {
    id: 'maurya', name: 'Maurya', adjective: 'Mauryan', leader: 'Ashoka', color: '#e0a030', aggression: 1, tradeWillingness: 4, legacy: true,
    cityNames: ['Pataliputra', 'Taxila', 'Ujjain', 'Tosali', 'Suvarnagiri', 'Vidisha', 'Mathura', 'Varanasi', 'Kaushambi', 'Sanchi'],
  },
  {
    id: 'inca', name: 'Inca', article: 'the', plural: true, adjective: 'Incan', leader: 'Pachacuti', color: '#40b070', aggression: 4, tradeWillingness: 2, legacy: true,
    cityNames: ['Cusco', 'Machu Picchu', 'Quito', 'Ollantaytambo', 'Vilcabamba', 'Tumebamba', 'Cajamarca', 'Huánuco Pampa', 'Pisac', 'Tambo Colorado'],
  },
];

/** The civs offered at New Game (Dan's 12), in roster order. */
export const PLAYABLE_CIVS: CivDef[] = CIVS.filter((c) => !c.legacy);

export function findCiv(id: string): CivDef | undefined {
  return CIVS.find((c) => c.id === id);
}

/** "HVIII", "JFK": the leader's initials, for the portrait placeholder. */
export function leaderInitials(civ: CivDef): string {
  const words = civ.leader.replace(/\./g, '').split(/\s+/).filter((w) => w !== 'the' && w !== 'of');
  const roman = words.find((w) => /^[IVX]+$/.test(w));
  const letters = words.filter((w) => !/^[IVX]+$/.test(w)).map((w) => w[0]!.toUpperCase());
  if (roman) return `${letters[0]}${roman}`;
  // One name (Hatshepsut, Caligula): its first two letters.
  if (letters.length === 1) return words[0]!.slice(0, 2);
  return letters.slice(0, 3).join('');
}
