// Round 17 (A1): the city panel's ◀ ▶ arrows. Pure (reads state, changes nothing) so the
// order and the wrap-around are unit-tested without a DOM.
//
// The order is fixed: the capital first, then the rest in founding order (city ids only ever
// grow, so a lower id was founded earlier; a captured city keeps the id it was founded with).

import type { City, GameState } from '../game/types';

/** The viewer's cities in cycling order: the capital first, then founding order. */
export function cityOrder(state: GameState, viewer: number): City[] {
  return state.cities
    .filter((c) => c.owner === viewer)
    .sort((a, b) => Number(b.capitalOf === viewer) - Number(a.capitalOf === viewer) || a.id - b.id);
}

/**
 * The city after (dir 1) or before (dir -1) `currentId`, wrapping around. If the current city
 * is no longer the viewer's (lost mid-cycle), it goes to the city that followed or preceded it
 * in founding order. Undefined when there's nothing else to go to.
 */
export function cycleCity(state: GameState, viewer: number, currentId: number, dir: 1 | -1): number | undefined {
  const order = cityOrder(state, viewer);
  if (order.length === 0) return undefined;
  const i = order.findIndex((c) => c.id === currentId);
  if (i >= 0) {
    if (order.length === 1) return undefined;
    return order[(i + dir + order.length) % order.length]!.id;
  }
  // Lost: it stood among the non-capital cities by its founding id.
  const rest = order.filter((c) => c.capitalOf !== viewer);
  if (dir === 1) return (rest.find((c) => c.id > currentId) ?? order[0])!.id;
  return ([...rest].reverse().find((c) => c.id < currentId) ?? (order[0]!.capitalOf === viewer ? order[0] : order[order.length - 1]))!.id;
}

/** "3 / 12": this city's place in the order (1-based) and how many there are. */
export function cityPlace(state: GameState, viewer: number, cityId: number): { index: number; count: number } {
  const order = cityOrder(state, viewer);
  return { index: order.findIndex((c) => c.id === cityId) + 1, count: order.length };
}

/** How many of the viewer's other cities have nothing to build (the arrows' dot). */
export function otherIdleCities(state: GameState, viewer: number, cityId: number): number {
  return cityOrder(state, viewer).filter((c) => c.id !== cityId && c.build === null).length;
}
