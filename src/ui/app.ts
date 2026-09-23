// Glue between game state, the renderer, and input. Holds view-only state (camera,
// selection). Every game change goes through applyAction.

import { CIVS } from '../data/civs';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { applyAction, type Action } from '../game/actions';
import { foundCityError } from '../game/city';
import { tileAt } from '../game/grid';
import { findUnit, reachableThisTurn } from '../game/movement';
import type { GameState, Unit } from '../game/types';
import { clampCamera, panBy, screenToWorld, zoomAt, type Camera } from '../render/camera';
import { playerColor, render, type ViewState } from '../render/renderer';
import { attachMapInput } from './input';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class App {
  state: GameState;
  private readonly canvas = $<HTMLCanvasElement>('map');
  private readonly ctx: CanvasRenderingContext2D;
  private camera: Camera = { cx: 0, cy: 0, tileSize: 52 };
  private selectedUnitId: number | undefined;
  private cssW = 0;
  private cssH = 0;
  private frameQueued = false;
  private readonly human = 0;

  constructor(state: GameState) {
    this.state = state;
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
    window.addEventListener('keydown', (e) => this.handleKey(e));

    // Resize: window resize, iPad rotation, and anything else that changes the canvas box.
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
    window.visualViewport?.addEventListener('resize', onResize);
    new ResizeObserver(onResize).observe(this.canvas);
    this.resize();

    this.startHumanTurn();
  }

  // ---- actions ---------------------------------------------------------------------------

  private dispatch(action: Action): boolean {
    const res = applyAction(this.state, action);
    if (!res.ok && res.reason) this.toast(res.reason, true);
    this.updateHud();
    this.requestDraw();
    return res.ok;
  }

  private endTurn(): void {
    const logStart = this.state.log.length;
    if (!this.dispatch({ type: 'endTurn' })) return;
    // Report what rivals did this round.
    for (const entry of this.state.log.slice(logStart)) {
      if (entry.player !== this.human) this.toast(entry.text);
    }
    this.startHumanTurn();
  }

  private foundCity(): void {
    const id = this.selectedUnitId;
    if (id === undefined) return;
    const logStart = this.state.log.length;
    if (this.dispatch({ type: 'foundCity', unitId: id })) {
      for (const entry of this.state.log.slice(logStart)) this.toast(entry.text);
      this.selectNext(false);
    }
  }

  private startHumanTurn(): void {
    this.selectedUnitId = undefined;
    this.selectNext(false);
    const u = this.selected();
    const focus = u ?? this.state.cities.find((c) => c.owner === this.human);
    if (focus) this.centerOn(focus.x, focus.y);
    this.updateHud();
    this.requestDraw();
  }

  // ---- selection -------------------------------------------------------------------------

  private selected(): Unit | undefined {
    return this.selectedUnitId === undefined ? undefined : findUnit(this.state, this.selectedUnitId);
  }

  private myUnits(): Unit[] {
    return this.state.units.filter((u) => u.owner === this.human);
  }

  /** Select the next unit that can still move (cycling after the current one). */
  private selectNext(center: boolean): void {
    const ready = this.myUnits().filter((u) => u.movesLeft > 0);
    if (ready.length === 0) {
      this.selectedUnitId = undefined;
    } else {
      const i = ready.findIndex((u) => u.id === this.selectedUnitId);
      this.selectedUnitId = ready[(i + 1) % ready.length]!.id;
      const u = this.selected();
      if (center && u) this.centerOn(u.x, u.y);
    }
    this.updateHud();
    this.requestDraw();
  }

  private handleTap(sx: number, sy: number): void {
    const w = screenToWorld(this.camera, this.cssW, this.cssH, sx, sy);
    const tx = Math.floor(w.x);
    const ty = Math.floor(w.y);
    const tile = tileAt(this.state.map, tx, ty);
    if (!tile) return;
    const explored = this.state.players[this.human]!.explored[ty * this.state.map.width + tx] === 1;

    // Tapping your own unit(s) selects; tapping the same stack again cycles through it.
    const mine = this.myUnits().filter((u) => u.x === tx && u.y === ty);
    if (mine.length > 0) {
      const i = mine.findIndex((u) => u.id === this.selectedUnitId);
      this.selectedUnitId = mine[(i + 1) % mine.length]!.id;
      this.updateHud();
      this.requestDraw();
      return;
    }

    const sel = this.selected();
    if (sel && sel.movesLeft > 0) {
      if (this.dispatch({ type: 'move', unitId: sel.id, to: { x: tx, y: ty } })) {
        const after = this.selected();
        if (after && after.movesLeft <= 0) this.selectNext(false);
      }
      return;
    }

    // Nothing to move: show what's there.
    if (explored) {
      const city = this.state.cities.find((c) => c.x === tx && c.y === ty);
      const def = TERRAIN[tile.terrain];
      const y = def.yields;
      const cityText = city ? `${city.name} · ` : '';
      this.toast(`${cityText}${def.name} — food ${y.food}, production ${y.production}, trade ${y.trade}`);
    }
    this.selectedUnitId = undefined;
    this.updateHud();
    this.requestDraw();
  }

  private handleKey(e: KeyboardEvent): void {
    // Desktop extras only; everything here also has an on-screen control.
    if (e.target instanceof HTMLInputElement) return;
    // A focused button already handles Enter/Space itself; don't double-fire.
    if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') this.endTurn();
    else if (k === 'b' || k === 'f') this.foundCity();
    else if (k === 'n' || k === 'tab') this.selectNext(true);
    else if (k === 'escape') {
      this.selectedUnitId = undefined;
      this.updateHud();
      this.requestDraw();
    } else if (k === '=' || k === '+') this.zoomCenter(1.2);
    else if (k === '-') this.zoomCenter(1 / 1.2);
    else return;
    e.preventDefault();
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

    const sel = this.selected();
    const panel = $('unitPanel');
    const foundBtn = $<HTMLButtonElement>('foundBtn');
    if (sel) {
      const def = UNITS[sel.type];
      const terrain = TERRAIN[tileAt(this.state.map, sel.x, sel.y)!.terrain].name;
      $('unitInfo').innerHTML = `${def.name} <span class="sub">· moves ${sel.movesLeft}/${def.moves} · ${terrain}</span>`;
      foundBtn.hidden = !def.canFoundCity;
      const err = foundCityError(this.state, sel.id);
      foundBtn.disabled = err !== undefined;
      foundBtn.title = err ?? 'Found a city here';
      panel.hidden = false;
    } else {
      panel.hidden = true;
    }
    const anyReady = this.myUnits().some((u) => u.movesLeft > 0);
    $('nextBtn').hidden = !this.myUnits().some((u) => u.movesLeft > 0 && u.id !== sel?.id);
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
