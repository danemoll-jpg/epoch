// Where a unit's disc is drawn inside its tile, in tile units (0–1), so the renderer and the drag
// rule (src/ui/dragMove.ts) agree on where a unit is. In a city (or a barbarian village) the disc
// shrinks into the lower-left corner so the city shows; elsewhere it's centered and larger.

export interface UnitDisc {
  /** The disc's center, from the tile's top-left corner. */
  cx: number;
  cy: number;
  /** Its radius. */
  r: number;
}

export function unitDisc(inCity: boolean): UnitDisc {
  return inCity ? { cx: 0.27, cy: 0.73, r: 0.21 } : { cx: 0.5, cy: 0.5, r: 0.3 };
}
