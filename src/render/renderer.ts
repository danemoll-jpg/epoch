// Canvas 2D renderer. Reads game state and view state; never changes game state.
// Placeholder art: colored tiles, simple terrain marks, lettered unit discs, city squares.

import { CIVS } from '../data/civs';
import type { TerrainId } from '../data/terrain';
import { UNITS } from '../data/units';
import { visibleTiles } from '../game/fog';
import { tileIndex } from '../game/grid';
import type { Coord, GameState, Unit } from '../game/types';
import { worldToScreen, type Camera } from './camera';

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
): void {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.3;
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
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(s * 0.32)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(UNITS[unit.type].glyph, cx, cy + s * 0.01);
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

  // Cities: shown wherever the viewer has explored (they don't move).
  for (const city of state.cities) {
    if (explored[tileIndex(map, city.x, city.y)] !== 1) continue;
    const p = pos(city.x, city.y);
    const inset = s * 0.12;
    ctx.fillStyle = playerColor(state, city.owner);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.fillRect(p.x + inset, p.y + inset, s - inset * 2, s - inset * 2);
    ctx.strokeRect(p.x + inset, p.y + inset, s - inset * 2, s - inset * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(p.x + s * 0.4, p.y + s * 0.3, s * 0.2, s * 0.4);
  }

  // Units: only where the viewer can currently see. One disc per tile; badge for stacks.
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
    drawUnit(ctx, state, shown, list.length, p.x, p.y, s, shown.id === view.selectedUnitId);
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
