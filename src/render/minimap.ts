// Round 14 (A2): the minimap. The whole map small, as the viewer knows it: explored terrain
// (land and water in two tones each way, so continents read at a glance), every known city as
// a dot in its owner's color, the tiles out of sight dimmed, and a frame for what the main map
// shows. Tapping it jumps there; dragging on it pans (src/ui/app.ts). Read-only on state.

import type { TerrainId } from '../data/terrain';
import { visibleTiles } from '../game/fog';
import type { GameState } from '../game/types';
import type { Camera } from './camera';
import { playerColor } from './renderer';

const MINI_COLOR: Record<TerrainId, [number, number, number]> = {
  grassland: [93, 154, 60],
  plains: [150, 150, 70],
  forest: [47, 106, 50],
  hills: [138, 122, 74],
  mountains: [125, 119, 115],
  desert: [217, 194, 122],
  coast: [63, 134, 184],
  ocean: [31, 79, 128],
};
const UNEXPLORED: [number, number, number] = [5, 8, 12];

/** Pixels per tile for a minimap no bigger than `maxW` × `maxH`. */
export function minimapScale(mapW: number, mapH: number, maxW: number, maxH: number): number {
  return Math.max(1, Math.min(maxW / mapW, maxH / mapH));
}

/** The map tile (fractional) under a point on the minimap (CSS px from its top left). */
export function minimapToWorld(mx: number, my: number, scale: number, mapW: number, mapH: number): { x: number; y: number } {
  return { x: Math.min(mapW, Math.max(0, mx / scale)), y: Math.min(mapH, Math.max(0, my / scale)) };
}

/** The terrain layer, one pixel per tile, remade only when the viewer explores more. */
export class MinimapTerrain {
  private image: HTMLCanvasElement | undefined;
  private key = '';

  get(state: GameState, viewer: number): HTMLCanvasElement {
    const { map } = state;
    const explored = state.players[viewer]!.explored;
    const vis = visibleTiles(state, viewer);
    // A hash of what's explored and what's in sight: the layer is remade only when it changes.
    let n = 0;
    let v = 0;
    for (let i = 0; i < explored.length; i++) {
      if (explored[i] === 1) n = (Math.imul(n, 31) + i) | 0;
      if (vis[i]) v = (Math.imul(v, 31) + i) | 0;
    }
    const key = `${map.width}x${map.height}|${n}|${v}|${state.seed}`;
    if (this.image && key === this.key) return this.image;
    const c = this.image ?? document.createElement('canvas');
    c.width = map.width;
    c.height = map.height;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(map.width, map.height);
    for (let i = 0; i < map.tiles.length; i++) {
      let rgb = UNEXPLORED;
      if (explored[i] === 1) {
        rgb = MINI_COLOR[map.tiles[i]!.terrain];
        // Out of sight: darker, as on the main map.
        if (!vis[i]) rgb = [rgb[0] * 0.6, rgb[1] * 0.6, rgb[2] * 0.6];
      }
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.image = c;
    this.key = key;
    return c;
  }
}

/**
 * Draws the minimap into `ctx` (already scaled to CSS px): terrain, cities, and the frame of
 * the main view (`viewW` × `viewH` CSS px seen through `camera`).
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewer: number,
  terrain: MinimapTerrain,
  camera: Camera,
  viewW: number,
  viewH: number,
  scale: number,
): void {
  const { map } = state;
  const w = map.width * scale;
  const h = map.height * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(terrain.get(state, viewer), 0, 0, w, h);
  const explored = state.players[viewer]!.explored;
  // Cities: a dot in the owner's color (a size a tap can hit is the frame's job, not the dot's).
  const r = Math.max(1.5, scale * 0.9);
  for (const c of state.cities) {
    if (explored[c.y * map.width + c.x] !== 1) continue;
    ctx.fillStyle = playerColor(state, c.owner);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc((c.x + 0.5) * scale, (c.y + 0.5) * scale, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // The main view's frame.
  const s = camera.tileSize;
  const fx = (camera.cx - viewW / 2 / s) * scale;
  const fy = (camera.cy - viewH / 2 / s) * scale;
  ctx.strokeStyle = '#ffe066';
  ctx.lineWidth = 2;
  ctx.strokeRect(fx, fy, (viewW / s) * scale, (viewH / s) * scale);
  // A thin frame around the whole map.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}
