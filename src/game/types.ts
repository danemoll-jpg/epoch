// Game state: plain, serializable data only. No classes, functions, or DOM references —
// save/load must be JSON.stringify / JSON.parse.

import type { HutResultKind } from '../data/barbarians';
import type { BuildingId } from '../data/buildings';
import type { GreatPersonKind } from '../data/greatPeople';
import type { ResourceId } from '../data/resources';
import type { CityFocus } from '../data/rules';
import type { TechId } from '../data/techs';
import type { TerrainId } from '../data/terrain';
import type { UnitTypeId } from '../data/units';
import type { ProjectId, VictoryKind } from '../data/victory';
import type { WonderId } from '../data/wonders';

export interface Coord {
  x: number;
  y: number;
}

export interface Tile {
  terrain: TerrainId;
  /** A map resource (Round 9): extra yields. Hidden kinds count only once revealed. */
  resource?: ResourceId;
  /** A hidden resource here was revealed for everyone (a barbarian village on it was destroyed). */
  revealed?: boolean;
  /** An exploration hut (Round 9): the first unit to step here gets a random result. */
  hut?: boolean;
  /** A hut's result set in advance (the dev scenarios use it to show each one); normally random. */
  hutResult?: HutResultKind;
}

export interface GameMap {
  width: number;
  height: number;
  /** Row-major: index = y * width + x. */
  tiles: Tile[];
}

/** 'barbarian' (Round 9): the barbarian faction, always last in `players` when there is one. */
export type PlayerKind = 'human' | 'ai' | 'barbarian';

export interface Player {
  id: number;
  civId: string;
  kind: PlayerKind;
  /** Per-tile explored flags (1 = explored), row-major like map.tiles. */
  explored: number[];
  /** How many city names from the civ's list have been used. */
  citiesFounded: number;
  alive: boolean;
  gold: number;
  /**
   * The science pool: progress toward the current research, or banked science while
   * nothing is being researched. Learning a tech takes its cost out; the rest carries over.
   */
  science: number;
  /** Percent of trade that becomes science (0–100, 10% steps); the rest is gold. */
  scienceRate: number;
  /** Known techs, in the order they were learned. */
  techs: TechId[];
  /** The tech being researched, or null when the player needs to pick one. */
  researching: TechId | null;
  /** Culture earned so far, all game (Milestone 6). It never goes down. */
  culture: number;
  /** The spaceship (technology victory). */
  space: SpaceProgram;
  /** Great People earned so far (Round 9); the next one needs a higher culture total. */
  greatPeople: number;
  /** Culture that doesn't count toward Great People (what a v7 save already had). */
  greatPeopleCultureBase: number;
}

export interface SpaceProgram {
  /** Parts built (in the capital). Lost if the capital is captured. */
  parts: number;
  /** The turn it was launched, or null. */
  launchedTurn: number | null;
  /** It arrives, and wins, at the start of this turn; null until launched. */
  arrivesTurn: number | null;
}

export interface Unit {
  id: number;
  type: UnitTypeId;
  owner: number;
  x: number;
  y: number;
  movesLeft: number;
  /** Veterans get a combat bonus. Built in a city with Barracks, or promoted by winning a fight. */
  veteran: boolean;
  /** Dug in for a defense bonus; cleared when the unit moves or attacks. */
  fortified: boolean;
  /** Three units of one type merged into one (combat strength × RULES.combat.armyMultiplier). */
  army: boolean;
  /**
   * The ship this land unit is aboard (Round 8), or null. Cargo stands on its ship's tile and
   * moves with it; it dies if the ship is sunk.
   */
  carriedBy: number | null;
  /** A barbarian unit's village (Round 9): it stays near it. Absent for everyone else. */
  home?: number;
}

export type BuildItem =
  | { kind: 'unit'; id: UnitTypeId }
  | { kind: 'building'; id: BuildingId }
  | { kind: 'wonder'; id: WonderId }
  | { kind: 'project'; id: ProjectId };

export interface City {
  id: number;
  name: string;
  owner: number;
  x: number;
  y: number;
  foundedTurn: number;
  size: number;
  /** Food in the box toward the next size. */
  food: number;
  /** Production stored toward the current item (kept when there is none). */
  production: number;
  /** What the city is building, or null when it needs a choice. */
  build: BuildItem | null;
  focus: CityFocus;
  buildings: BuildingId[];
  /** Wonders built here (they go with the city if it's captured). */
  wonders: WonderId[];
  /**
   * The player whose original capital this is (their first city), or null. It stays set when
   * the city is captured, so "capture every capital" (domination, M6) can be checked.
   */
  capitalOf: number | null;
  /**
   * Tile indices worked by citizens (not including the center). Assigned automatically by
   * refreshWorkedTiles; stored so the UI and saves see exactly what the rules used.
   */
  worked: number[];
  /** Great People settled here for good (Round 9). */
  greatPeople: GreatPersonKind[];
  /** The turn barbarians last raided the city, if ever. */
  lastRaid?: number;
}

/**
 * Bumped whenever the state shape changes. Older saves are migrated forward when there's a
 * migration for them in save.ts; otherwise they aren't loaded.
 * 3 = Milestone 3 (techs, research). 4 = Milestone 4 (combat: war, fortify, armies, capitals).
 * 5 = Milestone 5 (diplomacy: contact, peace treaties, opinions, offers, AI war plans).
 * 6 = Milestone 6 (culture, wonders, spaceship, victory).
 * 7 = Round 8 (ships: cargo, and the AI's sea plans).
 * 8 = Round 9 (barbarians and villages, resources, huts, Great People).
 */
export const STATE_VERSION = 8;

export interface GameState {
  version: number;
  seed: number;
  /** Current seeded-RNG state; advances whenever game logic draws a random number. */
  rngState: number;
  turn: number;
  /** Index into players of whose turn it is. */
  currentPlayer: number;
  map: GameMap;
  players: Player[];
  units: Unit[];
  cities: City[];
  nextId: number;
  /** atWar[a][b]: are players a and b at war? Symmetric. Civs start at peace (Milestone 5). */
  atWar: boolean[][];
  /** Contact, treaties, opinions, and offers between civs (Milestone 5). */
  diplomacy: Diplomacy;
  /** Each AI's current war plan (indexed by player id), or null. Always null for humans. */
  aiPlans: (AiPlan | null)[];
  /** Each AI's current sea plan (indexed by player id): a ship ferrying settlers or troops overseas. */
  aiFerries: (AiFerry | null)[];
  /** Short human-readable event log (newest last); the UI shows recent entries. */
  log: LogEntry[];
  /** The first win (Milestone 6), or null. Kept after "Keep playing" so the record stays. */
  victory: Victory | null;
  /** The human chose "Keep playing" after the game was won: nobody else can win now. */
  keepPlaying: boolean;
  /** Near-win warnings already given (keys from victory.ts), so each is shown once. */
  warned: string[];
  /** Barbarian villages still standing (Round 9). */
  villages: Village[];
  /** Great People waiting for their owner to settle or use them (the human's; the AI uses its own at once). */
  greatPeople: GreatPerson[];
  /** Great People names already given out, so each is used once per game. */
  greatPeopleNames: string[];
}

/**
 * A barbarian village (Round 9). It gains a flag every few turns and sends a unit out at 4.
 * When a civ's unit takes it, `takenBy` is set until that civ chooses: destroy or settle.
 */
export interface Village {
  id: number;
  x: number;
  y: number;
  flags: number;
  /** Turns toward the next flag. */
  progress: number;
  /** The civ whose unit took it and must now choose, or null. */
  takenBy: number | null;
}

export interface GreatPerson {
  id: number;
  owner: number;
  kind: GreatPersonKind;
  name: string;
  turn: number;
}

export interface Victory {
  winner: number;
  kind: VictoryKind;
  turn: number;
}

/**
 * Tables are indexed [a][b] by player id. Symmetric ones say so; the others are one civ's
 * view of another.
 */
export interface Diplomacy {
  /** Have a and b met? Symmetric. Set the first time either sees the other's unit or city. */
  met: boolean[][];
  /** The turn a and b's current peace treaty was signed, or null. Symmetric. */
  peaceTurn: (number | null)[][];
  /** The turn a and b's current war began, or null (null while at war = before Milestone 5). */
  warStart: (number | null)[][];
  /** How a feels about b, RULES.diplomacy.opinionMin..opinionMax. Drifts back toward 0. */
  opinion: number[][];
  /** What a has lost to b in their current war: units (an army counts 3) and cities. */
  warLosses: number[][];
  /** The turn a last demanded tribute from b, or null. */
  lastDemand: (number | null)[][];
  /** The turn a last offered peace to b, or null. */
  lastPeaceOffer: (number | null)[][];
  /** Offers from AIs waiting for the human's answer (a demand or a peace offer). */
  offers: Offer[];
}

export type OfferKind = 'demand' | 'peace';

export interface Offer {
  id: number;
  from: number;
  to: number;
  kind: OfferKind;
  /** A demand asks for gold or for a tech. */
  gold?: number;
  tech?: TechId;
  turn: number;
}

/**
 * An AI's war plan: take `cityId` from `target`. Units gather at `stagingCityId` (one of its
 * own cities) until the force is big enough, then march.
 */
export interface AiPlan {
  target: number;
  cityId: number;
  stagingCityId: number | null;
  phase: 'gather' | 'march';
  since: number;
}

/**
 * An AI's sea plan (Round 8): load a ship at `portCityId`, sail it to `landing` (a water tile
 * next to `target`), and put the cargo ashore. 'settle' carries a Settler and an escort to
 * found a city at `target`; 'invade' carries an attack force to the enemy city at `target`.
 */
export interface AiFerry {
  kind: 'settle' | 'invade';
  portCityId: number;
  /** The ship doing it, once one is in port (null while one is being built). */
  shipId: number | null;
  target: Coord;
  /** The water tile the ship unloads from. */
  landing: Coord;
  phase: 'load' | 'sail';
  since: number;
  /** The turn the ship finished loading enough to leave (it waits a little for more). */
  loadedSince?: number;
  /** A settling trip's escort, once picked (so its city doesn't keep it home as a guard). */
  escortId?: number;
}

export interface LogEntry {
  turn: number;
  player: number;
  /** Another player involved (e.g. the defender in a fight): they always see the entry too. */
  other?: number;
  /** The text for `player` (and for everyone, unless the fields below say otherwise). */
  text: string;
  /** The text for `other`, when it should read differently (e.g. "... declared war on you!"). */
  otherText?: string;
  /**
   * Civ-level news (an era, a war, a treaty): shown to everyone who has met `player` or
   * `other`, with this text, wherever it happened. Entries without it are map-level news and
   * need the tile to be visible.
   */
  publicText?: string;
  /** What kind of event, so the UI can give some of them their own panel. */
  kind?:
    | 'contact' | 'war' | 'peace' | 'trade' | 'demand' | 'gift' | 'era' | 'wonder' | 'space' | 'victory' | 'warning' | 'landing'
    // Round 9
    | 'village' | 'artifact' | 'hut' | 'raid' | 'greatPerson' | 'barbarians';
  /** Where it happened, so the UI can hide rival events the viewer can't see. */
  x?: number;
  y?: number;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
  /** A diplomatic proposal's answer: accepted or not, and why, in one line. */
  answer?: { accepted: boolean; reason: string };
  /** Set by an attack: what happened, for the UI's result message. */
  combat?: CombatReport;
  /** Set by choosing what to do with a taken barbarian village (Round 9). */
  village?: VillageOutcome;
  /** A one-line result for the UI (e.g. what a Great Person did). */
  message?: string;
}

/** What came of a barbarian village its taker chose to destroy or settle (Round 9). */
export interface VillageOutcome {
  choice: 'destroy' | 'settle';
  /** Destroy: what the reward was, in words ("40 gold", "a free Horseman"...). */
  reward?: string;
  rewardKind?: string;
  /** Destroy: a hidden resource revealed on the tile. */
  revealed?: ResourceId;
  /** Settle: the new city. */
  cityId?: number;
  artifact?: { name: string; techs: TechId[] };
}

export interface CombatReport {
  attackerWon: boolean;
  /** The attacker's win chance, 0–1, as shown before the attack. */
  chance: number;
  attackerType: UnitTypeId;
  defenderType: UnitTypeId;
  attackerArmy: boolean;
  defenderArmy: boolean;
  attackerOwner: number;
  defenderOwner: number;
  /** The defending tile. */
  x: number;
  y: number;
  /** The winner became a veteran from this fight. */
  promoted: boolean;
  /** The attack killed a city's last defender, so the attacker moved in and took this city. */
  capturedCityId?: number;
  /** A ship attacked a land tile (it never moves in). */
  bombard?: boolean;
  /** The attack killed a barbarian village's last defender and the winner moved in (Round 9). */
  tookVillage?: number;
  /** Barbarians won against a city's last defender and raided it instead of taking it. */
  raided?: boolean;
  /** Units that went down with a sunk ship. */
  cargoLost?: number;
}
