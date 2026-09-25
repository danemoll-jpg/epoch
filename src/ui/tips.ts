// First-game tips (Round 13, C3): one-time hints the first time something happens. Which tips
// are due is a pure function of the game state and the tips already seen on this device, so
// it's unit-tested; the app shows one at a time, and Settings can turn them off.

import { findCiv } from '../data/civs';
import { RULES } from '../data/rules';
import { UNITS } from '../data/units';
import { metCivs } from '../game/diplomacy';
import type { GameState } from '../game/types';
import { atWar } from '../game/war';

export type TipId = 'first-turn' | 'first-city' | 'first-tech' | 'first-contact' | 'first-war' | 'first-village' | 'first-great-person';

export interface Tip {
  id: TipId;
  title: string;
  text: string;
  /** Is it due in this state? */
  when: (state: GameState, human: number) => boolean;
}

export const TIPS: Tip[] = [
  {
    id: 'first-turn',
    title: 'Welcome!',
    text: 'Tap your Settler, then Found City to build your first city. Move your Warrior by tapping it, then a lit tile, to explore.',
    when: (s, h) => !s.cities.some((c) => c.owner === h) && s.units.some((u) => u.owner === h && UNITS[u.type].canFoundCity),
  },
  {
    id: 'first-city',
    title: 'Your first city',
    text: 'Pick what it builds from the Build list. A Warrior to guard it, then a Settler for a second city, is a good start. Tap the city on the map any time to change it.',
    when: (s, h) => s.cities.some((c) => c.owner === h),
  },
  {
    id: 'first-tech',
    title: 'A new tech',
    text: 'Each tech unlocks new things to build. Tap 🔬 at the top to choose what to research next; the Almanac (☰) explains every tech.',
    when: (s, h) => {
      const p = s.players[h];
      const start = findCiv(p?.civId ?? '')?.startTech;
      return !!p && p.techs.some((t) => t !== start);
    },
  },
  {
    id: 'first-contact',
    title: 'You met another civ',
    text: 'Open 🤝 Diplomacy to see them. You can trade techs, give gifts, make peace, or declare war. How you treat them is remembered.',
    when: (s, h) => metCivs(s, h).length > 0,
  },
  {
    id: 'first-war',
    title: 'At war',
    text: `Keep a defender in every city, fortified (Fortify gives +${RULES.combat.fortifiedPct}% defense). Before you attack, the odds panel shows your chance to win. Propose peace in Diplomacy when you’ve had enough.`,
    when: (s, h) => metCivs(s, h).some((c) => atWar(s, h, c)),
  },
  {
    id: 'first-village',
    title: 'A barbarian village',
    text: 'Villages send raiders out as their flags fill up. Take one with a strong unit, then destroy it for a reward or settle it as a new city.',
    when: (s, h) => s.villages.some((v) => s.players[h]!.explored[v.y * s.map.width + v.x] === 1),
  },
  {
    id: 'first-great-person',
    title: 'A Great Person',
    text: 'Great People come from culture. Settle one in a city for a lasting bonus, or use them once for a big boost.',
    when: (s, h) => s.greatPeople.some((g) => g.owner === h) || s.cities.some((c) => c.owner === h && c.greatPeople.length > 0),
  },
];

/** The tips due now that haven't been seen, in the order above. */
export function dueTips(state: GameState, human: number, seen: readonly string[]): Tip[] {
  if (!state.players[human]?.alive) return [];
  return TIPS.filter((t) => !seen.includes(t.id) && t.when(state, human));
}
