// Canvas 2D renderer. Reads game state and view state; never changes game state.
// Placeholder art: colored tiles, simple terrain marks, unit discs with icons, city squares
// with the size number. Armies get a thick gold ring and "×3"; fortified units a small
// shield; capitals a star; tiles the selected unit can attack a red outline.

import { CIVS } from '../data/civs';
import { RULES } from '../data/rules';
import type { TerrainId } from '../data/terrain';
import { UNITS } from '../data/units';
import { behindUnit } from '../game/stack';
import { visibleTiles } from '../game/fog';
import { tileIndex } from '../game/grid';
import type { Coord, GameState, Unit } from '../game/types';
import { worldToScreen, type Camera } from './camera';
import { iconBitmap } from './icons';

const TERRAIN_COLOR: Record<TerrainId, string> = {
  grassland: '#5d9a3c',
  plains: '#a7a24a',
  forest: '#2f6a32',
  hills: '#8a7a4a',
  mountains: '#7d7773',
  desert: '#d9c27a',
  coast: '#3f86b8',
  ocean: '#1f4f80',
};

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
  /** Called when a unit icon finishes loading, so the map can be drawn again with it. */
  onIconReady?: () => void;
}

export function playerColor(state: GameState, playerId: number): string {
  const civId = state.players[playerId]?.civId;
  return CIVS.find((c) => c.id === civId)?.color ?? '#cccccc';
}

function drawTerrainMark(ctx: CanvasRenderingContext2D, t: TerrainId, x: number, y: number, s: number): void {
  ctx.save();
  switch (t) {
    case 'forest':
      ctx.fillStyle = '#1f4d22';
      for (const [ox, oy] of [[0.3, 0.55], [0.62, 0.42], [0.55, 0.78]] as const) {
        ctx.beginPath();
        ctx.moveTo(x + ox * s, y + (oy - 0.22) * s);
        ctx.lineTo(x + (ox + 0.13) * s, y + oy * s);
        ctx.lineTo(x + (ox - 0.13) * s, y + oy * s);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'hills':
      ctx.strokeStyle = '#5e5230';
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.arc(x + s * 0.35, y + s * 0.7, s * 0.2, Math.PI, 0);
      ctx.moveTo(x + s * 0.85, y + s * 0.6);
      ctx.arc(x + s * 0.65, y + s * 0.6, s * 0.2, 0, Math.PI, true);
      ctx.stroke();
      break;
    case 'mountains':
      ctx.fillStyle = '#56504c';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.5, y + s * 0.15);
      ctx.lineTo(x + s * 0.88, y + s * 0.85);
      ctx.lineTo(x + s * 0.12, y + s * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#eeeeee';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.5, y + s * 0.15);
      ctx.lineTo(x + s * 0.61, y + s * 0.36);
      ctx.lineTo(x + s * 0.39, y + s * 0.36);
      ctx.closePath();
      ctx.fill();
      break;
    case 'desert':
      ctx.fillStyle = '#c4aa60';
      for (const [ox, oy] of [[0.3, 0.35], [0.7, 0.5], [0.4, 0.75]] as const) {
        ctx.fillRect(x + ox * s, y + oy * s, s * 0.08, s * 0.08);
      }
      break;
    default:
      break;
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
  ctx.strokeStyle = unit.movesLeft > 0 ? '#ffffff' : '#333333';
  ctx.lineWidth = Math.max(1.5, s * 0.045);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  drawGlyph(ctx, unit, cx, cy, r, onIconReady);
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
  const scale = ctx.getTransform().a || 1;
  const bmp = iconBitmap(def.icon, '#ffffff', box * scale, onReady ?? (() => {}));
  if (bmp) {
    ctx.drawImage(bmp, cx - box / 2, cy - box / 2, box, box);
    return;
  }
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

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const i = tileIndex(map, tx, ty);
      if (explored[i] !== 1) continue;
      const p = pos(tx, ty);
      const t = map.tiles[i]!.terrain;
      ctx.fillStyle = TERRAIN_COLOR[t];
      ctx.fillRect(p.x, p.y, s + 0.5, s + 0.5);
      if (s >= 18) drawTerrainMark(ctx, t, p.x, p.y, s);
    }
  }

  // Faint grid over explored land so tiles read as squares.
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (explored[tileIndex(map, tx, ty)] !== 1) continue;
      const p = pos(tx, ty);
      ctx.rect(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, s, s);
    }
  }
  ctx.stroke();

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
    ctx.fillStyle = playerColor(state, city.owner);
    ctx.strokeStyle = city.id === view.openCityId ? '#ffe066' : '#111';
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.fillRect(p.x + inset, p.y + inset, s - inset * 2, s - inset * 2);
    ctx.strokeRect(p.x + inset, p.y + inset, s - inset * 2, s - inset * 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(s * 0.36)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(city.size), p.x + s / 2, p.y + s / 2 + s * 0.02);
    if (city.capitalOf !== null) drawStar(ctx, p.x + inset, p.y + inset, s * 0.13);
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

  // Units: only where the viewer can currently see. One disc per tile, a count badge for
  // stacks, and a second disc peeking out behind when the stack has more than one type.
  const byTile = new Map<number, Unit[]>();
  for (const u of state.units) {
    const i = tileIndex(map, u.x, u.y);
    if (!visible[i]) continue;
    const list = byTile.get(i) ?? [];
    list.push(u);
    byTile.set(i, list);
  }
  for (const [, list] of byTile) {
    const shown = list.find((u) => u.id === view.selectedUnitId) ?? list.find((u) => u.movesLeft > 0) ?? list[0]!;
    const p = pos(shown.x, shown.y);
    const inCity = state.cities.some((c) => c.x === shown.x && c.y === shown.y);
    drawUnit(ctx, state, shown, list.length, p.x, p.y, s, shown.id === view.selectedUnitId, inCity, behindUnit(list, shown), view.onIconReady);
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
        const p = pos(tx, ty);
        ctx.fillRect(p.x, p.y, s + 0.5, s + 0.5);
      }
    }
  }

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
