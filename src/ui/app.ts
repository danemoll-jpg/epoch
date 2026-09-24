// Glue between game state, the renderer, and input. Holds view-only state (camera,
// selection, open city). Every game change goes through applyAction.

import { BUILDINGS } from '../data/buildings';
import { CIVS } from '../data/civs';
import { CITY_FOCUSES, RULES, growthThreshold, type CityFocus } from '../data/rules';
import { ERAS, TECHS, TECH_LIST, type TechId } from '../data/techs';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { applyAction, type Action } from '../game/actions';
import { foundCityError } from '../game/city';
import { attackError, combatOdds, formArmyError, fortifyError, type Strength } from '../game/combat';
import { civAdjective } from '../game/conquest';
import { neighbors, tileAt } from '../game/grid';
import { visibleTiles } from '../game/fog';
import { eventsVisibleTo } from '../game/log';
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
  knows,
  playerEra,
  researchError,
  techCost,
  techLeadsTo,
  techUnlocks,
  turnsToLearn,
} from '../game/tech';
import { STATE_VERSION, type ActionResult, type BuildItem, type City, type CombatReport, type Coord, type GameState, type Unit } from '../game/types';
import { cityScienceGold, cityYields, empireIncome, foodSurplus } from '../game/yields';
import { clampCamera, panBy, screenToWorld, zoomAt, type Camera } from '../render/camera';
import { playerColor, render, type ViewState } from '../render/renderer';
import { attachMapInput } from './input';
import { backupCurrentSave, listBackups, restoreBackup, saveToStorage } from './storage';
import { resolveTap } from './tap';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const FOCUS_LABEL: Record<CityFocus, string> = {
  balanced: 'Balanced',
  food: 'Food',
  production: 'Production',
  trade: 'Trade',
};

export interface AppOptions {
  /** Builds a fresh game for the New Game button. */
  newGame: () => GameState;
  /** Shown once at startup, e.g. "Resumed your game". */
  notice?: string;
  /** False while a dev scenario is loaded, so it can never overwrite the real autosave. */
  autosave?: boolean;
  /** Dev server only: the scenario being played (its note is shown on screen). */
  scenario?: { id: string; title: string; note: string };
  /** Dev server only: scenarios offered in the ☰ menu. */
  devScenarios?: { id: string; title: string }[];
}

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
  private cssW = 0;
  private cssH = 0;
  private frameQueued = false;
  private readonly human = 0;
  private readonly opts: AppOptions;

  constructor(state: GameState, opts: AppOptions) {
    this.state = state;
    this.opts = opts;
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
        zoomAt(this.camera, this.cssW, this.cssH, f, sx, sy);
        this.clamp();
        this.requestDraw();
      },
    });

    $('endTurnBtn').addEventListener('click', () => this.endTurn());
    $('foundBtn').addEventListener('click', () => this.foundCity());
    $('nextBtn').addEventListener('click', () => this.selectNext(true));
    $('deselectBtn').addEventListener('click', () => this.select(undefined));
    $('fortifyBtn').addEventListener('click', () => this.fortifySelected());
    $('armyBtn').addEventListener('click', () => this.formArmySelected());
    $('attackGoBtn').addEventListener('click', () => this.confirmAttack());
    $('attackCancelBtn').addEventListener('click', () => this.closeAttack());
    $('attackOverlay').addEventListener('click', (e) => {
      if (e.target === $('attackOverlay')) this.closeAttack();
    });
    $('endNewBtn').addEventListener('click', () => {
      if (this.opts.scenario) gotoScenario(undefined);
      else this.startNewGame();
    });
    $('endCloseBtn').addEventListener('click', () => {
      this.endDismissed = true;
      this.refresh();
    });
    $('rateDown').addEventListener('click', () => this.changeRate(-RULES.scienceRateStep));
    $('rateUp').addEventListener('click', () => this.changeRate(RULES.scienceRateStep));
    $('cityPanel').addEventListener('click', (e) => this.handleCityPanelClick(e));
    $('researchBtn').addEventListener('click', () => this.openTech());
    $('techOverlay').addEventListener('click', (e) => this.handleTechClick(e));
    this.setupMenu();
    this.setupDev();
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

    this.startHumanTurn();
    if (opts.notice) this.toast(opts.notice);
  }

  // ---- actions ---------------------------------------------------------------------------

  private dispatch(action: Action): boolean {
    return this.dispatchResult(action).ok;
  }

  private dispatchResult(action: Action): ActionResult {
    const res = applyAction(this.state, action);
    if (!res.ok && res.reason) this.toast(res.reason, true);
    // Cheap (a few tens of KB), and means a reload never loses more than one tap.
    if (res.ok) this.save();
    this.refresh();
    return res;
  }

  private save(): void {
    if (this.opts.autosave === false) return;
    saveToStorage(this.state);
  }

  private endTurn(): void {
    const logStart = this.state.log.length;
    const me = this.state.players[this.human]!;
    const techsBefore = me.techs.length;
    if (!this.dispatch({ type: 'endTurn' })) return;
    // Report what happened this round: our own events, and rival events we could see.
    for (const entry of eventsVisibleTo(this.state, this.human, this.state.log.slice(logStart))) {
      this.toast(entry.text);
    }
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
      for (const entry of this.state.log.slice(logStart)) this.toast(entry.text);
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
      this.toast(`${UNITS[u.type].name} fortified (+${RULES.combat.fortifiedPct}% defense until it moves)`);
      this.selectNext(false);
    }
  }

  private formArmySelected(): void {
    const u = this.selected();
    if (!u) return;
    if (this.dispatch({ type: 'formArmy', unitId: u.id })) {
      this.toast(`${UNITS[u.type].name} army formed: ×${RULES.combat.armyMultiplier} attack and defense`);
      this.select(u.id);
    }
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
    this.refresh();
  }

  /** New Game: the current game is backed up first, then replaced. */
  private startNewGame(): void {
    if (this.opts.autosave !== false) {
      this.save();
      if (!backupCurrentSave('Replaced by New Game', Date.now())) {
        this.toast("Couldn't back up your current game (storage is full), so it was kept.", true);
        return;
      }
    }
    this.replaceGame(this.opts.newGame(), 'New game started');
  }

  /** Swap in another game (New Game, or a restored backup that's already been saved). */
  private replaceGame(state: GameState, message: string): void {
    this.state = state;
    this.openCityId = undefined;
    this.selectedUnitId = undefined;
    this.pendingAttack = undefined;
    this.endDismissed = false;
    $('attackOverlay').hidden = true;
    this.save();
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

  /** Units still waiting for orders this turn (fortified units are left alone). */
  private readyUnits(): Unit[] {
    return this.myUnits().filter((u) => u.movesLeft > 0 && !u.fortified);
  }

  private myCities(): City[] {
    return this.state.cities.filter((c) => c.owner === this.human).sort((a, b) => a.id - b.id);
  }

  private select(unitId: number | undefined): void {
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
        if (this.dispatch({ type: 'move', unitId: result.unitId, to: { x: tx, y: ty } })) {
          // Captures and eliminations are worth announcing.
          for (const entry of this.state.log.slice(logStart)) this.toast(entry.text);
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
          // Enemy units in sight: say what they are.
          const enemy = this.state.units.find((u) => u.x === tx && u.y === ty && u.owner !== this.human);
          if (enemy && this.visibleToMe(tx, ty)) this.toast(`${this.unitLabel(enemy)} · ${unitSummary(enemy.type)}`);
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
    if (e.target instanceof HTMLInputElement) return;
    // A focused button already handles Enter/Space itself; don't double-fire.
    if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
    if (!$('menuOverlay').hidden) {
      if (e.key === 'Escape') this.closeMenu();
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
    if (act === 'close') {
      this.closeCity();
    } else if (act === 'focus') {
      this.dispatch({ type: 'setFocus', cityId: city.id, focus: btn.dataset.focus as CityFocus });
    } else if (act === 'build') {
      const item = JSON.parse(btn.dataset.item!) as BuildItem;
      this.dispatch({ type: 'setBuild', cityId: city.id, item });
    } else if (act === 'buy') {
      const name = city.build ? itemName(city.build) : '';
      if (this.dispatch({ type: 'rushBuy', cityId: city.id })) this.toast(`Bought ${name}; it's ready next turn`);
    } else if (act === 'unit') {
      this.closeCity();
      this.select(Number(btn.dataset.unit));
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
      const cost = itemCost(city.build);
      const t = turnsToFinish(this.state, city);
      const blocker = completionBlocker(city, city.build);
      const when = blocker ? `waiting: ${blocker}` : t === undefined ? 'no production' : plural(t, 'turn');
      prodHtml = `<div class="stat"><b>${itemName(city.build)}</b> ${Math.min(city.production, cost)}/${cost}
        <span class="sub">(+${y.production}) · ${when}</span></div>
        ${bar(city.production, cost, 'prod')}`;
    } else {
      prodHtml = `<div class="stat warn">Choose something to build <span class="sub">(${city.production} stored, +${y.production}/turn)</span></div>`;
    }
    const cost = buyCost(city);
    const bErr = buyError(this.state, city);
    const buyLabel = cost === undefined ? 'Buy' : `Buy · ${cost} gold`;

    const focusBtns = CITY_FOCUSES.map(
      (f) => `<button type="button" data-act="focus" data-focus="${f}" class="${city.focus === f ? 'on' : ''}"
        aria-pressed="${city.focus === f}">${FOCUS_LABEL[f]}</button>`,
    ).join('');

    const buildBtns = buildOptions(this.state, city)
      .map((item) => {
        const itemCostV = itemCost(item);
        const perTurn = y.production;
        const turns = perTurn > 0 ? Math.max(1, Math.ceil(Math.max(0, itemCostV - city.production) / perTurn)) : undefined;
        const blocker = completionBlocker(city, item);
        const detail = item.kind === 'building' ? BUILDINGS[item.id].summary : unitSummary(item.id);
        const note = blocker ?? (turns === undefined ? '—' : plural(turns, 'turn'));
        return `<button type="button" data-act="build" data-item='${JSON.stringify(item)}'
          class="buildItem ${sameItem(city.build, item) ? 'on' : ''}">
          <span class="bname">${itemName(item)}</span>
          <span class="bmeta">${itemCostV} · ${note}</span>
          <span class="bdesc">${detail}</span></button>`;
      })
      .join('');

    const units = this.state.units.filter((u) => u.owner === this.human && u.x === city.x && u.y === city.y);
    const unitBtns = units.length
      ? units
          .map(
            (u) => `<button type="button" data-act="unit" data-unit="${u.id}" class="unitItem">
            ${UNITS[u.type].name}${u.army ? ` army ×${RULES.combat.armyMultiplier}` : ''}${u.veteran ? ' ★' : ''}${u.fortified ? ' 🛡' : ''}
            <span class="sub">moves ${u.movesLeft}/${UNITS[u.type].moves}</span></button>`,
          )
          .join('')
      : '<span class="sub">None</span>';

    const builtList = city.buildings.length
      ? city.buildings.map((b) => BUILDINGS[b].name).join(', ')
      : '<span class="sub">None yet</span>';

    panel.innerHTML = `
      <div class="cityHead">
        <div><h2>${city.name}</h2><div class="sub">Size ${city.size}</div></div>
        <button type="button" data-act="close" class="closeBtn" aria-label="Close city">✕</button>
      </div>
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
      </div>
      <div class="section"><div class="label">Focus</div><div class="seg">${focusBtns}</div></div>
      <div class="section"><div class="label">Build</div><div class="buildList">${buildBtns}</div></div>
      <div class="section"><div class="label">Buildings</div><div>${builtList}</div></div>
      <div class="section"><div class="label">Units here</div><div class="unitList">${unitBtns}</div></div>
    `;
    panel.hidden = false;
    panel.scrollTop = scrollTop;
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
    $('backupList').addEventListener('click', (e) => this.handleBackupClick(e));
    $('menuCloseBtn').addEventListener('click', () => this.closeMenu());
    $('newGameBtn').addEventListener('click', () => this.showMenuPage('menuConfirm'));
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

  private showMenuPage(id: 'menuMain' | 'menuBackups' | 'menuConfirm'): void {
    for (const page of ['menuMain', 'menuBackups', 'menuConfirm']) $(page).hidden = page !== id;
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
    $('attackBody').innerHTML = `
      <h2>Attack?</h2>
      <div class="odds ${pct >= 60 ? 'good' : pct >= 40 ? 'even' : 'bad'}"><b>${pct}%</b><span>chance to win</span></div>
      <div class="sides">
        ${sideHtml(`Your ${this.unitName(odds.attacker)}`, 'Attack', odds.attack)}
        ${sideHtml(this.unitLabel(odds.defender), 'Defense', odds.defense)}
      </div>
      ${stackNote}
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
    // Anything after the fight itself (e.g. a civ eliminated).
    for (const entry of this.state.log.slice(logStart + 1)) this.toast(entry.text);
    this.selectNext(false);
  }

  private reportCombat(c: CombatReport): void {
    const pct = Math.round(c.chance * 100);
    const mine = `${UNITS[c.attackerType].name}${c.attackerArmy ? ' army' : ''}`;
    const theirs = `${UNITS[c.defenderType].name}${c.defenderArmy ? ' army' : ''}`;
    let text = c.attackerWon
      ? `Your ${mine} defeated the ${theirs} (${pct}%)`
      : `Your ${mine} was destroyed by the ${theirs} (${pct}%)`;
    if (c.promoted && c.attackerWon) text += `. Your ${mine} is now a veteran ★`;
    this.toast(text, !c.attackerWon);
    this.showFlash(c.x, c.y, c.attackerWon);
  }

  private showFlash(x: number, y: number, won: boolean): void {
    this.flash = { x, y, won };
    if (this.flashTimer !== undefined) clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      this.flash = undefined;
      this.requestDraw();
    }, 900);
    this.requestDraw();
  }

  private unitName(u: Unit): string {
    return `${UNITS[u.type].name}${u.army ? ' army' : ''}${u.veteran ? ' ★' : ''}`;
  }

  /** "Malian Spearman ★", or "Your Warrior". */
  private unitLabel(u: Unit): string {
    return u.owner === this.human ? `Your ${this.unitName(u)}` : `${civAdjective(this.state, u.owner)} ${this.unitName(u)}`;
  }

  private visibleToMe(x: number, y: number): boolean {
    return visibleTiles(this.state, this.human)[y * this.state.map.width + x] === true;
  }

  /** Adjacent tiles the selected unit could attack right now (outlined in red). */
  private attackTargets(u: Unit | undefined): Coord[] {
    if (!u || u.owner !== this.human || u.movesLeft <= 0 || UNITS[u.type].attack <= 0) return [];
    return neighbors(this.state.map, u).filter((n) => !attackError(this.state, u, n));
  }

  // ---- end of game (placeholder panels until Milestone 6) --------------------------------

  private renderEnd(): void {
    const me = this.state.players[this.human]!;
    const rivals = this.state.players.filter((p) => p.id !== this.human);
    const defeated = !me.alive;
    const victory = me.alive && rivals.length > 0 && rivals.every((p) => !p.alive);
    const show = (defeated || victory) && !this.endDismissed;
    $('endOverlay').hidden = !show;
    if (!show) return;
    $('endTitle').textContent = defeated ? 'Defeated' : 'Victory';
    $('endText').textContent = defeated
      ? `Your empire has fallen on turn ${this.state.turn}: no cities and no units left.`
      : `Every rival has been eliminated. You rule the world on turn ${this.state.turn}.`;
    // In a dev scenario, "New Game" means going back to the real game.
    $('endNewBtn').textContent = this.opts.scenario ? 'Back to my game' : 'New Game';
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
    if (btn.id === 'techCloseBtn') {
      this.closeTech();
    } else if (btn.dataset.tech) {
      this.techSelected = btn.dataset.tech as TechId;
      this.renderTech();
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
      ? `Researching ${TECHS[current].name}: ${Math.min(me.science, techCost(me, current))}/${techCost(me, current)} · +${income} science per turn`
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
    const cost = techCost(me, tech);
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
      ...u.buildings.map((b) => `<li><b>${BUILDINGS[b].name}</b> <span class="sub">building · ${BUILDINGS[b].summary}</span></li>`),
      ...u.units.map((id) => `<li><b>${UNITS[id].name}</b> <span class="sub">unit · ${unitSummary(id)}</span></li>`),
      ...u.wonders.map((w) => `<li><b>${w.name}</b> <span class="sub">wonder · ${w.summary}</span></li>`),
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

    return `
      <h3>${def.name}</h3>
      <div class="sub">${eraName(def.era)} era · ${stateText}${st === 'known' ? '' : ` · cost ${cost}`}</div>
      <p>${def.description}</p>
      ${action}
      <div class="label">Requires</div><div class="prereqs">${prereqs}</div>
      <div class="label">Unlocks</div>${unlocks}
      ${leads ? `<div class="label">Leads to</div><div class="sub">${leads}</div>` : ''}
    `;
  }

  // ---- dev scenarios (dev server only) ---------------------------------------------------

  private setupDev(): void {
    const { scenario, devScenarios } = this.opts;
    if (scenario) {
      $('devBannerText').innerHTML = `<b>Dev scenario: ${esc(scenario.title)}</b><br>${esc(scenario.note)}`;
      $('devBanner').hidden = false;
      $('devBannerClose').addEventListener('click', () => ($('devBanner').hidden = true));
      $('devBackBtn').addEventListener('click', () => gotoScenario(undefined));
    }
    if (devScenarios?.length) {
      const menu = $('devMenu');
      const back = scenario ? '<button type="button" data-scenario="">Back to my game</button>' : '';
      menu.innerHTML = `<div class="label">Dev scenarios (not saved)</div>
        <div class="devList">${devScenarios
          .map((s) => `<button type="button" data-scenario="${s.id}" class="${s.id === scenario?.id ? 'on' : ''}">${esc(s.title)}</button>`)
          .join('')}${back}</div>`;
      menu.hidden = false;
      menu.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (btn && btn.dataset.scenario !== undefined) gotoScenario(btn.dataset.scenario || undefined);
      });
    }
  }

  // ---- view ------------------------------------------------------------------------------

  private zoomCenter(f: number): void {
    zoomAt(this.camera, this.cssW, this.cssH, f, this.cssW / 2, this.cssH / 2);
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
    this.requestDraw();
  }

  private refresh(): void {
    this.updateHud();
    this.renderCityPanel();
    this.renderEnd();
    if (!$('techOverlay').hidden) this.renderTech();
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
    };
    // The DPR transform may be reset if the canvas was resized; re-apply every frame.
    const dpr = this.canvas.width / Math.max(1, this.cssW);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(this.ctx, this.state, view, this.cssW, this.cssH);
  }

  // ---- HUD -------------------------------------------------------------------------------

  private updateHud(): void {
    const player = this.state.players[this.human]!;
    const civ = CIVS.find((c) => c.id === player.civId);
    $('civLabel').innerHTML = `<span class="swatch" style="background:${playerColor(this.state, this.human)}"></span>${civ?.name ?? ''} · ${civ?.leader ?? ''}`;
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
      const army = sel.army ? ` army ×${RULES.combat.armyMultiplier}` : '';
      const mult = sel.army ? RULES.combat.armyMultiplier : 1;
      const fort = sel.fortified ? ' · 🛡 fortified' : '';
      $('unitInfo').innerHTML = `${def.name}${army}${vet}${fort} <span class="sub">· attack ${def.attack * mult} · defense ${
        def.defense * mult
      } · moves ${sel.movesLeft}/${def.moves} · ${terrain}</span>`;
      foundBtn.hidden = !def.canFoundCity;
      const err = foundCityError(this.state, sel.id);
      foundBtn.disabled = err !== undefined;
      foundBtn.title = err ?? 'Found a city here';
      const fortifyBtn = $<HTMLButtonElement>('fortifyBtn');
      fortifyBtn.hidden = def.canFoundCity || sel.owner !== this.human;
      fortifyBtn.disabled = fortifyError(this.state, sel) !== undefined;
      fortifyBtn.textContent = sel.fortified ? 'Fortified' : 'Fortify';
      // Form Army only appears when it's possible (3 of a kind here).
      $('armyBtn').hidden = sel.owner !== this.human || formArmyError(this.state, sel) !== undefined;
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

  private toast(text: string, error = false): void {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = error ? 'toast error' : 'toast';
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 4) box.firstElementChild?.remove();
    setTimeout(() => el.classList.add('fade'), 2600);
    setTimeout(() => el.remove(), 3100);
  }
}

/** One side of the odds panel: base strength, each bonus, and the total. */
function sideHtml(title: string, kind: 'Attack' | 'Defense', st: Strength): string {
  const mods = st.mods.length
    ? st.mods.map((m) => `<li>+${m.pct}% ${esc(m.label)}</li>`).join('')
    : '<li class="sub">No bonuses</li>';
  return `<div class="side"><div class="sideName">${esc(title)}</div>
    <div class="sub">${kind} ${num(st.base)}</div><ul>${mods}</ul>
    <div class="total">${num(st.total)}</div></div>`;
}

function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function bar(value: number, max: number, cls: string): string {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return `<div class="bar ${cls}"><div style="width:${pct.toFixed(1)}%"></div></div>`;
}

function unitSummary(id: BuildItem['id']): string {
  const def = UNITS[id as keyof typeof UNITS];
  if (!def) return '';
  const parts = [`attack ${def.attack} · defense ${def.defense} · moves ${def.moves}`];
  if (def.canFoundCity) parts.push('founds a city');
  if (def.popCost > 0) parts.push(`costs ${def.popCost} population`);
  return parts.join(' · ');
}

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
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
