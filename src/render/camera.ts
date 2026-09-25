// Camera maths. View state only (never saved in game state): which world point sits at the
// center of the screen and how big a tile is, in CSS pixels.

export interface Camera {
  /** World position (in tiles) at the center of the screen. */
  cx: number;
  cy: number;
  /** Tile size in CSS pixels. */
  tileSize: number;
}

export const MIN_TILE = 22;
export const MAX_TILE = 110;

/**
 * Round 14 (A2): the view a game opens with: about this many tiles across and down around your
 * capital (whichever fits first), so even a Huge map starts close up.
 */
export const DEFAULT_VIEW_TILES = { across: 12, down: 9 };
/** Round 14: pinching out stops here, so tiles never shrink past use (the minimap shows the rest). */
export const ZOOM_OUT_TILES = 40;
export const ZOOM_OUT_MIN_TILE = 28;

/** The tile size a game opens with on a `w` × `h` (CSS px) screen. */
export function defaultTileSize(w: number, h: number): number {
  const s = Math.min(w / DEFAULT_VIEW_TILES.across, h / DEFAULT_VIEW_TILES.down);
  return Math.min(MAX_TILE, Math.max(minTileSize(w, h), Math.round(s)));
}

/**
 * The smallest tile size pinching out allows: never under ZOOM_OUT_MIN_TILE px, and never so
 * small that more than ZOOM_OUT_TILES tiles fit across the longer side of the screen.
 */
export function minTileSize(w: number, h: number): number {
  return Math.max(ZOOM_OUT_MIN_TILE, Math.max(w, h) / ZOOM_OUT_TILES);
}

export function screenToWorld(cam: Camera, w: number, h: number, sx: number, sy: number) {
  return {
    x: cam.cx + (sx - w / 2) / cam.tileSize,
    y: cam.cy + (sy - h / 2) / cam.tileSize,
  };
}

export function worldToScreen(cam: Camera, w: number, h: number, wx: number, wy: number) {
  return {
    x: (wx - cam.cx) * cam.tileSize + w / 2,
    y: (wy - cam.cy) * cam.tileSize + h / 2,
  };
}

export function panBy(cam: Camera, dx: number, dy: number): void {
  cam.cx -= dx / cam.tileSize;
  cam.cy -= dy / cam.tileSize;
}

/** Zoom by `factor`, keeping the world point under screen point (sx, sy) fixed. */
export function zoomAt(cam: Camera, w: number, h: number, factor: number, sx: number, sy: number, minTile = MIN_TILE): void {
  const before = screenToWorld(cam, w, h, sx, sy);
  cam.tileSize = Math.min(MAX_TILE, Math.max(minTile, cam.tileSize * factor));
  const after = screenToWorld(cam, w, h, sx, sy);
  cam.cx += before.x - after.x;
  cam.cy += before.y - after.y;
}

/** Keep at least part of the map on screen so it can't be lost off an edge. */
export function clampCamera(cam: Camera, mapW: number, mapH: number): void {
  cam.cx = Math.min(mapW, Math.max(0, cam.cx));
  cam.cy = Math.min(mapH, Math.max(0, cam.cy));
}
