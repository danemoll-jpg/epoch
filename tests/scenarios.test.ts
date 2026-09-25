// Every dev scenario must do exactly what its on-screen note says after one End Turn. The
// scenario and this test build the same state (src/dev/scenarios.ts), so they can't drift.

import { describe, expect, it } from 'vitest';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { SCENARIOS, type Scenario } from '../src/dev/scenarios';
import { applyAction } from '../src/game/actions';
import { attackError, attackStrength, combatOdds, defenseStrength, formArmyError } from '../src/game/combat';
import { attitude, hasMet, metCivs } from '../src/game/diplomacy';
import { distance } from '../src/game/grid';
import { atWar } from '../src/game/war';
import { buildChoiceError, buildOptions, buyCost, buyError, itemCost } from '../src/game/production';
import { createGame } from '../src/game/newGame';
import { availableTechs } from '../src/game/tech';
import { empireCulture, empireIncome } from '../src/game/yields';
import { rushBuyCost } from '../src/data/rules';
import { UNIQUE_RULES } from '../src/data/leaders';
import { PLAYABLE_CIVS } from '../src/data/civs';
import { deserializeGame, serializeGame } from '../src/game/save';
import { playerEra } from '../src/game/tech';
import type { City, GameState } from '../src/game/types';
import { cityCulture, cityScienceGold, cityYields, foodSurplus, tileYields } from '../src/game/yields';
import { WONDERS } from '../src/data/wonders';
import { eventsVisibleTo } from '../src/game/log';
import { armyCandidates, behindUnit, isMixedStack, stackLabel, unitsOnTile } from '../src/game/stack';
import { cargoOf, isWaterAt } from '../src/game/naval';
import { landmassAt } from '../src/game/mapgen';
import { reachableThisTurn } from '../src/game/movement';
import { BARBARIANS } from '../src/data/barbarians';
import { RESOURCE_IDS } from '../src/data/resources';
import { visibleResource } from '../src/game/resources';
import { pendingVillage } from '../src/game/villages';
import { interception } from '../src/game/combat';
import { airliftTargets } from '../src/game/air';
import { RELIGION, RELIGION_SYMBOLS } from '../src/data/religion';
import { ROADS } from '../src/data/roads';
import { faithOpinion, holyReligion, religionCityCulture, religionCityGold, spreadTargets } from '../src/game/religion';
import { roadAt, roadConnected } from '../src/game/roads';
import { LARGE_MAP_TURNS, MINIMAP_SEED } from '../src/dev/scenarios';
import { FIXTURE_TURN } from '../src/dev/fixtures/fixtures';
import { LOOK_SIZES } from '../src/dev/artDemo';
import { cityLook } from '../src/data/cityLooks';
import { MAP_SIZES } from '../src/data/mapSizes';
import { MUSIC_FILES } from '../src/data/sounds';
import { visibleTiles } from '../src/game/fog';
import { ZOOM_OUT_TILES } from '../src/render/camera';
import { musicTrackFor } from '../src/ui/soundLogic';
import { findCard, searchAlmanac } from '../src/ui/almanac';
import { guidePages } from '../src/ui/guide';
import { dueTips } from '../src/ui/tips';

const AIR_TARGET = { x: 10, y: 5 };
const mine = (s: GameState, type: string) => s.units.find((u) => u.owner === 0 && u.type === type)!;

const capital = (s: GameState): City => s.cities.find((c) => c.owner === 0)!;
const FRONT = { x: 9, y: 5 };
const ENEMY = { x: 10, y: 5 };
const mineAt = (s: GameState, at: { x: number; y: number }) => s.units.filter((u) => u.owner === 0 && u.x === at.x && u.y === at.y);
const oddsPct = (s: GameState) => Math.round(combatOdds(s, mineAt(s, FRONT)[0]!, ENEMY)!.chance * 100);
const modLabels = (s: GameState) => combatOdds(s, mineAt(s, FRONT)[0]!, ENEMY)!.defense.mods.map((m) => `${m.label} +${m.pct}%`);
const noteOf = (id: string) => SCENARIOS.find((x) => x.id === id)!.note;

/** Attack ENEMY from FRONT through the real action; exactly one of the two units dies. */
function attackFromFront(s: GameState): void {
  const before = s.units.length;
  const res = applyAction(s, { type: 'attack', unitId: mineAt(s, FRONT)[0]!.id, at: ENEMY });
  expect(res.ok).toBe(true);
  expect(res.combat).toBeDefined();
  expect(s.units.length).toBe(before - 1);
}
const builds = (s: GameState) => buildOptions(s, capital(s)).map((i) => i.id);

function endTurn(s: GameState): void {
  expect(applyAction(s, { type: 'endTurn' })).toEqual({ ok: true });
}

/** What each scenario's note promises. A new scenario without an entry here fails the suite. */
const OUTCOMES: Record<string, (s: GameState) => void> = {
  theology: (s) => {
    const c = capital(s);
    const gc = { kind: 'wonder', id: 'grand_cathedral' } as const;
    expect(buildChoiceError(s, c, gc)).toBeDefined();
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
    expect(s.players[0]!.techs).toContain('theology');
    expect(buildChoiceError(s, c, gc)).toBeUndefined();
  },
  'ai-roads': (s) => {
    const kish = s.cities.find((c) => c.name === 'Kish')!;
    const cap = s.cities.find((c) => c.capitalOf === 1)!;
    expect(roadConnected(s, cap, kish, 20)).toBe(false);
    endTurn(s);
    expect(roadConnected(s, cap, kish, 20)).toBe(true);
    expect(s.players[1]!.gold).toBeLessThan(200);
  },
  // ---- Round 15: the update banner (the app shows it; the game itself is an ordinary one) ----
  'update-available': (s) => {
    expect(SCENARIOS.find((x) => x.id === 'update-available')!.fakeUpdate).toBe(true);
    expect(s.cities.filter((c) => c.owner === 0)).toHaveLength(1);
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
  },
  // ---- Round 14: big maps, the art candidates, era music ----
  'huge-map': (s) => lateMapOutcome(s, 'huge'),
  'epic-map': (s) => lateMapOutcome(s, 'epic'),
  minimap: (s) => {
    expect(s.mapSize).toBe('huge');
    expect(s.seed).toBe(MINIMAP_SEED);
    expect(s.players[0]!.explored.every((e) => e === 1)).toBe(true);
    expect(noteOf('minimap')).toContain(`about ${ZOOM_OUT_TILES} tiles`);
  },
  'city-growth-looks': (s) => {
    // Four civs, one per era; each has a city of every look and a walled metropolis.
    expect(s.players.map((p) => playerEra(p))).toEqual(['ancient', 'medieval', 'industrial', 'modern']);
    for (const p of s.players) {
      const mine = s.cities.filter((c) => c.owner === p.id);
      expect(mine.map((c) => cityLook(c.size).id)).toEqual(['village', 'town', 'city', 'metropolis', 'metropolis']);
      expect(mine.filter((c) => c.buildings.includes('walls'))).toHaveLength(1);
    }
    expect(noteOf('city-growth-looks')).toContain(`a village (size ${LOOK_SIZES[0]})`);
  },
  'walls-drawn': (s) => {
    const walled = s.cities.filter((c) => c.buildings.includes('walls'));
    expect(walled.map((c) => c.name)).toEqual(['Babylon']);
    expect(s.cities.find((c) => c.name === 'Ur')!.buildings).toEqual([]);
  },
  'terrain-styles': (s) => {
    // Every terrain, a road and a rail, resources, a hut, a village, and fog.
    expect(new Set(s.map.tiles.map((t) => t.terrain)).size).toBe(8);
    expect(s.map.tiles.some((t) => t.road === 'road')).toBe(true);
    expect(s.map.tiles.some((t) => t.road === 'rail')).toBe(true);
    expect(s.map.tiles.some((t) => t.hut)).toBe(true);
    expect(s.villages).toHaveLength(1);
    expect(s.units.some((u) => u.army)).toBe(true);
    expect(s.religions).toHaveLength(1);
    const vis = visibleTiles(s, 0);
    expect(s.players[0]!.explored.every((e) => e === 1)).toBe(true);
    expect(vis.some((v) => !v)).toBe(true); // some explored tiles are in fog
  },
  'era-music': (s) => {
    const scenario = SCENARIOS.find((x) => x.id === 'era-music')!;
    expect(scenario.sound).toBe(true);
    expect(scenario.musicSwitch).toBe(true);
    expect(playerEra(s.players[0]!)).toBe('ancient');
    expect(musicTrackFor(playerEra(s.players[0]!), MUSIC_FILES)).toBe('music-ancient.mp3');
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
    expect(playerEra(s.players[0]!)).toBe('medieval');
    expect(musicTrackFor(playerEra(s.players[0]!), MUSIC_FILES)).toBe('music-medieval.mp3');
  },
  // ---- Round 13: the main menu, Settings, difficulty, map size, the guide, and tips ----
  'main-menu': (s) => {
    expect(SCENARIOS.find((x) => x.id === 'main-menu')!.opens).toBe('mainMenu');
    expect(s.difficulty).toBe('normal');
    expect(s.mapSize).toBe('normal');
  },
  settings: (s) => {
    expect(SCENARIOS.find((x) => x.id === 'settings')!.opens).toBe('settings');
    // One unit that can still move, so Confirm End Turn asks.
    const ready = s.units.filter((u) => u.owner === 0 && u.movesLeft > 0 && !u.fortified);
    expect(ready).toHaveLength(1);
    expect(noteOf('settings')).toContain('1 unit can still move');
  },
  'difficulty-legendary-start': (s) => {
    expect(s.difficulty).toBe('legendary');
    expect(s.turn).toBe(1);
    for (const p of s.players.filter((q) => q.kind !== 'barbarian')) {
      expect(s.units.filter((u) => u.owner === p.id)).toHaveLength(p.id === 0 ? 2 : 4);
    }
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
  },
  'large-map': (s) => {
    expect(s.mapSize).toBe('large');
    expect(s.map.width).toBe(44);
    expect(s.players.filter((p) => p.kind !== 'barbarian')).toHaveLength(6);
    expect(s.players[0]!.kind).toBe('human');
    expect(s.currentPlayer).toBe(0);
    expect(s.turn).toBe(LARGE_MAP_TURNS + 1);
    expect(s.players[0]!.explored.every((e) => e === 1)).toBe(true);
    expect(s.cities.length).toBeGreaterThan(12);
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
  },
  almanac: () => {
    expect(SCENARIOS.find((x) => x.id === 'almanac')!.opens).toBe('almanac');
    expect(searchAlmanac('spear')[0]!.id).toBe('unit:spearman');
    expect(findCard('unit:spearman')!.html).toContain('data-card="tech:bronze_working"');
  },
  'how-to-play': () => {
    expect(SCENARIOS.find((x) => x.id === 'how-to-play')!.opens).toBe('howToPlay');
    expect(guidePages()).toHaveLength(9);
  },
  'first-game-tips': (s) => {
    expect(SCENARIOS.find((x) => x.id === 'first-game-tips')!.freshTips).toBe(true);
    expect(dueTips(s, 0, []).map((t) => t.id)).toEqual(['first-turn', 'first-contact', 'first-war', 'first-village']);
    const seen = ['first-turn', 'first-contact', 'first-war', 'first-village'];
    const settler = s.units.find((u) => u.owner === 0 && u.type === 'settler')!;
    expect(applyAction(s, { type: 'foundCity', unitId: settler.id }).ok).toBe(true);
    expect(dueTips(s, 0, seen).map((t) => t.id)).toEqual(['first-city']);
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
    expect(s.players[0]!.techs).toContain('pottery');
    expect(dueTips(s, 0, [...seen, 'first-city']).map((t) => t.id)).toEqual(['first-tech']);
  },
  // ---- Round 12: religion and roads ----
  'found-religion': (s) => {
    expect(s.religions).toEqual([]);
    endTurn(s);
    expect(s.players[0]!.techs).toContain('mysticism');
    expect(s.religions).toHaveLength(1);
    const r = s.religions[0]!;
    expect(r).toMatchObject({ founder: 0, holyCityId: capital(s).id, tech: 'mysticism', named: false });
    expect(capital(s).religion).toBe(r.id);
    expect(noteOf('found-religion')).toContain(`+${religionCityCulture(s, capital(s))} culture`);
    // The naming panel's action.
    expect(applyAction(s, { type: 'nameReligion', religionId: r.id, name: '  The   Lantern Folk ' }).ok).toBe(true);
    expect(r).toMatchObject({ name: 'The Lantern Folk', named: true });
    expect(applyAction(s, { type: 'nameReligion', religionId: r.id, name: 'Again' }).ok).toBe(false);
  },
  missionary: (s) => {
    const m = mine(s, 'missionary');
    const york = s.cities.find((c) => c.name === 'York')!;
    const rival = s.cities.find((c) => c.owner === 1)!;
    expect(spreadTargets(s, m).map((c) => c.id).sort()).toEqual([york.id, rival.id].sort());
    expect(applyAction(s, { type: 'spreadReligion', unitId: m.id, cityId: york.id }).ok).toBe(true);
    expect(york.religion).toBe(s.religions[0]!.id);
    expect(m.charges).toBe(RELIGION.missionaryCharges - 1);
    // Its moves are used up: the rival must wait for the next turn.
    expect(applyAction(s, { type: 'spreadReligion', unitId: m.id, cityId: rival.id }).ok).toBe(false);
    endTurn(s);
    const gold = s.players[0]!.gold;
    const culture = s.players[0]!.culture;
    expect(applyAction(s, { type: 'spreadReligion', unitId: m.id, cityId: rival.id }).ok).toBe(true);
    expect(rival.religion).toBe(s.religions[0]!.id);
    expect(s.players[0]!.gold).toBe(gold + RELIGION.conversionReward.gold);
    expect(s.players[0]!.culture).toBe(culture + RELIGION.conversionReward.culture);
    expect(s.units.some((u) => u.id === m.id)).toBe(false);
  },
  'religion-spread': (s) => {
    const york = s.cities.find((c) => c.name === 'York')!;
    expect(york.religion).toBeNull();
    endTurn(s);
    expect(york.religion).toBe(s.religions[0]!.id);
    expect(noteOf('religion-spread')).toMatch(/has a \d+% chance a turn/);
  },
  'holy-city-income': (s) => {
    const c = capital(s);
    const H = RELIGION.holyCity;
    expect(religionCityGold(s, c)).toBe(H.gold + 3 * H.goldPerFollower);
    expect(religionCityCulture(s, c)).toBe(H.culture);
    expect(noteOf('holy-city-income')).toContain(`+${religionCityGold(s, c)} gold a turn`);
    // It's in the city's real income.
    const withFaith = cityScienceGold(s, c).gold;
    const r = holyReligion(s, c)!;
    r.holyCityId = -1;
    expect(cityScienceGold(s, c).gold).toBe(withFaith - H.gold - 3 * H.goldPerFollower);
  },
  'shared-faith': (s) => {
    expect(faithOpinion(s, 1, 0)).toBe(RELIGION.differentFaithOpinion);
    const m = mine(s, 'missionary');
    const rival = s.cities.find((c) => c.capitalOf === 1)!;
    expect(applyAction(s, { type: 'spreadReligion', unitId: m.id, cityId: rival.id }).ok).toBe(true);
    expect(faithOpinion(s, 1, 0)).toBe(RELIGION.sharedFaithOpinion);
    expect(attitude(s, 1, 0)).toBe('friendly');
    expect(noteOf('shared-faith')).toContain('attitude friendly');
  },
  'henry-national-church': (s) => {
    expect(s.religions).toHaveLength(1);
    expect(applyAction(s, { type: 'nationalChurch' }).ok).toBe(true);
    const r = s.religions[1]!;
    expect(r).toMatchObject({ founder: 0, tech: null, holyCityId: capital(s).id, named: false });
    expect(capital(s).religion).toBe(r.id);
    expect(s.players[0]!.uniquesUsed).toContain('nationalChurch');
    expect(applyAction(s, { type: 'nationalChurch' }).ok).toBe(false);
  },
  'build-road': (s) => {
    const york = s.cities.find((c) => c.name === 'York')!;
    const res = applyAction(s, { type: 'buyRoad', fromCityId: capital(s).id, toCityId: york.id });
    expect(res.ok).toBe(true);
    for (let x = 8; x <= 11; x++) expect(roadAt(s, x, 5)).toBe('road');
    expect(s.players[0]!.gold).toBe(200 - 4 * ROADS.goldPerTile);
    expect(noteOf('build-road')).toContain(`drops to ${s.players[0]!.gold}`);
    expect(applyAction(s, { type: 'buyRoad', fromCityId: capital(s).id, toCityId: york.id }).ok).toBe(false);
  },
  'road-speed': (s) => {
    const w = mine(s, 'warrior');
    const to = { x: w.x + 3, y: w.y };
    expect(applyAction(s, { type: 'move', unitId: w.id, to }).ok).toBe(true);
    expect({ x: w.x, y: w.y }).toEqual(to);
    expect(w.movesLeft).toBe(0);
  },
  railroad: (s) => {
    expect(roadAt(s, 9, 5)).toBe('road');
    endTurn(s);
    expect(s.players[0]!.techs).toContain('railroad');
    for (let x = 8; x <= 11; x++) expect(roadAt(s, x, 5)).toBe('rail');
    const w = s.units.find((u) => u.owner === 0 && u.type === 'warrior' && u.x === 7)!;
    expect(applyAction(s, { type: 'move', unitId: w.id, to: { x: 12, y: 5 } }).ok).toBe(true);
    expect(w.x).toBe(12);
    expect(w.movesLeft).toBeCloseTo(0.5, 6);
    expect(s.religions).toEqual([]);
  },
  'all-religion-symbols': (s) => {
    expect(s.religions).toHaveLength(RELIGION_SYMBOLS.length);
    expect(new Set(s.religions.map((r) => r.symbol)).size).toBe(RELIGION_SYMBOLS.length);
    expect(s.cities.filter((c) => holyReligion(s, c))).toHaveLength(RELIGION_SYMBOLS.length);
    expect(s.cities.filter((c) => c.religion !== null && !holyReligion(s, c)).length).toBeGreaterThanOrEqual(4);
    expect(mine(s, 'missionary').religion).toBe(s.religions[0]!.id);
  },
  // ---- Round 11: leaders ----
  'new-game-setup': () => {
    // What Start does: your civ first, rivals drawn from the rest, each with its starting tech.
    const g = createGame({ seed: 11, playerCount: 3, civ: 'rome' });
    expect(g.players[0]!.civId).toBe('rome');
    const civs = g.players.filter((p) => p.kind !== 'barbarian').map((p) => p.civId);
    expect(new Set(civs).size).toBe(3);
    expect(g.players[0]!.techs).toEqual(['bronze_working']);
  },
  'starting-tech': (s) => {
    const p = s.players[0]!;
    expect(p.civId).toBe('russia');
    expect(p.techs).toEqual(['map_making']);
    expect(builds(s)).toContain('galley');
    expect(availableTechs(p)).toContain('alphabet');
    expect(availableTechs(p)).not.toContain('writing');
    expect(s.turn).toBe(1);
  },
  'era-bonus': (s) => {
    const legion = () => itemCost(s, capital(s), { kind: 'unit', id: 'legion' });
    // Round 15: Rome's Ancient Triumphs already takes 15% off; the Medieval Legions 20% more.
    const ancient = legion();
    expect(ancient).toBe(Math.round(UNITS.legion.cost * 0.85));
    endTurn(s);
    expect(playerEra(s.players[0]!)).toBe('medieval');
    expect(s.log.some((e) => e.player === 0 && e.kind === 'leader' && e.text.startsWith('Medieval bonus: Legions'))).toBe(true);
    expect(legion()).toBe(Math.round(UNITS.legion.cost * 0.65));
    expect(noteOf('era-bonus')).toContain(`costs ${ancient} now`);
    expect(noteOf('era-bonus')).toContain(`costs ${Math.round(UNITS.legion.cost * 0.65)}`);
  },
  'caligula-buy-wonder': (s) => {
    const c = capital(s);
    expect(buyError(s, c)).toBeUndefined();
    const price = buyCost(s, c)!;
    expect(noteOf('caligula-buy-wonder')).toContain(`${price} gold`);
    // Twice the usual price, less the 25% rush-buy discount.
    expect(price).toBe(Math.ceil(rushBuyCost(itemCost(s, c, c.build!) - c.production) * 2 * 0.75));
    expect(applyAction(s, { type: 'rushBuy', cityId: c.id }).ok).toBe(true);
    endTurn(s);
    expect(c.wonders).toContain('pyramids');
  },
  'mansa-pilgrimage': (s) => {
    const before = s.diplomacy.opinion[1]![0]!;
    const res = applyAction(s, { type: 'pilgrimage' });
    expect(res.ok).toBe(true);
    expect(s.players[0]!.gold).toBe(0);
    expect(s.players[0]!.culture).toBe(600);
    expect(s.diplomacy.opinion[1]![0]!).toBeGreaterThan(before);
    s.players[0]!.gold = 500;
    expect(applyAction(s, { type: 'pilgrimage' }).ok).toBe(false);
  },
  'henry-dissolution': (s) => {
    const before = empireCulture(s, 0);
    expect(applyAction(s, { type: 'dissolution' }).ok).toBe(true);
    expect(s.players[0]!.gold).toBe(120);
    expect(empireCulture(s, 0)).toBeLessThan(before);
    expect(noteOf('henry-dissolution')).toContain(`drops to ${empireCulture(s, 0)} a turn`);
    expect(applyAction(s, { type: 'dissolution' }).ok).toBe(false);
  },
  'bolivar-liberate': (s) => {
    const army = s.units.find((u) => u.owner === 0 && u.army)!;
    const res = applyAction(s, { type: 'attack', unitId: army.id, at: ENEMY });
    expect(res.combat?.capturedCityId).toBeDefined();
    const city = s.cities.find((c) => c.name === 'Djenné')!;
    expect(city.owner).toBe(0);
    expect(city.size).toBe(3);
    expect(s.players[0]!.culture).toBe(100);
    expect(s.players[0]!.gold).toBe(50);
    expect(applyAction(s, { type: 'returnCity', cityId: city.id }).ok).toBe(true);
    expect(city.owner).toBe(2);
    expect(s.players[0]!.culture).toBe(100 + UNIQUE_RULES.returnCity.culture);
    expect(attitude(s, 2, 0)).toBe('friendly');
    // His army went home.
    expect(s.units.some((u) => u.owner === 0 && u.x === city.x && u.y === city.y)).toBe(false);
  },
  'jfk-challenge': (s) => {
    const before = empireIncome(s, 0).science;
    expect(applyAction(s, { type: 'setChallenge', tech: 'physics' }).ok).toBe(true);
    const after = empireIncome(s, 0).science;
    expect(after).toBeGreaterThan(before);
    expect(noteOf('jfk-challenge')).toContain(`rises to ${after} a turn`);
    expect(applyAction(s, { type: 'setChallenge', tech: 'invention' }).ok).toBe(false);
  },
  versailles: (s) => {
    expect(builds(s)).toContain('versailles');
    const other = s.cities.find((c) => c.name === 'Marseille')!;
    expect(buildOptions(s, other).map((i) => i.id)).not.toContain('versailles');
  },
  deterrence: (s) => {
    for (let i = 0; i < 6; i++) {
      endTurn(s);
      expect(atWar(s, 0, 1)).toBe(false);
    }
    expect(noteOf('deterrence')).toMatch(/war score against you is -?\d/);
  },
  portraits: (s) => {
    expect(s.players.map((p) => p.civId)).toEqual(PLAYABLE_CIVS.map((c) => c.id));
    expect(metCivs(s, 0)).toHaveLength(11);
  },
  // ---- Round 10: aircraft and the map icons ----
  'air-strike': (s) => {
    const bomber = mine(s, 'bomber');
    const base = { x: bomber.x, y: bomber.y };
    // Its targets are anywhere in range, not just next door.
    expect(distance(bomber, AIR_TARGET)).toBe(3);
    expect(attackError(s, bomber, AIR_TARGET)).toBeUndefined();
    expect(noteOf('air-strike')).toContain(`${Math.round(combatOdds(s, bomber, AIR_TARGET)!.chance * 100)}%`);
    const res = applyAction(s, { type: 'attack', unitId: bomber.id, at: AIR_TARGET });
    expect(res.combat).toMatchObject({ attackerWon: true, airStrike: true });
    expect(res.combat!.interception).toBeUndefined();
    expect(s.units.some((u) => u.owner === 1 && u.x === AIR_TARGET.x && u.y === AIR_TARGET.y)).toBe(false);
    // Back at base, and done for the turn.
    expect({ x: bomber.x, y: bomber.y }).toEqual(base);
    expect(bomber.movesLeft).toBe(0);
    expect(attackError(s, bomber, AIR_TARGET)).toBe('Already flew this turn');
  },
  intercept: (s) => {
    const bomber = mine(s, 'bomber');
    const icpt = interception(s, bomber, AIR_TARGET)!;
    expect(icpt.fighter.type).toBe('fighter');
    expect(noteOf('intercept')).toContain(`${Math.round(icpt.chance * 100)}% of the time`);
    const res = applyAction(s, { type: 'attack', unitId: bomber.id, at: AIR_TARGET });
    expect(res.combat!.interception).toMatchObject({ fighterWon: true, fighterType: 'fighter' });
    expect(res.combat!.attackerWon).toBe(false);
    expect(s.units.some((u) => u.id === bomber.id)).toBe(false);
    // The strike never happened.
    expect(s.units.some((u) => u.owner === 1 && u.type === 'musketman')).toBe(true);
    expect(s.log.some((e) => e.kind === 'intercept')).toBe(true);
  },
  rebase: (s) => {
    const fighter = mine(s, 'fighter');
    const bomber = mine(s, 'bomber');
    const ur = s.cities.find((c) => c.name === 'Ur')!;
    const carrier = mine(s, 'carrier');
    // Tapping Ur with the Fighter selected is a move (rebase); the Carrier too for the Bomber.
    expect(reachableThisTurn(s, fighter)).toContainEqual({ x: ur.x, y: ur.y });
    expect(applyAction(s, { type: 'move', unitId: fighter.id, to: ur }).ok).toBe(true);
    expect({ x: fighter.x, y: fighter.y, carriedBy: fighter.carriedBy, movesLeft: fighter.movesLeft }).toEqual({ x: ur.x, y: ur.y, carriedBy: null, movesLeft: 0 });
    expect(applyAction(s, { type: 'move', unitId: bomber.id, to: carrier }).ok).toBe(true);
    expect(bomber.carriedBy).toBe(carrier.id);
    // The Carrier sails, and the Bomber goes along.
    expect(applyAction(s, { type: 'move', unitId: carrier.id, to: { x: carrier.x + 1, y: carrier.y } }).ok).toBe(true);
    expect({ x: bomber.x, y: bomber.y }).toEqual({ x: carrier.x, y: carrier.y });
  },
  'carrier-sunk': (s) => {
    const theirs = s.units.find((u) => u.owner === 1 && u.type === 'carrier')!;
    const aboard = s.units.filter((u) => u.carriedBy === theirs.id);
    expect(aboard.map((u) => u.type).sort()).toEqual(['bomber', 'fighter']);
    const res = applyAction(s, { type: 'attack', unitId: mine(s, 'battleship').id, at: theirs });
    expect(res.combat).toMatchObject({ attackerWon: true, cargoLost: 2 });
    for (const u of [theirs, ...aboard]) expect(s.units.some((x) => x.id === u.id)).toBe(false);
  },
  'bomber-no-capture': (s) => {
    const taxila = s.cities.find((c) => c.name === 'Taxila')!;
    const bomber = mine(s, 'bomber');
    const base = { x: bomber.x, y: bomber.y };
    const res = applyAction(s, { type: 'attack', unitId: bomber.id, at: taxila });
    expect(res.combat).toMatchObject({ attackerWon: true, airStrike: true });
    expect(res.combat!.capturedCityId).toBeUndefined();
    // Empty, and still theirs; the Bomber went home.
    expect(taxila.owner).toBe(1);
    expect(s.units.some((u) => u.x === taxila.x && u.y === taxila.y)).toBe(false);
    expect({ x: bomber.x, y: bomber.y }).toEqual(base);
    // The Legion walks in and takes it.
    expect(applyAction(s, { type: 'move', unitId: mine(s, 'legion').id, to: taxila }).ok).toBe(true);
    expect(taxila.owner).toBe(0);
  },
  helicopter: (s) => {
    const heli = mine(s, 'helicopter');
    const taxila = s.cities.find((c) => c.name === 'Taxila')!;
    // Over the mountain, the lake, and the forest at 1 a tile.
    expect(applyAction(s, { type: 'move', unitId: heli.id, to: { x: taxila.x - 1, y: taxila.y } }).ok).toBe(true);
    expect({ x: heli.x, y: heli.y }).toEqual({ x: taxila.x - 1, y: taxila.y });
    expect(heli.movesLeft).toBe(UNITS.helicopter.moves - 4);
    const res = applyAction(s, { type: 'attack', unitId: heli.id, at: taxila });
    expect(res.combat!.attackerWon).toBe(true);
    expect(res.combat!.capturedCityId).toBeUndefined();
    expect({ x: heli.x, y: heli.y }).toEqual({ x: taxila.x - 1, y: taxila.y });
    expect(taxila.owner).toBe(1);
    // Even into the empty city, it can't go.
    heli.movesLeft = 1;
    expect(applyAction(s, { type: 'move', unitId: heli.id, to: taxila }).reason).toBe('Helicopters can’t capture cities');
  },
  airlift: (s) => {
    const [a, b] = s.units.filter((u) => u.type === 'rifleman');
    const ur = s.cities.find((c) => c.name === 'Ur')!;
    const nineveh = s.cities.find((c) => c.name === 'Nineveh')!;
    expect(airliftTargets(s, a!).map((c) => c.name)).toEqual(['Ur']);
    expect(applyAction(s, { type: 'airlift', unitId: a!.id, cityId: nineveh.id }).ok).toBe(false);
    expect(applyAction(s, { type: 'airlift', unitId: a!.id, cityId: ur.id }).ok).toBe(true);
    expect({ x: a!.x, y: a!.y, movesLeft: a!.movesLeft }).toEqual({ x: ur.x, y: ur.y, movesLeft: 0 });
    expect(applyAction(s, { type: 'airlift', unitId: b!.id, cityId: ur.id }).reason).toContain('already airlifted a unit this turn');
    endTurn(s);
    expect(applyAction(s, { type: 'airlift', unitId: b!.id, cityId: ur.id }).ok).toBe(true);
  },
  'all-aircraft': (s) => {
    const air = UNIT_IDS.filter((id) => UNITS[id].domain === 'air' || UNITS[id].hover);
    for (const id of air) expect(s.units.some((u) => u.owner === 0 && u.type === id)).toBe(true);
    // Every based aircraft is in a city of yours or on your Carrier, never in the open.
    for (const u of s.units.filter((x) => UNITS[x.type].domain === 'air')) {
      const inCity = s.cities.some((c) => c.x === u.x && c.y === u.y && c.owner === u.owner);
      expect(inCity || u.carriedBy !== null).toBe(true);
    }
    const carrier = mine(s, 'carrier');
    expect(s.units.filter((u) => u.carriedBy === carrier.id)).toHaveLength(3);
    expect(atWar(s, 0, 1)).toBe(false);
  },
  'all-map-icons': (s) => {
    const shown = new Set<string>();
    for (let k = 0; k < s.map.tiles.length; k++) {
      const r = visibleResource(s, 0, k);
      if (r) shown.add(r.id);
    }
    expect(shown.size).toBe(RESOURCE_IDS.length);
    expect(s.villages).toHaveLength(1);
    expect(s.villages[0]!.flags).toBe(2);
    expect(s.map.tiles.some((t) => t.hut)).toBe(true);
    expect(s.units.filter((u) => s.players[u.owner]!.kind === 'barbarian').length).toBeGreaterThanOrEqual(2);
  },
  // ---- Round 9: barbarians, villages, artifacts, resources, huts, Great People ----
  'village-spawn': (s) => {
    const v = s.villages[0]!;
    expect(v.flags).toBe(BARBARIANS.flagsToSpawn - 1);
    const before = s.units.filter((u) => u.home === v.id).length;
    endTurn(s);
    const mine = s.units.filter((u) => u.home === v.id);
    expect(mine).toHaveLength(before + 1);
    expect(v.flags).toBe(0);
    const out = mine.find((u) => !(u.x === v.x && u.y === v.y))!;
    expect(distance(out, v)).toBe(1);
    expect(['warrior', 'archer']).toContain(out.type);
    expect(s.log.some((e) => e.kind === 'barbarians')).toBe(true);
  },
  'take-village': (s) => {
    const legion = mineAt(s, FRONT)[0]!;
    const odds = combatOdds(s, legion, ENEMY)!;
    expect(odds.defense.mods.map((m) => m.label)).toContain('Barbarian village');
    expect(noteOf('take-village')).toContain(`${Math.round(odds.chance * 100)}%`);
    const settle = JSON.parse(JSON.stringify(s)) as GameState;
    const res = applyAction(s, { type: 'attack', unitId: legion.id, at: ENEMY });
    expect(res.combat?.attackerWon).toBe(true);
    expect(res.combat?.tookVillage).toBe(s.villages[0]!.id);
    expect(legion).toMatchObject(ENEMY);
    expect(pendingVillage(s, 0)).toBeDefined();
    const gold = s.players[0]!.gold;
    const out = applyAction(s, { type: 'chooseVillage', villageId: s.villages[0]!.id, choice: 'destroy' });
    expect(out.ok).toBe(true);
    expect(s.villages).toHaveLength(0);
    expect(out.village?.reward).toBeTruthy();
    expect(s.players[0]!.gold >= gold).toBe(true);
    // The same fight, settled instead: a size 1 city of yours on the village's tile.
    applyAction(settle, { type: 'attack', unitId: legion.id, at: ENEMY });
    const r2 = applyAction(settle, { type: 'chooseVillage', villageId: settle.villages[0]!.id, choice: 'settle' });
    const city = settle.cities.find((c) => c.id === r2.village?.cityId)!;
    expect(city).toMatchObject({ owner: 0, size: 1, ...ENEMY });
  },
  'village-artifact': (s) => {
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    for (const [state, choice] of [[s, 'destroy'], [copy, 'settle']] as const) {
      const w = state.units.find((u) => u.owner === 0)!;
      const known = state.players[0]!.techs.length;
      expect(applyAction(state, { type: 'move', unitId: w.id, to: ENEMY }).ok).toBe(true);
      const res = applyAction(state, { type: 'chooseVillage', villageId: state.villages[0]!.id, choice });
      expect(res.village?.artifact, choice).toBeDefined();
      expect(state.players[0]!.techs.length).toBeGreaterThanOrEqual(known + res.village!.artifact!.techs.length);
      expect(state.log.some((e) => e.kind === 'artifact')).toBe(true);
    }
  },
  'village-resource': (s) => {
    const k = ENEMY.x + ENEMY.y * s.map.width;
    expect(visibleResource(s, 0, k)).toBeUndefined();
    const settle = JSON.parse(JSON.stringify(s)) as GameState;
    const w = s.units.find((u) => u.owner === 0)!;
    applyAction(s, { type: 'move', unitId: w.id, to: ENEMY });
    const res = applyAction(s, { type: 'chooseVillage', villageId: s.villages[0]!.id, choice: 'destroy' });
    expect(res.village?.revealed).toBe('iron');
    expect(visibleResource(s, 0, k)?.id).toBe('iron');
    expect(visibleResource(s, 1, k)?.id).toBe('iron'); // revealed for everyone
    expect(tileYields(s, k, 0).production).toBe(2 + 3); // hills + Iron
    // Settling keeps it hidden.
    const w2 = settle.units.find((u) => u.owner === 0)!;
    applyAction(settle, { type: 'move', unitId: w2.id, to: ENEMY });
    applyAction(settle, { type: 'chooseVillage', villageId: settle.villages[0]!.id, choice: 'settle' });
    expect(visibleResource(settle, 0, k)).toBeUndefined();
  },
  'barbarian-raid': (s) => {
    const ur = s.cities.find((c) => c.name === 'Ur')!;
    endTurn(s);
    expect(ur.owner).toBe(0);
    expect(ur.size).toBe(2);
    expect(s.players[0]!.gold).toBe(100 - 25);
    expect(noteOf('barbarian-raid')).toContain('25 gold');
    expect(eventsVisibleTo(s, 0, s.log).some((e) => e.kind === 'raid')).toBe(true);
  },
  hut: (s) => {
    const warriors = s.units.filter((u) => u.owner === 0).sort((a, b) => a.y - b.y);
    const gold = s.players[0]!.gold;
    const explored = s.players[0]!.explored.filter((e) => e === 1).length;
    const units = s.units.filter((u) => u.owner === 0).length;
    const barbs = s.units.filter((u) => u.owner !== 0).length;
    for (const w of warriors) expect(applyAction(s, { type: 'move', unitId: w.id, to: { x: 9, y: w.y } }).ok).toBe(true);
    const got = (k: string) => s.log.filter((e) => e.kind === 'hut' && e.player === 0).map((e) => e.text).find((t) => t.includes(k));
    expect(s.players[0]!.gold - gold).toBeGreaterThanOrEqual(25);
    expect(s.players[0]!.explored.filter((e) => e === 1).length).toBeGreaterThan(explored);
    expect(s.units.filter((u) => u.owner === 0).length).toBe(units + 1);
    expect(s.players[0]!.techs).toContain('pottery');
    expect(s.units.filter((u) => u.owner !== 0).length).toBe(barbs + 2);
    expect(got('gold')).toBeTruthy();
    expect(s.map.tiles.some((t) => t.hut)).toBe(false);
  },
  'great-person': (s) => {
    endTurn(s);
    expect(s.greatPeople).toHaveLength(1);
    const gp = s.greatPeople[0]!;
    expect(gp).toMatchObject({ owner: 0, kind: 'scientist', name: 'Hypatia' });
    const use = JSON.parse(JSON.stringify(s)) as GameState;
    // Settle: +50% science in Babylon.
    const before = cityScienceGold(s, capital(s)).science;
    expect(applyAction(s, { type: 'useGreatPerson', gpId: gp.id, how: { mode: 'settle', cityId: capital(s).id } }).ok).toBe(true);
    expect(capital(s).greatPeople).toEqual(['scientist']);
    expect(cityScienceGold(s, capital(s)).science).toBe(before + Math.floor(before / 2));
    // Use now: learn Writing at once.
    expect(applyAction(use, { type: 'useGreatPerson', gpId: gp.id, how: { mode: 'use' } }).ok).toBe(true);
    expect(use.players[0]!.techs).toContain('writing');
    expect(use.greatPeople).toHaveLength(0);
  },
  'engineer-wonder': (s) => {
    const gp = s.greatPeople[0]!;
    expect(applyAction(s, { type: 'useGreatPerson', gpId: gp.id, how: { mode: 'use', cityId: capital(s).id } }).ok).toBe(true);
    endTurn(s);
    expect(capital(s).wonders).toContain('pyramids');
  },
  'all-resources': (s) => {
    const shown = new Set<string>();
    for (let k = 0; k < s.map.tiles.length; k++) {
      const r = visibleResource(s, 0, k);
      if (r) shown.add(r.id);
    }
    expect(shown.size).toBe(RESOURCE_IDS.length);
  },
  // ---- Round 8: ships ----
  'board-unload': (s) => {
    const at = (t: string) => s.units.find((u) => u.owner === 0 && u.type === t)!;
    const galley = at('galley');
    expect(applyAction(s, { type: 'board', unitId: at('settler').id, shipId: galley.id }).ok).toBe(true);
    expect(applyAction(s, { type: 'board', unitId: at('warrior').id, shipId: galley.id }).ok).toBe(true);
    expect(cargoOf(s, galley)).toHaveLength(2);
    expect(applyAction(s, { type: 'move', unitId: galley.id, to: { x: 7, y: 5 } }).ok).toBe(true);
    // The cargo sailed with it.
    expect(at('settler')).toMatchObject({ x: 7, y: 5 });
    endTurn(s);
    expect(applyAction(s, { type: 'move', unitId: at('settler').id, to: { x: 8, y: 5 } }).ok).toBe(true);
    expect(applyAction(s, { type: 'move', unitId: at('warrior').id, to: { x: 8, y: 4 } }).ok).toBe(true);
    expect(at('settler').carriedBy).toBeNull();
    expect(cargoOf(s, galley)).toHaveLength(0);
    endTurn(s);
    expect(applyAction(s, { type: 'foundCity', unitId: at('settler').id }).ok).toBe(true);
    const city = s.cities.find((c) => c.x === 8 && c.y === 5)!;
    expect(landmassAt(s.map, city)).not.toBe(landmassAt(s.map, capital(s)));
    expect(noteOf('board-unload')).toContain('Board the Galley');
  },
  'galley-coast': (s) => {
    const galley = s.units.find((u) => u.type === 'galley')!;
    const caravel = s.units.find((u) => u.type === 'caravel')!;
    expect(s.map.tiles[7 + 5 * s.map.width]!.terrain).toBe('ocean');
    expect(applyAction(s, { type: 'move', unitId: galley.id, to: { x: 7, y: 5 } }).reason).toBe('A Galley can’t leave the coast');
    expect(reachableThisTurn(s, galley).every((c) => s.map.tiles[c.x + c.y * s.map.width]!.terrain === 'coast' || s.cities.some((x) => x.x === c.x && x.y === c.y))).toBe(true);
    expect(applyAction(s, { type: 'move', unitId: caravel.id, to: { x: 9, y: 6 } }).ok).toBe(true);
    expect(caravel).toMatchObject({ x: 9, y: 6 });
  },
  'naval-battle': (s) => {
    const mine = s.units.find((u) => u.owner === 0 && u.type === 'frigate')!;
    const odds = combatOdds(s, mine, { x: 8, y: 5 })!;
    expect(odds.chance).toBeCloseTo(4 / 7);
    expect(noteOf('naval-battle')).toContain(`${Math.round(odds.chance * 100)}%`);
    const res = applyAction(s, { type: 'attack', unitId: mine.id, at: { x: 8, y: 5 } });
    expect(res.ok).toBe(true);
    expect(s.units.filter((u) => u.type === 'frigate')).toHaveLength(1);
  },
  bombard: (s) => {
    const frigate = s.units.find((u) => u.owner === 0 && u.type === 'frigate')!;
    const odds = combatOdds(s, frigate, { x: 8, y: 5 })!;
    expect(odds.defense.mods.map((m) => m.label)).toEqual(['In a city']);
    expect(noteOf('bombard')).toContain(`${Math.round(odds.chance * 100)}%`);
    const res = applyAction(s, { type: 'attack', unitId: frigate.id, at: { x: 8, y: 5 } });
    expect(res.combat).toMatchObject({ attackerWon: true, bombard: true });
    expect(res.combat!.capturedCityId).toBeUndefined();
    expect(frigate).toMatchObject({ x: 7, y: 5 });
    expect(s.cities.find((c) => c.x === 8 && c.y === 5)!.owner).toBe(1);
    expect(s.units.some((u) => u.x === 8 && u.y === 5)).toBe(false);
  },
  'ship-sunk-cargo': (s) => {
    expect(s.units.filter((u) => u.owner === 0 && u.carriedBy !== null)).toHaveLength(2);
    endTurn(s);
    expect(s.units.filter((u) => u.owner === 0 && (u.type === 'galley' || u.type === 'settler'))).toHaveLength(0);
    expect(s.units.filter((u) => u.owner === 0 && u.carriedBy !== null)).toHaveLength(0);
    expect(eventsVisibleTo(s, 0, s.log).some((e) => e.text.includes('went down with it'))).toBe(true);
  },
  'amphibious-capture': (s) => {
    const legion = s.units.find((u) => u.type === 'legion')!;
    expect(legion.carriedBy).not.toBeNull();
    expect(applyAction(s, { type: 'move', unitId: legion.id, to: { x: 8, y: 5 } }).ok).toBe(true);
    expect(s.cities.find((c) => c.x === 8 && c.y === 5)!.owner).toBe(0);
    expect(legion).toMatchObject({ x: 8, y: 5, carriedBy: null });
  },
  harbor: (s) => {
    const before = foodSurplus(s, capital(s));
    const water = capital(s).worked.length;
    endTurn(s);
    expect(capital(s).buildings).toContain('harbor');
    expect(foodSurplus(s, capital(s))).toBe(before + water);
    expect(noteOf('harbor')).toContain(`from ${before} to +${before + water}`);
  },
  'ai-overseas': (s) => {
    const home = landmassAt(s.map, s.cities.find((c) => c.owner === 1)!);
    let founded = false;
    for (let i = 0; i < 6 && !founded; i++) {
      endTurn(s);
      founded = s.cities.some((c) => c.owner === 1 && landmassAt(s.map, c) !== home);
    }
    expect(founded).toBe(true);
    // It took its escort along.
    const city = s.cities.find((c) => c.owner === 1 && landmassAt(s.map, c) !== home)!;
    expect(s.units.some((u) => u.owner === 1 && u.type === 'warrior' && distance(u, city) <= 1)).toBe(true);
  },
  fleet: (s) => {
    const first = s.units.find((u) => u.owner === 0 && u.type === 'frigate')!;
    const before = Math.round(combatOdds(s, first, { x: 8, y: 5 })!.chance * 100);
    expect(applyAction(s, { type: 'formArmy', unitId: first.id }).ok).toBe(true);
    expect(s.units.filter((u) => u.owner === 0 && u.type === 'frigate')).toHaveLength(1);
    expect(cargoOf(s, first)).toHaveLength(1);
    const after = Math.round(combatOdds(s, first, { x: 8, y: 5 })!.chance * 100);
    expect(after).toBeGreaterThan(before);
    expect(noteOf('fleet')).toContain(`from ${before}% for one Frigate to ${after}%`);
    expect(applyAction(s, { type: 'attack', unitId: first.id, at: { x: 8, y: 5 } }).combat!.attackerWon).toBe(true);
  },
  'all-ships': (s) => {
    const ships = UNIT_IDS.filter((id) => UNITS[id].domain === 'sea');
    for (const id of ships) expect(s.units.some((u) => u.owner === 0 && u.type === id)).toBe(true);
    // Every ship is on water, with its own icon.
    for (const u of s.units.filter((x) => UNITS[x.type].domain === 'sea')) {
      expect(isWaterAt(s, u.x, u.y)).toBe(true);
      expect(UNITS[u.type].icon).toBeDefined();
    }
    expect(s.units.filter((u) => u.carriedBy !== null)).toHaveLength(2);
  },
  wonder: (s) => {
    const c = capital(s);
    const before = cityYields(s, c).production;
    endTurn(s);
    expect(capital(s).wonders).toEqual(['pyramids']);
    expect(cityYields(s, capital(s)).production).toBe(before + Math.floor((before * 25) / 100));
    expect(cityCulture(s, capital(s))).toBe(WONDERS.pyramids.effects.culture);
    expect(buildOptions(s, capital(s)).some((i) => i.kind === 'wonder' && i.id === 'pyramids')).toBe(false);
  },
  'wonder-race': (s) => {
    const c = capital(s);
    expect(c.production).toBe(40);
    endTurn(s);
    const rival = s.cities.find((x) => x.owner === 1)!;
    expect(rival.wonders).toEqual(['colossus']);
    expect(capital(s).build).toBeNull();
    expect(capital(s).production).toBeGreaterThanOrEqual(40);
    expect(buildOptions(s, capital(s)).some((i) => i.id === 'colossus')).toBe(false);
    expect(eventsVisibleTo(s, 0, s.log).some((e) => e.player === 0 && e.text.includes('first'))).toBe(true);
  },
  'win-domination': (s) => {
    expect(s.victory).toBeNull();
    attackFromFront(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'domination' });
    // Maurya lost its capital to you but is still in the game (Taxila).
    expect(s.players[1]!.alive).toBe(true);
    expect(noteOf('win-domination')).toContain(`${oddsPct(SCENARIOS.find((x) => x.id === 'win-domination')!.build())}%`);
  },
  'win-culture': (s) => {
    endTurn(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'culture' });
    // Keep playing: no more checks, and the record stays.
    expect(applyAction(s, { type: 'keepPlaying' }).ok).toBe(true);
    endTurn(s);
    expect(s.keepPlaying).toBe(true);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'culture' });
  },
  'win-economic': (s) => {
    endTurn(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'economic' });
  },
  'win-space': (s) => {
    const arrives = s.players[0]!.space.arrivesTurn;
    expect(arrives).toBe(s.turn + 1);
    expect(s.victory).toBeNull();
    endTurn(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'technology', turn: arrives });
  },
  'lose-space': (s) => {
    endTurn(s);
    expect(s.victory).toMatchObject({ winner: 1, kind: 'technology' });
    expect(s.players[0]!.alive).toBe(true);
  },
  'stop-launch': (s) => {
    const arrives = s.players[1]!.space.arrivesTurn!;
    attackFromFront(s);
    const pat = s.cities.find((c) => c.capitalOf === 1)!;
    expect(pat.owner).toBe(0);
    expect(s.players[1]!.space).toEqual({ parts: 0, launchedTurn: null, arrivesTurn: null });
    expect(s.log.some((e) => e.kind === 'space' && e.publicText?.includes('lost'))).toBe(true);
    while (s.turn <= arrives + 1) endTurn(s);
    expect(s.victory).toBeNull();
  },
  'near-win-warning': (s) => {
    endTurn(s);
    const warnings = () => s.log.filter((e) => e.kind === 'warning' && e.other === 0);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]!.text).toContain('culture');
    endTurn(s);
    expect(warnings()).toHaveLength(1);
  },
  'all-units': (s) => {
    const mine = s.units.filter((u) => u.owner === 0);
    // Land units only; ships have their own scenario (all-ships).
    const land = UNIT_IDS.filter((id) => UNITS[id].domain === 'land');
    expect(new Set(mine.map((u) => u.type))).toEqual(new Set(land));
    expect(mine.some((u) => u.army)).toBe(true);
    expect(mine.some((u) => u.veteran)).toBe(true);
    expect(mine.some((u) => u.fortified)).toBe(true);
    expect(isMixedStack(unitsOnTile(s, 12, 7))).toBe(true);
    expect(s.units.some((u) => u.owner === 1)).toBe(true);
    // Nothing on the map is at war, so looking around is safe.
    expect(atWar(s, 0, 1)).toBe(false);
    expect(noteOf('all-units')).toContain(String(land.length));
  },
  grow: (s) => {
    expect(capital(s).size).toBe(2);
    endTurn(s);
    expect(capital(s).size).toBe(3);
  },
  starve: (s) => {
    const c = capital(s);
    expect(c.size).toBe(3);
    expect(foodSurplus(s, c)).toBeLessThan(0);
    // The starvation guard does its best: the one tile with food (hills) is worked.
    const foodTiles = c.worked.filter((k) => tileYields(s, k).food > 0);
    expect(foodTiles.map((k) => s.map.tiles[k]!.terrain)).toEqual(['hills']);
    endTurn(s);
    expect(capital(s).size).toBe(2);
  },
  settler: (s) => {
    expect(capital(s).size).toBe(2);
    expect(s.units).toHaveLength(0);
    endTurn(s);
    const c = capital(s);
    expect(c.size).toBe(1);
    expect(s.units.filter((u) => UNITS[u.type].canFoundCity && u.x === c.x && u.y === c.y)).toHaveLength(1);
  },
  rich: (s) => {
    const c = capital(s);
    expect(s.players[0]!.gold).toBe(500);
    expect(buyError(s, c)).toBeUndefined();
    expect(applyAction(s, { type: 'rushBuy', cityId: c.id }).ok).toBe(true);
    endTurn(s);
    expect(capital(s).buildings).toContain('library');
  },
  tech: (s) => {
    expect(builds(s)).not.toContain('library');
    endTurn(s);
    const p = s.players[0]!;
    expect(p.techs).toContain('writing');
    expect(p.researching).toBeNull(); // the game asks for the next pick
    expect(builds(s)).toContain('library');
  },
  era: (s) => {
    expect(playerEra(s.players[0]!)).toBe('ancient');
    endTurn(s);
    expect(playerEra(s.players[0]!)).toBe('medieval');
    expect(s.log.map((e) => e.text)).toContain('Entered the Medieval era');
  },
  combat: (s) => {
    expect(oddsPct(s)).toBe(57); // 4 / (4 + 3)
    expect(modLabels(s)).toEqual([]);
    expect(noteOf('combat')).toContain('57%');
    attackFromFront(s);
  },
  fortified: (s) => {
    expect(modLabels(s)).toEqual(['Hills +50%', 'Fortified +50%', 'Veteran +50%']);
    expect(combatOdds(s, mineAt(s, FRONT)[0]!, ENEMY)!.defense.total).toBe(7.5);
    expect(oddsPct(s)).toBe(35); // 4 / (4 + 7.5)
    expect(noteOf('fortified')).toContain('35%');
    attackFromFront(s);
  },
  walls: (s) => {
    expect(modLabels(s)).toEqual(['In a city +25%', 'Walls +100%']);
    expect(combatOdds(s, mineAt(s, FRONT)[0]!, ENEMY)!.defense.total).toBe(6.75);
    expect(oddsPct(s)).toBe(47); // 6 / (6 + 6.75)
    expect(noteOf('walls')).toContain('47%');
    attackFromFront(s);
  },
  army: (s) => {
    const archers = mineAt(s, FRONT);
    expect(archers.map((u) => u.type)).toEqual(['archer', 'archer', 'archer']);
    expect(oddsPct(s)).toBe(75);
    expect(formArmyError(s, archers[0]!)).toBeUndefined();
    expect(applyAction(s, { type: 'formArmy', unitId: archers[0]!.id }).ok).toBe(true);
    const army = mineAt(s, FRONT);
    expect(army).toHaveLength(1);
    expect(army[0]!.army).toBe(true);
    const odds = combatOdds(s, army[0]!, ENEMY)!;
    expect([odds.attack.total, UNITS.archer.defense * 3]).toEqual([9, 6]);
    expect(oddsPct(s)).toBe(90);
  },
  'army-in-city': (s) => {
    const c = capital(s);
    const legions = mineAt(s, c).filter((u) => u.type === 'legion');
    expect(legions).toHaveLength(3);
    // The city panel's unit row selects the Legion; its Form Army button then works.
    expect(formArmyError(s, legions[1]!)).toBeUndefined();
    expect(applyAction(s, { type: 'formArmy', unitId: legions[1]!.id }).ok).toBe(true);
    const army = mineAt(s, c).filter((u) => u.type === 'legion');
    expect(army).toHaveLength(1);
    expect(army[0]!.army).toBe(true);
    expect(attackStrength(army[0]!).total).toBe(12);
    expect(defenseStrength(s, army[0]!).base).toBe(6);
    expect(noteOf('army-in-city')).toContain('attack 12, defense 6');
  },
  'mixed-stack': (s) => {
    const stack = unitsOnTile(s, FRONT.x, FRONT.y);
    expect(stack.map((u) => u.type)).toEqual(['warrior', 'legion', 'legion', 'legion']);
    expect(isMixedStack(stack)).toBe(true);
    expect(stackLabel(stack)).toBe('1 Warrior, 3 Legions');
    // The Warrior is drawn on top; a Legion peeks out behind it.
    expect(behindUnit(stack, stack[0]!)?.type).toBe('legion');
    // Form Army is offered for the Legions even though the Warrior is the selected unit.
    expect(formArmyError(s, stack[0]!)).toBeDefined();
    const [candidate] = armyCandidates(s, stack);
    expect(candidate?.type).toBe('legion');
    expect(applyAction(s, { type: 'formArmy', unitId: candidate!.id }).ok).toBe(true);
    const after = unitsOnTile(s, FRONT.x, FRONT.y);
    expect(after.map((u) => [u.type, u.army])).toEqual([['warrior', false], ['legion', true]]);
    expect(attackStrength(after[1]!).total).toBe(12);
    expect(noteOf('mixed-stack')).toContain('1 Warrior, 3 Legions');
    // The rival's tile is mixed too.
    const theirs = unitsOnTile(s, FRONT.x + 1, FRONT.y - 1);
    expect(isMixedStack(theirs)).toBe(true);
    expect(stackLabel(theirs)).toBe('1 Spearman, 1 Archer');
  },
  capture: (s) => {
    const rivalCapital = s.cities.find((c) => c.x === ENEMY.x && c.y === ENEMY.y)!;
    expect(rivalCapital.capitalOf).toBe(1);
    expect(oddsPct(s)).toBe(64); // 4 / (4 + 1 × 2.25)
    expect(noteOf('capture')).toContain('64%');
    const legion = mineAt(s, FRONT)[0]!;
    const res = applyAction(s, { type: 'attack', unitId: legion.id, at: ENEMY });
    expect(res.combat?.attackerWon).toBe(true);
    // One unit is enough now: the winner moved in and took the city.
    expect(res.combat?.capturedCityId).toBe(rivalCapital.id);
    expect(mineAt(s, ENEMY).map((u) => u.id)).toEqual([legion.id]);
    expect(rivalCapital.owner).toBe(0);
    expect(rivalCapital.size).toBe(2);
    expect(rivalCapital.buildings).toEqual(['granary']);
    expect(rivalCapital.capitalOf).toBe(1); // still their original capital
    expect(s.log.some((e) => e.text.includes('capital'))).toBe(true);
    expect(s.players[1]!.alive).toBe(true); // they still have Taxila
  },
  victory: (s) => {
    expect(noteOf('victory')).toContain(`${oddsPct(s)}%`);
    const res = applyAction(s, { type: 'attack', unitId: mineAt(s, FRONT)[0]!.id, at: ENEMY });
    expect(res.combat?.attackerWon).toBe(true);
    expect(res.combat?.capturedCityId).toBeDefined();
    expect(s.players[1]!.alive).toBe(false);
    // The UI shows the Victory panel when every rival is gone.
    expect(s.players.filter((p) => p.id !== 0).every((p) => !p.alive)).toBe(true);
  },
  'first-contact': (s) => {
    expect(hasMet(s, 0, 1)).toBe(false);
    const w = mineAt(s, FRONT)[0]!;
    expect(applyAction(s, { type: 'move', unitId: w.id, to: { x: FRONT.x + 1, y: FRONT.y } }).ok).toBe(true);
    expect(hasMet(s, 0, 1)).toBe(true);
    expect(atWar(s, 0, 1)).toBe(false);
    expect(metCivs(s, 0)).toEqual([1]);
    expect(s.log.some((e) => e.kind === 'contact' && e.player === 0 && e.other === 1)).toBe(true);
    expect(noteOf('first-contact')).toContain('Maurya, led by Ashoka');
  },
  peace: (s) => {
    expect(atWar(s, 0, 1)).toBe(true);
    const res = applyAction(s, { type: 'proposePeace', target: 1 });
    expect(res.answer?.accepted).toBe(true);
    expect(noteOf('peace')).toContain(res.answer!.reason);
    expect(atWar(s, 0, 1)).toBe(false);
    const legion = mineAt(s, FRONT)[0]!;
    expect(attackError(s, legion, ENEMY)).toContain('at peace');
  },
  demand: (s) => {
    endTurn(s);
    const gold = s.players[0]!.gold;
    const offer = s.diplomacy.offers.find((o) => o.kind === 'demand' && o.to === 0)!;
    expect(offer).toBeDefined();
    expect(offer.from).toBe(1);
    expect(atWar(s, 0, 1)).toBe(false);
    const before = s.diplomacy.opinion[1]![0]!;
    const res = applyAction(s, { type: 'answerOffer', offerId: offer.id, accept: false });
    expect(res.answer?.accepted).toBe(false);
    expect(s.diplomacy.opinion[1]![0]).toBeLessThan(before);
    expect(s.players[0]!.gold).toBe(gold);
  },
  'tech-trade': (s) => {
    expect(attitude(s, 1, 0)).toBe('friendly');
    expect(builds(s)).not.toContain('granary');
    const res = applyAction(s, { type: 'tradeTech', partner: 1, get: 'pottery', give: 'bronze_working' });
    expect(res.answer?.accepted).toBe(true);
    expect(s.players[0]!.techs).toContain('pottery');
    expect(s.players[1]!.techs).toContain('bronze_working');
    expect(builds(s)).toContain('granary');
  },
  'ai-war': (s) => {
    const rivalArmy = s.units.find((u) => u.owner === 1 && u.army)!;
    const start = distance(rivalArmy, capital(s));
    endTurn(s);
    expect(atWar(s, 0, 1)).toBe(true);
    expect(s.log.some((e) => e.kind === 'war' && e.player === 1 && e.other === 0)).toBe(true);
    // Within a few turns the army closes in and attacks (or has taken the city).
    let attacked = false;
    for (let i = 0; i < 6 && !attacked; i++) {
      endTurn(s);
      attacked = s.log.some((e) => e.player === 1 && e.other === 0 && /defeated|destroyed attacking|captured/.test(e.text));
    }
    expect(attacked).toBe(true);
    const army = s.units.find((u) => u.id === rivalArmy.id);
    if (army) expect(distance(army, capital(s))).toBeLessThan(start);
  },
  defeat: (s) => {
    expect(s.players[0]!.alive).toBe(true);
    endTurn(s);
    expect(s.cities.filter((c) => c.owner === 0)).toHaveLength(0);
    expect(s.units.filter((u) => u.owner === 0)).toHaveLength(0);
    expect(s.players[0]!.alive).toBe(false); // the UI shows the Defeated panel
  },
};

/** Round 14: a late-game big-map fixture, handed to you, whose End Turn runs. */
function lateMapOutcome(s: GameState, size: 'huge' | 'epic'): void {
  expect(s.mapSize).toBe(size);
  expect(s.map.width).toBe(MAP_SIZES[size].width);
  expect(s.players.filter((p) => p.kind !== 'barbarian')).toHaveLength(MAP_SIZES[size].maxRivals + 1);
  expect(s.players[0]!.kind).toBe('human');
  expect(s.currentPlayer).toBe(0);
  expect(s.turn).toBe(FIXTURE_TURN + 1);
  expect(s.victory).toBeNull();
  expect(s.players[0]!.explored.every((e) => e === 1)).toBe(true);
  expect(s.cities.length).toBeGreaterThan(30);
  expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
  expect(s.turn).toBe(FIXTURE_TURN + 2);
}

describe('dev scenarios', () => {
  it('has the starter set, with unique ids and a note each', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['grow', 'starve', 'settler', 'rich', 'tech']));
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS) expect(s.note.length).toBeGreaterThan(20);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as [string, Scenario]))('%s does what its note says', (id, scenario) => {
    const outcome = OUTCOMES[id];
    expect(outcome, `add an expected outcome for scenario "${id}" to OUTCOMES`).toBeDefined();
    outcome!(scenario.build());
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as [string, Scenario]))('%s is a valid, repeatable game state', (_id, scenario) => {
    const a = scenario.build();
    expect(scenario.build()).toEqual(a);
    const loaded = deserializeGame(serializeGame(a, 0));
    expect(loaded.kind).toBe('ok');
  });
});
