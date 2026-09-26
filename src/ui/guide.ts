// How to Play (Round 13, C1): short pages for a new player, in plain words, with the game's
// own icons. Numbers come from the data files so the pages stay true when the balance changes.

import { MAP_ICONS } from '../data/icons';
import { GREAT_PEOPLE } from '../data/greatPeople';
import { RELIGION, RELIGION_SYMBOLS } from '../data/religion';
import { RULES } from '../data/rules';
import { ROADS } from '../data/roads';
import { VICTORY } from '../data/victory';
import { WONDERS } from '../data/wonders';
import { iconHtml, unitIconHtml } from '../render/icons';
import type { UnitTypeId } from '../data/units';
import { victoryGoals } from '../data/mapSizes';
import { GAME } from '../data/game';

export interface GuidePage {
  id: string;
  title: string;
  html: string;
}

const unit = (id: UnitTypeId, color = '#3f7fe0') => `<span class="udisc" style="background:${color}">${unitIconHtml(id)}</span>`;
const map = (icon: string, cls = '') => `<span class="udisc mapdisc ${cls}">${iconHtml(icon, '?')}</span>`;
const pics = (...html: string[]) => `<div class="guidePics">${html.join('')}</div>`;
/** A link to an Almanac card, opened by the same handler as the cards' own links. */
const card = (id: string, label: string) => `<button type="button" class="alink" data-card="${id}">${label}</button>`;

export function guidePages(): GuidePage[] {
  const C = RULES.combat;
  const goals = victoryGoals('normal');
  const faith = RELIGION_SYMBOLS[0]!;
  return [
    {
      id: 'moving',
      title: 'Moving and founding cities',
      html: `${pics(unit('settler'), unit('warrior'))}
        <p>In <b>${GAME.name}</b> you lead a people from its first village to the space age, against up to five rivals. You start with a ${card('unit:settler', 'Settler')} and a ${card('unit:warrior', 'Warrior')}. <b>Tap a unit</b> to select it: the tiles it can reach this turn light up. <b>Tap a lit tile</b> to move there. Tapping one of your own cities opens it instead, and tapping another of your units selects that unit, unless the selected unit is right next to it (then it moves in, or boards the ship). From farther away you get a <b>Move … here</b> (or <b>Board the …</b>) button, so you can still send it there, for example to stack up an army. Want a second chance on every move? Turn on <b>Tap twice to move</b> in Settings.</p>
        <p>Hills, forests, and mountains cost more moves. Units see a little way around them; the rest of the world stays dark until you explore it.</p>
        <p>With the Settler selected, tap <b>Found City</b> to build a city where it stands. Good spots have grassland and plains for food, with hills or forest nearby for production. Cities must be at least ${RULES.minCityDistance} tiles apart.</p>
        <p>When every unit has moved, tap <b>End Turn</b>. The computer players then take their turns. <b>Next Unit</b> jumps to a unit that still has orders to give; once a unit has used its moves, the game selects the next one for you and brings it into view.</p>
        <p><b>Fortify</b> digs a unit in (Next Unit skips it from then on). To use it again, select it (tap it, pick it from its city's unit list, or find it in ☰ → <b>Units</b>) and tap <b>Wake</b>. Ships and aircraft have <b>Stay</b> and <b>Wake</b> the same way.</p>
        <p class="sub">Drag to move the map, pinch (or use the mouse wheel) to zoom.</p>`,
    },
    {
      id: 'cities',
      title: 'Cities: growth, focus, and building',
      html: `<p><b>Tap a city</b> to open it; the ◀ ▶ arrows by its name (or a swipe across the top, or , and . on a keyboard) go through your other cities. A city works the tiles around it for <b>food</b>, <b>production</b>, and <b>trade</b>.</p>
        <ul><li><b>Food</b> fills the food box; when it's full, the city grows by one and works one more tile.</li>
        <li><b>Production</b> builds what you pick in the <b>Build</b> list: units, buildings, and wonders.</li>
        <li><b>Trade</b> becomes science and gold (set the split with − and + at the top).</li></ul>
        <p>The <b>Focus</b> buttons tell the city what to favor: food to grow, production to build, trade for science and gold. Balanced is a fine start.</p>
        <p>Short of time? <b>Buy</b> finishes the current build next turn for gold.</p>
        <p>When something is finished you're told: a <b>wonder</b> gets a full-screen card with what it does; buildings and units come as one list at the start of your turn (a new unit's panel says which city trained it).</p>
        <p><b>📰 News</b> (at the top, or ☰ → News) lists everything that happened in the last few turns: builds, growth, techs, wars and peace, wonders, eras, Great People. Its count shows what's new; tap a line to see where it happened. Messages at the top stay a few seconds; tap one to dismiss it.</p>
        <p class="sub">Tap ⓘ beside anything in the Build list to read its card in the Almanac.</p>`,
    },
    {
      id: 'research',
      title: 'Research and eras',
      html: `<p>Science from your cities goes into research. Tap <b>🔬</b> at the top to open the tech tree and pick what to learn next. Each tech unlocks new units, buildings, or wonders, and leads to more techs.</p>
        <p>The tree has four eras: Ancient, Medieval, Industrial, and Modern. Your first tech of a new era opens it with a full-screen card: your new era bonus and the units, buildings, and wonders the era brings. The colored chip at the top always shows your era, and you're told when a rival gets to a new era before you. Your leader gets a new bonus in each era (tap your leader's name at the top to see them).</p>
        <p>You can also trade techs with other civs in Diplomacy.</p>`,
    },
    {
      id: 'combat',
      title: 'Combat, armies, and fleets',
      html: `${pics(unit('warrior'), unit('spearman', '#c0392b'), unit('archer'))}
        <p>To attack, select a unit and tap an enemy next to it (outlined in red). A panel shows your <b>chance to win</b> and every bonus on each side before you decide. The loser is destroyed.</p>
        <p>Defenders do better on hills and forests, in cities, behind Walls, and when <b>fortified</b> (+${C.fortifiedPct}%). A unit that wins may become a <b>veteran</b> ★ (+${C.veteranPct}%).</p>
        <p>Beat a city's last defender and you take the city.</p>
        <p><b>Armies:</b> put ${C.armySize} units of the same kind on one tile and tap <b>Form Army</b>: they become one unit ${C.armyMultiplier} times as strong. Three ships make a <b>fleet</b> the same way.</p>
        <p><b>Old units:</b> once you can build a unit's replacement (a Pikeman replaces the Spearman), the old one leaves the Build list. Bring an old unit into one of your cities and tap <b>⬆ Upgrade</b>: for gold it becomes the newest unit of its line, keeping its ★ and its army. It uses its turn. ☰ → Units has <b>Upgrade all</b>.</p>`,
    },
    {
      id: 'ships',
      title: 'Ships and aircraft',
      html: `${pics(unit('galley'), unit('transport'), unit('fighter'), unit('bomber'))}
        <p><b>Ships</b> are built in coastal cities. A land unit boards by stepping onto your ship, and goes ashore by stepping onto land. The ${card('unit:galley', 'Galley')} must stay near the coast; later ships cross the ocean. Ships can bombard units on the shore but never take a city.</p>
        <p><b>Aircraft</b> live in a city (or on a ${card('unit:carrier', 'Carrier')}). They strike any enemy in range that you can see, then fly home. Enemy fighters nearby may intercept them first. Aircraft never capture cities. An <b>Airport</b> can airlift one land unit a turn to another Airport city. The ${card('unit:drone', 'Drone')} (Computers) is cheap and fragile, with the longest range: tap any tile in range to <b>scout</b> it (you see all around it until the turn ends), or strike like a small bomber.</p>`,
    },
    {
      id: 'diplomacy',
      title: 'Diplomacy',
      html: `<p>You meet another civ when your units or cities see each other. Open <b>🤝 Diplomacy</b> to see everyone you've met: their leader, attitude toward you, and strength.</p>
        <p>From there you can <b>declare war</b>, <b>propose peace</b>, <b>trade techs</b> (for gold or a tech of yours), and give gifts of gold to make friends.</p>
        <p><b>Spies</b> (${card('unit:spy', 'Spy')}, from Literacy) can't be seen by rivals, and can walk into the cities of civs you're at peace with. Inside or next to a rival city a Spy can <b>investigate</b> it (always works: its buildings, what it's building, its defenders), <b>steal a technology</b>, <b>sabotage</b> its production, or pay to <b>incite a revolt</b> so it joins you (never a capital). The chance shows before you act; the Spy is used up either way, and a caught spy makes its victim angry. A <b>Courthouse</b> guards a city against spies and shows them next to it. You're told when a spy acts against you.</p>
        <p>Computer players remember how you treat them. They may demand tribute; refusing makes them angrier. A peace treaty holds for ${RULES.diplomacy.minPeaceTurns} turns.</p>`,
    },
    {
      id: 'villages',
      title: 'Villages, huts, and Great People',
      html: `${pics(map(MAP_ICONS.village), map(MAP_ICONS.hut), map(GREAT_PEOPLE.scientist.icon, 'gp'), map(GREAT_PEOPLE.artist.icon, 'gp'))}
        <p><b>Barbarian villages</b> send raiders out as their flags fill up. Take one with a unit, then choose: destroy it for a reward, or settle it as a new city.</p>
        <p><b>Huts</b> hold a surprise (usually a good one): step any unit onto one.</p>
        <p><b>Great People</b> arrive as your culture grows (Temples and wonders make culture). Settle one in a city for a lasting bonus, or use them once for a big boost.</p>`,
    },
    {
      id: 'religion',
      title: 'Religion and roads',
      html: `${pics(`<span class="udisc" style="background:${faith.color}">${iconHtml(faith.icon, faith.glyph)}</span>`, unit('missionary'), map(MAP_ICONS.holyCity, 'holy'))}
        <p>The first civ to learn certain techs (such as Mysticism) <b>founds a religion</b> in its capital, the holy city. You name yours. Each civ founds at most one.</p>
        <p>Religions spread to nearby cities on their own; a ${card('unit:missionary', 'Missionary')} (${RELIGION.missionaryCharges} spreads) does it at once. The holy city earns gold and culture, and civs that share your faith like you more.</p>
        <p><b>Roads</b> are bought with gold from a city's panel (“Build road to…”), ${ROADS.goldPerTile} gold a tile, and laid at once. Units move much faster on them, and worked road tiles give extra trade. Railroad later upgrades them.</p>`,
    },
    {
      id: 'winning',
      title: 'The four ways to win',
      html: `<p>The first civ to reach any one of these wins. Tap <b>🏆</b> to see how close everyone is.</p>
        <ul class="winList">
        <li><b>Domination</b>: hold every rival's original capital (★).</li>
        <li><b>Culture</b>: reach ${goals.culture} culture, then build the ${card('wonder:world_council', WONDERS.world_council.name)}.</li>
        <li><b>Economic</b>: have ${goals.gold} gold in the treasury, then build the ${card('wonder:global_exchange', WONDERS.global_exchange.name)}.</li>
        <li><b>Technology</b>: learn Space Flight, build ${VICTORY.spaceship.parts} ${card('project:spaceship', 'spaceship parts')} in your capital, launch, and keep your capital for ${VICTORY.spaceship.travelTurns} turns until it lands.</li></ul>
        <p><b>Warnings:</b> a full-screen card warns you when a rival passes ${VICTORY.warnPct}% of a goal, reaches it, starts its victory wonder (with the city and about how many turns), and again at ${VICTORY.warnSoonTurns} turns or less, then every turn from ${VICTORY.warnEveryTurnFrom}; the same for a spaceship in flight and a civ one capital from domination. Each card says what you can do: capture that city, declare war, or race them. Even a civ you haven't met is announced. While a rival is within 10 turns of winning, 🏆 has a red dot.</p>
        <p><b>Keep playing:</b> after someone wins you can play on. A win after that (your spaceship landing, say) goes on the record, but the result stands.</p>
        <p class="sub">The goals above are for a Normal map; a Large map needs more (the 🏆 screen shows yours).</p>`,
    },
  ];
}
