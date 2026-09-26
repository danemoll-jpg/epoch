// Canvas 2D renderer. Reads game state and view state; never changes game state.
// Placeholder art: colored tiles, simple terrain marks, unit discs with icons, city squares
// with the size number. Armies get a thick gold ring and "×3"; fortified units a small
// shield; capitals a star; tiles the selected unit can attack a red outline. A ship carrying
// units (Round 8) gets a teal cargo badge; cargo isn't counted in the stack badge.
// Round 9 things, with Dan's icon picks since round 10 (drawn as on the picker page he chose
// from): a barbarian village is its icon on a pale rounded square, with a red flag along the
// bottom for each flag it has (its garrison sits in the corner, like units in a city); a hut is
// its icon on a pale circle; a resource is its icon, white on a small dark badge in the tile's
// upper-right corner (hidden ones only once the viewer can see them); barbarian units carry a
// red skull badge. Letters (and the old shapes) stand in while an icon loads or if one is
// missing. Aircraft (Round 10) sit in their city behind its ground units, and a Carrier's
// badge counts the aircraft aboard with its cargo.
// Round 12: roads are thin brown lines between tile centers and rails darker lines with ties,
// under everything else on the tile. A city following a religion has a disc in the religion's
// color with its symbol (Dan's picks) in white, in its lower-right corner (the garrison sits
// lower-left); a holy city also has Dan's holy-city badge, gold on a dark disc, top right (left
// of the "!" badge when that shows). As on his picker page.

import { BARBARIAN_CIV, BARBARIANS } from '../data/barbarians';
import { CIVS } from '../data/civs';
import { MAP_ICONS } from '../data/icons';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { cityLook } from '../data/cityLooks';
import { UNITS } from '../data/units';
import { behindUnit } from '../game/stack';
import { unitVisibleTo, visibleTiles } from '../game/fog';
import { territory } from '../game/borders';
import { carriedBy, isAir } from '../game/naval';
import { tileIndex } from '../game/grid';
import { visibleResource } from '../game/resources';
import { roadAt } from '../game/roads';
import { cityReligion, holyReligion, symbolOf } from '../game/religion';
import type { Coord, GameState, Unit } from '../game/types';
import { worldToScreen, type Camera } from './camera';
import { iconBitmap } from './icons';
import { DEFAULT_ART, drawCityArt, drawShimmer, drawTerrainTile, type ArtChoice, type TileInfo } from './art';
import { eraIndex, playerEra } from '../game/tech';


export interface ViewState {
  camera: Camera;
  /** The human player whose fog we draw. */
  viewer: number;
  selectedUnitId?: number;
  reachable: Coord[];
  /** Adjacent enemy tiles the selected unit can attack (outlined in red). */
  targets: Coord[];
  /** City whose panel is open: its worked tiles are outlined. */
  openCityId?: number;
  /** A short flash on a tile after a fight or capture: green if we won, red if we lost. */
  flash?: { x: number; y: number; won: boolean };
  /** Round 17 (B2): "Tap twice to move": the path shown after the first tap, and its turns. */
  plannedMove?: { path: Coord[]; turns: number };
  /** Called when a unit icon finishes loading, so the map can be drawn again with it. */
  onIconReady?: () => void;
  /** Round 14: the terrain and city styles (today's look unless a dev build switched). */
  art?: ArtChoice;
  /** Round 14: ms clock for the painted style's water shimmer. */
  time?: number;
  /** Round 14: pre-drawn terrain chunks, reused while the zoom stays the same. */
  chunks?: TerrainChunks;
}

/**
 * Round 14 (A3): the explored terrain, pre-drawn in square chunks of tiles at the current tile
 * size and style, so a frame is a few image copies instead of every tile's shapes. A chunk is
 * redrawn when the viewer explores a tile in or beside it. Used only once the zoom has held
 * for a frame (while pinching, tiles are drawn directly, since every frame has a new size).
 */
export class TerrainChunks {
  private key = '';
  private lastSize = 0;
  private readonly chunks = new Map<number, { canvas: HTMLCanvasElement; sig: number }>();
  /** Tiles per chunk side at the current size (about 512 device pixels a chunk). */
  n = 8;

  /** Whether the cache can be used this frame; clears it when the size, scale, style, or map change. */
  ready(s: number, scale: number, style: string, mapKey: string): boolean {
    const stable = s === this.lastSize;
    this.lastSize = s;
    if (!stable) return false;
    const key = `${s}|${scale}|${style}|${mapKey}`;
    if (key !== this.key) {
      this.key = key;
      this.chunks.clear();
      this.n = Math.max(2, Math.min(16, Math.floor(512 / (s * scale))));
    }
    return true;
  }

  get(id: number, sig: number, make: (canvas: HTMLCanvasElement) => void): HTMLCanvasElement {
    const hit = this.chunks.get(id);
    if (hit && hit.sig === sig) return hit.canvas;
    const canvas = hit?.canvas ?? document.createElement('canvas');
    make(canvas);
    this.chunks.set(id, { canvas, sig });
    // Keep memory in check on a big map: forget the oldest chunks past a few screens' worth.
    if (this.chunks.size > 160) {
      const first = this.chunks.keys().next().value;
      if (first !== undefined) this.chunks.delete(first);
    }
    return canvas;
  }
}

/** What the viewer knows of a tile for drawing it: its terrain and which sides meet the other kind. */
export function tileInfo(state: GameState, explored: number[], tx: number, ty: number): TileInfo {
  const { map } = state;
  const terrain = map.tiles[tileIndex(map, tx, ty)]!.terrain;
  const water = TERRAIN[terrain].isWater;
  // Unexplored neighbors count as the same kind, so an edge never gives away hidden land.
  const other = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    const k = tileIndex(map, x, y);
    return explored[k] === 1 && TERRAIN[map.tiles[k]!.terrain].isWater !== water;
  };
  return { terrain, x: tx, y: ty, water, edge: { n: other(tx, ty - 1), e: other(tx + 1, ty), s: other(tx, ty + 1), w: other(tx - 1, ty) } };
}

export function playerColor(state: GameState, playerId: number): string {
  const civId = state.players[playerId]?.civId;
  if (civId === BARBARIAN_CIV.id) return BARBARIAN_CIV.color;
  return CIVS.find((c) => c.id === civId)?.color ?? '#cccccc';
}

/**
 * An icon in `color`, `box` px square, centered on (cx, cy), from the cached bitmaps. False if
 * it isn't ready (or missing), so the caller can draw its fallback.
 */
function drawIcon(ctx: CanvasRenderingContext2D, icon: string, color: string, cx: number, cy: number, box: number, onReady?: () => void): boolean {
  const scale = ctx.getTransform().a || 1;
  const bmp = iconBitmap(icon, color, box * scale, onReady ?? (() => {}));
  if (!bmp) return false;
  ctx.drawImage(bmp, cx - box / 2, cy - box / 2, box, box);
  return true;
}

/** A rounded rectangle path (drawn by hand: older iPad Safari has no roundRect). */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * A barbarian village (Round 9): Dan's icon, dark on a pale rounded square, as on the picker
 * page (its flags come later, over the units). A wooden fence while the icon loads.
 */
function drawVillage(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, onReady?: () => void): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  roundRectPath(ctx, x + s * 0.15, y + s * 0.12, s * 0.7, s * 0.7, s * 0.15);
  ctx.fill();
  if (drawIcon(ctx, MAP_ICONS.village, '#262626', x + s / 2, y + s * 0.47, s * 0.58, onReady)) {
    ctx.restore();
    return;
  }
  const inset = s * 0.08;
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.strokeRect(x + inset, y + inset, s - inset * 2, s - inset * 2);
  ctx.restore();
}

/**
 * A village's flags along the bottom right, one per flag it has gained (the empty ones faint),
 * clear of its garrison in the lower-left corner: drawn over the units so they stay readable.
 */
function drawVillageFlags(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flags: number): void {
  ctx.save();
  for (let i = 0; i < BARBARIANS.flagsToSpawn; i++) {
    const fx = x + s * (0.53 + i * 0.12);
    const fy = y + s * 0.78;
    ctx.strokeStyle = '#2a1a0a';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy + s * 0.18);
    ctx.stroke();
    ctx.fillStyle = i < flags ? '#e03a2f' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + s * 0.09, fy + s * 0.045);
    ctx.lineTo(fx, fy + s * 0.09);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** An exploration hut (Round 9): Dan's icon, dark on a pale circle; a tan dome with "?" while it loads. */
function drawHut(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, onReady?: () => void): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s * 0.29, 0, Math.PI * 2);
  ctx.fill();
  if (drawIcon(ctx, MAP_ICONS.hut, '#262626', x + s / 2, y + s / 2, s * 0.44, onReady)) {
    ctx.restore();
    return;
  }
  const cx = x + s / 2;
  const cy = y + s * 0.62;
  const r = s * 0.24;
  ctx.fillStyle = '#d8b878';
  ctx.strokeStyle = '#4a3418';
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.lineTo(cx + r, cy + r * 0.35);
  ctx.lineTo(cx - r, cy + r * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a3418';
  ctx.font = `800 ${Math.round(s * 0.26)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', cx, cy - r * 0.15);
  ctx.restore();
}

/**
 * Roads and rails (Round 12) on explored tiles: a line from each road tile (or city) to each
 * road neighbor. Each pair is drawn once (only toward E, SE, S, SW). Rails: dark, with ties.
 */
function drawRoads(ctx: CanvasRenderingContext2D, state: GameState, explored: number[], x0: number, x1: number, y0: number, y1: number, s: number, pos: (x: number, y: number) => Coord): void {
  const { map } = state;
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ] as const;
  const roads: [Coord, Coord][] = [];
  const rails: [Coord, Coord][] = [];
  for (let ty = Math.max(0, y0 - 1); ty <= y1; ty++) {
    for (let tx = Math.max(0, x0 - 1); tx <= x1; tx++) {
      if (explored[tileIndex(map, tx, ty)] !== 1) continue;
      const a = roadAt(state, tx, ty);
      if (!a) continue;
      for (const [dx, dy] of dirs) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        if (explored[tileIndex(map, nx, ny)] !== 1) continue;
        const b = roadAt(state, nx, ny);
        if (!b) continue;
        // Two cities side by side aren't joined by a road just for being cities.
        if (!map.tiles[tileIndex(map, tx, ty)]!.road && !map.tiles[tileIndex(map, nx, ny)]!.road) continue;
        const pa = pos(tx, ty);
        const pb = pos(nx, ny);
        const seg: [Coord, Coord] = [
          { x: pa.x + s / 2, y: pa.y + s / 2 },
          { x: pb.x + s / 2, y: pb.y + s / 2 },
        ];
        (a === 'rail' && b === 'rail' ? rails : roads).push(seg);
      }
    }
  }
  ctx.lineCap = 'round';
  if (roads.length) {
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.beginPath();
    for (const [a, b] of roads) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  if (rails.length) {
    ctx.strokeStyle = '#2b1d12';
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath();
    for (const [a, b] of rails) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    // Ties across the line, when zoomed in enough to see them.
    if (s >= 20) {
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      const tie = s * 0.12;
      for (const [a, b] of rails) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        for (let d = s * 0.2; d < len - s * 0.1; d += s * 0.22) {
          const cx = a.x + ux * d;
          const cy = a.y + uy * d;
          ctx.moveTo(cx - uy * tie, cy + ux * tie);
          ctx.lineTo(cx + uy * tie, cy - ux * tie);
        }
      }
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}

/** A small disc badge with an icon on it (its letter while the icon loads), as on Dan's picker page. */
/** Round 19 (item 7): each civ's territory on explored tiles: a faint wash and a line along its edge. */
function drawBorders(ctx: CanvasRenderingContext2D, state: GameState, explored: number[], x0: number, x1: number, y0: number, y1: number, s: number, pos: (x: number, y: number) => Coord): void {
  const t = territory(state);
  const w = state.map.width;
  const h = state.map.height;
  const own = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : t.owner[y * w + x]!);
  const line = Math.max(2, Math.round(s / 11));
  ctx.save();
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const i = ty * w + tx;
      const o = t.owner[i]!;
      if (o < 0 || explored[i] !== 1) continue;
      const p = pos(tx, ty);
      const color = playerColor(state, o);
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = color;
      ctx.fillRect(p.x, p.y, s, s);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = line;
      ctx.beginPath();
      const inset = line / 2;
      if (own(tx, ty - 1) !== o) { ctx.moveTo(p.x, p.y + inset); ctx.lineTo(p.x + s, p.y + inset); }
      if (own(tx, ty + 1) !== o) { ctx.moveTo(p.x, p.y + s - inset); ctx.lineTo(p.x + s, p.y + s - inset); }
      if (own(tx - 1, ty) !== o) { ctx.moveTo(p.x + inset, p.y); ctx.lineTo(p.x + inset, p.y + s); }
      if (own(tx + 1, ty) !== o) { ctx.moveTo(p.x + s - inset, p.y); ctx.lineTo(p.x + s - inset, p.y + s); }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBadge(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, rim: string, icon: string, iconColor: string, glyph: string, onReady?: () => void,
): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // The icon fills the same share of the disc as on the picker (12 px in a 19 px disc).
  if (drawIcon(ctx, icon, iconColor, x, y, r * 1.26, onReady)) return;
  if (r >= 5) {
    ctx.fillStyle = iconColor;
    ctx.font = `800 ${Math.round(r * 1.2)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x, y + r * 0.05);
  }
}

/** Round 12: a religion's disc (its color, its symbol in white), in a city's lower-right corner. */
function drawReligionDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, icon: string, glyph: string, onReady?: () => void): void {
  drawBadge(ctx, x, y, r, color, '#ffffff', icon, '#ffffff', glyph, onReady);
}

/** Round 12: the holy-city badge, gold on a dark disc with a gold rim. */
function drawHolyBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, onReady?: () => void): void {
  drawBadge(ctx, x, y, r, '#262626', '#f0cf62', MAP_ICONS.holyCity, '#f0cf62', '✦', onReady);
}

/** A resource (Round 9): its icon, white on a small dark badge in the tile's upper-right corner (its letters while the icon loads). */
function drawResource(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, glyph: string, icon: string, onReady?: () => void): void {
  const w = s * 0.35;
  const bx = x + s - w - s * 0.04;
  const by = y + s * 0.05;
  ctx.save();
  ctx.fillStyle = 'rgba(20,20,20,0.72)';
  roundRectPath(ctx, bx, by, w, w, w * 0.22);
  ctx.fill();
  if (!drawIcon(ctx, icon, '#ffffff', bx + w / 2, by + w / 2, w * 0.78, onReady)) {
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `700 ${Math.round(s * 0.15)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, bx + w / 2, by + w / 2 + s * 0.005);
  }
  ctx.restore();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  unit: Unit,
  stackCount: number,
  x: number,
  y: number,
  s: number,
  selected: boolean,
  inCity: boolean,
  behind?: Unit,
  onIconReady?: () => void,
  cargo = 0,
): void {
  // In a city the disc shrinks into the lower-left corner so the city's size stays readable.
  const cx = inCity ? x + s * 0.27 : x + s / 2;
  const cy = inCity ? y + s * 0.73 : y + s / 2;
  const r = inCity ? s * 0.21 : s * 0.3;
  // Mixed stack: a second, smaller disc of another unit type peeks out behind (upper left),
  // so a different unit on the tile is never hidden.
  if (behind) {
    // Offset far enough that the selection ring doesn't hide it; in a city, straight up so
    // it stays on the tile.
    const br = r * 0.78;
    const bx = inCity ? cx + r * 0.1 : cx - r * 0.85;
    const by = cy - r * (inCity ? 1.0 : 0.85);
    ctx.fillStyle = playerColor(state, behind.owner);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    drawGlyph(ctx, behind, bx - (inCity ? 0 : br * 0.2), by - br * 0.2, br * 0.8, onIconReady);
    ctx.globalAlpha = 1;
  }
  if (selected) {
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, r + s * 0.09, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = playerColor(state, unit.owner);
  // Barbarians (Round 9) get a red rim (and the skull badge below) so they read as barbarians, not as a civ.
  const barbarian = state.players[unit.owner]?.kind === 'barbarian';
  ctx.strokeStyle = barbarian ? '#e03a2f' : unit.movesLeft > 0 ? '#ffffff' : '#333333';
  ctx.lineWidth = Math.max(barbarian ? 2.5 : 1.5, s * (barbarian ? 0.07 : 0.045));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  drawGlyph(ctx, unit, cx, cy, r, onIconReady);
  // Barbarians carry Dan's skull badge in the upper left, as on the picker page.
  if (barbarian) {
    const br = r * 0.48;
    const bx = cx - r * 0.83;
    const by = cy - r * 0.83;
    ctx.fillStyle = '#c62f24';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawIcon(ctx, MAP_ICONS.barbarian, '#ffffff', bx, by, br * 1.4, onIconReady);
  }
  if (unit.army) {
    ctx.strokeStyle = '#e6b73f';
    ctx.lineWidth = Math.max(2.5, s * 0.075);
    ctx.beginPath();
    ctx.arc(cx, cy, r + s * 0.02, 0, Math.PI * 2);
    ctx.stroke();
    const lx = cx;
    const ly = cy + r + s * 0.02;
    ctx.fillStyle = '#e6b73f';
    ctx.fillRect(lx - s * 0.14, ly - s * 0.08, s * 0.28, s * 0.16);
    ctx.fillStyle = '#1b1405';
    ctx.font = `800 ${Math.round(s * 0.14)}px system-ui, sans-serif`;
    ctx.fillText(`×${RULES.combat.armyMultiplier}`, lx, ly + s * 0.005);
  }
  if (unit.fortified) drawShield(ctx, cx - r * 0.95, cy + r * 0.2, s * 0.2);
  if (cargo > 0) {
    // Units aboard: a teal badge at the lower right (a bit higher on a fleet, clear of its ×3 tag).
    const bx = cx + r * (unit.army ? 1.05 : 0.85);
    const by = cy + r * (unit.army ? 0.35 : 0.85);
    ctx.fillStyle = '#1aa39a';
    ctx.strokeStyle = '#0b1f22';
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.arc(bx, by, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.round(s * 0.17)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(cargo), bx, by + s * 0.01);
  }
  if (stackCount > 1) {
    const bx = cx + r * 0.85;
    const by = cy - r * 0.85;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(bx, by, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(s * 0.18)}px system-ui, sans-serif`;
    ctx.fillText(String(stackCount), bx, by + s * 0.01);
  }
}

/**
 * The unit's mark inside its disc (radius `r`): its icon (Round 7), drawn white on the owner's
 * color as on the picker page Dan chose from, from a bitmap cached per icon, color, and pixel
 * size. Its letters stand in while the icon loads, or if it's missing. The only place a
 * unit's look is drawn on the map.
 */
function drawGlyph(ctx: CanvasRenderingContext2D, unit: Unit, cx: number, cy: number, r: number, onReady?: () => void): void {
  const def = UNITS[unit.type];
  // Icon box: the same share of the disc as on the picker page (20 px in a 29 px disc).
  const box = r * 1.38;
  if (def.icon && drawIcon(ctx, def.icon, '#ffffff', cx, cy, box, onReady)) return;
  ctx.fillStyle = '#ffffff';
  const glyph = def.glyph;
  ctx.font = `700 ${Math.round(r * (glyph.length > 1 ? 0.8 : 1.07))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, cx, cy);
}

/** Small shield (fortified), centered on (x, y), `h` tall. */
function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  const w = h * 0.8;
  ctx.fillStyle = '#d8dee6';
  ctx.strokeStyle = '#1b2430';
  ctx.lineWidth = Math.max(1, h * 0.1);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y);
  ctx.quadraticCurveTo(x + w / 2, y + h * 0.35, x, y + h / 2);
  ctx.quadraticCurveTo(x - w / 2, y + h * 0.35, x - w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Five-pointed star centered on (x, y) with outer radius r (capital marker). */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffe066';
  ctx.strokeStyle = '#1b1405';
  ctx.lineWidth = Math.max(1, r * 0.2);
  ctx.fill();
  ctx.stroke();
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  view: ViewState,
  width: number,
  height: number,
): void {
  const { map } = state;
  const cam = view.camera;
  const s = cam.tileSize;
  ctx.fillStyle = '#05080c';
  ctx.fillRect(0, 0, width, height);

  const explored = state.players[view.viewer]!.explored;
  const visible = visibleTiles(state, view.viewer);

  // Only draw tiles that are on screen.
  const x0 = Math.max(0, Math.floor(cam.cx - width / 2 / s) - 1);
  const x1 = Math.min(map.width - 1, Math.ceil(cam.cx + width / 2 / s) + 1);
  const y0 = Math.max(0, Math.floor(cam.cy - height / 2 / s) - 1);
  const y1 = Math.min(map.height - 1, Math.ceil(cam.cy + height / 2 / s) + 1);
  const pos = (tx: number, ty: number) => worldToScreen(cam, width, height, tx, ty);

  const art = view.art ?? DEFAULT_ART;
  const scale = ctx.getTransform().a || 1;
  const chunks = view.chunks;
  if (chunks && chunks.ready(s, scale, art.terrain, `${state.seed}|${map.width}x${map.height}`)) {
    // Pre-drawn chunks (Round 14), each placed on whole device pixels with a pixel of overlap.
    const n = chunks.n;
    const cols = Math.ceil(map.width / n);
    for (let cy = Math.floor(y0 / n); cy <= Math.floor(y1 / n); cy++) {
      for (let cx = Math.floor(x0 / n); cx <= Math.floor(x1 / n); cx++) {
        // The chunk's signature: which tiles in and around it are explored.
        let sig = 0;
        for (let ty = Math.max(0, cy * n - 1); ty <= Math.min(map.height - 1, cy * n + n); ty++) {
          for (let tx = Math.max(0, cx * n - 1); tx <= Math.min(map.width - 1, cx * n + n); tx++) {
            if (explored[tileIndex(map, tx, ty)] === 1) sig = (Math.imul(sig, 31) + ty * map.width + tx + 1) | 0;
          }
        }
        if (sig === 0) continue;
        const px = Math.ceil(n * s * scale) + 1;
        const canvas = chunks.get(cy * cols + cx, sig, (c) => {
          c.width = px;
          c.height = px;
          const g = c.getContext('2d')!;
          g.setTransform(scale, 0, 0, scale, 0, 0);
          g.clearRect(0, 0, px, px);
          for (let ty = cy * n; ty < Math.min(map.height, cy * n + n); ty++) {
            for (let tx = cx * n; tx < Math.min(map.width, cx * n + n); tx++) {
              if (explored[tileIndex(map, tx, ty)] !== 1) continue;
              drawTerrainTile(g, art.terrain, tileInfo(state, explored, tx, ty), (tx - cx * n) * s, (ty - cy * n) * s, s);
            }
          }
        });
        const p = pos(cx * n, cy * n);
        const dx = Math.round(p.x * scale) / scale;
        const dy = Math.round(p.y * scale) / scale;
        ctx.drawImage(canvas, dx, dy, px / scale, px / scale);
      }
    }
  } else {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (explored[tileIndex(map, tx, ty)] !== 1) continue;
        const p = pos(tx, ty);
        drawTerrainTile(ctx, art.terrain, tileInfo(state, explored, tx, ty), p.x, p.y, s);
      }
    }
  }
  // The painted style's water shimmers (drawn every frame, over the chunks).
  if (art.terrain === 'painted' && view.time !== undefined) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = tileIndex(map, tx, ty);
        if (explored[i] !== 1 || !visible[i] || !TERRAIN[map.tiles[i]!.terrain].isWater) continue;
        const p = pos(tx, ty);
        drawShimmer(ctx, tileInfo(state, explored, tx, ty), p.x, p.y, s, view.time);
      }
    }
  }

  // Round 12: roads and rails, under everything that stands on a tile.
  drawRoads(ctx, state, explored, x0, x1, y0, y1, s, pos);

  // Round 19 (item 7): culture borders, a soft tint and an edge in the owner's color.
  drawBorders(ctx, state, explored, x0, x1, y0, y1, s, pos);

  // Round 9: resources the viewer can see, huts, and barbarian villages, on explored tiles.
  if (s >= 14) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = tileIndex(map, tx, ty);
        if (explored[i] !== 1) continue;
        const res = visibleResource(state, view.viewer, i);
        if (res) {
          const p = pos(tx, ty);
          drawResource(ctx, p.x, p.y, s, res.glyph, res.icon, view.onIconReady);
        }
        if (map.tiles[i]!.hut) {
          const p = pos(tx, ty);
          drawHut(ctx, p.x, p.y, s, view.onIconReady);
        }
      }
    }
  }
  for (const v of state.villages) {
    if (explored[tileIndex(map, v.x, v.y)] !== 1) continue;
    const p = pos(v.x, v.y);
    drawVillage(ctx, p.x, p.y, s, view.onIconReady);
  }

  // Reachable-this-turn highlight for the selected unit.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  for (const c of view.reachable) {
    const p = pos(c.x, c.y);
    ctx.fillRect(p.x + 2, p.y + 2, s - 4, s - 4);
    ctx.strokeRect(p.x + 2, p.y + 2, s - 4, s - 4);
  }

  // Open city: outline its work radius and mark the tiles its citizens work.
  const openCity = state.cities.find((c) => c.id === view.openCityId);
  if (openCity) {
    const r = RULES.cityWorkRadius;
    const a = pos(openCity.x - r, openCity.y - r);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(a.x, a.y, s * (2 * r + 1), s * (2 * r + 1));
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,224,102,0.9)';
    for (const k of openCity.worked) {
      const p = pos(k % map.width, Math.floor(k / map.width));
      ctx.beginPath();
      ctx.arc(p.x + s * 0.18, p.y + s * 0.18, Math.max(3, s * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cities: shown wherever the viewer has explored (they don't move). The number is the
  // city's size; a "!" badge marks the viewer's cities with nothing to build.
  for (const city of state.cities) {
    if (explored[tileIndex(map, city.x, city.y)] !== 1) continue;
    const p = pos(city.x, city.y);
    const inset = s * 0.12;
    // Round 14: the city's look (its size and its owner's era pick it in the new styles), and
    // its walls.
    const look = cityLook(city.size);
    const owner = state.players[city.owner];
    drawCityArt(ctx, art.city, {
      look: look.id,
      buildings: look.buildings,
      era: owner ? eraIndex(playerEra(owner)) : 0,
      color: playerColor(state, city.owner),
      walls: city.buildings.includes('walls'),
      size: city.size,
      open: city.id === view.openCityId,
    }, p.x, p.y, s);
    if (city.capitalOf !== null) drawStar(ctx, p.x + inset, p.y + inset, s * 0.13);
    // Round 12: its religion (lower right), and the holy-city badge (upper right).
    const faith = cityReligion(state, city);
    if (faith && s >= 14) {
      const sym = symbolOf(faith);
      drawReligionDot(ctx, p.x + s - inset, p.y + s - inset, Math.max(5, s * 0.18), sym.color, sym.icon, sym.glyph, view.onIconReady);
    }
    if (holyReligion(state, city) && s >= 14) {
      const bang = city.owner === view.viewer && city.build === null;
      drawHolyBadge(ctx, p.x + s - inset - (bang ? s * 0.32 : 0), p.y + inset, Math.max(5, s * 0.18), view.onIconReady);
    }
    if (city.owner === view.viewer && city.build === null) {
      const bx = p.x + s - inset;
      const by = p.y + inset;
      ctx.fillStyle = '#e6b73f';
      ctx.beginPath();
      ctx.arc(bx, by, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1405';
      ctx.font = `800 ${Math.round(s * 0.2)}px system-ui, sans-serif`;
      ctx.fillText('!', bx, by + s * 0.01);
    }
  }

  // Units: only where the viewer can currently see (a submarine only from next to it). One disc
  // per tile, a count badge for stacks, and a second disc peeking out behind when the stack
  // has more than one type.
  const byTile = new Map<number, Unit[]>();
  for (const u of state.units) {
    const i = tileIndex(map, u.x, u.y);
    if (!unitVisibleTo(state, view.viewer, u, visible)) continue;
    const list = byTile.get(i) ?? [];
    list.push(u);
    byTile.set(i, list);
  }
  for (const [, list] of byTile) {
    // Cargo rides inside its ship: the ship is drawn (with a cargo badge) unless a unit aboard
    // is the one selected. Aircraft in a city (Round 10) sit behind its ground units.
    const outside = list.filter((u) => u.carriedBy === null);
    const ground = outside.filter((u) => !isAir(u));
    const shown =
      list.find((u) => u.id === view.selectedUnitId) ??
      ground.find((u) => u.movesLeft > 0) ?? ground[0] ?? outside.find((u) => u.movesLeft > 0) ?? outside[0] ?? list[0]!;
    const p = pos(shown.x, shown.y);
    // Units in a city, or a barbarian village, sit in the corner so the city or village shows.
    const inCity = state.cities.some((c) => c.x === shown.x && c.y === shown.y) || state.villages.some((v) => v.x === shown.x && v.y === shown.y);
    const others = shown.carriedBy === null ? outside : list;
    const aboard = shown.carriedBy === null ? carriedBy(state, shown).length : 0;
    drawUnit(ctx, state, shown, others.length, p.x, p.y, s, shown.id === view.selectedUnitId, inCity, behindUnit(others, shown), view.onIconReady, aboard);
  }

  // Village flags go over the units standing in them.
  for (const v of state.villages) {
    if (explored[tileIndex(map, v.x, v.y)] !== 1) continue;
    const p = pos(v.x, v.y);
    drawVillageFlags(ctx, p.x, p.y, s, v.flags);
  }

  // Tiles the selected unit can attack.
  ctx.strokeStyle = '#ff5a4f';
  ctx.lineWidth = Math.max(2, s * 0.06);
  for (const c of view.targets) {
    const p = pos(c.x, c.y);
    ctx.strokeRect(p.x + 2, p.y + 2, s - 4, s - 4);
  }

  // A fight (or capture) just happened here.
  if (view.flash) {
    const p = pos(view.flash.x, view.flash.y);
    ctx.fillStyle = view.flash.won ? 'rgba(90, 230, 120, 0.45)' : 'rgba(255, 70, 60, 0.5)';
    ctx.fillRect(p.x, p.y, s, s);
    ctx.strokeStyle = view.flash.won ? '#5ae678' : '#ff463c';
    ctx.lineWidth = Math.max(3, s * 0.09);
    ctx.strokeRect(p.x + 1, p.y + 1, s - 2, s - 2);
  }

  // Explored-but-not-visible tiles are dimmed.
  ctx.fillStyle = 'rgba(5,8,12,0.5)';
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const i = tileIndex(map, tx, ty);
      if (explored[i] === 1 && !visible[i]) {
        // Edges snapped to whole pixels, so neighbors meet without overlapping (an overlap
        // is dimmed twice and shows as a grid line).
        const p = pos(tx, ty);
        const ax = Math.round(p.x);
        const ay = Math.round(p.y);
        ctx.fillRect(ax, ay, Math.round(p.x + s) - ax, Math.round(p.y + s) - ay);
      }
    }
  }

  if (view.plannedMove) drawPlannedMove(ctx, view.plannedMove, pos, s);

  // City name labels on top of everything so they stay readable.
  ctx.font = `600 ${Math.max(11, Math.round(s * 0.26))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const city of state.cities) {
    if (explored[tileIndex(map, city.x, city.y)] !== 1) continue;
    const p = pos(city.x, city.y);
    const tw = ctx.measureText(city.name).width + 12;
    const th = Math.max(16, s * 0.34);
    const lx = p.x + s / 2;
    const ly = p.y + s + th / 2 - 2;
    ctx.fillStyle = 'rgba(10,14,20,0.85)';
    ctx.fillRect(lx - tw / 2, ly - th / 2, tw, th);
    ctx.fillStyle = playerColor(state, city.owner);
    ctx.fillRect(lx - tw / 2, ly - th / 2, 3, th);
    ctx.fillStyle = '#fff';
    ctx.fillText(city.name, lx + 1, ly + 1);
  }
}

/** Round 17 (B2): the path of a move waiting for its second tap: dots, and the turns on the goal. */
function drawPlannedMove(
  ctx: CanvasRenderingContext2D,
  plan: { path: Coord[]; turns: number },
  pos: (x: number, y: number) => { x: number; y: number },
  s: number,
): void {
  const goal = plan.path[plan.path.length - 1];
  if (!goal) return;
  ctx.fillStyle = 'rgba(255,224,102,0.95)';
  ctx.strokeStyle = 'rgba(20,20,20,0.7)';
  ctx.lineWidth = 1.5;
  for (const c of plan.path.slice(0, -1)) {
    const p = pos(c.x, c.y);
    ctx.beginPath();
    ctx.arc(p.x + s / 2, p.y + s / 2, Math.max(3, s * 0.09), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const g = pos(goal.x, goal.y);
  ctx.strokeStyle = '#ffe066';
  ctx.lineWidth = Math.max(2.5, s * 0.07);
  ctx.strokeRect(g.x + 2, g.y + 2, s - 4, s - 4);
  const label = plan.turns === 1 ? '1 turn' : `${plan.turns} turns`;
  const fs = Math.max(11, Math.min(16, s * 0.24));
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  const w = ctx.measureText(label).width + fs;
  const lx = g.x + s / 2 - w / 2;
  const ly = g.y - fs * 1.6;
  ctx.fillStyle = 'rgba(16,24,34,0.92)';
  ctx.fillRect(lx, ly, w, fs * 1.5);
  ctx.fillStyle = '#ffe066';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, g.x + s / 2, ly + fs * 0.75);
}
