// Which victory an AI leans toward (Milestone 6). Personality sets the lean, and progress
// already made pulls it along: each goal scores its personality base plus
// RULES.ai.victory.progressWeight × how far along it is (0–1). Ties go to technology, then
// culture, economic, domination. Deterministic, and recomputed each turn (nothing stored).
//
// Personality bases: domination = aggression; culture = 5 − aggression; economic = trade
// willingness − 1; technology = a flat RULES.ai.victory.techBase. So Charlemagne and Pachacuti
// lean to conquest, Ashoka to culture, Mansa Musa to wealth, and Hammurabi to science.

import { RULES } from '../data/rules';
import { TECH_IDS } from '../data/techs';
import { VICTORY, type VictoryKind } from '../data/victory';
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
    culture: Math.min(1, player.culture / VICTORY.cultureGoal),
    economic: Math.min(1, player.gold / VICTORY.goldGoal),
    technology: player.techs.length / TECH_IDS.length,
  };
  const base: Record<VictoryKind, number> = {
    domination: civ.aggression,
    culture: 5 - civ.aggression,
    economic: civ.tradeWillingness - 1,
    technology: V.techBase,
  };
  const out = {} as Record<VictoryKind, number>;
  for (const k of ORDER) out[k] = base[k] + V.progressWeight * progress[k];
  return out;
}

/** The victory this AI is working toward right now. */
export function aiVictoryGoal(state: GameState, p: number): VictoryKind {
  const scores = aiVictoryScores(state, p);
  let best = ORDER[0]!;
  for (const k of ORDER) if (scores[k] > scores[best]) best = k;
  return best;
}
