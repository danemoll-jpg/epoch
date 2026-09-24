// Map resources (Round 9, Milestone 7). Placement, who can see them, and their yield bonus.
// The data (kinds, terrains, bonuses, hidden ones) is in src/data/resources.ts.
//
// - Placement is seeded from the game's seed with its own RNG stream, so a save migrated from
//   before resources existed gets exactly the resources a new game with that seed would have.
// - A hidden resource (Iron, Aluminum, Rubber, Oil) is invisible and gives nothing until it's
//   revealed: on its tile for everyone (Tile.revealed: a barbarian village there was
//   destroyed), or everywhere for a civ that knows the kind's `revealedBy` tech.
// - A city gets the bonus on its center tile and on the tiles its citizens work, when the
//   resource is visible to the city's owner.

import { RESOURCES, RESOURCE_IDS, RESOURCE_RULES as R, type ResourceDef, type ResourceId } from '../data/resources';
import type { TerrainId, Yields } from '../data/terrain';
import { distance, tileIndex, tilesInRadius } from './grid';
import { hashSeed, nextFloat, nextInt, type RngHolder } from './rng';
import type { Coord, GameMap, GameState } from './types';

/** The resources a tile of this terrain can have. */
export function resourcesFor(terrain: TerrainId, opts: { hidden?: boolean } = {}): ResourceDef[] {
  return RESOURCE_IDS.map((id) => RESOURCES[id]).filter(
    (r) => r.terrains.includes(terrain) && (opts.hidden === undefined || !!r.hidden === opts.hidden),
  );
}

function pickWeighted(rng: RngHolder, list: ResourceDef[]): ResourceDef | undefined {
  const total = list.reduce((s, r) => s + r.weight, 0);
  if (total <= 0) return undefined;
  let roll = nextFloat(rng) * total;
  for (const r of list) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return list[list.length - 1];
}

/** Food or production, and not hidden: what makes a start fair. */
function helpsStart(r: ResourceDef): boolean {
  return !r.hidden && r.bonus.food + r.bonus.production > 0;
}

/** Its own RNG stream from the seed, so placing resources never changes the game's dice. */
export function placementRng(seed: number, salt: number): RngHolder {
  return { rngState: hashSeed((seed ^ salt) >>> 0) };
}

/**
 * Scatters resources over the map (seeded), then makes sure every start has at least
 * R.startMinimum visible food or production resources within R.startRadius.
 */
export function placeResources(map: GameMap, seed: number, starts: Coord[]): void {
  const rng = placementRng(seed, 0x2e5a11);
  const placed: Coord[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[tileIndex(map, x, y)]!;
      const roll = nextFloat(rng) * 100;
      if (roll >= R.tileChancePct || tile.resource) continue;
      if (placed.some((p) => distance(p, { x, y }) < R.minSpacing)) continue;
      const r = pickWeighted(rng, resourcesFor(tile.terrain));
      if (!r) continue;
      tile.resource = r.id;
      placed.push({ x, y });
    }
  }
  for (const start of starts) {
    const near = tilesInRadius(map, start, R.startRadius).filter((c) => c.x !== start.x || c.y !== start.y);
    const good = () => near.filter((c) => {
      const id = map.tiles[tileIndex(map, c.x, c.y)]!.resource;
      return id !== undefined && helpsStart(RESOURCES[id]);
    }).length;
    const open = near.filter((c) => {
      const t = map.tiles[tileIndex(map, c.x, c.y)]!;
      return !t.resource && resourcesFor(t.terrain).some(helpsStart);
    });
    while (good() < R.startMinimum && open.length > 0) {
      const c = open.splice(nextInt(rng, open.length), 1)[0]!;
      const t = map.tiles[tileIndex(map, c.x, c.y)]!;
      t.resource = pickWeighted(rng, resourcesFor(t.terrain).filter(helpsStart))!.id;
    }
  }
}

/** The resource on this tile that `viewer` can see (and use), if any. */
export function visibleResource(state: GameState, viewer: number, index: number): ResourceDef | undefined {
  const tile = state.map.tiles[index];
  if (!tile?.resource) return undefined;
  const def = RESOURCES[tile.resource];
  if (!def) return undefined;
  if (!def.hidden || tile.revealed) return def;
  const player = state.players[viewer];
  return player && def.revealedBy && player.techs.includes(def.revealedBy) ? def : undefined;
}

/** The yield bonus a city of `owner` gets from this tile's resource. */
export function resourceBonus(state: GameState, owner: number, index: number): Yields | undefined {
  return visibleResource(state, owner, index)?.bonus;
}

/** Reveals a hidden resource on this tile for everyone. Returns it, if there was one to reveal. */
export function revealResourceAt(state: GameState, at: Coord): ResourceId | undefined {
  const tile = state.map.tiles[tileIndex(state.map, at.x, at.y)];
  if (!tile?.resource || !RESOURCES[tile.resource].hidden || tile.revealed) return undefined;
  tile.revealed = true;
  return tile.resource;
}

/** A short "+2 food, +1 production" for a bonus. */
export function bonusText(b: Yields): string {
  const parts: string[] = [];
  if (b.food) parts.push(`+${b.food} food`);
  if (b.production) parts.push(`+${b.production} production`);
  if (b.trade) parts.push(`+${b.trade} trade`);
  return parts.join(', ');
}

/** A hidden resource for a village's tile, if its terrain has one and the dice say so. */
export function hiddenResourceFor(rng: RngHolder, terrain: TerrainId): ResourceId | undefined {
  const list = resourcesFor(terrain, { hidden: true });
  if (list.length === 0 || nextFloat(rng) * 100 >= R.villageHiddenPct) return undefined;
  return pickWeighted(rng, list)?.id;
}
