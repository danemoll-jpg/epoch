// Wonders arrive in Milestone 7. This is the data shape they'll use, so the tech screen and
// build list already know where to look. The table stays empty until then.

import type { BuildingEffects } from './buildings';
import type { TechId } from './techs';

export type WonderId = string;

export interface WonderDef {
  id: WonderId;
  name: string;
  cost: number;
  summary: string;
  /** Tech needed to build it. */
  requires: TechId;
  effects: BuildingEffects;
}

export const WONDERS: WonderDef[] = [];
