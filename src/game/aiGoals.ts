// Which victory an AI leans toward (Milestone 6). Personality sets the lean, and progress
// already made pulls it along: each goal scores its personality base plus
// RULES.ai.victory.progressWeight × how far along it is (0–1). Ties go to technology, then
// culture, economic, domination. Deterministic, and recomputed each turn (nothing stored).
//
// Bases (Round 11): each leader's primary lean scores RULES.ai.victory.primaryBase, its secondary
// secondaryBase, and the rest otherBase, so progress alone can pull an AI to its secondary but
// never drags a conqueror over to technology just because its tech count grows. Legacy civs
// (old saves) keep the old personality bases: domination = aggression; culture = 5 −
// aggression; economic = trade willingness − 1; technology = a flat techBase.

import { victoryGoals } from '../data/mapSizes';
import { RULES } from '../data/rules';
import { TECH_IDS } from '../data/techs';
import { type VictoryKind } from '../data/victory';
import { civDef } from './diplomacy';
import { capitalsHeld } from './victory';
import type { GameState } from './types';

const ORDER: VictoryKind[] = ['technology', 'culture', 'economic', 'domination'];

/** Each goal's score for this AI (higher = more likely to pursue it). */
export function aiVictoryScores(state: GameState, p: number): Record<VictoryKind, number> {
  const civ = civDef(state, p);
  const player = state.players[p]!;
  const V = RULES.ai.victory;
  const { held, of } = capitalsHeld(state, p);
  const progress: Record<VictoryKind, number> = {
    domination: of > 0 ? held / of : 0,
    culture: Math.min(1, player.culture / victoryGoals(state.mapSize, state.difficulty).culture),
    economic: Math.min(1, player.gold / victoryGoals(state.mapSize, state.difficulty).gold),
    technology: player.techs.length / TECH_IDS.length,
  };
  // Round 11: a leader's lean (primary, then secondary) sets the bases; legacy civs keep the
  // old formula from their personality.
  const base: Record<VictoryKind, number> = civ.lean
    ? { domination: V.otherBase, culture: V.otherBase, economic: V.otherBase, technology: V.otherBase }
    : { domination: civ.aggression, culture: 5 - civ.aggression, economic: civ.tradeWillingness - 1, technology: V.techBase };
  if (civ.lean) {
    base[civ.lean.primary] = V.primaryBase;
    base[civ.lean.secondary] = V.secondaryBase;
  }
  const out = {} as Record<VictoryKind, number>;
  for (const k of ORDER) out[k] = base[k] + V.progressWeight * progress[k];
  return out;
}

/** The victory this AI is working toward right now. */
export function aiVictoryGoal(state: GameState, p: number): VictoryKind {
  const scores = aiVictoryScores(state, p);
  // A tie goes to the leader's primary lean (Round 11), else the ORDER above.
  let best = civDef(state, p).lean?.primary ?? ORDER[0]!;
  for (const k of ORDER) if (scores[k] > scores[best]) best = k;
  return best;
}
