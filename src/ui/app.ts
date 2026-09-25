// Glue between game state, the renderer, and input. Holds view-only state (camera,
// selection, open city). Every game change goes through applyAction.

import { victoryGoals } from '../data/mapSizes';
import { BUILDINGS } from '../data/buildings';
import { CIVS } from '../data/civs';
import { CITY_FOCUSES, RULES, growthThreshold, type CityFocus } from '../data/rules';
import { ERAS, TECHS, TECH_LIST, type TechId } from '../data/techs';
import { TERRAIN } from '../data/terrain';
import { ICON_CREDITS, ICON_LICENSE, ICON_SITE, MAP_ICONS, usedIcons } from '../data/icons';
import { UNITS, type UnitTypeId } from '../data/units';
import { PROJECTS, VICTORY, VICTORY_NAMES, type VictoryKind } from '../data/victory';
import { WONDERS, WONDER_LIST } from '../data/wonders';
import { applyAction, type Action } from '../game/actions';
import { BARBARIANS } from '../data/barbarians';
import { GREAT_PEOPLE, GREAT_PEOPLE_RULES } from '../data/greatPeople';
import { RESOURCES } from '../data/resources';
import { villageAt } from '../game/barbarians';
import { cityNameFor, foundCityError } from '../game/city';
import { cultureToNextGreatPerson, engineerCities, generalTiles, greatPersonError, merchantGold } from '../game/greatPeople';
import { bonusText, visibleResource } from '../game/resources';
import { pendingVillage, settleVillageError } from '../game/villages';
import { attackError, combatOdds, fortifyError, interception, overallChance, type Strength } from '../game/combat';
import { airliftSourceError, airliftTargets, airRange, hasAirlift, tilesWithin } from '../game/air';
import { CivName, civAdjective, civName, civVerb } from '../game/conquest';
import {
  attitude,
  civDef,
  declareWarError,
  hasMet,
  metCivs,
  offerAcceptError,
  offerText,
  strengthRatio,
  techPrice,
  techValue,
  tradeableTechs,
  treatyLockedUntil,
} from '../game/diplomacy';
import { distance, neighbors, tileAt, tileIndex } from '../game/grid';
import { unitVisibleTo } from '../game/fog';
import { aircraftOf, airCapacity, armyWord, cargoCapacity, cargoOf, hovers, isAir, isShip, isWaterAt } from '../game/naval';
import { entryText, eventsVisibleTo } from '../game/log';
import { findUnit, reachableThisTurn } from '../game/movement';
import { migrationSummary } from '../game/save';
import {
  buildOptions,
  buyCost,
  buyError,
  completionBlocker,
  findCity,
  growthForecast,
  itemCost,
  itemName,
  sameItem,
  turnsToFinish,
} from '../game/production';
import {
  availableTechs,
  eraName,
  hasTech,
  knows,
  playerEra,
  eraIndex,
  researchError,
  techCost,
  techLeadsTo,
  techUnlocks,
  turnsToLearn,
} from '../game/tech';
import {
  STATE_VERSION,
  type ActionResult,
  type BuildItem,
  type City,
  type CombatReport,
  type Coord,
  type GameState,
  type GreatPerson,
  type Village,
  type LogEntry,
  type Offer,
  type Unit,
} from '../game/types';
import { atWar } from '../game/war';
import { cityCulture, cityScienceGold, cityYields, empireCulture, empireIncome, foodSurplus } from '../game/yields';
import { capitalOf, launchError, victoryProgress, type VictoryProgress } from '../game/victory';
import { wonderCity } from '../game/wonders';
import { clampCamera, defaultTileSize, minTileSize, panBy, screenToWorld, zoomAt, type Camera } from '../render/camera';
import { drawMinimap, minimapScale, minimapToWorld, MinimapTerrain } from '../render/minimap';
import { CITY_STYLES, DEFAULT_ART, TERRAIN_STYLES, type ArtChoice } from '../render/art';
import { iconHtml, unitIconHtml } from '../render/icons';
import { playerColor, render, TerrainChunks, type ViewState } from '../render/renderer';
import { attachMapInput } from './input';
import { backupCurrentSave, listBackups, restoreBackup, saveToStorage } from './storage';
import { TurnRunner } from './turnRunner';
import { titleBackground } from './titleArt';
import { resolveTap } from './tap';
import { armyCandidates, isMixedStack, stackLabel, unitsOnTile } from '../game/stack';

import { portraitHtml } from './portraits';
import { esc, plural, unitSummary } from './text';
import { DEFAULT_SETTINGS, flashMs, loadSettings, loadTipsSeen, saveSettings, saveTipsSeen, toastMs, type Settings } from './settings';
import { musicPresent, SoundEngine, soundFilesPresent } from './sound';
import type { MusicContext } from './soundLogic';
import { snapshot, turnSounds } from './soundLogic';
import { ALMANAC_CATEGORIES, cardLink, findCard, searchAlmanac, type AlmanacCategory } from './almanac';
import { guidePages } from './guide';
import { dueTips, type Tip } from './tips';
import { DIFFICULTIES } from '../data/difficulty';
import { MAP_SIZES } from '../data/mapSizes';
import { SOUND_EVENTS } from '../data/sounds';
import { SetupScreen, bonusListHtml, type SetupChoice } from './setup';
import { UNIQUE_RULES } from '../data/leaders';
import { hasUnique } from '../game/leaders';
import { challengeError, dissolutionError, dissolutionGold, pilgrimageError, returnCityError } from '../game/uniques';
import { FOUNDING_TECHS, RELIGION } from '../data/religion';
import { ROADS } from '../data/roads';
import {
  artistConvertTargets,
  cityReligion,
  faithOpinion,
  followerCities,
  holyCity,
  holyReligion,
  nationalChurchError,
  ownReligion,
  religionById,
  religionCityCulture,
  religionCityGold,
  spreadTargets,
  suggestReligionName,
  symbolOf,
} from '../game/religion';
import { roadGoldPerTile, roadTargets } from '../game/roads';
import type { Religion } from '../game/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const FOCUS_LABEL: Record<CityFocus, string> = {
  balanced: 'Balanced',
  food: 'Food',
  production: 'Production',
  trade: 'Trade',
};

export interface AppOptions {
  /** Builds a fresh game for the New Game screen (Round 11: your civ, or random, and how many rivals). */
  newGame: (choice?: SetupChoice) => GameState;
  /** Shown once at startup, e.g. "Resumed your game". */
  notice?: string;
  /** False while a dev scenario is loaded, so it can never overwrite the real autosave. */
  autosave?: boolean;
  /** Dev server only: the scenario being played (its note is shown on screen). */
  scenario?: { id: string; title: string; note: string };
  /** Dev server only: scenarios offered in the ☰ menu. */
  devScenarios?: { id: string; title: string }[];
  /**
   * Round 13: there's no saved game yet; the state is only a stand-in behind the main menu. It
   * isn't saved, and New Game replaces it without a backup.
   */
  placeholder?: boolean;
  /** Round 13: a screen to open at startup (the main menu, or a dev scenario's screen). */
  opens?: 'mainMenu' | 'settings' | 'almanac' | 'howToPlay' | 'setup';
  /** Round 13 (dev scenario): show every first-game tip afresh, without touching the device's list. */
  freshTips?: boolean;
  /** Round 14 (dev scenario): this scenario plays sound, and shows a music switch in its note. */
  scenarioSound?: boolean;
  musicSwitch?: boolean;
}

/** Round 14: the dev builds' art style switch, kept on this device (never in production). */
const DEV_ART_KEY = 'epoch.devArt';
function loadDevArt(): ArtChoice {
  try {
    const raw = JSON.parse(localStorage.getItem(DEV_ART_KEY) ?? '{}') as Partial<ArtChoice>;
    return {
      terrain: TERRAIN_STYLES.some((t) => t.id === raw.terrain) ? raw.terrain! : DEFAULT_ART.terrain,
      city: CITY_STYLES.some((c) => c.id === raw.city) ? raw.city! : DEFAULT_ART.city,
    };
  } catch {
    return { ...DEFAULT_ART };
  }
}
function saveDevArt(art: ArtChoice): void {
  try {
    localStorage.setItem(DEV_ART_KEY, JSON.stringify(art));
  } catch {
    // Storage full or blocked: the switch just won't be remembered.
  }
}

/** Round 13/14: dev scenarios whose End Turn toasts how long the computer turns took. */
const TIMED_SCENARIOS = ['large-map', 'huge-map', 'epic-map'];

export class App {
  state: GameState;
  private readonly canvas = $<HTMLCanvasElement>('map');
  private readonly ctx: CanvasRenderingContext2D;
  private camera: Camera = { cx: 0, cy: 0, tileSize: 52 };
  private selectedUnitId: number | undefined;
  private openCityId: number | undefined;
  /** The tech highlighted on the tech screen, and its prompt line (view state only). */
  private techSelected: TechId | undefined;
  private techPrompt: string | undefined;
  /** The attack waiting for confirmation in the odds panel. */
  private pendingAttack: { unitId: number; at: Coord } | undefined;
  /** A short flash on a tile after a fight (view only). */
  private flash: { x: number; y: number; won: boolean } | undefined;
  private flashTimer: number | undefined;
  /** The end-of-game panel was dismissed to look at the map ("Look at the map"). */
  private endDismissed = false;
  /** Diplomacy screen view state: the civ picked, which page, the tech asked for, the last answer. */
  private diploCiv: number | undefined;
  private diploPage: 'main' | 'trade' | 'confirmWar' = 'main';
  private tradeGet: TechId | undefined;
  private diploAnswer: { civ: number; accepted: boolean; reason: string } | undefined;
  /** Panels waiting to be shown one at a time (first contact, war declared on you, AI offers). */
  private notices: Notice[] = [];
  /** Great People the human put off this turn ("Decide later"). */
  private gpLater = new Set<number>();
  private cssW = 0;
  private cssH = 0;
  private frameQueued = false;
  private readonly human = 0;
  private readonly opts: AppOptions;
  private readonly setup = new SetupScreen((choice) => this.startNewGame(choice));
  /** Round 13: this device's settings, the sound engine, and whether this game is saved. */
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private readonly sound: SoundEngine;
  private autosave: boolean;
  private placeholder: boolean;
  /** First-game tips already shown (the device's list, or a scenario's own), and the one showing. */
  private tipsSeen: string[] = [];
  private tipShowing: Tip | undefined;
  /** Almanac view state: category, search text, the card open, and the cards before it (‹ Back). */
  private almanacCat: AlmanacCategory | undefined;
  private almanacQuery = '';
  private almanacCardId: string | undefined;
  private almanacHistory: string[] = [];
  private guideIndex = 0;
  /** The end screen's sound has played for this result (so it plays once). */
  private endSound: string | undefined;
  /** Round 14: End Turn runs in a Web Worker; while it does, the game waits (turnBusy). */
  private readonly turnRunner = new TurnRunner();
  private turnBusy = false;
  /** Round 14: pre-drawn terrain, the minimap's terrain layer, and the art style shown. */
  private readonly chunks = new TerrainChunks();
  private readonly miniTerrain = new MinimapTerrain();
  private miniScale = 1;
  private art: ArtChoice = { ...DEFAULT_ART };
  private shimmerTimer: number | undefined;

  constructor(state: GameState, opts: AppOptions) {
    this.state = state;
    this.opts = opts;
    this.autosave = opts.autosave !== false;
    this.placeholder = !!opts.placeholder;
    this.settings = loadSettings();
    this.applySettings();
    this.sound = new SoundEngine(() => this.settings, !!opts.scenario && !opts.scenarioSound);
    // Round 14 (C1): the theme on the main menu and the New Game screen, the era's track in a game.
    const watch = new MutationObserver(() => this.updateMusicContext());
    for (const id of ['mainMenu', 'setupOverlay']) watch.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
    // A scenario keeps its own list of tips seen, so it never uses up the real game's tips.
    const seen = loadTipsSeen();
    this.tipsSeen = opts.freshTips ? [] : seen;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;

    attachMapInput(this.canvas, {
      onTap: (sx, sy) => this.handleTap(sx, sy),
      onPan: (dx, dy) => {
        panBy(this.camera, dx, dy);
        this.clamp();
        this.requestDraw();
      },
      onZoom: (f, sx, sy) => {
        zoomAt(this.camera, this.cssW, this.cssH, f, sx, sy, minTileSize(this.cssW, this.cssH));
        this.clamp();
        this.requestDraw();
      },
    });

    $('endTurnBtn').addEventListener('click', () => this.endTurn());
    $('foundBtn').addEventListener('click', () => this.foundCity());
    $('nextBtn').addEventListener('click', () => this.selectNext(true));
    $('deselectBtn').addEventListener('click', () => this.select(undefined));
    $('fortifyBtn').addEventListener('click', () => this.fortifySelected());
    $('stackList').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-unit]');
      if (!btn) return;
      const id = Number(btn.dataset.unit);
      if (btn.dataset.act === 'army') this.formArmyOf(id);
      else if (btn.dataset.act === 'board') this.boardShip(id, Number(btn.dataset.ship));
      else if (btn.dataset.act === 'unload') this.unloadHere(id);
      else if (btn.dataset.act === 'airlift') this.pickAirlift(id);
      else if (btn.dataset.act === 'spread') this.spreadReligion(id, Number(btn.dataset.city));
      else this.select(id);
    });
    $('attackGoBtn').addEventListener('click', () => this.confirmAttack());
    $('attackCancelBtn').addEventListener('click', () => this.closeAttack());
    $('attackOverlay').addEventListener('click', (e) => {
      if (e.target === $('attackOverlay')) this.closeAttack();
    });
    $('endNewBtn').addEventListener('click', () => {
      if (this.opts.scenario) gotoScenario(undefined);
      else this.setup.open();
    });
    // Round 11: your leader, bonuses, and unique actions.
    $('leaderBtn').addEventListener('click', () => this.openLeader());
    $('leaderOverlay').addEventListener('click', (e) => this.handleLeaderClick(e));
    $('endCloseBtn').addEventListener('click', () => {
      // A win (anyone's): Keep playing stops victory checks for the rest of the game.
      // Eliminated: just look at the map.
      if (this.state.players[this.human]!.alive && this.state.victory && !this.state.keepPlaying) {
        this.dispatch({ type: 'keepPlaying' });
      } else {
        this.endDismissed = true;
        this.refresh();
      }
    });
    $('victoryBtn').addEventListener('click', () => this.openVictory());
    $('victoryMenuBtn').addEventListener('click', () => {
      this.closeMenu();
      this.openVictory();
    });
    $('victoryOverlay').addEventListener('click', (e) => this.handleVictoryClick(e));
    // Round 12: the Religion screen (from the menu, the city panel, or Diplomacy).
    $('religionMenuBtn').addEventListener('click', () => {
      this.closeMenu();
      this.openReligion();
    });
    $('religionOverlay').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === $('religionOverlay') || t.closest('#religionCloseBtn')) $('religionOverlay').hidden = true;
    });
    $('rateDown').addEventListener('click', () => this.changeRate(-RULES.scienceRateStep));
    $('rateUp').addEventListener('click', () => this.changeRate(RULES.scienceRateStep));
    $('cityPanel').addEventListener('click', (e) => this.handleCityPanelClick(e));
    $('researchBtn').addEventListener('click', () => this.openTech());
    $('diploBtn').addEventListener('click', () => this.openDiplo());
    $('diploOverlay').addEventListener('click', (e) => this.handleDiploClick(e));
    $('noticeButtons').addEventListener('click', (e) => this.handleNoticeClick(e));
    $('techOverlay').addEventListener('click', (e) => this.handleTechClick(e));
    this.setupMenu();
    this.setupDev();
    this.setupRound13();
    window.addEventListener('keydown', (e) => this.handleKey(e));

    // Autosave when the tab is hidden or unloaded: Safari may kill a background tab
    // without warning, so this is the last chance to save mid-turn progress.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });
    window.addEventListener('pagehide', () => this.save());

    // Resize: window resize, iPad rotation, and anything else that changes the canvas box.
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
    window.visualViewport?.addEventListener('resize', onResize);
    new ResizeObserver(onResize).observe(this.canvas);
    this.resize();
    // Round 14 (A2): a game opens close up (about 12×9 tiles), not the whole continent.
    this.camera.tileSize = defaultTileSize(this.cssW, this.cssH);
    this.setupMinimap();
    // Round 14: load the turn worker's code now, not on the first End Turn.
    window.setTimeout(() => this.turnRunner.warm(), 800);

    this.startHumanTurn();
    if (opts.notice) this.toast(opts.notice);
    // Round 13: the main menu first (or a dev scenario's screen).
    switch (opts.opens) {
      case 'mainMenu':
        this.openMainMenu();
        break;
      case 'setup':
        this.setup.open();
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'almanac':
        this.openAlmanac();
        break;
      case 'howToPlay':
        this.openGuide();
        break;
    }
  }

  // ---- actions ---------------------------------------------------------------------------

  private dispatch(action: Action): boolean {
    return this.dispatchResult(action).ok;
  }

  private dispatchResult(action: Action): ActionResult {
    // Round 14: while the computer turns run in the worker, the game can't change here.
    if (this.turnBusy) {
      this.toast('Rivals are moving…');
      return { ok: false, reason: 'Rivals are moving' };
    }
    const metBefore = new Set(metCivs(this.state, this.human));
    const res = applyAction(this.state, action);
    this.afterAction(res, metBefore);
    return res;
  }

  /** After any action: its message, first contacts, the autosave, and the screen. */
  private afterAction(res: ActionResult, metBefore: Set<number>): void {
    if (!res.ok && res.reason) this.toast(res.reason, true);
    // First contact (on our move, or on theirs during End Turn) gets its own panel.
    for (const civ of metCivs(this.state, this.human)) if (!metBefore.has(civ)) this.queueContact(civ);
    // Cheap (a few tens of KB), and means a reload never loses more than one tap.
    if (res.ok) this.save();
    this.refresh();
    this.checkPending();
  }

  /** Round 14: shows or hides "Rivals are moving…" and holds the End Turn button meanwhile. */
  private setTurnBusy(on: boolean): void {
    this.turnBusy = on;
    $('rivalsMoving').hidden = !on;
    $<HTMLButtonElement>('endTurnBtn').disabled = on;
  }

  /**
   * Round 9: a village the human has taken waits for a choice, and a new Great Person for a
   * decision. Each gets its panel once (a Great Person put off with "Decide later" comes back
   * next turn).
   */
  private checkPending(): void {
    const v = pendingVillage(this.state, this.human);
    if (v) this.queueVillage(v);
    // Round 11: Bolívar may give a city he just took back to its founders.
    for (const c of this.state.cities) {
      if (c.owner === this.human && !returnCityError(this.state, c)) this.queueReturnCity(c);
    }
    for (const gp of this.state.greatPeople) {
      if (gp.owner === this.human && !this.gpLater.has(gp.id)) this.queueGreatPerson(gp);
    }
    // Round 12: a religion you founded waits for its name.
    for (const r of this.state.religions) {
      if (r.founder === this.human && !r.named) this.queueNameReligion(r);
    }
  }

  private save(): void {
    if (!this.autosave || this.placeholder) return;
    saveToStorage(this.state);
  }

  /** Toasts the entries the player should hear about (first contact has its own panel). */
  private announce(entries: LogEntry[]): void {
    for (const e of eventsVisibleTo(this.state, this.human, entries)) {
      // These have their own panels.
      const aimedAtMe = e.other === this.human && e.player !== this.human;
      if (e.kind === 'contact' || (aimedAtMe && (e.kind === 'war' || e.kind === 'demand' || e.kind === 'warning'))) continue;
      // Round 10: Dan's icons beside the Round 9 news (a hut's result, a village, an artifact).
      const icon = e.kind === 'hut' ? MAP_ICONS.hut : e.kind === 'village' ? MAP_ICONS.village : e.kind === 'artifact' ? MAP_ICONS.artifact : undefined;
      this.toast(entryText(e, this.human), false, icon);
    }
  }

  private endTurn(confirmed = false): void {
    // Round 13 (A2): ask first while a unit can still move, if Settings says so.
    const ready = this.readyUnits().length;
    if (!confirmed && this.settings.confirmEndTurn && ready > 0 && this.state.players[this.human]!.alive) {
      this.showNow({
        title: 'End your turn?',
        text: `${plural(ready, 'unit')} can still move.`,
        sub: 'You can turn this question off in Settings (☰).',
        buttons: [
          { label: 'Keep playing', cls: 'bigBtn', run: () => this.selectNext(true) },
          { label: 'End Turn', cls: 'bigBtn primary', run: () => this.endTurn(true) },
        ],
      });
      return;
    }
    if (this.turnBusy) return;
    void this.runEndTurn();
  }

  /**
   * Round 14 (A3): the computer turns run in a Web Worker on a copy of the game, so the page
   * stays responsive (the map still pans and zooms) while "Rivals are moving…" shows. Nothing
   * else can change the game until the new state comes back.
   */
  private async runEndTurn(): Promise<void> {
    const logStart = this.state.log.length;
    const techsBefore = this.state.players[this.human]!.techs.length;
    const before = snapshot(this.state, this.human);
    const metBefore = new Set(metCivs(this.state, this.human));
    const t0 = performance.now();
    this.setTurnBusy(true);
    let out;
    try {
      out = await this.turnRunner.run(this.state);
    } finally {
      this.setTurnBusy(false);
    }
    if (out.error || !out.result.ok) {
      this.toast(out.result.reason ?? 'Something went wrong ending the turn. Your game is as it was; try End Turn again.', true);
      return;
    }
    this.state = out.state;
    this.afterAction(out.result, metBefore);
    const me = this.state.players[this.human]!;
    // Round 13/14: how long the computer turns took (the big-map checks read it).
    const ms = Math.round(performance.now() - t0);
    console.info(`Epoch: End Turn took ${ms} ms (${Math.round(out.ms)} ms of rules, in the ${this.turnRunner.lastWhere}; turn ${this.state.turn}, ${this.state.map.width}×${this.state.map.height})`);
    if (this.opts.scenario && TIMED_SCENARIOS.includes(this.opts.scenario.id)) this.toast(`The computer turns took ${ms} ms (${this.turnRunner.lastWhere === 'worker' ? 'in the background' : 'on the page'})`);
    // Round 13: a sound or two for what happened (war on you, a tech, a new era, a city grew...).
    const warOnYou = this.state.log.slice(logStart).some((e) => e.kind === 'war' && e.other === this.human && e.player !== this.human);
    this.sound.playSequence(turnSounds(before, snapshot(this.state, this.human), { warOnYou }));
    // Report what happened this round: our own events, and rival events we could see or civ
    // news from civs we've met. A declaration of war on us gets a panel.
    for (const entry of this.state.log.slice(logStart)) {
      if (entry.kind === 'war' && entry.other === this.human && entry.player !== this.human) {
        this.queueNotice({
          title: 'War!',
          text: entryText(entry, this.human),
          buttons: [
            { label: 'Diplomacy', run: () => this.openDiplo(entry.player) },
            { label: 'OK', cls: 'bigBtn' },
          ],
        });
      }
      // Someone we've met is close to winning (Milestone 6).
      if (entry.kind === 'warning' && entry.other === this.human) {
        this.queueNotice({
          title: 'Close to winning!',
          text: entryText(entry, this.human),
          sub: 'Open Victory progress to see where everyone stands.',
          buttons: [
            { label: 'Victory progress', run: () => this.openVictory() },
            { label: 'OK', cls: 'bigBtn' },
          ],
        });
      }
    }
    this.announce(this.state.log.slice(logStart));
    this.startHumanTurn();
    // Just learned a tech: ask what to research next (on top of any city that needs a build).
    if (me.techs.length > techsBefore && !me.researching && availableTechs(me).length > 0) {
      const learned = TECHS[me.techs[me.techs.length - 1]!].name;
      this.openTech(`You learned ${learned}. Choose what to research next.`);
    }
  }

  private foundCity(): void {
    const id = this.selectedUnitId;
    if (id === undefined) return;
    const logStart = this.state.log.length;
    const cityCountBefore = this.state.cities.length;
    if (this.dispatch({ type: 'foundCity', unitId: id })) {
      this.sound.play('found-city');
      this.announce(this.state.log.slice(logStart));
      this.selectNext(false);
      // A new city needs its first build choice.
      const city = this.state.cities[cityCountBefore];
      if (city) this.openCity(city.id);
    }
  }

  private fortifySelected(): void {
    const u = this.selected();
    if (!u) return;
    if (this.dispatch({ type: 'fortify', unitId: u.id })) {
      this.toast(
        isShip(u) || isAir(u) || hovers(u)
          ? `${UNITS[u.type].name} stays put (Next Unit skips it until it moves)`
          : `${UNITS[u.type].name} fortified (+${RULES.combat.fortifiedPct}% defense until it moves)`,
      );
      this.selectNext(false);
    }
  }

  /** Forms an army around this unit (any type on the selected unit's tile), and selects it. */
  private formArmyOf(unitId: number): void {
    const u = findUnit(this.state, unitId);
    if (!u) return;
    if (this.dispatch({ type: 'formArmy', unitId: u.id })) {
      this.toast(`${UNITS[u.type].name} ${armyWord(u.type)} formed: ×${RULES.combat.armyMultiplier} attack and defense${isShip(u) && UNITS[u.type].cargo ? `, carries ${cargoCapacity(u)}` : ''}`);
      this.select(u.id);
    }
  }

  /** Boards a ship docked in the same city (Round 8). At sea, boarding is a tap on the ship. */
  private boardShip(unitId: number, shipId: number): void {
    const u = findUnit(this.state, unitId);
    const ship = findUnit(this.state, shipId);
    if (!u || !ship) return;
    if (this.dispatch({ type: 'board', unitId, shipId })) {
      this.toast(isAir(u) ? `${UNITS[u.type].name} landed on the ${UNITS[ship.type].name}` : `${UNITS[u.type].name} boarded the ${UNITS[ship.type].name}`);
      this.selectNext(false);
    }
  }

  /** Goes ashore into the city the ship is docked in. */
  private unloadHere(unitId: number): void {
    const u = findUnit(this.state, unitId);
    if (!u) return;
    if (this.dispatch({ type: 'unload', unitId })) {
      this.toast(isAir(u) ? `${UNITS[u.type].name} is now based in the city` : `${UNITS[u.type].name} went ashore`);
      this.selectNext(false);
    }
  }

  /** The Airport's airlift (Round 10): pick the city with an Airport to fly this land unit to. */
  private pickAirlift(unitId: number): void {
    const u = findUnit(this.state, unitId);
    if (!u) return;
    const from = findCity(this.state, this.state.cities.find((c) => c.x === u.x && c.y === u.y)?.id ?? -1);
    this.showNow({
      title: `Airlift the ${UNITS[u.type].name} where?`,
      text: `Your Airport${from ? ` in ${from.name}` : ''} can fly one land unit a turn to another of your cities with an Airport. It arrives with no moves left.`,
      list: true,
      buttons: [
        ...airliftTargets(this.state, u).map((c) => ({
          label: c.name,
          run: () => {
            const res = this.dispatchResult({ type: 'airlift', unitId, cityId: c.id });
            if (res.ok) {
              this.toast(`${UNITS[u.type].name} airlifted to ${c.name}`);
              this.centerOn(c.x, c.y);
              this.selectNext(false);
            }
          },
        })),
        { label: 'Cancel' },
      ],
    });
  }

  private changeRate(delta: number): void {
    const rate = this.state.players[this.human]!.scienceRate + delta;
    if (rate < 0 || rate > 100) return;
    this.dispatch({ type: 'setScienceRate', rate });
  }

  private startHumanTurn(): void {
    this.selectedUnitId = undefined;
    this.selectNext(false);
    const u = this.selected();
    const focus = u ?? this.state.cities.find((c) => c.owner === this.human);
    if (focus) this.centerOn(focus.x, focus.y);
    // A city that finished a building (or never chose) asks what to build next.
    const idle = this.myCities().filter((c) => c.build === null);
    if (idle.length > 0) {
      this.openCity(idle[0]!.id);
      if (idle.length > 1) this.toast(`${idle.length} cities need something to build`);
    }
    // Offers from AIs (demands, peace) wait for an answer.
    for (const o of this.state.diplomacy.offers) if (o.to === this.human) this.queueOffer(o);
    this.gpLater.clear();
    this.checkPending();
    this.refresh();
  }

  /** New Game: the current game is backed up first, then replaced. */
  private startNewGame(choice?: SetupChoice): void {
    // Round 13: the stand-in behind the main menu (no save yet) is simply replaced.
    if (this.placeholder && !this.opts.scenario) {
      this.placeholder = false;
      this.autosave = true;
    } else if (this.autosave) {
      this.save();
      if (!backupCurrentSave('Replaced by New Game', Date.now())) {
        this.toast("Couldn't back up your current game (storage is full), so it was kept.", true);
        return;
      }
    }
    const state = this.opts.newGame(choice);
    const civ = civDef(state, this.human);
    this.closeMainMenu();
    this.replaceGame(state, `New game: you lead ${civName(state, this.human)} as ${civ.leader} · ${DIFFICULTIES[state.difficulty].name} · ${MAP_SIZES[state.mapSize].name} map`);
  }

  /** Round 11: the New Game setup screen (the dev scenario `new-game-setup` opens it too). */
  openSetup(): void {
    this.setup.open();
  }

  /** Swap in another game (New Game, or a restored backup that's already been saved). */
  private replaceGame(state: GameState, message: string): void {
    this.state = state;
    this.openCityId = undefined;
    this.selectedUnitId = undefined;
    this.pendingAttack = undefined;
    this.endDismissed = false;
    this.notices = [];
    this.diploCiv = undefined;
    this.diploAnswer = undefined;
    this.endSound = undefined;
    this.hideTip();
    $('attackOverlay').hidden = true;
    $('noticeOverlay').hidden = true;
    $('diploOverlay').hidden = true;
    $('victoryOverlay').hidden = true;
    $('leaderOverlay').hidden = true;
    $('religionOverlay').hidden = true;
    if (this.placeholder && !this.opts.scenario) {
      this.placeholder = false;
      this.autosave = true;
    }
    this.save();
    this.camera.tileSize = defaultTileSize(this.cssW, this.cssH);
    this.clamp();
    this.startHumanTurn();
    this.toast(message);
    (window as unknown as { __epoch: { app: App; seed: number } }).__epoch.seed = state.seed;
  }

  // ---- selection -------------------------------------------------------------------------

  private selected(): Unit | undefined {
    return this.selectedUnitId === undefined ? undefined : findUnit(this.state, this.selectedUnitId);
  }

  private myUnits(): Unit[] {
    return this.state.units.filter((u) => u.owner === this.human);
  }

  /** Units still waiting for orders this turn (fortified units, and cargo riding aboard a ship, are left alone; aircraft on a Carrier aren't cargo). */
  private readyUnits(): Unit[] {
    return this.myUnits().filter((u) => u.movesLeft > 0 && !u.fortified && (u.carriedBy === null || isAir(u)));
  }

  private myCities(): City[] {
    return this.state.cities.filter((c) => c.owner === this.human).sort((a, b) => a.id - b.id);
  }

  private select(unitId: number | undefined): void {
    if (unitId !== undefined && unitId !== this.selectedUnitId) this.sound.play('tap');
    this.selectedUnitId = unitId;
    this.refresh();
  }

  /** Select the next unit that can still move (cycling after the current one). */
  private selectNext(center: boolean): void {
    const ready = this.readyUnits();
    if (ready.length === 0) {
      this.selectedUnitId = undefined;
    } else {
      const i = ready.findIndex((u) => u.id === this.selectedUnitId);
      this.selectedUnitId = ready[(i + 1) % ready.length]!.id;
      const u = this.selected();
      if (center && u) this.centerOn(u.x, u.y);
    }
    this.refresh();
  }

  private handleTap(sx: number, sy: number): void {
    const w = screenToWorld(this.camera, this.cssW, this.cssH, sx, sy);
    const tx = Math.floor(w.x);
    const ty = Math.floor(w.y);
    const tile = tileAt(this.state.map, tx, ty);
    if (!tile) return;
    const result = resolveTap(this.state, this.human, this.selectedUnitId, tx, ty);
    switch (result.kind) {
      case 'move': {
        const logStart = this.state.log.length;
        const enemyCity = this.state.cities.find((c) => c.x === tx && c.y === ty && c.owner !== this.human);
        const mover = findUnit(this.state, result.unitId);
        const res = this.dispatchResult({ type: 'move', unitId: result.unitId, to: { x: tx, y: ty } });
        // An aircraft rebased (Round 10).
        if (res.ok && mover && isAir(mover) && res.message) this.toast(`${UNITS[mover.type].name} flew ${res.message}`);
        if (res.ok) {
          this.sound.play('unit-move');
          // Captures and eliminations are worth announcing.
          this.announce(this.state.log.slice(logStart));
          const after = this.selected();
          if (after && after.movesLeft <= 0) this.selectNext(false);
          if (enemyCity && enemyCity.owner === this.human) {
            this.showFlash(tx, ty, true);
            this.openCity(enemyCity.id);
          }
        }
        return;
      }
      case 'attack':
        this.openAttack(result.unitId, { x: tx, y: ty });
        return;
      case 'openCity':
        this.openCity(result.cityId);
        return;
      case 'select':
        this.select(result.unitId);
        return;
      case 'inspect': {
        const explored = this.state.players[this.human]!.explored[ty * this.state.map.width + tx] === 1;
        if (explored) {
          const city = this.state.cities.find((c) => c.x === tx && c.y === ty);
          const def = TERRAIN[tile.terrain];
          const y = def.yields;
          const cityText = city ? `${city.name} · ` : '';
          const defense = def.defensePct ? ` · defense +${def.defensePct}%` : '';
          this.toast(`${cityText}${def.name} — food ${y.food}, production ${y.production}, trade ${y.trade}${defense}`);
          // Round 9: a resource you can see, a barbarian village, a hut.
          const res = visibleResource(this.state, this.human, tileIndex(this.state.map, tx, ty));
          if (res) this.toast(`${res.name}: ${bonusText(res.bonus)} when a city works it`, false, res.icon);
          const village = villageAt(this.state, { x: tx, y: ty });
          if (village) {
            this.toast(`Barbarian village · ${village.flags}/${BARBARIANS.flagsToSpawn} flags (at ${BARBARIANS.flagsToSpawn} it sends a unit out) · defense +${BARBARIANS.villageDefensePct}%. Take it to destroy it for a reward or settle it as a city`, false, MAP_ICONS.village);
          }
          if (tile.hut) this.toast('A hut to explore: step a unit onto it to see what’s there', false, MAP_ICONS.hut);
          // Enemy units in sight: say what they are.
          const enemies = unitsOnTile(this.state, tx, ty).filter((u) => u.owner !== this.human && unitVisibleTo(this.state, this.human, u));
          if (enemies.length === 1) this.toast(`${this.unitLabel(enemies[0]!)} · ${unitSummary(enemies[0]!.type)}`);
          // A stack: say everything in it, so a mixed stack is never mistaken for one type.
          if (enemies.length > 1) {
            this.toast(`${civAdjective(this.state, enemies[0]!.owner)} ${isMixedStack(enemies) ? 'mixed stack' : 'stack'}: ${stackLabel(enemies)}`);
          }
        }
        this.closeCity();
        this.select(undefined);
        return;
      }
      case 'none':
        return;
    }
  }

  private handleKey(e: KeyboardEvent): void {
    // Desktop extras only; everything here also has an on-screen control.
    if (e.target instanceof HTMLInputElement) {
      // Esc in the Almanac's search box closes the Almanac.
      if (e.key === 'Escape' && e.target.id === 'almanacSearch') $('almanacOverlay').hidden = true;
      return;
    }
    // A focused button already handles Enter/Space itself; don't double-fire.
    if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
    if (!$('menuOverlay').hidden) {
      if (e.key === 'Escape') this.closeMenu();
      return;
    }
    // Round 13: the Almanac (over How to Play), How to Play, Settings, then the main menu.
    for (const id of ['almanacOverlay', 'guideOverlay', 'settingsOverlay', 'setupOverlay']) {
      if (!$(id).hidden) {
        if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) $(id).hidden = true;
        return;
      }
    }
    if (!$('mainMenu').hidden) return;
    if (!$('noticeOverlay').hidden) {
      if (e.key === 'Escape' && this.notices[0]?.dismissible !== false) this.closeNotice();
      return;
    }
    if (!$('diploOverlay').hidden) {
      if (e.key === 'Escape') this.closeDiplo();
      return;
    }
    if (!$('victoryOverlay').hidden) {
      if (e.key === 'Escape') this.closeVictory();
      return;
    }
    if (!$('religionOverlay').hidden) {
      if (e.key === 'Escape') $('religionOverlay').hidden = true;
      return;
    }
    if (!$('attackOverlay').hidden) {
      if (e.key === 'Escape') this.closeAttack();
      return;
    }
    if (!$('endOverlay').hidden) return;
    if (!$('techOverlay').hidden) {
      if (e.key === 'Escape') this.closeTech();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'enter') this.endTurn();
    else if (k === 'b' || k === 'f') this.foundCity();
    else if (k === 'n' || k === 'tab') this.selectNext(true);
    else if (k === 'escape') {
      if (this.openCityId !== undefined) this.closeCity();
      else this.select(undefined);
    } else if (k === '=' || k === '+') this.zoomCenter(1.2);
    else if (k === '-') this.zoomCenter(1 / 1.2);
    else return;
    e.preventDefault();
  }

  // ---- city panel ------------------------------------------------------------------------

  private openCity(cityId: number): void {
    if (cityId !== this.openCityId) this.sound.play('tap');
    this.openCityId = cityId;
    this.refresh();
    // Center the city in the part of the map the panel leaves uncovered (above the bottom
    // sheet in portrait, left of the side panel in landscape).
    const city = findCity(this.state, cityId);
    const panel = $('cityPanel').getBoundingClientRect();
    const map = this.canvas.getBoundingClientRect();
    if (!city || panel.width === 0) return;
    const s = this.camera.tileSize;
    const portrait = panel.left - map.left < map.width / 4;
    const visW = portrait ? map.width : panel.left - map.left;
    const visH = portrait ? panel.top - map.top : map.height;
    this.camera.cx = city.x + 0.5 + (map.width / 2 - visW / 2) / s;
    this.camera.cy = city.y + 0.5 + (map.height / 2 - visH / 2) / s;
    this.clamp();
    this.requestDraw();
  }

  private closeCity(): void {
    this.openCityId = undefined;
    this.refresh();
  }

  private handleCityPanelClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || btn.disabled) return;
    const city = this.openCityId === undefined ? undefined : findCity(this.state, this.openCityId);
    if (!city) return;
    const act = btn.dataset.act;
    if (btn.dataset.card) {
      this.openAlmanac(btn.dataset.card);
    } else if (act === 'close') {
      this.closeCity();
    } else if (act === 'focus') {
      this.dispatch({ type: 'setFocus', cityId: city.id, focus: btn.dataset.focus as CityFocus });
    } else if (act === 'build') {
      const item = JSON.parse(btn.dataset.item!) as BuildItem;
      this.dispatch({ type: 'setBuild', cityId: city.id, item });
    } else if (act === 'launch') {
      const logStart = this.state.log.length;
      if (this.dispatch({ type: 'launchSpaceship' })) this.announce(this.state.log.slice(logStart));
    } else if (act === 'buy') {
      const name = city.build ? itemName(city.build) : '';
      if (this.dispatch({ type: 'rushBuy', cityId: city.id })) this.toast(`Bought ${name}; it's ready next turn`);
    } else if (act === 'road') {
      const res = this.dispatchResult({ type: 'buyRoad', fromCityId: city.id, toCityId: Number(btn.dataset.to) });
      if (res.ok && res.message) this.toast(res.message);
    } else if (act === 'religions') {
      this.openReligion();
    } else if (act === 'unit') {
      // Selecting a unit closes the city so the unit's own buttons (Fortify, Form Army) show.
      this.closeCity();
      this.select(Number(btn.dataset.unit));
    } else if (act === 'army') {
      const u = findUnit(this.state, Number(btn.dataset.unit));
      if (u && this.dispatch({ type: 'formArmy', unitId: u.id })) {
        this.toast(`${UNITS[u.type].name} ${armyWord(u.type)} formed: ×${RULES.combat.armyMultiplier} attack and defense${isShip(u) && UNITS[u.type].cargo ? `, carries ${cargoCapacity(u)}` : ''}`);
      }
    }
  }

  /** The one-line description under a build-list item. */
  private itemDetail(item: BuildItem): string {
    switch (item.kind) {
      case 'unit':
        return unitSummary(item.id);
      case 'building':
        return BUILDINGS[item.id].summary;
      case 'wonder': {
        const rivals = this.state.cities.filter((c) => c.owner !== this.human && c.build?.kind === 'wonder' && c.build.id === item.id);
        const race = rivals.length ? ' · someone else is building it too' : '';
        return `Wonder, one per world · ${WONDERS[item.id].summary}${race}`;
      }
      case 'project': {
        const s = this.state.players[this.human]!.space;
        return `${PROJECTS[item.id].summary} · ${s.parts}/${VICTORY.spaceship.parts} built`;
      }
    }
  }

  private renderCityPanel(): void {
    const panel = $('cityPanel');
    const city = this.openCityId === undefined ? undefined : findCity(this.state, this.openCityId);
    if (!city || city.owner !== this.human) {
      this.openCityId = undefined;
      panel.hidden = true;
      return;
    }
    const scrollTop = panel.scrollTop;
    const y = cityYields(this.state, city);
    const surplus = foodSurplus(this.state, city);
    const threshold = growthThreshold(city.size);
    const forecast = growthForecast(this.state, city);
    const growText = !forecast
      ? surplus === 0 ? 'Not growing' : 'Starving (can’t shrink below 1)'
      : forecast.grows
        ? `Grows in ${plural(forecast.turns, 'turn')}`
        : `Shrinks in ${plural(forecast.turns, 'turn')}`;
    const sg = cityScienceGold(this.state, city);
    const gold = this.state.players[this.human]!.gold;

    let prodHtml: string;
    if (city.build) {
      const cost = itemCost(this.state, city, city.build);
      const t = turnsToFinish(this.state, city);
      const blocker = completionBlocker(this.state, city, city.build);
      const when = blocker ? `waiting: ${blocker}` : t === undefined ? 'no production' : plural(t, 'turn');
      prodHtml = `<div class="stat"><b>${itemName(city.build)}</b> ${Math.min(city.production, cost)}/${cost}
        <span class="sub">(+${y.production}) · ${when}</span></div>
        ${bar(city.production, cost, 'prod')}`;
    } else {
      prodHtml = `<div class="stat warn">Choose something to build <span class="sub">(${city.production} stored, +${y.production}/turn)</span></div>`;
    }
    const cost = buyCost(this.state, city);
    const bErr = buyError(this.state, city);
    const buyLabel = cost === undefined ? 'Buy' : `Buy · ${cost} gold`;

    const focusBtns = CITY_FOCUSES.map(
      (f) => `<button type="button" data-act="focus" data-focus="${f}" class="${city.focus === f ? 'on' : ''}"
        aria-pressed="${city.focus === f}">${FOCUS_LABEL[f]}</button>`,
    ).join('');

    const buildBtns = buildOptions(this.state, city)
      .map((item) => {
        const itemCostV = itemCost(this.state, city, item);
        const perTurn = y.production;
        const turns = perTurn > 0 ? Math.max(1, Math.ceil(Math.max(0, itemCostV - city.production) / perTurn)) : undefined;
        const blocker = completionBlocker(this.state, city, item);
        const detail = this.itemDetail(item);
        const note = blocker ?? (turns === undefined ? '—' : plural(turns, 'turn'));
        // Round 13: ⓘ opens the item's Almanac card.
        return `<div class="buildRow"><button type="button" data-act="build" data-item='${JSON.stringify(item)}'
          class="buildItem ${item.kind} ${sameItem(city.build, item) ? 'on' : ''}">
          <span class="bname">${item.kind === 'unit' ? this.badge(item.id, this.human) : ''}${itemName(item)}</span>
          <span class="bmeta">${itemCostV} · ${note}</span>
          <span class="bdesc">${detail}</span></button><button type="button" class="infoBtn" data-card="${item.kind}:${item.id}" aria-label="About ${esc(itemName(item))}">ⓘ</button></div>`;
      })
      .join('');

    const units = this.state.units.filter((u) => u.owner === this.human && u.x === city.x && u.y === city.y);
    // Three of a kind here: offer Form Army right in the list (round 5: it was hard to find).
    const armyBtns = armyCandidates(this.state, units)
      .map(
        (u) => `<button type="button" data-act="army" data-unit="${u.id}" class="armyBtn">Form ${UNITS[u.type].name} ${armyWord(u.type)}
          <span class="sub">(${RULES.combat.armySize} → 1, ×${RULES.combat.armyMultiplier})</span></button>`,
      )
      .join('');
    const unitBtns = units.length
      ? units
          .map(
            (u) => `<button type="button" data-act="unit" data-unit="${u.id}" class="unitItem">
            ${this.badge(u.type, u.owner)}${UNITS[u.type].name}${u.army ? ` ${armyWord(u.type)} ×${RULES.combat.armyMultiplier}` : ''}${u.veteran ? ' ★' : ''}${u.fortified && !isShip(u) ? ' 🛡' : ''}${u.carriedBy !== null ? ' ⚓ aboard' : ''}
            <span class="sub">${isAir(u) ? (u.movesLeft > 0 ? `ready · range ${airRange(u)}` : 'flown this turn') : `moves ${movesText(u.movesLeft)}/${UNITS[u.type].moves}`}${isShip(u) && UNITS[u.type].cargo ? ` · cargo ${cargoOf(this.state, u).length}/${cargoCapacity(u)}` : ''}${isShip(u) && UNITS[u.type].airCargo ? ` · aircraft ${aircraftOf(this.state, u).length}/${airCapacity(u)}` : ''} · tap to select</span></button>`,
          )
          .join('') + armyBtns
      : '<span class="sub">None</span>';

    const builtList = city.buildings.length
      ? city.buildings.map((b) => BUILDINGS[b].name).join(', ')
      : '<span class="sub">None yet</span>';
    const wonderList = city.wonders.length
      ? `<div class="section"><div class="label">Wonders</div><div>${city.wonders
          .map((w) => `<b class="wonderName">★ ${WONDERS[w].name}</b> <span class="sub">${WONDERS[w].summary}</span>`)
          .join('<br>')}</div></div>`
      : '';
    // The spaceship is built (and launched) in the capital.
    const me = this.state.players[this.human]!;
    let spaceHtml = '';
    if (city.capitalOf === this.human && (me.space.parts > 0 || me.space.launchedTurn !== null || hasTech(me, VICTORY.spaceship.requires))) {
      const launchErr = launchError(this.state, this.human);
      const status =
        me.space.arrivesTurn !== null
          ? `Launched on turn ${me.space.launchedTurn}: arrives on turn ${me.space.arrivesTurn}. Keep ${esc(city.name)} safe until then.`
          : `${me.space.parts} of ${VICTORY.spaceship.parts} parts built.`;
      spaceHtml = `<div class="section"><div class="label">Spaceship</div><div class="stat">${status}</div>
        ${me.space.launchedTurn === null && !launchErr ? '<button type="button" data-act="launch" class="bigBtn launchBtn">🚀 Launch spaceship</button>' : ''}</div>`;
    }
    const culture = cityCulture(this.state, city);
    // Round 9: resources on the tiles it works (and its own), and Great People settled here.
    const resTiles = [tileIndex(this.state.map, city.x, city.y), ...city.worked];
    const resList = resTiles
      .map((k) => visibleResource(this.state, this.human, k))
      .filter((r) => !!r)
      .map((r) => `<span class="micon res">${iconHtml(r!.icon, r!.glyph)}</span><b>${r!.name}</b> <span class="sub">${bonusText(r!.bonus)}</span>`);
    const resHtml = resList.length ? `<div class="section"><div class="label">Resources worked</div><div>${resList.join('<br>')}</div></div>` : '';
    const faithHtml = this.cityFaithHtml(city);
    const roadHtml = this.cityRoadsHtml(city, gold);
    const gpHtml = city.greatPeople.length
      ? `<div class="section"><div class="label">Great People settled here</div><div>${city.greatPeople
          .map((k) => `<span class="micon gp">${iconHtml(GREAT_PEOPLE[k].icon, GREAT_PEOPLE[k].glyph)}</span><b>${GREAT_PEOPLE[k].name}</b> <span class="sub">${GREAT_PEOPLE[k].settleText}</span>`)
          .join('<br>')}</div></div>`
      : '';

    panel.innerHTML = `
      <div class="cityHead">
        <div><h2>${city.name}</h2><div class="sub">Size ${city.size}</div></div>
        <button type="button" data-act="close" class="closeBtn" aria-label="Close city">✕</button>
      </div>
      ${units.length ? `<div class="section"><div class="label">Units here</div><div class="unitList">${unitBtns}</div></div>` : ''}
      ${hasAirlift(city) ? `<div class="section sub">✈ Airport: ${city.airliftTurn === this.state.turn ? 'airlift used this turn' : 'one airlift this turn (select a land unit here, then Airlift)'}</div>` : ''}
      <div class="section">
        <div class="stat">Food ${Math.max(0, city.food)}/${threshold}
          <span class="sub">(${surplus >= 0 ? '+' : ''}${surplus}) · ${growText}</span></div>
        ${bar(city.food, threshold, 'food')}
      </div>
      <div class="section">
        ${prodHtml}
        <button type="button" data-act="buy" class="buyBtn" ${bErr ? 'disabled' : ''}>${buyLabel}</button>
        <div class="sub">${bErr && cost !== undefined ? bErr + ` · you have ${gold}` : `You have ${gold} gold`}</div>
      </div>
      <div class="section yields">
        <span>Food <b>${y.food}</b></span><span>Production <b>${y.production}</b></span>
        <span>Trade <b>${y.trade}</b></span><span class="sub">→ Science ${sg.science} · Gold ${sg.gold}</span>
        <span>Culture <b>${culture}</b></span>
      </div>
      ${resHtml}
      ${faithHtml}
      <div class="section"><div class="label">Focus</div><div class="seg">${focusBtns}</div></div>
      <div class="section"><div class="label">Build</div><div class="buildList">${buildBtns}</div></div>
      ${spaceHtml}
      ${roadHtml}
      <div class="section"><div class="label">Buildings</div><div>${builtList}</div></div>
      ${wonderList}
      ${gpHtml}
    `;
    panel.hidden = false;
    panel.scrollTop = scrollTop;
  }

  /** Round 12: the city's religion line (its dot, name, and holy city), and what it brings. */
  private cityFaithHtml(city: City): string {
    const r = cityReligion(this.state, city);
    const holy = holyReligion(this.state, city);
    if (!r && !this.state.religions.length) return '';
    const extra: string[] = [];
    const cul = religionCityCulture(this.state, city);
    const gold = religionCityGold(this.state, city);
    if (cul) extra.push(`+${cul} culture`);
    if (gold) extra.push(`+${gold} gold`);
    const line = r
      ? `${religionDot(r, !!holy)}<b>${esc(r.name)}</b>${holy ? ` <span class="sub">· holy city${holy.id !== r.id ? ` of ${esc(holy.name)}` : ''}</span>` : ''}`
      : '<span class="sub">Follows no religion yet</span>';
    return `<div class="section"><div class="label">Religion</div><div>${line}${extra.length ? ` <span class="sub">· ${extra.join(', ')} a turn</span>` : ''}</div>
      <button type="button" data-act="religions">All religions…</button></div>`;
  }

  /** Round 12: "Build road to…": the nearest cities it could be joined to, with each road's gold cost. */
  private cityRoadsHtml(city: City, gold: number): string {
    const options = roadTargets(this.state, city).slice(0, 8);
    if (!options.length) return '';
    const per = roadGoldPerTile(this.state, this.human);
    const rail = this.state.players[this.human]!.techs.includes(ROADS.railTech);
    const btns = options
      .map((o) => {
        const whose = o.city.owner === this.human ? '' : ` <span class="sub">(${esc(civDef(this.state, o.city.owner).name)})</span>`;
        if (o.newTiles === 0) return `<button type="button" disabled>${esc(o.city.name)}${whose} <span class="sub">· joined by road</span></button>`;
        return `<button type="button" data-act="road" data-to="${o.city.id}" ${gold < o.cost ? 'disabled' : ''}>${esc(o.city.name)}${whose}
          <span class="sub">· ${plural(o.newTiles, 'new tile')} · ${o.cost} gold</span></button>`;
      })
      .join('');
    return `<div class="section"><div class="label">Build ${rail ? 'railroad' : 'road'} to…</div>
      <div class="sub">${per} gold a tile, laid at once. Moving along a ${rail ? 'rail costs 1/10' : 'road costs 1/3'} of a move a tile, and worked ${rail ? 'rail tiles give +1 trade and +1 production' : 'road tiles give +1 trade'}. Anyone may use it.</div>
      <div class="roadList">${btns}</div></div>`;
  }

  // ---- menu ------------------------------------------------------------------------------

  private setupMenu(): void {
    $('menuBtn').addEventListener('click', () => {
      const sc = this.opts.scenario;
      $('menuInfo').textContent = sc
        ? `Dev scenario “${sc.title}” · turn ${this.state.turn}. Not saved; your real game is untouched.`
        : `Turn ${this.state.turn} · seed ${this.state.seed}. Your game saves automatically.`;
      $('newGameBtn').hidden = !!sc;
      $('restoreBtn').hidden = !!sc;
      this.showMenuPage('menuMain');
      $('menuOverlay').hidden = false;
    });
    $('restoreBtn').addEventListener('click', () => {
      this.backupConfirmSlot = undefined;
      this.renderBackups();
      this.showMenuPage('menuBackups');
    });
    $('backupsBackBtn').addEventListener('click', () => this.showMenuPage('menuMain'));
    $('aboutBtn').addEventListener('click', () => {
      this.renderAbout();
      this.showMenuPage('menuAbout');
    });
    $('aboutBackBtn').addEventListener('click', () => this.showMenuPage('menuMain'));
    $('backupList').addEventListener('click', (e) => this.handleBackupClick(e));
    $('menuCloseBtn').addEventListener('click', () => this.closeMenu());
    // Round 13.
    $('mainMenuBtn').addEventListener('click', () => {
      this.closeMenu();
      this.openMainMenu();
    });
    $('howMenuBtn').addEventListener('click', () => {
      this.closeMenu();
      this.openGuide();
    });
    $('almanacMenuBtn').addEventListener('click', () => {
      this.closeMenu();
      this.openAlmanac();
    });
    $('settingsMenuBtn').addEventListener('click', () => {
      this.closeMenu();
      this.openSettings();
    });
    $('newGameBtn').addEventListener('click', () => {
      this.closeMenu();
      this.setup.open();
    });
    $('confirmNoBtn').addEventListener('click', () => this.closeMenu());
    $('confirmYesBtn').addEventListener('click', () => {
      this.closeMenu();
      this.startNewGame();
    });
    // Tapping the dimmed backdrop closes the menu.
    $('menuOverlay').addEventListener('click', (e) => {
      if (e.target === $('menuOverlay')) this.closeMenu();
    });
  }

  private closeMenu(): void {
    $('menuOverlay').hidden = true;
  }

  private showMenuPage(id: 'menuMain' | 'menuBackups' | 'menuConfirm' | 'menuAbout'): void {
    for (const page of ['menuMain', 'menuBackups', 'menuConfirm', 'menuAbout']) $(page).hidden = page !== id;
  }

  /** ☰ → About / Credits (every build): the game's name and version, and the icon credits the license asks for. */
  private renderAbout(): void {
    // Round 10: the map icons too (village, hut, barbarian badge, artifact, resources, Great People).
    const rowsFor = (group: 'Units' | 'Map') =>
      usedIcons()
        .filter((u) => u.group === group)
        .map((u) => {
          const credit = ICON_CREDITS[u.icon];
          const pic = u.unit ? this.badge(u.unit, this.human) : `<span class="udisc mapdisc">${iconHtml(u.icon, '?')}</span>`;
          return `<li>${pic}<span><b>${esc(u.name)}</b>: “${esc(credit?.title ?? u.icon)}” by ${esc(credit?.author ?? 'unknown')}
          ${credit?.modified ? `<span class="sub">(modified: ${esc(credit.modified)})</span>` : ''}
          ${credit ? `<a href="${credit.url}" target="_blank" rel="noopener">source</a>` : ''}</span></li>`;
        })
        .join('');
    $('aboutBody').innerHTML = `
      <p><b>Epoch</b> (working title) · version ${esc(__APP_VERSION__)} · save format ${STATE_VERSION}</p>
      <p class="sub">A turn-based strategy game made for family and friends.</p>
      <div class="label">Unit icons</div>
      <p class="sub">From <a href="${ICON_SITE}" target="_blank" rel="noopener">game-icons.net</a>, used under the
        <a href="${ICON_LICENSE.url}" target="_blank" rel="noopener">${ICON_LICENSE.name}</a> license. Recolored to fit the map; shapes unchanged except where noted.</p>
      <ul class="credits">${rowsFor('Units')}</ul>
      <div class="label">Map icons</div>
      <ul class="credits">${rowsFor('Map')}</ul>
      ${soundFilesPresent().length ? `<div class="label">Sounds</div><p class="sub">${soundFilesPresent().some((f) => !f.startsWith('music-')) ? 'Sound effects generated with ElevenLabs.' : ''}${musicPresent() ? ' Music generated with Suno.' : ''}</p>` : ''}`;
  }

  // ---- backups (☰ → Restore a backup; in the production build too) ------------------------

  private backupConfirmSlot: number | undefined;

  private renderBackups(): void {
    const when = (ms: number) =>
      new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const items = listBackups().map((b) => {
      const turn = b.turn === undefined ? 'Unknown turn' : `Turn ${b.turn}`;
      const saved = b.savedAt ? `saved ${when(b.savedAt)}` : '';
      const upgrade = b.loadable && b.saveVersion !== undefined && b.saveVersion < STATE_VERSION ? ' (will be updated)' : '';
      const version = b.saveVersion === undefined ? '' : `version ${b.saveVersion}${upgrade}`;
      let action: string;
      if (!b.loadable) {
        action = `<div class="warn">Can’t be restored. ${esc(b.problem ?? '')}</div>`;
      } else if (this.backupConfirmSlot === b.slot) {
        action = `<div class="sub">Restore this? Your current game will be kept as a backup.</div>
          <div class="row"><button type="button" data-cancel="1">Cancel</button>
          <button type="button" data-confirm="${b.slot}" class="danger">Yes, restore</button></div>`;
      } else {
        action = `<div class="row"><button type="button" data-restore="${b.slot}">Restore</button></div>`;
      }
      return `<div class="backup"><div><b>${turn}</b> <span class="sub">${[saved, version].filter(Boolean).join(' · ')}</span></div>
        <div class="sub">Kept ${when(b.backedUpAt)} · ${esc(b.reason)}</div>${action}</div>`;
    });
    $('backupList').innerHTML = items.length
      ? items.join('')
      : '<p>No backups yet. One is kept automatically whenever a saved game is replaced: New Game, an update, or a save that can’t be loaded.</p>';
  }

  private handleBackupClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.restore) {
      this.backupConfirmSlot = Number(btn.dataset.restore);
      this.renderBackups();
    } else if (btn.dataset.cancel) {
      this.backupConfirmSlot = undefined;
      this.renderBackups();
    } else if (btn.dataset.confirm) {
      // The backup of the current game should be its very latest state.
      this.save();
      const res = restoreBackup(Number(btn.dataset.confirm), Date.now());
      this.backupConfirmSlot = undefined;
      if (!res.ok) {
        this.toast(res.reason, true);
        this.renderBackups();
        return;
      }
      this.closeMenu();
      const updated = res.migratedFrom ? ` and updated it for ${migrationSummary(res.migratedFrom)}` : '';
      this.replaceGame(res.state, `Restored your game from turn ${res.state.turn}${updated}. The game you replaced is now a backup.`);
    }
  }

  // ---- attack (odds panel) ---------------------------------------------------------------

  private openAttack(unitId: number, at: Coord): void {
    const unit = findUnit(this.state, unitId);
    if (!unit) return;
    const err = attackError(this.state, unit, at);
    if (err) {
      this.toast(err, true);
      return;
    }
    const odds = combatOdds(this.state, unit, at)!;
    this.pendingAttack = { unitId, at };
    const pct = Math.round(odds.chance * 100);
    const others = this.state.units.filter((u) => u.x === at.x && u.y === at.y && u.id !== odds.defender.id).length;
    const stackNote = others > 0 ? `<p class="sub">Their best defender fights. If it loses, the other ${plural(others, 'unit')} on that tile stay.</p>` : '';
    const city = this.state.cities.find((c) => c.x === at.x && c.y === at.y);
    const bombard = isShip(unit) && !isWaterAt(this.state, at.x, at.y);
    const flying = isAir(unit) || hovers(unit);
    const takeNote =
      city && others === 0 && !bombard && !flying
        ? `<p class="sub">It’s ${esc(city.name)}’s last defender: if you win, your ${esc(UNITS[unit.type].name)} moves in and takes the city.</p>`
        : '';
    const bombardNote = bombard
      ? `<p class="sub">Bombarding: if you win, the defender is destroyed but your ${esc(UNITS[unit.type].name)} stays at sea (ships never capture). If you lose, it sinks.</p>`
      : '';
    const aboard = (u: Unit) => cargoOf(this.state, u).length;
    const cargoNote =
      (aboard(odds.defender) ? `<p class="sub">If their ${esc(UNITS[odds.defender.type].name)} sinks, the ${plural(aboard(odds.defender), 'unit')} aboard go down with it.</p>` : '') +
      (aboard(unit) ? `<p class="sub">If your ${esc(UNITS[unit.type].name)} sinks, the ${plural(aboard(unit), 'unit')} aboard go down with it.</p>` : '');
    // Round 10: aircraft strike and fly home; a fighter may intercept first.
    const uname = esc(UNITS[unit.type].name);
    const airNote = isAir(unit)
      ? `<p class="sub">Air strike: if you win, the defender is destroyed and your ${uname} flies back to base. Aircraft never capture${city && others === 0 ? `, so ${esc(city.name)} stays theirs` : ''}. If you lose, it’s shot down.</p>`
      : hovers(unit)
        ? `<p class="sub">Helicopters never capture: if you win, the defender is destroyed and your ${uname} stays where it is.</p>`
        : '';
    const icpt = interception(this.state, unit, at);
    const overall = Math.round(overallChance(this.state, unit, at) * 100);
    const icptNote = icpt
      ? `<p class="warnline">${this.badge(icpt.fighter.type, icpt.fighter.owner)}Their ${esc(this.unitName(icpt.fighter))} can intercept: it shoots your ${uname} down ${Math.round(icpt.chance * 100)}% of the time${icpt.attack.mods.some((m) => m.label === 'Stealth') ? ' (stealth makes it harder)' : ''}, and then the strike never happens. <b>Overall: ${overall}%</b> that it gets through and wins.</p>`
      : flying ? '<p class="sub">No enemy fighter is in range to intercept.</p>' : '';
    $('attackBody').innerHTML = `
      <h2>${isAir(unit) ? 'Air strike?' : 'Attack?'}</h2>
      <div class="odds ${pct >= 60 ? 'good' : pct >= 40 ? 'even' : 'bad'}"><b>${pct}%</b><span>chance to win${icpt ? ' the fight' : ''}</span></div>
      <div class="sides">
        ${sideHtml(this.badge(odds.attacker.type, odds.attacker.owner), `Your ${this.unitName(odds.attacker)}`, 'Attack', odds.attack)}
        ${sideHtml(this.badge(odds.defender.type, odds.defender.owner), this.unitLabel(odds.defender), 'Defense', odds.defense)}
      </div>
      ${icptNote}${stackNote}${takeNote}${bombardNote}${airNote}${cargoNote}
      <p class="sub">The loser is destroyed. Attacking uses up your unit’s turn.</p>`;
    $('attackOverlay').hidden = false;
    $<HTMLButtonElement>('attackGoBtn').focus({ preventScroll: true });
  }

  private closeAttack(): void {
    this.pendingAttack = undefined;
    $('attackOverlay').hidden = true;
  }

  private confirmAttack(): void {
    const p = this.pendingAttack;
    this.closeAttack();
    if (!p) return;
    const logStart = this.state.log.length;
    const res = this.dispatchResult({ type: 'attack', unitId: p.unitId, at: p.at });
    if (!res.ok || !res.combat) return;
    this.reportCombat(res.combat);
    // Anything after the fight itself (a city taken, a civ eliminated).
    this.announce(this.state.log.slice(logStart + 1));
    this.selectNext(false);
    // The last defender fell and the winner moved in: the city is ours, so pick its build.
    if (res.combat.capturedCityId !== undefined) this.openCity(res.combat.capturedCityId);
  }

  private reportCombat(c: CombatReport): void {
    const pct = Math.round(c.chance * 100);
    const mine = `${UNITS[c.attackerType].name}${c.attackerArmy ? ` ${armyWord(c.attackerType)}` : ''}`;
    const theirs = `${UNITS[c.defenderType].name}${c.defenderArmy ? ` ${armyWord(c.defenderType)}` : ''}`;
    let text = c.attackerWon
      ? `Your ${mine} defeated the ${theirs} (${pct}%)`
      : `Your ${mine} was destroyed by the ${theirs} (${pct}%)`;
    if (c.bombard && c.attackerWon) text = `Your ${mine} bombarded and destroyed the ${theirs} (${pct}%). It stays at sea`;
    if (c.airStrike && c.attackerWon) text = `Your ${mine} destroyed the ${theirs} (${pct}%) and flew back to base`;
    // Round 10: a fighter went after it first.
    const i = c.interception;
    if (i && i.fighterWon) text = `A ${civAdjective(this.state, i.fighterOwner)} ${UNITS[i.fighterType].name} intercepted and shot down your ${mine} (${Math.round(i.chance * 100)}%). The strike never happened`;
    else if (i) text = `Your ${mine} shot down the intercepting ${UNITS[i.fighterType].name}, then ${c.attackerWon ? `destroyed the ${theirs}` : `was destroyed by the ${theirs}`} (${pct}%)`;
    if (c.promoted && c.attackerWon) text += `. Your ${mine} is now a veteran ★`;
    if (c.cargoLost) text += `. ${plural(c.cargoLost, 'unit')} aboard went down with the ship`;
    this.toast(text, !c.attackerWon);
    this.sound.play(c.attackerWon && !(i && i.fighterWon) ? 'combat-win' : 'combat-loss');
    this.showFlash(c.x, c.y, c.attackerWon);
  }

  private showFlash(x: number, y: number, won: boolean): void {
    this.flash = { x, y, won };
    if (this.flashTimer !== undefined) clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      this.flash = undefined;
      this.requestDraw();
    }, flashMs(this.settings));
    this.requestDraw();
  }

  private unitName(u: Unit): string {
    return `${UNITS[u.type].name}${u.army ? ` ${armyWord(u.type)}` : ''}${u.veteran ? ' ★' : ''}`;
  }

  /** "Malian Spearman ★", or "Your Warrior". */
  private unitLabel(u: Unit): string {
    return u.owner === this.human ? `Your ${this.unitName(u)}` : `${civAdjective(this.state, u.owner)} ${this.unitName(u)}`;
  }

  /** The unit type's icon on its owner's color, as on the map (Round 7). */
  private badge(type: UnitTypeId, owner: number): string {
    return `<span class="udisc" style="background:${playerColor(this.state, owner)}">${unitIconHtml(type)}</span>`;
  }

  /** Tiles the selected unit could attack right now (outlined in red): next door, or in an aircraft's range. */
  private attackTargets(u: Unit | undefined): Coord[] {
    if (!u || u.owner !== this.human || u.movesLeft <= 0 || UNITS[u.type].attack <= 0) return [];
    const tiles = isAir(u) ? tilesWithin(this.state, u, airRange(u)) : neighbors(this.state.map, u);
    return tiles.filter((n) => !attackError(this.state, u, n));
  }

  // ---- end of game (Milestone 6): which victory, who, when, and a short stats summary ------

  private renderEnd(): void {
    const me = this.state.players[this.human]!;
    const v = this.state.victory;
    const eliminated = !me.alive;
    const won = !eliminated && !!v && !this.state.keepPlaying;
    const show = eliminated ? !this.endDismissed : won;
    $('endOverlay').hidden = !show;
    if (!show) return;
    const mine = !!v && v.winner === this.human;
    // Round 13: its fanfare (or lament), once per result.
    const key = eliminated ? 'defeated' : `${v?.winner}-${v?.kind}`;
    if (this.endSound !== key) {
      this.endSound = key;
      this.sound.play(mine ? 'victory' : 'defeat');
    }
    let banner: string;
    let title: string;
    let text: string;
    if (eliminated) {
      banner = '💀';
      title = 'Defeated';
      text = `Your empire has fallen on turn ${this.state.turn}: no cities and no units left.`;
    } else if (mine) {
      banner = '🏆';
      title = `${VICTORY_NAMES[v!.kind]} victory!`;
      text = `You won on turn ${v!.turn}: ${victoryHow(v!.kind, true, victoryGoals(this.state.mapSize))}.`;
    } else {
      banner = '🏳️';
      title = 'Defeat';
      const civ = v!.winner;
      text = `${CivName(this.state, civ)} won a ${VICTORY_NAMES[v!.kind].toLowerCase()} victory on turn ${v!.turn}: ${victoryHow(v!.kind, false, victoryGoals(this.state.mapSize))}. The game is theirs.`;
    }
    const face = eliminated || mine ? this.human : v!.winner;
    $('endBanner').innerHTML = `${portraitHtml(this.state.players[face]!.civId, 96)} <span>${banner}</span>`;
    $('endPanel').className = `dialog ${mine ? 'win' : 'lose'}`;
    $('endTitle').textContent = title;
    $('endText').textContent = text;
    const rows = [this.human];
    if (v && v.winner !== this.human) rows.unshift(v.winner);
    $('endStats').innerHTML = `<p class="sub endLevel">${esc(DIFFICULTIES[this.state.difficulty].name)} · ${esc(MAP_SIZES[this.state.mapSize].name)} map · turn ${this.state.turn}</p><table class="stats"><thead><tr><th></th><th>Cities</th><th>Techs</th><th>Wonders</th><th>Culture</th><th>Gold</th></tr></thead>
      <tbody>${rows.map((p) => this.statsRow(p)).join('')}</tbody></table>`;
    $('endCloseBtn').textContent = eliminated ? 'Look at the map' : 'Keep playing';
    // In a dev scenario, "New Game" means going back to the real game.
    $('endNewBtn').textContent = this.opts.scenario ? 'Back to my game' : 'New Game';
  }

  private statsRow(p: number): string {
    const pl = this.state.players[p]!;
    const cities = this.state.cities.filter((c) => c.owner === p);
    const wonders = cities.reduce((n, c) => n + c.wonders.length, 0);
    const name = p === this.human ? 'You' : esc(civDef(this.state, p).name);
    return `<tr><th><span class="swatch" style="background:${playerColor(this.state, p)}"></span> ${name}</th>
      <td>${cities.length}</td><td>${pl.techs.length}</td><td>${wonders}</td><td>${pl.culture}</td><td>${pl.gold}</td></tr>`;
  }

  // ---- your leader (Round 11): bonuses and unique actions -----------------------------------

  /** A unique action the human could take right now (a dot on the leader button). */
  private uniqueReady(): boolean {
    return !pilgrimageError(this.state, this.human) || !dissolutionError(this.state, this.human) || !nationalChurchError(this.state, this.human);
  }

  private openLeader(): void {
    $('leaderOverlay').hidden = false;
    this.renderLeader();
  }

  private handleLeaderClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target === $('leaderOverlay')) {
      $('leaderOverlay').hidden = true;
      return;
    }
    const btn = target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.id === 'leaderCloseBtn') $('leaderOverlay').hidden = true;
    else if (btn.dataset.act === 'pilgrimage' || btn.dataset.act === 'dissolution' || btn.dataset.act === 'nationalChurch') {
      const res = this.dispatchResult({ type: btn.dataset.act });
      if (res.ok && res.message) this.toast(res.message);
    } else if (btn.dataset.act === 'techs') {
      $('leaderOverlay').hidden = true;
      this.openTech();
    }
  }

  private renderLeader(): void {
    const me = this.state.players[this.human]!;
    const def = civDef(this.state, this.human);
    const era = eraIndex(playerEra(me));
    $('leaderTitle').textContent = `${def.leader} of ${def.name}`;
    $('leaderStatus').textContent = `${eraName(playerEra(me))} era · bonuses for later eras switch on when you reach them`;
    const actions: string[] = [];
    if (hasUnique(this.state, this.human, 'pilgrimage') || me.uniquesUsed.includes('pilgrimage')) {
      const err = pilgrimageError(this.state, this.human);
      const R = UNIQUE_RULES.pilgrimage;
      actions.push(`<button type="button" data-act="pilgrimage" ${err ? 'disabled' : ''}>🕌 The Pilgrimage: ${me.gold} gold → ${Math.floor(me.gold * R.culturePerGold)} culture</button>
        <div class="sub">${err ? esc(err) : `Spends all your gold (at least ${R.minGold}); every civ you’ve met thinks better of you. Once per game.`}</div>`);
    }
    if (hasUnique(this.state, this.human, 'dissolution') || me.uniquesUsed.includes('dissolution')) {
      const err = dissolutionError(this.state, this.human);
      actions.push(`<button type="button" data-act="dissolution" ${err ? 'disabled' : ''}>⛪ The Dissolution: +${dissolutionGold(this.state, this.human)} gold</button>
        <div class="sub">${err ? esc(err) : `${UNIQUE_RULES.dissolution.goldPerBuilding} gold per Temple and Cathedral, but their culture is halved for ${UNIQUE_RULES.dissolution.turns} turns. Once per game.`}${me.dissolvedUntil && this.state.turn < me.dissolvedUntil ? ` Halved until turn ${me.dissolvedUntil}.` : ''}</div>`);
    }
    // Round 12: Henry VIII's national church.
    if (hasUnique(this.state, this.human, 'nationalChurch') || me.uniquesUsed.includes('nationalChurch')) {
      const err = nationalChurchError(this.state, this.human);
      actions.push(`<button type="button" data-act="nationalChurch" ${err ? 'disabled' : ''}>👑 Found a national church</button>
        <div class="sub">${err ? esc(err) : 'Your capital becomes the holy city of a faith of your own (you name it), even if others founded theirs first. Needs a Temple. Once per game.'}</div>`);
    }
    if (hasUnique(this.state, this.human, 'challenge')) {
      actions.push(`<button type="button" data-act="techs">⭐ National Challenge: ${me.challenge ? esc(TECHS[me.challenge].name) : 'none named'}</button>
        <div class="sub">Name a tech on the tech screen: +${UNIQUE_RULES.challenge.sciencePct}% science while you research it.</div>`);
    }
    if (hasUnique(this.state, this.human, 'versailles')) actions.push(`<div class="sub">🏰 Versailles: build it in your capital (city panel).</div>`);
    if (hasUnique(this.state, this.human, 'moonshot')) actions.push(`<div class="sub">🌙 Moonshot: ${me.uniquesUsed.includes('moonshot') ? 'done' : 'build it in a city (needs Rocketry)'}.</div>`);
    if (hasUnique(this.state, this.human, 'returnCity')) actions.push(`<div class="sub">🕊️ When you take a city someone else founded, you can give it back that turn.</div>`);
    $('leaderBody').innerHTML = `
      <div class="leaderHead">${portraitHtml(me.civId, 128)}<div>
        <h3>${esc(def.leader)}</h3><div class="sub">${esc(def.name)} · started with ${def.startTech ? esc(TECHS[def.startTech].name) : 'no tech'}</div>
        ${bonusListHtml(me.civId, era)}
      </div></div>
      ${actions.length ? `<div class="label">Unique actions</div><div class="uniqueActions">${actions.join('')}</div>` : ''}`;
  }

  /** Bolívar took a city someone else founded: give it back to them? (only this turn) */
  private queueReturnCity(city: City): void {
    if (this.notices.some((n) => n.returnCityId === city.id)) return;
    const R = UNIQUE_RULES.returnCity;
    this.queueNotice({
      title: 'Return a liberated city?',
      portrait: city.founder,
      text: `${city.name} was founded by ${civName(this.state, city.founder)}. Give it back to them?`,
      sub: `You gain ${R.culture} culture, peace with them, and a grateful friend. Your units there go home. Only this turn.`,
      returnCityId: city.id,
      buttons: [
        { label: 'Keep it', cls: 'bigBtn' },
        {
          label: `Return ${city.name}`,
          cls: 'bigBtn',
          run: () => {
            const res = this.dispatchResult({ type: 'returnCity', cityId: city.id });
            if (res.ok && res.message) this.toast(res.message);
          },
        },
      ],
    });
  }

  // ---- victory progress screen (Milestone 6): who's close to winning? ---------------------

  private openVictory(): void {
    $('victoryOverlay').hidden = false;
    this.renderVictory();
  }

  private closeVictory(): void {
    $('victoryOverlay').hidden = true;
  }

  private handleVictoryClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target === $('victoryOverlay')) {
      this.closeVictory();
      return;
    }
    const btn = target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.id === 'victoryCloseBtn') this.closeVictory();
    else if (btn.dataset.act === 'launch') {
      const logStart = this.state.log.length;
      if (this.dispatch({ type: 'launchSpaceship' })) this.announce(this.state.log.slice(logStart));
    }
  }

  private renderVictory(): void {
    const v = this.state.victory;
    $('victoryStatus').textContent = v
      ? `${v.winner === this.human ? 'You' : CivName(this.state, v.winner)} won a ${VICTORY_NAMES[v.kind].toLowerCase()} victory on turn ${v.turn}${this.state.keepPlaying ? '; you kept playing' : ''}.`
      : `Turn ${this.state.turn}. The first civ to reach any one of these wins.`;
    // Round 13: the level and map this game is played at.
    $('victoryStatus').textContent += ` · ${DIFFICULTIES[this.state.difficulty].name} · ${MAP_SIZES[this.state.mapSize].name} map`;
    const body = $('victoryBody');
    const scroll = body.scrollTop;
    const order = [this.human, ...this.state.players.filter((p) => p.kind !== 'barbarian').map((p) => p.id).filter((p) => p !== this.human)];
    const cards = order.map((p) => this.victoryCard(p)).join('');
    const S = VICTORY.spaceship;
    const rules = `<div class="vrules">
      <div><b>Domination</b> <span class="sub">Hold every rival's original capital (★). Wiping a civ out counts too.</span></div>
      <div><b>Culture</b> <span class="sub">Reach ${victoryGoals(this.state.mapSize).culture} culture (Temples and wonders), then build the ${WONDERS.world_council.name}.</span></div>
      <div><b>Economic</b> <span class="sub">Have ${victoryGoals(this.state.mapSize).gold} gold, then build the ${WONDERS.global_exchange.name} (with production; keep the gold until it's done).</span></div>
      <div><b>Technology</b> <span class="sub">Learn Space Flight, build ${S.parts} spaceship parts in your capital, launch, and hold your capital for ${S.travelTurns} turns until it arrives.</span></div>
    </div>`;
    const wonders = WONDER_LIST.map((w) => {
      const city = wonderCity(this.state, w.id);
      const met = city && (city.owner === this.human || hasMet(this.state, this.human, city.owner));
      const where = !city
        ? '<span class="sub">Not built yet</span>'
        : met
          ? `<span class="swatch" style="background:${playerColor(this.state, city.owner)}"></span> ${city.owner === this.human ? 'You' : esc(civDef(this.state, city.owner).name)} · ${esc(city.name)}`
          : '<span class="sub">A civ you haven’t met</span>';
      return `<li><b>${w.name}</b> <span class="sub">${TECHS[w.requires].name}${w.victory ? ' · wins the game' : ''}</span><span class="wwhere">${where}</span></li>`;
    }).join('');
    body.innerHTML = `${rules}<div class="vcards">${cards}</div>
      <div class="label">Wonders of the world</div><ul class="wonderList">${wonders}</ul>`;
    body.scrollTop = scroll;
  }

  /** One civ's progress toward all four victories; unmet civs show as unknown. */
  private victoryCard(p: number): string {
    const pl = this.state.players[p]!;
    const me = p === this.human;
    const def = civDef(this.state, p);
    const head = `<div class="vhead">${portraitHtml(pl.civId, 36)}<span class="swatch" style="background:${playerColor(this.state, p)}"></span>
      <b>${me ? `You (${esc(def.name)})` : esc(def.name)}</b>`;
    if (!me && !hasMet(this.state, this.human, p)) {
      return `<div class="vcard unknown"><div class="vhead"><span class="swatch unknownSwatch"></span><b>Unknown civ</b></div>
        <div class="sub">You haven’t met them yet.</div></div>`;
    }
    if (!pl.alive) return `<div class="vcard out">${head}<span class="sub">Eliminated</span></div></div>`;
    const g: VictoryProgress = victoryProgress(this.state, p);
    const capital = capitalOf(this.state, p);
    const S = VICTORY.spaceship;
    let space: string;
    if (g.space.arrivesTurn !== null) space = `<b class="hot">Launched: arrives on turn ${g.space.arrivesTurn}</b>`;
    else if (g.space.parts > 0) space = `Building: ${g.space.parts}/${S.parts} parts`;
    else if (hasTech(pl, S.requires)) space = 'Space Flight known · not started';
    else space = `Not started · ${g.techs}/${TECH_LIST.length} techs`;
    const launch = me && !launchError(this.state, p) ? '<button type="button" data-act="launch" class="launchBtn">🚀 Launch spaceship</button>' : '';
    const building = (on: boolean, what: string) => (on ? ` · <b class="hot">building the ${what}</b>` : '');
    const row = (label: string, value: string, pct: number) => `<div class="vrow"><span class="vlabel">${label}</span>
      <span class="vval">${value}</span>${bar(pct, 100, 'vbar')}</div>`;
    return `<div class="vcard${me ? ' me' : ''}">${head}${!capital ? ' <span class="sub">· capital lost</span>' : ''}</div>
      ${row('Domination', `${g.capitals.held}/${g.capitals.of} rival capitals`, (g.capitals.held / Math.max(1, g.capitals.of)) * 100)}
      ${row('Culture', `${g.culture}/${victoryGoals(this.state.mapSize).culture} <span class="sub">(+${g.culturePerTurn}/turn)</span>${building(g.buildingWonder.culture, WONDERS.world_council.name)}${me ? ` <span class="sub">· next Great Person in ${cultureToNextGreatPerson(this.state, p)} culture</span>` : ''}`, (g.culture / victoryGoals(this.state.mapSize).culture) * 100)}
      ${row('Economic', `${g.gold}/${victoryGoals(this.state.mapSize).gold} gold${building(g.buildingWonder.economic, WONDERS.global_exchange.name)}`, (g.gold / victoryGoals(this.state.mapSize).gold) * 100)}
      ${row('Technology', space, g.space.arrivesTurn !== null ? 100 : (g.space.parts / S.parts) * 100)}
      ${launch}</div>`;
  }

  // ---- tech screen ---------------------------------------------------------------------

  /** Opens the tech screen. `prompt` is shown above the status line (e.g. after learning a tech). */
  private openTech(prompt?: string): void {
    const me = this.state.players[this.human]!;
    this.techSelected = me.researching ?? availableTechs(me)[0] ?? this.techSelected;
    this.techPrompt = prompt;
    $('techOverlay').hidden = false;
    this.renderTech();
    // Bring the highlighted tech into view in the tree.
    $('techTree').querySelector('.tech.sel')?.scrollIntoView({ block: 'center' });
  }

  private closeTech(): void {
    $('techOverlay').hidden = true;
  }

  private handleTechClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    // Tapping the dimmed backdrop closes the screen.
    if (target === $('techOverlay')) {
      this.closeTech();
      return;
    }
    const btn = target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.card) {
      this.openAlmanac(btn.dataset.card);
    } else if (btn.id === 'techCloseBtn') {
      this.closeTech();
    } else if (btn.dataset.tech) {
      this.techSelected = btn.dataset.tech as TechId;
      this.renderTech();
    } else if (btn.dataset.act === 'challenge' && this.techSelected) {
      const res = this.dispatchResult({ type: 'setChallenge', tech: this.techSelected });
      if (res.ok && res.message) this.toast(res.message);
    } else if (btn.dataset.act === 'research' && this.techSelected) {
      const tech = this.techSelected;
      if (this.dispatch({ type: 'setResearch', tech })) {
        this.toast(`Researching ${TECHS[tech].name}`);
        this.closeTech();
      }
    }
  }

  private techStatus(tech: TechId): 'known' | 'current' | 'available' | 'locked' {
    const me = this.state.players[this.human]!;
    if (knows(me, tech)) return 'known';
    if (me.researching === tech) return 'current';
    return researchError(me, tech) ? 'locked' : 'available';
  }

  private renderTech(): void {
    const me = this.state.players[this.human]!;
    const income = empireIncome(this.state, this.human).science;
    const current = me.researching;
    const status = current
      ? `Researching ${TECHS[current].name}: ${Math.min(me.science, techCost(this.state, this.human, current))}/${techCost(this.state, this.human, current)} · +${income} science per turn`
      : `Nothing being researched${me.science > 0 ? ` · ${me.science} science banked` : ''} · +${income} per turn`;
    $('techStatus').innerHTML = this.techPrompt
      ? `<b class="prompt">${esc(this.techPrompt)}</b><br>${esc(status)}`
      : esc(status);

    const treeEl = $('techTree');
    const scrollTop = treeEl.scrollTop;
    treeEl.innerHTML = ERAS.map((era) => {
      const techs = TECH_LIST.filter((t) => t.era === era.id);
      const known = techs.filter((t) => knows(me, t.id)).length;
      const btns = techs
        .map((t) => {
          const st = this.techStatus(t.id);
          let meta: string;
          if (st === 'known') meta = '✓ Known';
          else if (st === 'locked') meta = 'Locked';
          else {
            const turns = turnsToLearn(this.state, this.human, t.id);
            meta = `${st === 'current' ? 'Researching · ' : ''}${turns === undefined ? '—' : plural(turns, 'turn')}`;
          }
          const sel = t.id === this.techSelected ? ' sel' : '';
          return `<button type="button" class="tech ${st}${sel}" data-tech="${t.id}">
            <span class="tname">${t.name}</span><span class="tmeta">${meta}</span></button>`;
        })
        .join('');
      return `<div class="era"><h3>${era.name} <span class="sub">${known}/${techs.length} known</span></h3>
        <div class="techGrid">${btns}</div></div>`;
    }).join('');
    treeEl.scrollTop = scrollTop;

    $('techDetail').innerHTML = this.techSelected ? this.techDetailHtml(this.techSelected) : '';
  }

  private techDetailHtml(tech: TechId): string {
    const me = this.state.players[this.human]!;
    const def = TECHS[tech];
    const st = this.techStatus(tech);
    const cost = techCost(this.state, this.human, tech);
    const turns = turnsToLearn(this.state, this.human, tech);
    const stateText =
      st === 'known' ? 'Known' : st === 'current' ? 'Researching now' : st === 'available' ? 'Available' : 'Locked';

    const prereqs = def.prereqs.length
      ? def.prereqs
          .map((p) => `<span class="${knows(me, p) ? 'have' : 'need'}">${knows(me, p) ? '✓' : '✗'} ${TECHS[p].name}</span>`)
          .join(' ')
      : '<span class="sub">None</span>';

    const u = techUnlocks(tech);
    const unlockParts = [
      ...u.buildings.map((b) => `<li><b>${cardLink(`building:${b}`, BUILDINGS[b].name)}</b> <span class="sub">building · ${BUILDINGS[b].summary}</span></li>`),
      ...u.units.map((id) => `<li>${this.badge(id, this.human)}<b>${cardLink(`unit:${id}`, UNITS[id].name)}</b> <span class="sub">unit · ${unitSummary(id)}</span></li>`),
      ...u.wonders.map((w) => `<li><b>${cardLink(`wonder:${w.id}`, w.name)}</b> <span class="sub">wonder · ${w.summary}</span></li>`),
    ];
    const unlocks = unlockParts.length
      ? `<ul>${unlockParts.join('')}</ul>`
      : '<div class="sub">Nothing to build yet; its uses come in later milestones.</div>';
    const leads = techLeadsTo(tech).map((t) => TECHS[t].name).join(', ');

    let action = '';
    if (st === 'available') {
      action = `<button type="button" data-act="research" class="researchBtn">Research this${turns === undefined ? '' : ` · ${plural(turns, 'turn')}`}</button>`;
    } else if (st === 'current') {
      action = `<div class="sub">Being researched${turns === undefined ? '' : `, ${plural(turns, 'turn')} left`}.</div>`;
    } else if (st === 'locked') {
      action = `<div class="sub">${esc(researchError(me, tech) ?? '')}</div>`;
    }
    // Round 11: JFK's National Challenge.
    if (hasUnique(this.state, this.human, 'challenge') && st !== 'known') {
      action += me.challenge === tech
        ? `<div class="sub">⭐ National Challenge: +${UNIQUE_RULES.challenge.sciencePct}% science while you research it.</div>`
        : `<button type="button" data-act="challenge" ${challengeError(this.state, this.human, tech) ? 'disabled' : ''}>⭐ Make it the National Challenge</button>
           ${me.challenge ? `<div class="sub">The current challenge is ${esc(TECHS[me.challenge].name)}; a new one once it’s learned.</div>` : ''}`;
    }

    return `
      <h3>${def.name} ${cardLink(`tech:${tech}`, 'Almanac ›')}</h3>
      <div class="sub">${eraName(def.era)} era · ${stateText}${st === 'known' ? '' : ` · cost ${cost}`}</div>
      <p>${def.description}</p>
      ${action}
      <div class="label">Requires</div><div class="prereqs">${prereqs}</div>
      <div class="label">Unlocks</div>${unlocks}
      ${leads ? `<div class="label">Leads to</div><div class="sub">${leads}</div>` : ''}
    `;
  }

  // ---- notices (first contact, war declared on you, AI offers) ----------------------------

  private queueNotice(n: Notice): void {
    this.notices.push(n);
    if (this.notices.length === 1) this.showNotice();
  }

  private queueContact(civ: number): void {
    const def = civDef(this.state, civ);
    this.queueNotice({
      title: 'First contact',
      portrait: civ,
      text: `You have met ${civName(this.state, civ)}, led by ${def.leader}.`,
      sub: 'You are at peace. Open Diplomacy to see them, trade techs, or declare war.',
      buttons: [
        { label: 'Diplomacy', run: () => this.openDiplo(civ) },
        { label: 'OK', cls: 'bigBtn' },
      ],
    });
  }

  private queueOffer(o: Offer): void {
    if (this.notices.some((n) => n.offerId === o.id)) return;
    const acceptErr = offerAcceptError(this.state, o);
    const peace = o.kind === 'peace';
    this.queueNotice({
      title: peace ? 'Peace offer' : 'Tribute demanded',
      portrait: o.from,
      text: offerText(this.state, o),
      sub: peace
        ? 'Accept to end the war now; your treaty then holds for a while.'
        : `Give it, or refuse${acceptErr ? ` (${acceptErr})` : ''}. Refusing makes ${civDef(this.state, o.from).leader} angrier, and war more likely.`,
      offerId: o.id,
      dismissible: false,
      buttons: [
        { label: 'Refuse', cls: 'bigBtn', run: () => this.answerOffer(o.id, false) },
        {
          label: peace ? 'Accept peace' : 'Give',
          cls: 'bigBtn',
          disabled: !!acceptErr,
          run: () => this.answerOffer(o.id, true),
        },
      ],
    });
  }

  /** Shows `n` right away, ahead of anything else waiting. */
  private showNow(n: Notice): void {
    this.notices.unshift(n);
    this.showNotice();
  }

  // ---- Round 9: villages, artifacts, Great People ------------------------------------------

  private queueVillage(v: Village): void {
    if (this.notices.some((n) => n.villageId === v.id)) return;
    const unit = unitsOnTile(this.state, v.x, v.y).find((u) => u.owner === this.human);
    const err = settleVillageError(this.state, v);
    const close = this.state.cities.some((c) => distance(c, v) < RULES.minCityDistance);
    const name = cityNameFor(this.state, this.human);
    this.queueNotice({
      title: 'Barbarian village taken',
      icon: MAP_ICONS.village,
      text: `Your ${unit ? UNITS[unit.type].name : 'unit'} took the village. Destroy it for a reward, or settle it as a new city?`,
      sub:
        `Destroy: a random reward (usually gold), and anything hidden under it comes to light. ` +
        `Settle: it becomes ${name}, a size 1 city.${close ? ' It’s closer to another city than a Settler could found, which is allowed for a village.' : ''} ` +
        'Either way, your people may dig up an ancient artifact.',
      villageId: v.id,
      dismissible: false,
      buttons: [
        { label: 'Destroy it', cls: 'bigBtn', run: () => this.chooseVillage(v.id, 'destroy') },
        { label: `Settle ${name}`, cls: 'bigBtn', disabled: !!err, run: () => this.chooseVillage(v.id, 'settle') },
      ],
    });
  }

  private chooseVillage(villageId: number, choice: 'destroy' | 'settle'): void {
    const res = this.dispatchResult({ type: 'chooseVillage', villageId, choice });
    const o = res.village;
    if (!o) return;
    if (o.choice === 'settle') {
      const city = o.cityId !== undefined ? findCity(this.state, o.cityId) : undefined;
      if (city) {
        this.toast(`The village is now ${city.name}`);
        this.openCity(city.id);
      }
    } else {
      const res2 = o.revealed ? RESOURCES[o.revealed] : undefined;
      this.showNow({
        title: 'Village destroyed',
        icon: MAP_ICONS.village,
        text: `Your people found ${o.reward}.`,
        sub: res2 ? `There was ${res2.name} under the village (${bonusText(res2.bonus)} when a city works it).` : undefined,
        buttons: [{ label: 'OK', cls: 'bigBtn' }],
      });
    }
    if (o.artifact) {
      const techs = o.artifact.techs.map((t) => TECHS[t].name);
      this.queueNotice({
        title: 'Ancient artifact!',
        icon: MAP_ICONS.artifact,
        iconCls: 'artifact',
        text: `Digging through the village, your people found the ${o.artifact.name}.`,
        sub: `It taught you ${techs.length === 1 ? techs[0] : `${techs.slice(0, -1).join(', ')} and ${techs[techs.length - 1]}`}.`,
        buttons: [
          { label: 'Tech tree', run: () => this.openTech() },
          { label: 'OK', cls: 'bigBtn' },
        ],
      });
    }
  }

  /** What using this Great Person once would do, in words. */
  private gpUseText(gp: GreatPerson): string {
    const me = this.state.players[this.human]!;
    switch (gp.kind) {
      case 'scientist':
        return me.researching ? `learn ${TECHS[me.researching].name} at once` : 'learn a tech you could research, at once';
      case 'artist':
        return `+${GREAT_PEOPLE_RULES.artistCultureBurst} culture at once`;
      case 'merchant':
        return `+${merchantGold(this.state, this.human)} gold at once`;
      case 'engineer':
        return 'finish the wonder or building one city is making';
      case 'general':
        return 'make every unit on one tile a veteran';
    }
  }

  private queueGreatPerson(gp: GreatPerson): void {
    if (this.notices.some((n) => n.gpId === gp.id)) return;
    this.queueNotice(this.greatPersonNotice(gp));
  }

  private greatPersonNotice(gp: GreatPerson): Notice {
    const def = GREAT_PEOPLE[gp.kind];
    const needsTarget = gp.kind === 'engineer' || gp.kind === 'general';
    const noTarget =
      gp.kind === 'engineer' && engineerCities(this.state, this.human).length === 0
        ? 'No city is making a wonder or a building'
        : gp.kind === 'general' && generalTiles(this.state, this.human).length === 0
          ? 'You have no units to train'
          : !needsTarget
            ? greatPersonError(this.state, gp, { mode: 'use' })
            : undefined;
    return {
      title: `${def.name}: ${gp.name}`,
      icon: def.icon,
      iconCls: 'gp',
      text: `${gp.name}, a ${def.name}, has joined your empire. Settle them in a city for good, or use them once.`,
      sub: `Settle: ${def.settleText}. Use now: ${this.gpUseText(gp)}.${noTarget ? ` (${noTarget}.)` : ''}`,
      gpId: gp.id,
      buttons: [
        { label: 'Decide later', run: () => this.gpLater.add(gp.id) },
        // Round 12: a Great Artist can bring your faith to a city instead.
        ...(gp.kind === 'artist' && artistConvertTargets(this.state, this.human).length
          ? [{ label: `Convert a city to ${ownReligion(this.state, this.human)!.name}…`, run: () => this.pickGreatPersonTarget(gp, 'convert') }]
          : []),
        { label: 'Settle in a city…', cls: 'bigBtn', run: () => this.pickGreatPersonTarget(gp, 'settle') },
        { label: 'Use now', cls: 'bigBtn', disabled: !!noTarget, run: () => (needsTarget ? this.pickGreatPersonTarget(gp, 'use') : this.useGreatPerson(gp, { mode: 'use' })) },
      ],
    };
  }

  /** A list of cities (settle, or an Engineer) or tiles (a General) to choose from. */
  private pickGreatPersonTarget(gp: GreatPerson, mode: 'settle' | 'use' | 'convert'): void {
    const back = { label: '← Back', run: () => this.showNow(this.greatPersonNotice(gp)) };
    const def = GREAT_PEOPLE[gp.kind];
    if (mode === 'convert') {
      const faith = ownReligion(this.state, this.human);
      this.showNow({
        title: `${gp.name}: convert which city?`,
        icon: def.icon,
        iconCls: 'gp',
        text: `The city will follow ${faith?.name ?? 'your faith'}. A rival's city (at peace with you) also brings its founder gold and culture.`,
        gpId: gp.id,
        list: true,
        buttons: [
          ...artistConvertTargets(this.state, this.human).map((c) => ({
            label: `${c.name}${c.owner === this.human ? '' : ` (${civDef(this.state, c.owner).name})`}${c.religion !== null ? ` · now ${religionById(this.state, c.religion)?.name ?? ''}` : ''}`,
            run: () => {
              const res = this.dispatchResult({ type: 'useGreatPerson', gpId: gp.id, how: { mode: 'convert', cityId: c.id } });
              if (res.ok && res.message) this.toast(res.message);
            },
          })),
          back,
        ],
      });
      return;
    }
    if (mode === 'use' && gp.kind === 'general') {
      const tiles = generalTiles(this.state, this.human);
      this.showNow({
        title: `${gp.name}: train which units?`,
        icon: def.icon,
        iconCls: 'gp',
        text: 'Every unit on the tile you pick becomes a veteran (+50% in combat).',
        gpId: gp.id,
        list: true,
        buttons: [
          ...tiles.map((c) => {
            const units = unitsOnTile(this.state, c.x, c.y).filter((u) => u.owner === this.human);
            const city = this.state.cities.find((x) => x.x === c.x && x.y === c.y);
            const near = city ?? [...this.myCities()].sort((a, b) => distance(a, c) - distance(b, c))[0];
            const where = city ? city.name : near ? `near ${near.name}` : `at ${c.x},${c.y}`;
            return { label: `${where}: ${stackLabel(units)}`, run: () => this.useGreatPerson(gp, { mode: 'use', at: c }) };
          }),
          back,
        ],
      });
      return;
    }
    const cities = mode === 'use' ? engineerCities(this.state, this.human) : this.myCities();
    this.showNow({
      title: mode === 'settle' ? `Settle ${gp.name} where?` : `${gp.name}: finish what?`,
      icon: def.icon,
      iconCls: 'gp',
      text: mode === 'settle' ? `${def.settleText}, for good.` : 'The city finishes what it is making at the end of this turn.',
      gpId: gp.id,
      list: true,
      buttons: [
        ...cities.map((c) => ({
          label: mode === 'settle' ? c.name : `${c.name}: ${c.build ? itemName(c.build) : ''}`,
          run: () => this.useGreatPerson(gp, mode === 'settle' ? { mode: 'settle', cityId: c.id } : { mode: 'use', cityId: c.id }),
        })),
        back,
      ],
    });
  }

  private useGreatPerson(gp: GreatPerson, how: { mode: 'settle'; cityId: number } | { mode: 'use'; cityId?: number; at?: Coord }): void {
    const res = this.dispatchResult({ type: 'useGreatPerson', gpId: gp.id, how });
    if (res.ok && res.message) this.toast(res.message);
  }

  private answerOffer(offerId: number, accept: boolean): void {
    const res = this.dispatchResult({ type: 'answerOffer', offerId, accept });
    if (res.answer) this.toast(res.answer.reason, !res.answer.accepted);
  }

  private showNotice(): void {
    const n = this.notices[0];
    // Round 13: they wait while the main menu is up.
    $('noticeOverlay').hidden = !n || !$('mainMenu').hidden;
    if (!n) return;
    const portrait = n.portrait !== undefined ? portraitHtml(this.state.players[n.portrait]?.civId ?? '', 64) : '';
    $('noticeTitle').innerHTML = `${portrait}${n.icon ? `<span class="micon ${n.iconCls ?? ''}">${iconHtml(n.icon, '')}</span>` : ''}${esc(n.title)}`;
    $('noticeText').innerHTML = `${esc(n.text)}${n.sub ? `<span class="sub">${esc(n.sub)}</span>` : ''}${
      n.input ? `<input id="noticeInput" type="text" maxlength="${n.input.max}" value="${esc(n.input.value)}" aria-label="${esc(n.input.label)}" autocomplete="off" autocapitalize="words" spellcheck="false">` : ''
    }`;
    // A long list of choices (cities, tiles) stacks up and scrolls.
    $('noticeButtons').className = n.list ? 'row list scroll' : 'row';
    $('noticeButtons').innerHTML = n.buttons
      .map((b, i) => `<button type="button" data-i="${i}" class="${b.cls ?? ''}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`)
      .join('');
  }

  private closeNotice(): void {
    this.notices.shift();
    this.showNotice();
  }

  private handleNoticeClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest('button');
    const n = this.notices[0];
    if (!btn || btn.disabled || !n) return;
    const b = n.buttons[Number(btn.dataset.i)];
    const input = document.getElementById('noticeInput') as HTMLInputElement | null;
    const value = input?.value;
    if (b?.stay) {
      b.run?.(value);
      return;
    }
    this.closeNotice();
    b?.run?.(value);
  }

  // ---- Round 12: religion ---------------------------------------------------------------------

  /** The naming panel for a religion you just founded: type a name, or tap Suggest. */
  private queueNameReligion(r: Religion): void {
    if (this.notices.some((n) => n.religionId === r.id)) return;
    this.queueNotice(this.nameReligionNotice(r, r.name));
  }

  private nameReligionNotice(r: Religion, value: string): Notice {
    const city = holyCity(this.state, r);
    let n = 0;
    return {
      title: r.tech ? 'A new religion!' : 'A national church!',
      text: r.tech
        ? `Your people in ${city?.name ?? 'your city'} have founded a faith of their own. What is it called?`
        : `The King's new church in ${city?.name ?? 'your capital'} needs a name. (Something grander than “the King's church”, perhaps.)`,
      sub: `${city?.name ?? 'The city'} is its holy city: +${RELIGION.holyCity.culture} culture and +${RELIGION.holyCity.gold} gold a turn, and more gold for every city that follows it. Missionaries and nearby cities spread it.`,
      religionId: r.id,
      dismissible: false,
      input: { value, max: RELIGION.maxNameLength, label: 'Name of your religion' },
      buttons: [
        {
          label: 'Suggest',
          stay: true,
          run: () => {
            const input = document.getElementById('noticeInput') as HTMLInputElement | null;
            if (input) input.value = suggestReligionName(this.state, ++n);
          },
        },
        {
          label: 'Found it',
          cls: 'bigBtn',
          run: (name) => {
            const res = this.dispatchResult({ type: 'nameReligion', religionId: r.id, name: name ?? '' });
            if (res.ok) this.toast(`${religionById(this.state, r.id)!.name} is founded in ${city?.name ?? 'your city'}`);
            else this.showNow(this.nameReligionNotice(r, name ?? r.name));
          },
        },
      ],
    };
  }

  /** A Missionary converts a city next to (or under) it. */
  private spreadReligion(unitId: number, cityId: number): void {
    const res = this.dispatchResult({ type: 'spreadReligion', unitId, cityId });
    if (res.ok) {
      if (res.message) this.toast(res.message);
      if (!findUnit(this.state, unitId) || findUnit(this.state, unitId)!.movesLeft <= 0) this.selectNext(false);
    }
  }

  private openReligion(): void {
    $('religionOverlay').hidden = false;
    this.renderReligion();
  }

  /** The Religion screen: every religion founded, its founder, holy city, followers, and whether it's yours. */
  private renderReligion(): void {
    const st = this.state;
    const R = RELIGION;
    const known = (c: City) => st.players[this.human]!.explored[c.y * st.map.width + c.x] === 1;
    const who = (p: number) => (p === this.human ? 'You' : p === undefined ? '' : hasMet(st, this.human, p) ? esc(CivName(st, p)) : 'A civ you haven’t met');
    const mineFaith = ownReligion(st, this.human);
    $('religionStatus').textContent = `${plural(st.religions.length, 'religion')} founded · ${st.cities.filter((c) => c.religion !== null).length} of ${st.cities.length} cities follow one`;
    const cards = st.religions
      .map((r) => {
        const city = holyCity(st, r);
        const followers = followerCities(st, r);
        const mineCount = followers.filter((c) => c.owner === this.human).length;
        const yours = r.founder === this.human || city?.owner === this.human;
        const holyText = city ? (known(city) ? `${esc(city.name)} <span class="sub">(${who(city.owner)})</span>` : 'Somewhere you haven’t explored') : 'Gone';
        return `<div class="rcard${yours ? ' mine' : ''}">
          <div class="rhead">${religionDot(r, true)}<b>${esc(r.name)}</b>${yours ? ' <span class="badge peace">Yours</span>' : ''}</div>
          <dl>
            <dt>Founded</dt><dd>${who(r.founder)} · turn ${r.foundedTurn}${r.tech ? ` · ${TECHS[r.tech].name}` : ' · a national church'}</dd>
            <dt>Holy city</dt><dd>${holyText}</dd>
            <dt>Followers</dt><dd>${followers.length} ${followers.length === 1 ? 'city' : 'cities'}${mineCount ? ` · ${mineCount} of yours` : ''}</dd>
            ${mineFaith?.id === r.id ? '<dt>Your faith</dt><dd>Your capital follows it</dd>' : ''}
          </dl></div>`;
      })
      .join('');
    const open = FOUNDING_TECHS.filter((t) => !st.religions.some((r) => r.tech === t) && !st.religionTechsLapsed.includes(t));
    const lapsed = st.religionTechsLapsed.map((t) => TECHS[t].name);
    const rules = `<div class="vrules">
      <div><b>Founding</b> <span class="sub">The first civ to learn ${FOUNDING_TECHS.map((t) => TECHS[t].name).join(', ')} founds a religion (${R.maxReligions} at most) in its capital, the holy city.</span></div>
      <div><b>Spreading</b> <span class="sub">Cities near a city of a religion may convert each turn (closer, bigger, holy, Temples, Cathedrals, and roads help). A Missionary (${R.missionaryCharges} spreads) or a Great Artist converts a city at once. Holy cities never change faith.</span></div>
      <div><b>Holy city</b> <span class="sub">+${R.holyCity.culture} culture, +${R.holyCity.gold} gold, and +${R.holyCity.goldPerFollower} gold per follower city (up to +${R.holyCity.maxFollowerGold}), for whoever holds it.</span></div>
      <div><b>Followers</b> <span class="sub">A Temple makes +${R.followerCulture.temple} culture and a Cathedral +${R.followerCulture.cathedral} in a city that follows any religion. Capitals of the same faith: +${R.sharedFaithOpinion} opinion; different faiths −${Math.abs(R.differentFaithOpinion)}.</span></div>
    </div>`;
    const still = open.length ? `<p class="sub">Still to be founded: ${open.map((t) => TECHS[t].name).join(', ')}.</p>` : '<p class="sub">Every founding tech has been used.</p>';
    const gone = lapsed.length ? `<p class="sub">Known before religions came (no religion from them): ${lapsed.join(', ')}.</p>` : '';
    $('religionBody').innerHTML = `${rules}
      <div class="label">Religions of the world</div>
      ${cards ? `<div class="rcards">${cards}</div>` : '<p class="sub">No religion has been founded yet.</p>'}
      ${still}${gone}
      <p class="sub">No religious victory: faith feeds culture, gold, and friendships.</p>`;
  }

  // ---- diplomacy screen ------------------------------------------------------------------

  private openDiplo(civ?: number): void {
    const met = metCivs(this.state, this.human);
    this.diploCiv = civ ?? (this.diploCiv !== undefined && met.includes(this.diploCiv) ? this.diploCiv : met[0]);
    this.diploPage = 'main';
    this.tradeGet = undefined;
    this.diploAnswer = undefined;
    $('diploOverlay').hidden = false;
    this.renderDiplo();
  }

  private closeDiplo(): void {
    $('diploOverlay').hidden = true;
  }

  private handleDiploClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target === $('diploOverlay')) {
      this.closeDiplo();
      return;
    }
    const btn = target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.id === 'diploCloseBtn') {
      this.closeDiplo();
      return;
    }
    const civ = this.diploCiv;
    const d = btn.dataset;
    if (d.civ !== undefined) {
      this.diploCiv = Number(d.civ);
      this.diploPage = 'main';
      this.tradeGet = undefined;
      this.diploAnswer = undefined;
    } else if (civ === undefined) {
      return;
    } else if (d.act === 'war') {
      this.diploPage = 'confirmWar';
    } else if (d.act === 'warYes') {
      this.diploPage = 'main';
      if (this.dispatch({ type: 'declareWar', target: civ })) {
        this.diploAnswer = { civ, accepted: true, reason: `You are at war with ${civName(this.state, civ)}.` };
      }
    } else if (d.act === 'religions') {
      this.closeDiplo();
      this.openReligion();
      return;
    } else if (d.act === 'back') {
      this.diploPage = 'main';
      this.tradeGet = undefined;
    } else if (d.act === 'peace') {
      this.showAnswer(civ, this.dispatchResult({ type: 'proposePeace', target: civ }));
    } else if (d.act === 'trade') {
      this.diploPage = 'trade';
      this.tradeGet = undefined;
      this.diploAnswer = undefined;
    } else if (d.get) {
      this.tradeGet = d.get as TechId;
    } else if (d.act === 'buy' && this.tradeGet) {
      this.finishTrade(civ, this.dispatchResult({ type: 'tradeTech', partner: civ, get: this.tradeGet, give: null }));
    } else if (d.give && this.tradeGet) {
      this.finishTrade(civ, this.dispatchResult({ type: 'tradeTech', partner: civ, get: this.tradeGet, give: d.give as TechId }));
    } else if (d.gold) {
      this.showAnswer(civ, this.dispatchResult({ type: 'giveGold', target: civ, amount: Number(d.gold) }));
    }
    this.renderDiplo();
  }

  private showAnswer(civ: number, res: ActionResult): void {
    if (res.answer) this.diploAnswer = { civ, ...res.answer };
  }

  private finishTrade(civ: number, res: ActionResult): void {
    this.showAnswer(civ, res);
    if (res.answer?.accepted) {
      this.diploPage = 'main';
      this.tradeGet = undefined;
    }
  }

  private renderDiplo(): void {
    const met = metCivs(this.state, this.human);
    if (this.diploCiv !== undefined && !met.includes(this.diploCiv)) this.diploCiv = met[0];
    $('diploStatus').textContent = met.length
      ? `You have met ${plural(met.length, 'civ')} of ${this.state.players.filter((p) => p.kind !== 'barbarian').length - 1}.`
      : '';
    const listEl = $('diploList');
    const scroll = listEl.scrollTop;
    listEl.innerHTML = met.length
      ? met
          .map((c) => {
            const def = civDef(this.state, c);
            const war = atWar(this.state, this.human, c);
            const att = attitude(this.state, c, this.human);
            return `<button type="button" data-civ="${c}" class="civRow ${c === this.diploCiv ? 'sel' : ''}">
              ${portraitHtml(this.state.players[c]!.civId, 40, 'dcivPortrait')}
              <span class="cname">${esc(def.name)}</span>
              <span class="badge ${war ? 'war' : 'peace'}">${war ? 'War' : 'Peace'}</span>
              <span class="cmeta">${esc(def.leader)} · <span class="att-${att}">${ATTITUDE_LABEL[att]}</span></span></button>`;
          })
          .join('')
      : '<p class="sub">You haven’t met anyone yet. Explore: civs meet when one sees the other’s units or cities.</p>';
    listEl.scrollTop = scroll;
    $('diploDetail').innerHTML = this.diploCiv === undefined ? '' : this.diploDetailHtml(this.diploCiv);
  }

  private diploDetailHtml(civ: number): string {
    const me = this.state.players[this.human]!;
    const def = civDef(this.state, civ);
    const name = esc(def.name);
    const inText = esc(civName(this.state, civ));
    const Start = esc(CivName(this.state, civ));
    const war = atWar(this.state, this.human, civ);
    const att = attitude(this.state, civ, this.human);
    const start = this.state.diplomacy.warStart[this.human]?.[civ];
    const lock = treatyLockedUntil(this.state, this.human, civ);
    const relation = war
      ? `At war${start !== null && start !== undefined ? ` since turn ${start}` : ''}`
      : `At peace${lock !== undefined ? ` · treaty holds until turn ${lock}` : ''}`;
    const cities = this.state.cities.filter((c) => c.owner === civ).length;
    const answer =
      this.diploAnswer && this.diploAnswer.civ === civ
        ? `<div class="answer ${this.diploAnswer.accepted ? 'yes' : 'no'}">${this.diploAnswer.accepted ? '✓' : '✗'} ${esc(this.diploAnswer.reason)}</div>`
        : '';
    const head = `
      <div class="leaderHead">${portraitHtml(this.state.players[civ]!.civId, 96)}<div>
      <h3><span class="swatch" style="background:${playerColor(this.state, civ)}"></span> ${name}</h3>
      <div class="sub">Led by ${esc(def.leader)}</div>
      <details><summary class="sub">Their leader bonuses</summary>${bonusListHtml(this.state.players[civ]!.civId, eraIndex(playerEra(this.state.players[civ]!)))}</details></div></div>
      <dl class="facts">
        <dt>Relation</dt><dd>${relation}</dd>
        <dt>Attitude</dt><dd class="att-${att}">${ATTITUDE_LABEL[att]}</dd>
        <dt>Cities</dt><dd>${cities}</dd>
        <dt>Military</dt><dd>${strengthWords(strengthRatio(this.state, civ, this.human))}</dd>
        <dt>Culture</dt><dd>${this.state.players[civ]!.culture} <span class="sub">(+${empireCulture(this.state, civ)} per turn)</span></dd>
        <dt>Faith</dt><dd>${this.faithWords(civ)}</dd>
      </dl>${answer}`;

    if (this.diploPage === 'confirmWar') {
      return `${head}
        <div class="label">Declare war?</div>
        <p>Your units will be able to attack ${inText}, and theirs yours. ${Start} won’t forget it.</p>
        <div class="diploActions">
          <button type="button" data-act="back" class="bigBtn">Cancel</button>
          <button type="button" data-act="warYes" class="bigBtn danger">Declare War</button>
        </div>`;
    }

    if (this.diploPage === 'trade') {
      const theirs = tradeableTechs(this.state, civ, this.human);
      const ours = tradeableTechs(this.state, this.human, civ);
      const pickTheirs = theirs.length
        ? `<div class="techPick">${theirs
            .map(
              (t) => `<button type="button" data-get="${t}" class="${t === this.tradeGet ? 'sel' : ''}">${TECHS[t].name}
                <span class="tmeta">worth ${techValue(this.state, this.human, t)} science to you</span></button>`,
            )
            .join('')}</div>`
        : `<p class="sub">${Start} ${civVerb(this.state, civ, 'knows', 'know')} nothing you could learn right now.</p>`;
      let offer = '';
      if (this.tradeGet) {
        const price = techPrice(this.state, civ, this.human, this.tradeGet);
        const swap = ours.length
          ? `<div class="techPick">${ours
              .map(
                (t) => `<button type="button" data-give="${t}">Give ${TECHS[t].name}
                  <span class="tmeta">worth ${techValue(this.state, civ, t)} to them</span></button>`,
              )
              .join('')}</div>`
          : `<p class="sub">You know nothing ${inText} could learn right now.</p>`;
        offer = `
          <div class="label">What will you offer for ${TECHS[this.tradeGet].name}?</div>
          <div class="diploActions">
            <button type="button" data-act="buy" ${me.gold < price ? 'disabled' : ''}>Pay ${price} gold</button>
          </div>
          <div class="sub">${me.gold < price ? `You have ${me.gold} gold. ` : ''}Or swap one of yours:</div>
          ${swap}`;
      }
      return `${head}
        <div class="diploActions"><button type="button" data-act="back">‹ Back</button></div>
        <div class="label">Their techs you could learn</div>
        ${pickTheirs}
        ${offer}`;
    }

    const warErr = war ? undefined : declareWarError(this.state, this.human, civ);
    const theirs = tradeableTechs(this.state, civ, this.human).length;
    const gifts = [25, 50, 100]
      .map((g) => `<button type="button" data-gold="${g}" ${me.gold < g ? 'disabled' : ''}>Give ${g} gold</button>`)
      .join('');
    return `${head}
      <div class="label">Actions</div>
      <div class="diploActions">
        ${war
          ? '<button type="button" data-act="peace" class="bigBtn">Propose Peace</button>'
          : `<button type="button" data-act="war" class="bigBtn danger" ${warErr ? 'disabled' : ''}>Declare War</button>`}
        <button type="button" data-act="trade" class="bigBtn" ${theirs ? '' : 'disabled'}>Trade Techs</button>
      </div>
      ${warErr ? `<div class="sub">${esc(warErr)}</div>` : ''}
      ${theirs ? '' : `<div class="sub">${name} knows no tech you could learn right now.</div>`}
      <div class="label">Gifts <span class="sub">(you have ${me.gold} gold)</span></div>
      <div class="diploActions">${gifts}</div>
      <div class="diploActions"><button type="button" data-act="religions">Religions of the world…</button></div>`;
  }

  /** Round 12: their capital's faith, and how it colors their view of you ("Shares your faith"). */
  private faithWords(civ: number): string {
    const cap = this.state.cities.find((c) => c.capitalOf === civ && c.owner === civ);
    const r = cap ? cityReligion(this.state, cap) : undefined;
    if (!r) return '<span class="sub">Their capital follows no religion</span>';
    const f = faithOpinion(this.state, civ, this.human);
    const how = f > 0 ? ` · <b class="att-friendly">Shares your faith</b> <span class="sub">(+${f} opinion)</span>` : f < 0 ? ` · <span class="att-hostile">Different faith</span> <span class="sub">(−${Math.abs(f)} opinion)</span>` : '';
    return `${religionDot(r, !!holyReligion(this.state, cap!))}${esc(r.name)}${how}`;
  }


  // ---- Round 13: main menu, Settings, How to Play, the Almanac, first-game tips ----------------

  private setupRound13(): void {
    // Main menu.
    $('mmContinue').addEventListener('click', () => this.closeMainMenu());
    $('mmNew').addEventListener('click', () => this.setup.open());
    $('mmHow').addEventListener('click', () => this.openGuide());
    $('mmAlmanac').addEventListener('click', () => this.openAlmanac());
    $('mmSettings').addEventListener('click', () => this.openSettings());
    $('mmRestore').addEventListener('click', () => {
      this.backupConfirmSlot = undefined;
      this.renderBackups();
      this.showMenuPage('menuBackups');
      $('menuOverlay').hidden = false;
    });
    $('mmAbout').addEventListener('click', () => {
      this.renderAbout();
      this.showMenuPage('menuAbout');
      $('menuOverlay').hidden = false;
    });
    $('mmDev').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn && btn.dataset.scenario !== undefined) gotoScenario(btn.dataset.scenario || undefined);
    });
    // Settings.
    $('settingsOverlay').addEventListener('click', (e) => this.handleSettingsClick(e));
    // How to Play.
    $('guideOverlay').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === $('guideOverlay') || t.closest('#guideCloseBtn')) {
        $('guideOverlay').hidden = true;
        return;
      }
      const btn = t.closest('button');
      if (!btn) return;
      if (btn.dataset.card) this.openAlmanac(btn.dataset.card);
      else if (btn.dataset.page !== undefined) this.showGuidePage(Number(btn.dataset.page));
      else if (btn.id === 'guidePrevBtn') this.showGuidePage(this.guideIndex - 1);
      else if (btn.id === 'guideNextBtn') {
        if (this.guideIndex >= guidePages().length - 1) $('guideOverlay').hidden = true;
        else this.showGuidePage(this.guideIndex + 1);
      }
    });
    // Almanac.
    $('almanacOverlay').addEventListener('click', (e) => this.handleAlmanacClick(e));
    $<HTMLInputElement>('almanacSearch').addEventListener('input', (e) => {
      this.almanacQuery = (e.target as HTMLInputElement).value;
      this.renderAlmanacList();
    });
    // Tips.
    $('tipOkBtn').addEventListener('click', () => this.dismissTip());
    $('tipOffBtn').addEventListener('click', () => {
      this.dismissTip();
      this.settings.tips = false;
      saveSettings(this.settings);
      this.toast('Tips are off. Turn them back on in Settings (☰).');
    });
  }

  /** Text size, and anything else that changes the page itself. */
  private applySettings(): void {
    document.documentElement.classList.toggle('largeText', this.settings.textSize === 'large');
  }

  // ---- main menu ----

  openMainMenu(): void {
    this.save();
    // Round 14 (B4): Dan's title picture behind the menu, when there is one.
    const bg = titleBackground(this.cssH > this.cssW);
    $('mainMenu').classList.toggle('pictured', !!bg);
    $('mainMenu').style.setProperty('--title-bg', bg ? `url("${bg}")` : 'none');
    const me = this.state.players[this.human]!;
    const def = civDef(this.state, this.human);
    const cont = $<HTMLButtonElement>('mmContinue');
    const sc = this.opts.scenario;
    cont.hidden = this.placeholder;
    cont.innerHTML = `${portraitHtml(me.civId, 64)}<span class="mmcText"><b>${sc ? 'Back to the scenario' : 'Continue'}</b>
      <span>${esc(def.leader)} of ${esc(def.name)}</span>
      <span class="sub">Turn ${this.state.turn} · ${esc(eraName(playerEra(me)))} era · ${esc(DIFFICULTIES[this.state.difficulty].name)} · ${esc(MAP_SIZES[this.state.mapSize].name)} map</span></span>`;
    $('mmNew').classList.toggle('primary', this.placeholder);
    $('mmFoot').textContent = `Version ${__APP_VERSION__}${sc ? ` · dev scenario “${sc.title}” (not saved)` : ''}`;
    const dev = this.opts.devScenarios;
    if (dev?.length) {
      $('mmDev').innerHTML = `<details><summary class="sub">Dev scenarios (not saved)</summary><div class="devList">${dev
        .map((s) => `<button type="button" data-scenario="${s.id}">${esc(s.title)}</button>`)
        .join('')}${sc ? '<button type="button" data-scenario="">Back to my game</button>' : ''}</div></details>`;
      $('mmDev').hidden = false;
    }
    this.hideTip();
    $('noticeOverlay').hidden = true;
    $('mainMenu').hidden = false;
  }

  private closeMainMenu(): void {
    if ($('mainMenu').hidden) return;
    $('mainMenu').hidden = true;
    this.showNotice();
    this.refresh();
  }

  // ---- Settings ----

  openSettings(): void {
    this.renderSettings();
    $('settingsOverlay').hidden = false;
  }

  private renderSettings(): void {
    const s = this.settings;
    const toggle = (key: keyof Settings, on: boolean) =>
      `<div class="seg"><button type="button" data-set="${key}" data-val="true" class="${on ? 'on' : ''}" aria-pressed="${on}">On</button><button type="button" data-set="${key}" data-val="false" class="${on ? '' : 'on'}" aria-pressed="${!on}">Off</button></div>`;
    const choice = (key: keyof Settings, value: string, options: [string, string][]) =>
      `<div class="seg">${options.map(([v, label]) => `<button type="button" data-set="${key}" data-val="${v}" class="${value === v ? 'on' : ''}" aria-pressed="${value === v}">${label}</button>`).join('')}</div>`;
    const volume = (key: 'sfxVolume' | 'musicVolume', v: number, on: boolean) =>
      `<div class="vol ${on ? '' : 'off'}"><button type="button" data-vol="${key}" data-step="-10" aria-label="Quieter" ${v <= 0 ? 'disabled' : ''}>−</button><b>${v}%</b><button type="button" data-vol="${key}" data-step="10" aria-label="Louder" ${v >= 100 ? 'disabled' : ''}>+</button></div>`;
    const files = soundFilesPresent();
    const effects = SOUND_EVENTS.filter((e) => files.includes(e.file)).length;
    const music = files.filter((f) => f.startsWith('music-')).length;
    const row = (label: string, sub: string, control: string) => `<div class="setRow"><div><b>${label}</b><div class="sub">${sub}</div></div>${control}</div>`;
    $('settingsBody').innerHTML = `
      ${row('Sound effects', `${effects} of ${SOUND_EVENTS.length} sounds in this version${effects ? '' : ' (none yet: they’ll play once they’re added)'}`, `${toggle('sfxOn', s.sfxOn)}${volume('sfxVolume', s.sfxVolume, s.sfxOn)}`)}
      ${row('Music', music ? `${plural(music, 'track')}` : 'No music yet', `${toggle('musicOn', s.musicOn)}${volume('musicVolume', s.musicVolume, s.musicOn)}`)}
      ${row('Animation speed', 'How long combat flashes and news stay on screen (computer turns are always instant)', choice('animationSpeed', s.animationSpeed, [['normal', 'Normal'], ['fast', 'Fast']]))}
      ${row('Confirm End Turn', 'Ask before ending the turn while a unit can still move', toggle('confirmEndTurn', s.confirmEndTurn))}
      ${row('Text size', 'Bigger text in menus and panels', choice('textSize', s.textSize, [['normal', 'Normal'], ['large', 'Large']]))}
      ${row('First-game tips', 'A short hint the first time something happens', `${toggle('tips', s.tips)}<button type="button" data-act="resetTips">Show tips again</button>`)}
      ${import.meta.env.DEV ? row('Sound in dev scenarios', 'Dev builds only: let scenarios play sounds', toggle('scenarioSound', s.scenarioSound)) : ''}
      ${import.meta.env.DEV || location.port === '4173' ? '<p class="sub">Check each sound on the <a href="docs/sounds.html" target="_blank" rel="noopener">sound check page</a>.</p>' : ''}`;
  }

  private handleSettingsClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t === $('settingsOverlay') || t.closest('#settingsCloseBtn')) {
      $('settingsOverlay').hidden = true;
      return;
    }
    const btn = t.closest('button');
    if (!btn || btn.disabled) return;
    const s = this.settings as unknown as Record<string, unknown>;
    if (btn.dataset.set) {
      const v = btn.dataset.val!;
      s[btn.dataset.set] = v === 'true' ? true : v === 'false' ? false : v;
    } else if (btn.dataset.vol) {
      const key = btn.dataset.vol as 'sfxVolume' | 'musicVolume';
      this.settings[key] = Math.max(0, Math.min(100, this.settings[key] + Number(btn.dataset.step)));
    } else if (btn.dataset.act === 'resetTips') {
      this.tipsSeen = [];
      if (!this.opts.scenario) saveTipsSeen([]);
      this.settings.tips = true;
      this.toast('Tips will show again as things happen');
    } else return;
    saveSettings(this.settings);
    this.applySettings();
    this.sound.unlock();
    this.sound.updateMusic();
    // A sample so the new effects volume can be heard.
    if (btn.dataset.vol === 'sfxVolume' || btn.dataset.set === 'sfxOn') this.sound.play('tap');
    this.renderSettings();
  }

  // ---- How to Play ----

  openGuide(page = 0): void {
    $('guideOverlay').hidden = false;
    this.showGuidePage(page);
  }

  private showGuidePage(i: number): void {
    const pages = guidePages();
    this.guideIndex = Math.max(0, Math.min(pages.length - 1, i));
    const page = pages[this.guideIndex]!;
    $('guideNav').innerHTML = pages
      .map((p, n) => `<button type="button" data-page="${n}" class="${n === this.guideIndex ? 'on' : ''}" aria-pressed="${n === this.guideIndex}">${n + 1}. ${esc(p.title)}</button>`)
      .join('');
    $('guidePage').innerHTML = `<h3>${esc(page.title)}</h3>${page.html}`;
    $('guidePage').scrollTop = 0;
    $('guideStatus').textContent = `Page ${this.guideIndex + 1} of ${pages.length}`;
    $<HTMLButtonElement>('guidePrevBtn').disabled = this.guideIndex === 0;
    $('guideNextBtn').textContent = this.guideIndex === pages.length - 1 ? 'Done' : 'Next ›';
    $('guideNav').querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---- the Almanac ----

  /** Opens the Almanac, on a card if `cardId` is given (from the build list, tech screen, a link). */
  openAlmanac(cardId?: string): void {
    if (cardId && findCard(cardId)) {
      if (!$('almanacOverlay').hidden && this.almanacCardId && this.almanacCardId !== cardId) this.almanacHistory.push(this.almanacCardId);
      else if ($('almanacOverlay').hidden) this.almanacHistory = [];
      this.almanacCardId = cardId;
      // Show its category, so the list around it makes sense.
      this.almanacCat = findCard(cardId)!.category;
      this.almanacQuery = '';
      $<HTMLInputElement>('almanacSearch').value = '';
    }
    $('almanacOverlay').hidden = false;
    this.renderAlmanac();
    $('almanacList').querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }

  private handleAlmanacClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t === $('almanacOverlay') || t.closest('#almanacCloseBtn')) {
      $('almanacOverlay').hidden = true;
      return;
    }
    const btn = t.closest('button');
    if (!btn) return;
    if (btn.dataset.cat !== undefined) {
      this.almanacCat = (btn.dataset.cat || undefined) as AlmanacCategory | undefined;
      this.renderAlmanac();
    } else if (btn.dataset.card) {
      if (this.almanacCardId && this.almanacCardId !== btn.dataset.card) this.almanacHistory.push(this.almanacCardId);
      this.almanacCardId = btn.dataset.card;
      // A link on a card to a card of another kind: switch the list to its kind.
      const c = findCard(btn.dataset.card);
      if (c && btn.classList.contains('alink') && this.almanacCat && c.category !== this.almanacCat) this.almanacCat = c.category;
      this.renderAlmanac();
      $('almanacCard').scrollTop = 0;
    } else if (btn.dataset.act === 'back') {
      this.almanacCardId = this.almanacHistory.pop();
      this.renderAlmanac();
    }
  }

  private renderAlmanac(): void {
    $('almanacCats').innerHTML = [{ id: '', name: 'All' }, ...ALMANAC_CATEGORIES]
      .map((c) => {
        const on = (this.almanacCat ?? '') === c.id;
        return `<button type="button" data-cat="${c.id}" class="${on ? 'on' : ''}" aria-pressed="${on}">${esc(c.name)}</button>`;
      })
      .join('');
    this.renderAlmanacList();
    const card = this.almanacCardId ? findCard(this.almanacCardId) : undefined;
    const back = this.almanacHistory.length ? '<button type="button" data-act="back" class="almanacBack">‹ Back</button>' : '';
    $('almanacCard').innerHTML = card ? `${back}${card.html}` : '<p class="sub">Pick a card from the list, or search.</p>';
  }

  private renderAlmanacList(): void {
    const hits = searchAlmanac(this.almanacQuery, this.almanacCat);
    const list = $('almanacList');
    list.innerHTML = hits.length
      ? hits
          .map((c) => `<button type="button" data-card="${esc(c.id)}" class="acard ${c.id === this.almanacCardId ? 'sel' : ''}"><b>${esc(c.name)}</b><span class="sub">${esc(c.line)}</span></button>`)
          .join('')
      : '<p class="sub">Nothing matches that.</p>';
    $('almanacStatus').textContent = `${plural(hits.length, 'card')}${this.almanacQuery ? ` matching “${this.almanacQuery}”` : ''}`;
  }

  // ---- first-game tips ----

  private checkTips(): void {
    if (!this.settings.tips || this.tipShowing || !$('mainMenu').hidden || !$('endOverlay').hidden) return;
    const tip = dueTips(this.state, this.human, this.tipsSeen)[0];
    if (!tip) return;
    this.tipShowing = tip;
    $('tipText').innerHTML = `<b>💡 ${esc(tip.title)}</b><span>${esc(tip.text)}</span>`;
    $('tipCard').hidden = false;
  }

  private dismissTip(): void {
    const tip = this.tipShowing;
    if (!tip) return;
    this.tipsSeen.push(tip.id);
    // A scenario's tips never count against the real game's.
    if (!this.opts.scenario) saveTipsSeen(this.tipsSeen);
    this.hideTip();
    this.checkTips();
  }

  private hideTip(): void {
    this.tipShowing = undefined;
    $('tipCard').hidden = true;
  }

  // ---- dev scenarios (dev server only) ---------------------------------------------------

  private setupDev(): void {
    const { scenario, devScenarios } = this.opts;
    if (scenario) {
      $('devBannerText').innerHTML = `<b>Dev scenario: ${esc(scenario.title)}</b><br>${esc(scenario.note)}`;
      $('devBanner').hidden = false;
      $('devBannerClose').addEventListener('click', () => ($('devBanner').hidden = true));
      $('devBackBtn').addEventListener('click', () => gotoScenario(undefined));
      if (this.opts.musicSwitch) {
        // Round 14: hear each era's track (each crossfades in); Game follows your era again.
        const row = document.createElement('div');
        row.className = 'devArtRow devMusic';
        const choices: [string, MusicContext | undefined][] = [['Theme', 'menu'], ...ERAS.map((e): [string, MusicContext] => [e.name, e.id]), ['Game', undefined]];
        row.innerHTML = `<span>Music</span>${choices.map(([label, ctx]) => `<button type="button" data-music="${ctx ?? ''}">${label}</button>`).join('')}`;
        row.addEventListener('click', (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-music]');
          if (!btn) return;
          this.sound.unlock();
          this.musicOverride = (btn.dataset.music || undefined) as MusicContext | undefined;
          for (const b of row.querySelectorAll('button')) b.classList.toggle('on', b === btn && !!btn.dataset.music);
          this.updateMusicContext();
        });
        $('devBannerText').after(row);
      }
    }
    if (devScenarios?.length) {
      const menu = $('devMenu');
      const back = scenario ? '<button type="button" data-scenario="">Back to my game</button>' : '';
      menu.innerHTML = `<div class="label">Dev scenarios (not saved)</div>
        <div class="devList scroll">${devScenarios
          .map((s) => `<button type="button" data-scenario="${s.id}" class="${s.id === scenario?.id ? 'on' : ''}">${esc(s.title)}</button>`)
          .join('')}${back}</div>`;
      menu.hidden = false;
      menu.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (btn && btn.dataset.scenario !== undefined) gotoScenario(btn.dataset.scenario || undefined);
      });
      // Round 14: switch between the art styles (dev builds only; the game shows Dan's picks).
      this.art = loadDevArt();
      const art = document.createElement('div');
      art.id = 'devArt';
      const render = () => {
        const row = (label: string, kind: 'terrain' | 'city', list: { id: string; letter: string; name: string }[]) =>
          `<div class="devArtRow"><span>${label}</span>${list
            .map((st) => `<button type="button" data-art="${kind}" data-id="${st.id}" class="${this.art[kind] === st.id ? 'on' : ''}" title="${esc(st.name)}">${st.letter === '–' ? 'Old' : st.letter}</button>`)
            .join('')}</div>`;
        art.innerHTML = `<div class="label">Art style (dev only)</div>${row('Terrain', 'terrain', TERRAIN_STYLES)}${row('Cities', 'city', CITY_STYLES)}`;
      };
      render();
      menu.after(art);
      art.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-art]');
        if (!btn) return;
        this.art = { ...this.art, [btn.dataset.art!]: btn.dataset.id } as ArtChoice;
        saveDevArt(this.art);
        render();
        this.requestDraw();
      });
    }
  }

  // ---- view ------------------------------------------------------------------------------

  private zoomCenter(f: number): void {
    zoomAt(this.camera, this.cssW, this.cssH, f, this.cssW / 2, this.cssH / 2, minTileSize(this.cssW, this.cssH));
    this.requestDraw();
  }

  private centerOn(x: number, y: number): void {
    this.camera.cx = x + 0.5;
    this.camera.cy = y + 0.5;
    this.clamp();
  }

  private clamp(): void {
    clampCamera(this.camera, this.state.map.width, this.state.map.height);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssW = rect.width;
    this.cssH = rect.height;
    const pw = Math.round(rect.width * dpr);
    const ph = Math.round(rect.height * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Turning the iPad can change the cap (it follows the longer side).
    if (this.cssW > 0) this.camera.tileSize = Math.max(this.camera.tileSize, minTileSize(this.cssW, this.cssH));
    this.requestDraw();
  }

  /** Round 14 (C1): which music fits what's on screen (the menu, or your era in the game). */
  private updateMusicContext(): void {
    const menu = !$('mainMenu').hidden || !$('setupOverlay').hidden;
    this.sound.setMusicContext(this.musicOverride ?? (menu ? 'menu' : playerEra(this.state.players[this.human]!)));
  }

  /** Round 14 (dev, the era-music scenario): a track picked by hand, until Game is tapped. */
  private musicOverride: MusicContext | undefined;

  private refresh(): void {
    this.updateMusicContext();
    this.updateHud();
    this.renderCityPanel();
    this.renderEnd();
    if (!$('techOverlay').hidden) this.renderTech();
    if (!$('diploOverlay').hidden) this.renderDiplo();
    if (!$('victoryOverlay').hidden) this.renderVictory();
    if (!$('leaderOverlay').hidden) this.renderLeader();
    this.checkTips();
    this.requestDraw();
  }

  private requestDraw(): void {
    if (this.frameQueued) return;
    this.frameQueued = true;
    requestAnimationFrame(() => {
      this.frameQueued = false;
      this.draw();
    });
  }

  private draw(): void {
    const sel = this.selected();
    const view: ViewState = {
      camera: this.camera,
      viewer: this.human,
      selectedUnitId: sel?.id,
      reachable: sel ? reachableThisTurn(this.state, sel) : [],
      targets: this.attackTargets(sel),
      openCityId: this.openCityId,
      flash: this.flash,
      onIconReady: () => this.requestDraw(),
      art: this.art,
      time: performance.now(),
      chunks: this.chunks,
    };
    // The DPR transform may be reset if the canvas was resized; re-apply every frame.
    const dpr = this.canvas.width / Math.max(1, this.cssW);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(this.ctx, this.state, view, this.cssW, this.cssH);
    this.drawMinimap();
    // The painted style's water shimmers: redraw a few times a second while it's shown.
    if (this.art.terrain === 'painted' && this.shimmerTimer === undefined && !document.hidden) {
      this.shimmerTimer = window.setTimeout(() => {
        this.shimmerTimer = undefined;
        this.requestDraw();
      }, 120);
    }
  }

  // ---- minimap (Round 14, A2) --------------------------------------------------------------

  private setupMinimap(): void {
    const box = $('minimap');
    const canvas = $<HTMLCanvasElement>('minimapCanvas');
    box.classList.toggle('folded', !this.settings.minimap);
    $('minimapToggle').addEventListener('click', () => {
      this.settings = { ...this.settings, minimap: !this.settings.minimap };
      saveSettings(this.settings);
      box.classList.toggle('folded', !this.settings.minimap);
      this.requestDraw();
    });
    // Tap to jump there; drag to pan (the main view follows the finger).
    let dragging = false;
    const jump = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const w = minimapToWorld(e.clientX - r.left, e.clientY - r.top, this.miniScale, this.state.map.width, this.state.map.height);
      this.camera.cx = w.x;
      this.camera.cy = w.y;
      this.clamp();
      this.requestDraw();
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      e.preventDefault();
      jump(e);
    });
    const end = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  private drawMinimap(): void {
    // Hidden while a side panel covers that corner (the city panel in landscape).
    const box = $('minimap');
    const cityOpen = this.openCityId !== undefined && this.cssW > this.cssH;
    box.hidden = cityOpen;
    if (cityOpen || !this.settings.minimap) return;
    const { map } = this.state;
    const maxW = Math.min(200, Math.max(120, this.cssW * 0.2));
    const maxH = Math.min(150, Math.max(90, this.cssH * 0.2));
    const scale = minimapScale(map.width, map.height, maxW, maxH);
    this.miniScale = scale;
    const canvas = $<HTMLCanvasElement>('minimapCanvas');
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(map.width * scale);
    const h = Math.round(map.height * scale);
    if (canvas.style.width !== `${w}px`) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMinimap(ctx, this.state, this.human, this.miniTerrain, this.camera, this.cssW, this.cssH, scale);
  }

  // ---- HUD -------------------------------------------------------------------------------

  private updateHud(): void {
    const player = this.state.players[this.human]!;
    const civ = CIVS.find((c) => c.id === player.civId);
    $('civLabel').innerHTML = `${portraitHtml(player.civId, 28)}${esc(civ?.name ?? '')} · ${esc(civ?.leader ?? '')}${this.uniqueReady() ? ' <span class="dot">●</span>' : ''}`;
    $('turnLabel').textContent = `Turn ${this.state.turn}`;
    $('eraLabel').textContent = `${eraName(playerEra(player))} era`;
    const income = empireIncome(this.state, this.human);
    $('goldLabel').innerHTML = `Gold <b>${player.gold}</b> <span class="sub">(+${income.gold})</span>`;
    const rb = $<HTMLButtonElement>('researchBtn');
    if (player.researching) {
      const t = turnsToLearn(this.state, this.human, player.researching);
      rb.innerHTML = `🔬 ${TECHS[player.researching].name} <span class="sub">(${t ?? '—'})</span>`;
      rb.classList.remove('ready');
    } else if (availableTechs(player).length > 0) {
      const banked = player.science > 0 ? ` <span class="sub">· ${player.science} banked</span>` : '';
      rb.innerHTML = `🔬 Choose research${banked}`;
      rb.classList.add('ready');
    } else {
      rb.innerHTML = '🔬 All techs known';
      rb.classList.remove('ready');
    }
    rb.title = `Science +${income.science} per turn`;
    const met = metCivs(this.state, this.human).length;
    const wars = metCivs(this.state, this.human).filter((c) => atWar(this.state, this.human, c)).length;
    $('diploBtn').innerHTML = `🤝 Diplomacy${wars ? ` <span class="sub">· ${wars} at war</span>` : ''}`;
    $('diploBtn').title = `${met} civ${met === 1 ? '' : 's'} met`;
    $('rateLabel').textContent = `${player.scienceRate}% sci · ${100 - player.scienceRate}% gold`;
    $<HTMLButtonElement>('rateDown').disabled = player.scienceRate <= 0;
    $<HTMLButtonElement>('rateUp').disabled = player.scienceRate >= 100;

    const sel = this.selected();
    const panel = $('unitPanel');
    const foundBtn = $<HTMLButtonElement>('foundBtn');
    if (sel) {
      const def = UNITS[sel.type];
      const terrain = TERRAIN[tileAt(this.state.map, sel.x, sel.y)!.terrain].name;
      const vet = sel.veteran ? ' ★ veteran' : '';
      const army = sel.army ? ` ${armyWord(sel.type)} ×${RULES.combat.armyMultiplier}` : '';
      const mult = sel.army ? RULES.combat.armyMultiplier : 1;
      const fort = sel.fortified ? (isShip(sel) ? ' · staying put' : ' · 🛡 fortified') : '';
      const carrier = sel.carriedBy !== null ? findUnit(this.state, sel.carriedBy) : undefined;
      const naval = isShip(sel)
        ? ` · cargo ${cargoOf(this.state, sel).length}/${cargoCapacity(sel)}${def.coastOnly ? ' · coast only' : ''}`
        : carrier
          ? ` · ⚓ aboard the ${UNITS[carrier.type].name}`
          : '';
      const air = isAir(sel)
        ? ` · range ${airRange(sel)}${def.airAttack ? ` · vs aircraft ${def.airAttack}` : ''} · ${sel.movesLeft > 0 ? 'tap an outlined target to strike, or a city or Carrier to rebase' : 'flown this turn'}`
        : hovers(sel) ? ' · flies over anything · can’t capture' : '';
      const carrierAir = isShip(sel) && def.airCargo ? ` · aircraft ${aircraftOf(this.state, sel).length}/${airCapacity(sel)}` : '';
      // Round 12: a Missionary's faith and spreads left.
      const faith = def.spreadsReligion ? religionById(this.state, sel.religion) : undefined;
      const mission = faith ? ` · ${esc(faith.name)} · ${plural(sel.charges ?? 0, 'spread')} left` : '';
      $('unitInfo').innerHTML = `${this.badge(sel.type, sel.owner)}${def.name}${army}${vet}${fort} <span class="sub">· attack ${def.attack * mult} · defense ${
        def.defense * mult
      }${isAir(sel) ? '' : ` · moves ${movesText(sel.movesLeft)}/${def.moves}`}${mission}${naval}${carrierAir}${air}${isAir(sel) ? '' : ` · ${terrain}`}</span>`;
      foundBtn.hidden = !def.canFoundCity;
      const err = foundCityError(this.state, sel.id);
      foundBtn.disabled = err !== undefined;
      foundBtn.title = err ?? 'Found a city here';
      const fortifyBtn = $<HTMLButtonElement>('fortifyBtn');
      fortifyBtn.hidden = def.canFoundCity || sel.owner !== this.human;
      fortifyBtn.disabled = fortifyError(this.state, sel) !== undefined;
      // Ships don't dig in; "Stay" just leaves them out of Next Unit until they move.
      const stays = isShip(sel) || isAir(sel) || hovers(sel) || !!def.spreadsReligion;
      fortifyBtn.textContent = stays ? (sel.fortified ? 'Staying' : 'Stay') : sel.fortified ? 'Fortified' : 'Fortify';
      fortifyBtn.hidden = fortifyBtn.hidden || (sel.carriedBy !== null && !isAir(sel));
      this.renderStackList(sel);
      // The city panel covers this spot; the unit comes back when the city closes.
      panel.hidden = this.openCityId !== undefined;
    } else {
      panel.hidden = true;
    }
    const ready = this.readyUnits();
    const anyReady = ready.length > 0;
    $('nextBtn').hidden = !ready.some((u) => u.id !== sel?.id);
    $('endTurnBtn').classList.toggle('ready', !anyReady);
  }

  /**
   * The unit panel's stack list (Round 6): when the selected unit shares its tile, every unit
   * there as a button to select it (type, army, ★, 🛡, moves), and Form Army for any type
   * with three on the tile, not just the selected one's.
   */
  private renderStackList(sel: Unit): void {
    const box = $('stackList');
    const units = unitsOnTile(this.state, sel.x, sel.y)
      .filter((u) => u.owner === sel.owner)
      .sort((a, b) => Number(a.carriedBy !== null) - Number(b.carriedBy !== null) || a.id - b.id);
    const mine = sel.owner === this.human;
    // Ships (Round 8): what's aboard, and boarding a ship docked here / going ashore in port.
    const ships = units.filter((u) => isShip(u));
    const cargoHead =
      ships
        .filter((s) => UNITS[s.type].cargo > 0)
        .map((s) => {
          const c = cargoOf(this.state, s);
          return `<div class="label">⚓ ${UNITS[s.type].name} cargo ${c.length}/${cargoCapacity(s)}${c.length ? `: ${stackLabel(c)}` : ''}</div>`;
        })
        .join('') +
      // A Carrier's aircraft (Round 10).
      ships
        .filter((s) => (UNITS[s.type].airCargo ?? 0) > 0)
        .map((s) => {
          const a = aircraftOf(this.state, s);
          return `<div class="label">✈ ${UNITS[s.type].name} aircraft ${a.length}/${airCapacity(s)}${a.length ? `: ${stackLabel(a)}` : ''}</div>`;
        })
        .join('');
    let navalBtns = '';
    if (mine && !isShip(sel) && !isAir(sel) && !hovers(sel) && sel.carriedBy === null) {
      const ship = ships.find((s) => cargoOf(this.state, s).length < cargoCapacity(s));
      if (ship) navalBtns += `<button type="button" data-act="board" data-unit="${sel.id}" data-ship="${ship.id}" class="navalBtn">⚓ Board the ${UNITS[ship.type].name}</button>`;
    }
    // An aircraft in a city with a Carrier in port: land on it, or leave it for the city.
    if (mine && isAir(sel) && sel.carriedBy === null && sel.movesLeft > 0) {
      const ship = ships.find((s) => aircraftOf(this.state, s).length < airCapacity(s));
      if (ship) navalBtns += `<button type="button" data-act="board" data-unit="${sel.id}" data-ship="${ship.id}" class="navalBtn">✈ Land on the ${UNITS[ship.type].name}</button>`;
    }
    if (mine && isAir(sel) && sel.carriedBy !== null && sel.movesLeft > 0 && !isWaterAt(this.state, sel.x, sel.y)) {
      navalBtns += `<button type="button" data-act="unload" data-unit="${sel.id}" class="navalBtn">✈ Base it in the city</button>`;
    }
    if (mine && !isAir(sel) && sel.carriedBy !== null && !isWaterAt(this.state, sel.x, sel.y)) {
      navalBtns += `<button type="button" data-act="unload" data-unit="${sel.id}" class="navalBtn">Go ashore here</button>`;
    }
    // The Airport's airlift (Round 10).
    if (mine && !airliftSourceError(this.state, sel) && airliftTargets(this.state, sel).length > 0) {
      navalBtns += `<button type="button" data-act="airlift" data-unit="${sel.id}" class="navalBtn">✈ Airlift…</button>`;
    }
    if (mine && !isAir(sel) && sel.carriedBy !== null && isWaterAt(this.state, sel.x, sel.y)) {
      navalBtns += '<div class="label">Tap a land tile next to the ship to go ashore there.</div>';
    }
    // Round 12: a Missionary converts the city it stands in or next to.
    if (mine && UNITS[sel.type].spreadsReligion) {
      const faith = religionById(this.state, sel.religion);
      const targets = sel.movesLeft > 0 ? spreadTargets(this.state, sel) : [];
      for (const c of targets) {
        navalBtns += `<button type="button" data-act="spread" data-unit="${sel.id}" data-city="${c.id}" class="navalBtn spreadBtn">✦ Spread ${esc(faith?.name ?? 'the faith')} to ${esc(c.name)}${c.owner !== this.human ? ` (${esc(civDef(this.state, c.owner).name)})` : ''}</button>`;
      }
      if (!targets.length) navalBtns += `<div class="label">Walk into or next to a city that doesn’t follow ${esc(faith?.name ?? 'your faith')} (yours, or a civ at peace with you), then spread it.</div>`;
    }
    let html = '';
    if (units.length > 1) {
      const head = `<div class="label">${isMixedStack(units) ? '<span class="mixed">Mixed</span> ' : ''}${units.length} units here: ${stackLabel(units)}</div>`;
      const items = mine
        ? units
            .map(
              (u) => `<button type="button" data-unit="${u.id}" class="stackItem${u.id === sel.id ? ' on' : ''}">
              ${this.badge(u.type, u.owner)}${UNITS[u.type].name}${u.army ? ` ${armyWord(u.type)} ×${RULES.combat.armyMultiplier}` : ''}${u.veteran ? ' ★' : ''}${u.fortified && !isShip(u) ? ' 🛡' : ''}${u.carriedBy !== null ? ' ⚓' : ''}
              <span class="sub">${movesText(u.movesLeft)}/${UNITS[u.type].moves}${u.carriedBy !== null ? ' · aboard' : ''}</span></button>`,
            )
            .join('')
        : '';
      const armies = mine
        ? armyCandidates(this.state, units)
            .map(
              (u) => `<button type="button" data-act="army" data-unit="${u.id}" class="armyBtn">Form ${UNITS[u.type].name} ${armyWord(u.type)}
              <span class="sub">(${RULES.combat.armySize} → 1, ×${RULES.combat.armyMultiplier})</span></button>`,
            )
            .join('')
        : '';
      html = `${head}${cargoHead}<div class="stackItems">${items}</div>${armies}${navalBtns}`;
    } else if (navalBtns || cargoHead) {
      html = `${cargoHead}${navalBtns}`;
    }
    // Only touch the DOM when it changes, so a tap in progress isn't lost to a re-render.
    if (box.dataset.html !== html) {
      box.innerHTML = html;
      box.dataset.html = html;
    }
    box.hidden = html === '';
  }

  /** A short message; `icon` (Round 10) puts one of the map icons in front of it. */
  private toast(text: string, error = false, icon?: string): void {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = error ? 'toast error' : 'toast';
    if (icon) el.innerHTML = `<span class="micon">${iconHtml(icon, '')}</span>${esc(text)}`;
    else el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 4) box.firstElementChild?.remove();
    const ms = toastMs(this.settings);
    setTimeout(() => el.classList.add('fade'), ms);
    setTimeout(() => el.remove(), ms + 500);
  }
}

/** One side of the odds panel: base strength, each bonus, and the total. */
function sideHtml(icon: string, title: string, kind: 'Attack' | 'Defense', st: Strength): string {
  const mods = st.mods.length
    ? st.mods.map((m) => `<li>${m.pct >= 0 ? '+' : '−'}${Math.abs(m.pct)}% ${esc(m.label)}</li>`).join('')
    : '<li class="sub">No bonuses</li>';
  return `<div class="side"><div class="sideName">${icon}${esc(title)}</div>
    <div class="sub">${kind} ${num(st.base)}</div><ul>${mods}</ul>
    <div class="total">${num(st.total)}</div></div>`;
}

/** A panel in the notice queue. `run` is called after the panel closes. */
interface Notice {
  title: string;
  text: string;
  sub?: string;
  /** `run` gets the text field's value (Round 12); `stay` keeps the panel open (e.g. "Suggest"). */
  buttons: { label: string; cls?: string; disabled?: boolean; stay?: boolean; run?: (input?: string) => void }[];
  /** Round 12: a text field under the text (naming a religion). */
  input?: { value: string; max: number; label: string };
  /** Round 12: set for a religion waiting for its name, so its panel is queued once. */
  religionId?: number;
  /** Set for an AI offer, so it's queued once. */
  offerId?: number;
  /** False when the panel needs an answer (Esc doesn't close it). */
  dismissible?: boolean;
  /** Round 9: set for a barbarian village's choice, or a Great Person's, so each is queued once. */
  villageId?: number;
  gpId?: number;
  /** The buttons are a list of choices (cities, tiles): stacked, and scrolling if long. */
  list?: boolean;
  /** Round 10: an icon beside the title (the village, the artifact, a Great Person), and its style. */
  icon?: string;
  iconCls?: string;
  /** Round 11: a leader's portrait beside the title (a civ's player id). */
  portrait?: number;
  /** Round 11: a city Bolívar may give back, so its panel is queued once. */
  returnCityId?: number;
}

const ATTITUDE_LABEL = { friendly: 'Friendly', neutral: 'Neutral', hostile: 'Hostile' } as const;

/** Their military next to yours, in rough words. */
function strengthWords(ratio: number): string {
  if (ratio > 1.5) return 'Much stronger than yours';
  if (ratio > 1.15) return 'Stronger than yours';
  if (ratio >= 0.87) return 'About the same as yours';
  if (ratio >= 0.67) return 'Weaker than yours';
  return 'Much weaker than yours';
}

/** How each victory was won, for the end screen. */
function victoryHow(kind: VictoryKind, you: boolean, goals: { culture: number; gold: number }): string {
  const who = you ? 'you' : 'they';
  switch (kind) {
    case 'domination':
      return `${who} held every rival's original capital`;
    case 'culture':
      return `${who} built the ${WONDERS.world_council.name} after reaching ${goals.culture} culture`;
    case 'economic':
      return `${who} built the ${WONDERS.global_exchange.name} with ${goals.gold} gold in the treasury`;
    case 'technology':
      return `${you ? 'your' : 'their'} spaceship arrived`;
  }
}

function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function bar(value: number, max: number, cls: string): string {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return `<div class="bar ${cls}"><div style="width:${pct.toFixed(1)}%"></div></div>`;
}

/** Round 12: moves left, which roads can make fractional ("⅓", "1⅔", "0.4"). */
function movesText(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const whole = Math.floor(n);
  const frac = n - whole;
  const third = Math.abs(frac - 1 / 3) < 0.01 ? '⅓' : Math.abs(frac - 2 / 3) < 0.01 ? '⅔' : undefined;
  if (third) return `${whole || ''}${third}`;
  return String(Math.round(n * 10) / 10);
}

/** Round 12: a religion's disc (its symbol, white on its color) for panels; with `holy`, the holy-city badge after it. */
function religionDot(r: Religion, holy = false): string {
  const sym = symbolOf(r);
  const dot = `<span class="rdot" style="background:${sym.color}" title="${esc(sym.name)}">${iconHtml(sym.icon, esc(sym.glyph), 'ricon')}</span>`;
  return holy ? `${dot}<span class="rdot holyBadge" title="Holy city">${iconHtml(MAP_ICONS.holyCity, '✦', 'ricon')}</span>` : dot;
}

/** Reloads with ?scenario=<id>, or without it (back to the real, autosaved game). */
function gotoScenario(id: string | undefined): void {
  const params = new URLSearchParams(location.search);
  params.delete('new');
  if (id) params.set('scenario', id);
  else params.delete('scenario');
  const q = params.toString();
  location.href = location.pathname + (q ? `?${q}` : '');
}
