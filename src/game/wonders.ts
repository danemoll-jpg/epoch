// Wonders (Milestone 6). One per world: once any city finishes a wonder, nobody else can
// start it, and every other city building it keeps its production and asks for a new choice
// (the "wonder race"). Finishing one is world news, told to everyone who has met the builder.
// Effects are read from data (wonders.ts in src/data) by yields.ts and production.ts.

import { BUILDINGS } from '../data/buildings';
import { WONDERS, type WonderId } from '../data/wonders';
import { CivName, civName } from './conquest';
import { addLog } from './log';
import { victoryWonderError } from './victory';
import type { City, GameState } from './types';

/** The city that has this wonder, if anyone has built it. */
export function wonderCity(state: GameState, id: WonderId): City | undefined {
  return state.cities.find((c) => c.wonders.includes(id));
}

/** Why this city can't start the wonder (tech aside), or undefined if it can. */
export function wonderError(state: GameState, city: City, id: WonderId): string | undefined {
  const built = wonderCity(state, id);
  if (built) return built.owner === city.owner ? `Already built in ${built.name}` : `Already built by ${civName(state, built.owner)}`;
  return victoryWonderError(state, city.owner, id);
}

/** Cities (other than `except`) currently building this wonder. */
export function citiesBuildingWonder(state: GameState, id: WonderId, except?: City): City[] {
  return state.cities.filter((c) => c !== except && c.build?.kind === 'wonder' && c.build.id === id);
}

/**
 * The city finished the wonder: it's added to the city, a free building is handed out if the
 * wonder gives one, the world hears of it, and everyone else building it has to choose again
 * (their production is kept).
 */
export function completeWonder(state: GameState, city: City, id: WonderId): void {
  const def = WONDERS[id];
  city.wonders.push(id);
  const free = def.effects.freeBuilding;
  if (free) {
    for (const c of state.cities) if (c.owner === city.owner && !c.buildings.includes(free)) c.buildings.push(free);
  }
  const extra = free ? ` Every city of yours now has ${BUILDINGS[free].name}.` : '';
  addLog(state, city.owner, `${city.name} completed the ${def.name}!${extra}`, city, undefined, {
    publicText: `${CivName(state, city.owner)} completed the ${def.name} in ${city.name}`,
    kind: 'wonder',
    ref: { cityId: city.id, item: { kind: 'wonder', id } },
  });
  for (const other of citiesBuildingWonder(state, id, city)) {
    other.build = null;
    const who = other.owner === city.owner ? city.name : CivName(state, city.owner);
    addLog(
      state,
      other.owner,
      `${who} finished the ${def.name} first. ${other.name} keeps its ${other.production} production; choose something new.`,
      other,
      undefined,
      { kind: 'wonderLost', ref: { cityId: other.id, item: { kind: 'wonder', id } } },
    );
  }
}
