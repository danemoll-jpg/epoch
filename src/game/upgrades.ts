// Round 19 (item 8): obsolete units and upgrades.
//
// - Obsolete: each unit may name the unit that replaces it (`upgradesTo` in src/data/units.ts).
//   Once its owner knows the replacement's techs, the old unit leaves the build list (units
//   already out stay); a city still set to build it switches to the replacement, keeping its
//   production.
// - Upgrade: a unit standing in one of its owner's cities (not aboard a ship) becomes the best
//   unit along its line that its owner can build, for gold: the production difference times
//   RULES.upgrade.goldPerProduction, at least minGold, an army counting each of its units, and
//   the difficulty level's percent for the player. It uses the unit's turn; veteran status,
//   the army, and anything else about it stay.
// - The AI upgrades too, from gold above its reserve, defenders in cities first.

import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../data/difficulty';
import { RULES } from '../data/rules';
import { UNITS, type UnitTypeId } from '../data/units';
import { cargoOf, isShip } from './naval';
import { hasTech } from './tech';
import type { ActionResult, GameState, Player, Unit } from './types';

/** The player knows everything this unit type needs (both techs, for the Stealth Bomber). */
export function knowsUnit(player: Player, id: UnitTypeId): boolean {
  const def = UNITS[id];
  return hasTech(player, def.requires) && hasTech(player, def.alsoRequires);
}

/** The unit's type is out of date for this player: they can build something later along its line. */
export function isObsolete(player: Player, id: UnitTypeId): boolean {
  return replacementOf(player, id) !== undefined;
}

/** The newest unit along `id`'s line that the player can build (undefined if it isn't obsolete). */
export function replacementOf(player: Player, id: UnitTypeId): UnitTypeId | undefined {
  let best: UnitTypeId | undefined;
  let next = UNITS[id].upgradesTo;
  for (let guard = 0; next && guard < 20; guard++) {
    if (knowsUnit(player, next)) best = next;
    next = UNITS[next].upgradesTo;
  }
  return best;
}

/** What the unit would become if upgraded now. */
export function upgradeTarget(state: GameState, u: Unit): UnitTypeId | undefined {
  const player = state.players[u.owner];
  return player ? replacementOf(player, u.type) : undefined;
}

/** The gold an upgrade costs (undefined when there's nothing to upgrade to). */
export function upgradeCost(state: GameState, u: Unit): number | undefined {
  const to = upgradeTarget(state, u);
  if (!to) return undefined;
  const R = RULES.upgrade;
  const count = u.army ? RULES.combat.armySize : 1;
  const base = Math.max(R.minGold, (UNITS[to].cost - UNITS[u.type].cost) * R.goldPerProduction) * count;
  const pct = u.owner === 0 ? DIFFICULTIES[state.difficulty ?? DEFAULT_DIFFICULTY].upgradePct : 100;
  return Math.ceil((base * pct) / 100);
}

/** Why this unit can't be upgraded right now, or undefined if it can. */
export function upgradeError(state: GameState, u: Unit): string | undefined {
  const to = upgradeTarget(state, u);
  if (!to) return 'Nothing newer to upgrade to';
  if (state.currentPlayer !== u.owner) return 'Not your turn';
  if (u.carriedBy !== null) return 'Only in one of your cities';
  const city = state.cities.find((c) => c.x === u.x && c.y === u.y);
  if (!city || city.owner !== u.owner) return 'Only in one of your cities';
  if (u.movesLeft <= 0) return 'It has already used its turn';
  if (isShip(u) && cargoOf(state, u).length > UNITS[to].cargo) return 'Unload its cargo first';
  const cost = upgradeCost(state, u)!;
  if (state.players[u.owner]!.gold < cost) return `Needs ${cost} gold`;
  return undefined;
}

/** The `upgrade` action: the unit becomes its replacement for gold, using its turn. */
export function upgradeUnit(state: GameState, unitId: number): ActionResult {
  const u = state.units.find((x) => x.id === unitId);
  if (!u) return { ok: false, reason: 'No such unit' };
  if (u.owner !== state.currentPlayer) return { ok: false, reason: 'Not your unit' };
  const err = upgradeError(state, u);
  if (err) return { ok: false, reason: err };
  const to = upgradeTarget(state, u)!;
  const cost = upgradeCost(state, u)!;
  const from = UNITS[u.type].name;
  state.players[u.owner]!.gold -= cost;
  u.type = to;
  u.movesLeft = 0;
  return { ok: true, message: `${from}${u.army ? ' army' : ''} upgraded to ${UNITS[to].name}${u.veteran ? ' (still a veteran)' : ''} for ${cost} gold` };
}

/** The player's units that could be upgraded (tech-wise) and stand in one of their cities, with each cost. */
export function upgradableUnits(state: GameState, p: number): { unit: Unit; to: UnitTypeId; cost: number }[] {
  const out: { unit: Unit; to: UnitTypeId; cost: number }[] = [];
  for (const u of state.units) {
    if (u.owner !== p || u.carriedBy !== null) continue;
    const to = upgradeTarget(state, u);
    if (!to) continue;
    const city = state.cities.find((c) => c.x === u.x && c.y === u.y);
    if (!city || city.owner !== p) continue;
    out.push({ unit: u, to, cost: upgradeCost(state, u)! });
  }
  return out;
}

/**
 * A city set to build a unit that just went out of date switches to its replacement (its
 * production stays). Called when the player learns a tech.
 */
export function switchObsoleteBuilds(state: GameState, p: number): void {
  const player = state.players[p]!;
  for (const c of state.cities) {
    if (c.owner !== p || c.build?.kind !== 'unit') continue;
    const to = replacementOf(player, c.build.id);
    if (to) c.build = { kind: 'unit', id: to };
  }
}

/**
 * The AI upgrades from gold above its reserve, a few units a turn: units defending a city
 * first (fortified), then the rest, cheapest first within each group.
 */
export function aiUpgrade(state: GameState, p: number, reserve: number): number {
  const player = state.players[p]!;
  const list = upgradableUnits(state, p)
    .filter((x) => !upgradeError(state, x.unit))
    .sort((a, b) => Number(b.unit.fortified) - Number(a.unit.fortified) || a.cost - b.cost);
  let done = 0;
  for (const x of list) {
    if (done >= RULES.upgrade.aiMaxPerTurn) break;
    if (player.gold - x.cost < reserve) continue;
    if (upgradeUnit(state, x.unit.id).ok) done++;
  }
  return done;
}
