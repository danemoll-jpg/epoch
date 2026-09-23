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
export function zoomAt(cam: Camera, w: number, h: number, factor: number, sx: number, sy: number): void {
  const before = screenToWorld(cam, w, h, sx, sy);
  cam.tileSize = Math.min(MAX_TILE, Math.max(MIN_TILE, cam.tileSize * factor));
  const after = screenToWorld(cam, w, h, sx, sy);
  cam.cx += before.x - after.x;
  cam.cy += before.y - after.y;
}

/** Keep at least part of the map on screen so it can't be lost off an edge. */
export function clampCamera(cam: Camera, mapW: number, mapH: number): void {
  cam.cx = Math.min(mapW, Math.max(0, cam.cx));
  cam.cy = Math.min(mapH, Math.max(0, cam.cy));
}
