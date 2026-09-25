// Round 14 (B1, B2): the art styles, all drawn in code (no downloaded tiles).
//
// Terrain: 'classic' is the look the game has had since M1 (flat colors, simple marks, a faint
// grid). Three candidates for Dan to pick from on docs/terrain-style-candidates.html:
//   A 'painted'   soft gradients, shaded hills, tree clusters, a sandy shore, water that shimmers;
//   B 'storybook' bright colors, bold outlines along every coast, lollipop trees, like the portraits;
//   C 'flat'      clean flat modern: muted colors, small geometric marks, no gradients.
// Cities: 'classic' is today's colored square (now with walls drawn). Two candidates that grow
// with size (src/data/cityLooks.ts) and change with the owner's era:
//   A 'towns' soft little houses on a patch of the owner's color (goes with painted);
//   B 'bold'  outlined storybook buildings with roofs in the owner's color (goes with storybook).
// The renderer draws the chosen style through these functions; only dev builds can switch
// (☰ → Art style) until Dan picks. Everything here is read-only drawing.

import type { CityLookId } from '../data/cityLooks';
import type { TerrainId } from '../data/terrain';

export type TerrainStyleId = 'classic' | 'painted' | 'storybook' | 'flat';
export type CityStyleId = 'classic' | 'towns' | 'bold';

export interface ArtChoice {
  terrain: TerrainStyleId;
  city: CityStyleId;
}

/** What the game shows until Dan picks (and what production builds always show until then). */
export const DEFAULT_ART: ArtChoice = { terrain: 'classic', city: 'classic' };

export const TERRAIN_STYLES: { id: TerrainStyleId; letter: string; name: string; summary: string }[] = [
  { id: 'classic', letter: '–', name: 'Today’s look', summary: 'Flat colors, simple marks, a faint grid.' },
  { id: 'painted', letter: 'A', name: 'Painted', summary: 'Soft gradients, shaded hills, tree clusters, sandy shores, shimmering water.' },
  { id: 'storybook', letter: 'B', name: 'Storybook', summary: 'Bright colors, bold outlines along the coasts, lollipop trees; matches the portraits.' },
  { id: 'flat', letter: 'C', name: 'Clean flat', summary: 'Muted modern colors, small geometric marks, no gradients.' },
];

export const CITY_STYLES: { id: CityStyleId; letter: string; name: string; summary: string }[] = [
  { id: 'classic', letter: '–', name: 'Today’s look', summary: 'A square in the owner’s color with the size on it (now with walls).' },
  { id: 'towns', letter: 'A', name: 'Little towns', summary: 'Soft houses on a patch of the owner’s color; more and taller as the city grows.' },
  { id: 'bold', letter: 'B', name: 'Bold buildings', summary: 'Outlined storybook buildings with roofs in the owner’s color.' },
];

/** One tile to draw: its terrain, where it is, and which sides meet the other kind (land/water). */
export interface TileInfo {
  terrain: TerrainId;
  x: number;
  y: number;
  water: boolean;
  /** A neighbor on this side is the other kind (water beside land, land beside water), as far as the viewer knows. */
  edge: { n: boolean; e: boolean; s: boolean; w: boolean };
}

// ---- helpers ------------------------------------------------------------------------------

/** A steady 0..1 number per tile (and salt), so marks sit in the same place every frame. */
export function tileHash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(salt + 7, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise (0..1) over the map, `spacing` tiles between its lattice points. */
export function smoothNoise(x: number, y: number, spacing: number): number {
  const gx = x / spacing;
  const gy = y / spacing;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const f = (t: number) => t * t * (3 - 2 * t);
  const tx = f(gx - x0);
  const ty = f(gy - y0);
  const v = (a: number, b: number) => tileHash(a, b, 99);
  const top = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
  const bottom = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
  return top + (bottom - top) * ty;
}

/** Two hex colors mixed (0 = a, 1 = b). */
function mix(a: string, b: string, f: number): string {
  const p = parseInt(a.slice(1), 16);
  const q = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((p >> sh) & 255) * (1 - f) + ((q >> sh) & 255) * f);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function tri(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
}

// ---- classic (the look since M1) ------------------------------------------------------------

export const CLASSIC_COLOR: Record<TerrainId, string> = {
  grassland: '#5d9a3c',
  plains: '#a7a24a',
  forest: '#2f6a32',
  hills: '#8a7a4a',
  mountains: '#7d7773',
  desert: '#d9c27a',
  coast: '#3f86b8',
  ocean: '#1f4f80',
};

function classicMark(ctx: CanvasRenderingContext2D, t: TerrainId, x: number, y: number, s: number): void {
  switch (t) {
    case 'forest':
      ctx.fillStyle = '#1f4d22';
      for (const [ox, oy] of [[0.3, 0.55], [0.62, 0.42], [0.55, 0.78]] as const) {
        tri(ctx, x + ox * s, y + (oy - 0.22) * s, x + (ox + 0.13) * s, y + oy * s, x + (ox - 0.13) * s, y + oy * s);
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
      tri(ctx, x + s * 0.5, y + s * 0.15, x + s * 0.88, y + s * 0.85, x + s * 0.12, y + s * 0.85);
      ctx.fill();
      ctx.fillStyle = '#eeeeee';
      tri(ctx, x + s * 0.5, y + s * 0.15, x + s * 0.61, y + s * 0.36, x + s * 0.39, y + s * 0.36);
      ctx.fill();
      break;
    case 'desert':
      ctx.fillStyle = '#c4aa60';
      for (const [ox, oy] of [[0.3, 0.35], [0.7, 0.5], [0.4, 0.75]] as const) ctx.fillRect(x + ox * s, y + oy * s, s * 0.08, s * 0.08);
      break;
    default:
      break;
  }
}

function drawClassic(ctx: CanvasRenderingContext2D, t: TileInfo, x: number, y: number, s: number): void {
  ctx.fillStyle = CLASSIC_COLOR[t.terrain];
  ctx.fillRect(x, y, s + 0.5, s + 0.5);
  if (s >= 18) classicMark(ctx, t.terrain, x, y, s);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, s, s);
}

// ---- A: painted ---------------------------------------------------------------------------

const PAINTED: Record<TerrainId, [string, string]> = {
  grassland: ['#7cb24e', '#5b9139'],
  plains: ['#c9bd62', '#a89c45'],
  forest: ['#4f8a3e', '#3a6f2e'],
  hills: ['#a99966', '#857449'],
  mountains: ['#9a948d', '#76706a'],
  desert: ['#ecd59a', '#d5b870'],
  coast: ['#5fa7cf', '#4389b6'],
  ocean: ['#2b6399', '#1d4a7a'],
};

function drawPainted(ctx: CanvasRenderingContext2D, t: TileInfo, x: number, y: number, s: number): void {
  const [light, dark] = PAINTED[t.terrain];
  // A tint that drifts slowly across the map (not a gradient per tile, which reads as a grid).
  ctx.fillStyle = mix(light, dark, smoothNoise(t.x, t.y, 5));
  ctx.fillRect(x, y, s + 0.5, s + 0.5);
  if (!t.water) {
    // A sandy shore along any side that meets the sea.
    ctx.fillStyle = 'rgba(240,222,160,0.75)';
    const b = s * 0.09;
    if (t.edge.n) ctx.fillRect(x, y, s, b);
    if (t.edge.s) ctx.fillRect(x, y + s - b, s, b);
    if (t.edge.w) ctx.fillRect(x, y, b, s);
    if (t.edge.e) ctx.fillRect(x + s - b, y, b, s);
  } else if (t.terrain === 'coast') {
    // Shallow water: lighter where it meets land.
    ctx.fillStyle = 'rgba(160,215,235,0.45)';
    const b = s * 0.16;
    if (t.edge.n) ctx.fillRect(x, y, s, b);
    if (t.edge.s) ctx.fillRect(x, y + s - b, s, b);
    if (t.edge.w) ctx.fillRect(x, y, b, s);
    if (t.edge.e) ctx.fillRect(x + s - b, y, b, s);
  }
  if (s < 16) return;
  switch (t.terrain) {
    case 'grassland': {
      ctx.strokeStyle = 'rgba(40,90,30,0.55)';
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const gx = x + s * (0.15 + 0.7 * tileHash(t.x, t.y, i));
        const gy = y + s * (0.2 + 0.65 * tileHash(t.x, t.y, i + 9));
        ctx.moveTo(gx - s * 0.04, gy);
        ctx.lineTo(gx - s * 0.02, gy - s * 0.07);
        ctx.moveTo(gx + s * 0.01, gy);
        ctx.lineTo(gx + s * 0.03, gy - s * 0.08);
      }
      ctx.stroke();
      break;
    }
    case 'plains': {
      ctx.strokeStyle = 'rgba(140,110,40,0.45)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const py = y + s * (0.3 + i * 0.22);
        ctx.moveTo(x + s * (0.15 + 0.1 * tileHash(t.x, t.y, i)), py);
        ctx.quadraticCurveTo(x + s * 0.5, py - s * 0.05, x + s * (0.75 + 0.1 * tileHash(t.x, t.y, i + 3)), py);
      }
      ctx.stroke();
      break;
    }
    case 'forest': {
      const trees: [number, number, number][] = [[0.28, 0.36, 0.17], [0.66, 0.3, 0.16], [0.46, 0.62, 0.19], [0.78, 0.68, 0.14], [0.2, 0.75, 0.13]];
      for (const [ox, oy, r] of trees) {
        const cx = x + s * (ox + (tileHash(t.x, t.y, ox * 10) - 0.5) * 0.06);
        const cy = y + s * oy;
        ctx.fillStyle = 'rgba(20,50,20,0.45)';
        ctx.beginPath();
        ctx.arc(cx + s * 0.04, cy + s * 0.05, s * r, 0, Math.PI * 2);
        ctx.fill();
        const rg = ctx.createRadialGradient(cx - s * r * 0.4, cy - s * r * 0.4, s * r * 0.1, cx, cy, s * r);
        rg.addColorStop(0, '#6fae4f');
        rg.addColorStop(1, '#2c5f26');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(cx, cy, s * r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'hills': {
      for (const [ox, oy, r] of [[0.32, 0.66, 0.26], [0.7, 0.56, 0.24]] as const) {
        const cx = x + s * ox;
        const cy = y + s * oy;
        const rg = ctx.createRadialGradient(cx - s * r * 0.4, cy - s * r * 0.6, s * r * 0.1, cx, cy, s * r * 1.1);
        rg.addColorStop(0, '#d8c894');
        rg.addColorStop(1, '#6f6040');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * r, s * r * 0.7, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'mountains': {
      const px = x + s * 0.5;
      tri(ctx, px, y + s * 0.12, x + s * 0.9, y + s * 0.88, x + s * 0.1, y + s * 0.88);
      ctx.fillStyle = '#6e6862';
      ctx.fill();
      tri(ctx, px, y + s * 0.12, px + s * 0.4, y + s * 0.88, px, y + s * 0.88);
      ctx.fillStyle = '#56504b';
      ctx.fill();
      tri(ctx, px, y + s * 0.12, px + s * 0.12, y + s * 0.34, px - s * 0.12, y + s * 0.34);
      ctx.fillStyle = '#f4f4f4';
      ctx.fill();
      break;
    }
    case 'desert': {
      ctx.strokeStyle = 'rgba(170,130,60,0.55)';
      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const dy = y + s * (0.4 + i * 0.3);
        ctx.moveTo(x + s * 0.12, dy);
        ctx.quadraticCurveTo(x + s * 0.45, dy - s * 0.14, x + s * 0.85, dy);
      }
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/** Painted water's shimmer (drawn over the terrain each frame): a few short light strokes that drift. */
export function drawShimmer(ctx: CanvasRenderingContext2D, t: TileInfo, x: number, y: number, s: number, time: number): void {
  if (!t.water || s < 16) return;
  const phase = time / 1400 + tileHash(t.x, t.y, 5) * Math.PI * 2;
  ctx.strokeStyle = `rgba(220,240,255,${0.18 + 0.14 * Math.sin(phase)})`;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const wx = x + s * (0.2 + 0.5 * tileHash(t.x, t.y, i + 20) + 0.05 * Math.sin(phase + i));
    const wy = y + s * (0.3 + 0.4 * tileHash(t.x, t.y, i + 30));
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + s * 0.16, wy);
  }
  ctx.stroke();
}

// ---- B: storybook -------------------------------------------------------------------------

const STORY: Record<TerrainId, string> = {
  grassland: '#79c74a',
  plains: '#e0cf5c',
  forest: '#5fb24a',
  hills: '#c9a86a',
  mountains: '#a8a3a0',
  desert: '#f7dd8a',
  coast: '#4fb3e8',
  ocean: '#2a7fd0',
};
const INK = '#23201c';

function drawStorybook(ctx: CanvasRenderingContext2D, t: TileInfo, x: number, y: number, s: number): void {
  ctx.fillStyle = STORY[t.terrain];
  ctx.fillRect(x, y, s + 0.5, s + 0.5);
  const lw = Math.max(1.5, s * 0.05);
  if (s >= 16) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    switch (t.terrain) {
      case 'grassland': {
        ctx.strokeStyle = '#3f8a2a';
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const gx = x + s * (0.2 + 0.6 * tileHash(t.x, t.y, i));
          const gy = y + s * (0.3 + 0.5 * tileHash(t.x, t.y, i + 4));
          ctx.moveTo(gx - s * 0.05, gy - s * 0.06);
          ctx.lineTo(gx, gy);
          ctx.lineTo(gx + s * 0.05, gy - s * 0.06);
        }
        ctx.stroke();
        break;
      }
      case 'plains': {
        ctx.strokeStyle = '#b39a30';
        ctx.beginPath();
        for (let i = 0; i < 2; i++) {
          const py = y + s * (0.38 + i * 0.28);
          ctx.moveTo(x + s * 0.2, py);
          ctx.lineTo(x + s * 0.8, py);
        }
        ctx.stroke();
        break;
      }
      case 'forest': {
        for (const [ox, oy] of [[0.3, 0.42], [0.68, 0.36], [0.5, 0.72]] as const) {
          const cx = x + s * ox;
          const cy = y + s * oy;
          ctx.fillStyle = '#8a5a2b';
          ctx.fillRect(cx - s * 0.025, cy, s * 0.05, s * 0.16);
          ctx.strokeRect(cx - s * 0.025, cy, s * 0.05, s * 0.16);
          ctx.fillStyle = '#2f8f3a';
          ctx.beginPath();
          ctx.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        break;
      }
      case 'hills': {
        ctx.fillStyle = '#dcbf85';
        for (const [ox, oy, r] of [[0.35, 0.7, 0.22], [0.68, 0.62, 0.2]] as const) {
          ctx.beginPath();
          ctx.arc(x + s * ox, y + s * oy, s * r, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        break;
      }
      case 'mountains': {
        tri(ctx, x + s * 0.5, y + s * 0.14, x + s * 0.88, y + s * 0.84, x + s * 0.12, y + s * 0.84);
        ctx.fillStyle = '#8c8682';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + s * 0.37, y + s * 0.38);
        ctx.lineTo(x + s * 0.5, y + s * 0.14);
        ctx.lineTo(x + s * 0.63, y + s * 0.38);
        ctx.lineTo(x + s * 0.56, y + s * 0.33);
        ctx.lineTo(x + s * 0.5, y + s * 0.4);
        ctx.lineTo(x + s * 0.44, y + s * 0.33);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'desert': {
        // A little cactus now and then, otherwise a dune line.
        if (tileHash(t.x, t.y, 2) < 0.35) {
          const cx = x + s * 0.5;
          const cy = y + s * 0.5;
          ctx.fillStyle = '#4c9a3c';
          ctx.beginPath();
          ctx.moveTo(cx, cy + s * 0.22);
          ctx.lineTo(cx, cy - s * 0.18);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - s * 0.1, cy);
          ctx.lineTo(cx - s * 0.1, cy - s * 0.1);
          ctx.moveTo(cx, cy + s * 0.06);
          ctx.lineTo(cx + s * 0.1, cy + s * 0.06);
          ctx.lineTo(cx + s * 0.1, cy - s * 0.05);
          ctx.lineWidth = s * 0.07;
          ctx.strokeStyle = INK;
          ctx.stroke();
          ctx.lineWidth = s * 0.04;
          ctx.strokeStyle = '#4c9a3c';
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#c9a44e';
          ctx.beginPath();
          ctx.moveTo(x + s * 0.15, y + s * 0.6);
          ctx.quadraticCurveTo(x + s * 0.45, y + s * 0.38, x + s * 0.85, y + s * 0.6);
          ctx.stroke();
        }
        break;
      }
      case 'ocean':
      case 'coast': {
        if (tileHash(t.x, t.y, 3) < (t.terrain === 'ocean' ? 0.5 : 0.3)) {
          ctx.strokeStyle = t.terrain === 'ocean' ? '#7cc0f2' : '#a5dcf6';
          ctx.beginPath();
          const wx = x + s * 0.3;
          const wy = y + s * (0.4 + 0.2 * tileHash(t.x, t.y, 6));
          ctx.moveTo(wx, wy);
          ctx.quadraticCurveTo(wx + s * 0.1, wy - s * 0.1, wx + s * 0.2, wy);
          ctx.quadraticCurveTo(wx + s * 0.3, wy + s * 0.1, wx + s * 0.4, wy);
          ctx.stroke();
        }
        break;
      }
    }
  }
  // Bold coastlines: a dark line along every side where land meets water (drawn on the land side).
  if (!t.water) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    const o = ctx.lineWidth / 2;
    if (t.edge.n) (ctx.moveTo(x, y + o), ctx.lineTo(x + s, y + o));
    if (t.edge.s) (ctx.moveTo(x, y + s - o), ctx.lineTo(x + s, y + s - o));
    if (t.edge.w) (ctx.moveTo(x + o, y), ctx.lineTo(x + o, y + s));
    if (t.edge.e) (ctx.moveTo(x + s - o, y), ctx.lineTo(x + s - o, y + s));
    ctx.stroke();
  }
}

// ---- C: clean flat --------------------------------------------------------------------------

const FLAT: Record<TerrainId, [string, string]> = {
  grassland: ['#8fb87a', '#76a062'],
  plains: ['#cdc28b', '#b3a770'],
  forest: ['#5f8f64', '#4a7650'],
  hills: ['#b3a582', '#978a68'],
  mountains: ['#a2a0a6', '#86848b'],
  desert: ['#e6d6a8', '#cdbc8a'],
  coast: ['#79b4d6', '#6aa3c5'],
  ocean: ['#3f6f9c', '#355f88'],
};

function drawFlat(ctx: CanvasRenderingContext2D, t: TileInfo, x: number, y: number, s: number): void {
  const [base, mark] = FLAT[t.terrain];
  ctx.fillStyle = base;
  ctx.fillRect(x, y, s + 0.5, s + 0.5);
  if (s >= 16) {
    ctx.fillStyle = mark;
    switch (t.terrain) {
      case 'forest':
        tri(ctx, x + s * 0.35, y + s * 0.28, x + s * 0.48, y + s * 0.58, x + s * 0.22, y + s * 0.58);
        ctx.fill();
        tri(ctx, x + s * 0.65, y + s * 0.4, x + s * 0.78, y + s * 0.7, x + s * 0.52, y + s * 0.7);
        ctx.fill();
        break;
      case 'hills':
        ctx.beginPath();
        ctx.arc(x + s * 0.5, y + s * 0.68, s * 0.24, Math.PI, 0);
        ctx.fill();
        break;
      case 'mountains':
        tri(ctx, x + s * 0.5, y + s * 0.22, x + s * 0.8, y + s * 0.76, x + s * 0.2, y + s * 0.76);
        ctx.fill();
        break;
      case 'desert':
        for (const [ox, oy] of [[0.35, 0.4], [0.62, 0.62]] as const) {
          ctx.beginPath();
          ctx.arc(x + s * ox, y + s * oy, s * 0.045, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'plains':
        ctx.fillRect(x + s * 0.25, y + s * 0.47, s * 0.5, s * 0.06);
        break;
      case 'grassland':
        ctx.beginPath();
        ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.04, 0, Math.PI * 2);
        ctx.fill();
        break;
      default:
        break;
    }
  }
  // A thin light line where water meets land.
  if (t.water) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const b = Math.max(1, s * 0.04);
    if (t.edge.n) ctx.fillRect(x, y, s, b);
    if (t.edge.s) ctx.fillRect(x, y + s - b, s, b);
    if (t.edge.w) ctx.fillRect(x, y, b, s);
    if (t.edge.e) ctx.fillRect(x + s - b, y, b, s);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, s, s);
}

/** Draws one explored tile's terrain in the chosen style. */
export function drawTerrainTile(ctx: CanvasRenderingContext2D, style: TerrainStyleId, t: TileInfo, x: number, y: number, s: number): void {
  ctx.save();
  switch (style) {
    case 'painted':
      drawPainted(ctx, t, x, y, s);
      break;
    case 'storybook':
      drawStorybook(ctx, t, x, y, s);
      break;
    case 'flat':
      drawFlat(ctx, t, x, y, s);
      break;
    default:
      drawClassic(ctx, t, x, y, s);
  }
  ctx.restore();
}

// ---- cities -------------------------------------------------------------------------------

export interface CityDraw {
  look: CityLookId;
  /** Number of buildings to draw (from the look). */
  buildings: number;
  /** The owner's era, 0 (Ancient) to 3 (Modern). */
  era: number;
  color: string;
  walls: boolean;
  size: number;
  /** The city panel is open on it (a gold rim). */
  open: boolean;
}

/** Where a look's buildings stand in the tile (fractions), front ones last so they overlap. */
const SPOTS: [number, number][] = [
  [0.5, 0.42], [0.3, 0.5], [0.7, 0.5], [0.42, 0.62], [0.62, 0.64], [0.24, 0.66], [0.78, 0.66], [0.36, 0.34], [0.64, 0.34],
];

/** The drawing order of a look's spots: back (higher up) first. */
function spots(n: number): [number, number][] {
  return SPOTS.slice(0, n).sort((a, b) => a[1] - b[1]);
}

/** The height of building i in a look: bigger looks build taller, the center tallest. */
function height(look: CityLookId, i: number): number {
  const base = { village: 0.16, town: 0.2, city: 0.25, metropolis: 0.32 }[look];
  return base * (i === 0 ? 1.35 : 0.85 + 0.3 * ((i * 37) % 10) / 10);
}

function walls(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, bold: boolean, insetFrac = 0.08): void {
  const inset = s * insetFrac;
  const w = s - inset * 2;
  ctx.save();
  ctx.strokeStyle = bold ? INK : '#5a5550';
  ctx.lineWidth = Math.max(2, s * (bold ? 0.09 : 0.075));
  ctx.strokeRect(x + inset, y + inset, w, w);
  ctx.strokeStyle = bold ? '#b8b2a8' : '#c9c2b6';
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.strokeRect(x + inset, y + inset, w, w);
  // Merlons along the top edge and the corner towers.
  ctx.fillStyle = bold ? '#b8b2a8' : '#c9c2b6';
  ctx.strokeStyle = bold ? INK : '#5a5550';
  ctx.lineWidth = Math.max(1, s * 0.02);
  const m = s * 0.06;
  for (let i = 0; i < 5; i++) {
    const mx = x + inset + (w - m) * (i / 4);
    ctx.fillRect(mx, y + inset - m * 0.9, m, m * 0.9);
    ctx.strokeRect(mx, y + inset - m * 0.9, m, m * 0.9);
  }
  for (const [cx, cy] of [[x + inset, y + inset], [x + s - inset, y + inset], [x + inset, y + s - inset], [x + s - inset, y + s - inset]]) {
    ctx.beginPath();
    ctx.arc(cx!, cy!, s * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** One building in the 'towns' style (A), standing on (bx, by), `h` tall (tile fractions × s). */
function townBuilding(ctx: CanvasRenderingContext2D, era: number, bx: number, by: number, s: number, h: number): void {
  const w = s * (era >= 3 ? 0.13 : 0.19);
  const top = by - s * h;
  switch (era) {
    case 0: {
      // A round hut with a thatched cone.
      ctx.fillStyle = '#b08858';
      ctx.fillRect(bx - w / 2, top + s * h * 0.45, w, s * h * 0.55);
      tri(ctx, bx, top, bx + w * 0.7, top + s * h * 0.5, bx - w * 0.7, top + s * h * 0.5);
      ctx.fillStyle = '#d9b565';
      ctx.fill();
      break;
    }
    case 1: {
      // Stone walls and a red-tiled roof.
      ctx.fillStyle = '#c9c1b0';
      ctx.fillRect(bx - w / 2, top + s * h * 0.35, w, s * h * 0.65);
      tri(ctx, bx, top, bx + w * 0.65, top + s * h * 0.38, bx - w * 0.65, top + s * h * 0.38);
      ctx.fillStyle = '#b5553a';
      ctx.fill();
      break;
    }
    case 2: {
      // Brick with a flat roof and a smoking chimney.
      ctx.fillStyle = '#a4553e';
      ctx.fillRect(bx - w / 2, top + s * h * 0.2, w, s * h * 0.8);
      ctx.fillStyle = '#5a4034';
      ctx.fillRect(bx + w * 0.15, top - s * 0.02, w * 0.2, s * h * 0.25);
      ctx.fillStyle = 'rgba(210,210,210,0.7)';
      ctx.beginPath();
      ctx.arc(bx + w * 0.3, top - s * 0.05, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      // Glass towers with lit windows.
      ctx.fillStyle = '#7f97ad';
      ctx.fillRect(bx - w / 2, top, w, s * h);
      ctx.fillStyle = '#e8f1f8';
      for (let r = top + s * 0.03; r < by - s * 0.03; r += s * 0.05) {
        ctx.fillRect(bx - w * 0.3, r, w * 0.18, s * 0.02);
        ctx.fillRect(bx + w * 0.1, r, w * 0.18, s * 0.02);
      }
    }
  }
}

/** One building in the 'bold' style (B): outlined, the roof in the owner's color. */
function boldBuilding(ctx: CanvasRenderingContext2D, era: number, bx: number, by: number, s: number, h: number, color: string): void {
  const w = s * (era >= 3 ? 0.14 : 0.2);
  const top = by - s * h;
  ctx.lineWidth = Math.max(1.2, s * 0.03);
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  switch (era) {
    case 0: {
      // A tent.
      tri(ctx, bx, top, bx + w * 0.65, by, bx - w * 0.65, by);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
      tri(ctx, bx, top + s * h * 0.4, bx + w * 0.18, by, bx - w * 0.18, by);
      ctx.fillStyle = INK;
      ctx.fill();
      break;
    }
    case 1: {
      // A little keep with a pointed roof.
      ctx.fillStyle = '#e9e1cf';
      ctx.fillRect(bx - w / 2, top + s * h * 0.35, w, s * h * 0.65);
      ctx.strokeRect(bx - w / 2, top + s * h * 0.35, w, s * h * 0.65);
      tri(ctx, bx, top, bx + w * 0.62, top + s * h * 0.36, bx - w * 0.62, top + s * h * 0.36);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 2: {
      // A factory with a sawtooth roof.
      ctx.fillStyle = '#d88a64';
      ctx.fillRect(bx - w / 2, top + s * h * 0.3, w, s * h * 0.7);
      ctx.strokeRect(bx - w / 2, top + s * h * 0.3, w, s * h * 0.7);
      ctx.beginPath();
      ctx.moveTo(bx - w / 2, top + s * h * 0.3);
      ctx.lineTo(bx - w / 2, top);
      ctx.lineTo(bx, top + s * h * 0.3);
      ctx.lineTo(bx, top);
      ctx.lineTo(bx + w / 2, top + s * h * 0.3);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
      break;
    }
    default: {
      // A skyscraper with a colored crown.
      ctx.fillStyle = '#cfe0ee';
      ctx.fillRect(bx - w / 2, top, w, s * h);
      ctx.strokeRect(bx - w / 2, top, w, s * h);
      ctx.fillStyle = color;
      ctx.fillRect(bx - w / 2, top, w, s * h * 0.18);
      ctx.strokeRect(bx - w / 2, top, w, s * h * 0.18);
    }
  }
}

/** The city's size, in a small dark badge at the bottom of its tile (the new looks). */
function sizeBadge(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, size: number): void {
  const r = s * 0.15;
  const cx = x + s / 2;
  const cy = y + s * 0.84;
  ctx.fillStyle = 'rgba(15,18,24,0.9)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${Math.round(s * 0.19)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(size), cx, cy + s * 0.01);
}

/**
 * Draws a city in the chosen style (the capital star, religion, holy-city and "!" badges, and
 * the name label are drawn over it by the renderer, the same in every style).
 */
export function drawCityArt(ctx: CanvasRenderingContext2D, style: CityStyleId, c: CityDraw, x: number, y: number, s: number): void {
  ctx.save();
  if (style === 'classic') {
    const inset = s * 0.12;
    ctx.fillStyle = c.color;
    ctx.strokeStyle = c.open ? '#ffe066' : '#111';
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.fillRect(x + inset, y + inset, s - inset * 2, s - inset * 2);
    ctx.strokeRect(x + inset, y + inset, s - inset * 2, s - inset * 2);
    // Walls ring the square itself (drawn over its edge, so they show in this plain look).
    if (c.walls) walls(ctx, x, y, s, false, 0.1);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(s * 0.36)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.size), x + s / 2, y + s / 2 + s * 0.02);
    ctx.restore();
    return;
  }
  const bold = style === 'bold';
  // The ground: a patch in the owner's color (a rounded square), larger as the city grows.
  const pad = { village: 0.2, town: 0.14, city: 0.1, metropolis: 0.06 }[c.look];
  const px = x + s * pad;
  const py = y + s * (pad + 0.06);
  const pw = s * (1 - pad * 2);
  const ph = s * (1 - pad * 2 - 0.02);
  const r = s * 0.12;
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.arcTo(px + pw, py, px + pw, py + ph, r);
  ctx.arcTo(px + pw, py + ph, px, py + ph, r);
  ctx.arcTo(px, py + ph, px, py, r);
  ctx.arcTo(px, py, px + pw, py, r);
  ctx.closePath();
  // Neutral ground so buildings (and bold roofs in the owner's color) stand out, ringed in
  // the owner's color.
  ctx.fillStyle = bold ? '#f3ead2' : 'rgba(233,223,196,0.95)';
  ctx.fill();
  ctx.lineWidth = Math.max(2, s * (bold ? 0.075 : 0.06));
  ctx.strokeStyle = c.open ? '#ffe066' : c.color;
  ctx.stroke();
  if (bold) {
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  if (c.walls) walls(ctx, x, y, s, bold);
  // Buildings, back to front.
  const list = spots(c.buildings);
  list.forEach(([fx, fy], i) => {
    const bx = x + s * fx;
    const by = y + s * (fy + 0.08);
    const h = height(c.look, SPOTS.indexOf(list[i]!));
    if (bold) boldBuilding(ctx, c.era, bx, by, s, h, c.color);
    else townBuilding(ctx, c.era, bx, by, s, h);
  });
  if (!bold) {
    // A pennant in the owner's color over the main building.
    const [fx, fy] = SPOTS[0]!;
    const bx = x + s * fx;
    const top = y + s * (fy + 0.08) - s * height(c.look, 0) - s * 0.02;
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath();
    ctx.moveTo(bx, top);
    ctx.lineTo(bx, top - s * 0.14);
    ctx.stroke();
    tri(ctx, bx, top - s * 0.14, bx + s * 0.11, top - s * 0.1, bx, top - s * 0.06);
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.stroke();
  }
  sizeBadge(ctx, x, y, s, c.size);
  ctx.restore();
}
