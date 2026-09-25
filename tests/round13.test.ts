// Round 13 (M9 part 1): difficulty levels, map sizes, Settings, the Almanac, the sound
// engine's rules, first-game tips, the v11 → v12 migration, and the main menu's startup.

import soundsMd from '../docs/SOUNDS.md?raw';
import soundsHtml from '../docs/sounds.html?raw';
import { describe, expect, it } from 'vitest';
import { BUILDING_IDS } from '../src/data/buildings';
import { PLAYABLE_CIVS } from '../src/data/civs';
import { DIFFICULTIES, DIFFICULTY_IDS, type DifficultyId } from '../src/data/difficulty';
import { GREAT_PERSON_KINDS } from '../src/data/greatPeople';
import { MAP_SIZES, MAP_SIZE_IDS, mapShape, victoryGoals } from '../src/data/mapSizes';
import { RESOURCE_IDS, RESOURCE_RULES } from '../src/data/resources';
import { SOUND_EVENTS, SOUND_RULES, MUSIC_FILES } from '../src/data/sounds';
import { TECH_LIST } from '../src/data/techs';
import { UNIT_IDS } from '../src/data/units';
import { PROJECT_IDS, VICTORY } from '../src/data/victory';
import { WONDER_LIST } from '../src/data/wonders';
import { civPlayers } from '../src/game/barbarians';
import { canDemand, warScore } from '../src/game/diplomacy';
import { distance, tileIndex, tilesInRadius } from '../src/game/grid';
import { aiAggression, difficultyEffects } from '../src/game/leaders';
import { landRegionSizes } from '../src/game/mapgen';
import { createGame } from '../src/game/newGame';
import { visibleResource } from '../src/game/resources';
import { deserializeGame, migrationSummary, serializeGame } from '../src/game/save';
import { STATE_VERSION, type GameState } from '../src/game/types';
import { cityYields, empireIncome } from '../src/game/yields';
import { ALMANAC_CATEGORIES, almanacCards, findCard, searchAlmanac } from '../src/ui/almanac';
import { guidePages } from '../src/ui/guide';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  TIPS_SEEN_KEY,
  loadSettings,
  loadTipsSeen,
  normalizeSettings,
  saveSettings,
  saveTipsSeen,
} from '../src/ui/settings';
import { effectiveGain, measure, normalizeGain, snapshot, soundAllowed, turnSounds, type SoundContext, type TurnSnapshot } from '../src/ui/soundLogic';
import { SAVE_KEY, backupCurrentSave, loadOrStart, saveToStorage, type KeyValueStore } from '../src/ui/storage';
import { TIPS, dueTips } from '../src/ui/tips';
import { addCity, addUnit, makeState } from './helpers';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

// ---- B1: difficulty ------------------------------------------------------------------------

/** You (player 0) and one AI, each with an identical size-3 city on grassland. */
function twoCities(level: DifficultyId): GameState {
  const s = makeState(['ggggggggggg', 'ggggggggggg', 'ggggggggggg'], { players: 2, peace: true, difficulty: level });
  addCity(s, 0, 1, 1, { size: 3 });
  addCity(s, 1, 8, 1, { size: 3 });
  s.players.forEach((p) => (p.scienceRate = 50));
  return s;
}

describe('difficulty levels (B1)', () => {
  it('Normal changes nothing: its effects are empty and both cities yield the same', () => {
    const s = twoCities('normal');
    expect(difficultyEffects(s, 0)).toEqual([]);
    expect(difficultyEffects(s, 1)).toEqual([]);
    expect(cityYields(s, s.cities[0]!).production).toBe(cityYields(s, s.cities[1]!).production);
    expect(empireIncome(s, 0)).toEqual(empireIncome(s, 1));
  });

  it('each level applies its own percents to you and to the AIs, per the data', () => {
    const base = twoCities('normal');
    const prod0 = cityYields(base, base.cities[0]!).production;
    const inc0 = empireIncome(base, 0);
    for (const id of DIFFICULTY_IDS) {
      const d = DIFFICULTIES[id];
      const s = twoCities(id);
      const pct = (n: number, p: number) => n + Math.floor((n * p) / 100);
      expect(cityYields(s, s.cities[0]!).production, `${id} you`).toBe(pct(prod0, d.player.production));
      expect(cityYields(s, s.cities[1]!).production, `${id} AI`).toBe(pct(prod0, d.ai.production));
      expect(empireIncome(s, 0).science, `${id} your science`).toBe(pct(inc0.science, d.player.science));
      expect(empireIncome(s, 1).science, `${id} AI science`).toBe(pct(inc0.science, d.ai.science));
      expect(empireIncome(s, 1).gold, `${id} AI gold`).toBe(pct(inc0.gold, d.ai.gold));
    }
  });

  it('the numbers match the plan: Novice helps you and slows the AIs; Veteran and Legendary boost the AIs', () => {
    expect(DIFFICULTIES.novice.player).toMatchObject({ production: 25, science: 25 });
    expect(DIFFICULTIES.novice.ai).toMatchObject({ production: -15, science: -15 });
    expect(DIFFICULTIES.novice.demandsFromTurn).toBe(60);
    expect(DIFFICULTIES.veteran.ai).toEqual({ production: 15, science: 15, gold: 15 });
    // Round 15 (B3): was +30% of each.
    expect(DIFFICULTIES.legendary.ai).toEqual({ production: 25, science: 20, gold: 10 });
    expect([...DIFFICULTIES.legendary.extraAiUnits].sort()).toEqual(['settler', 'warrior']);
    expect(DIFFICULTIES.novice.aggression).toBeLessThan(0);
    expect(DIFFICULTIES.veteran.aggression).toBeGreaterThan(0);
    expect(DIFFICULTIES.legendary.aggression).toBeGreaterThan(DIFFICULTIES.veteran.aggression);
    expect(DIFFICULTIES.legendary.warGraceTurns).toBeLessThan(DIFFICULTIES.normal.warGraceTurns);
  });

  it('the barbarians get nothing from any level', () => {
    const s = createGame({ seed: 5, difficulty: 'legendary' });
    const barb = s.players.findIndex((p) => p.kind === 'barbarian');
    expect(difficultyEffects(s, barb)).toEqual([]);
  });

  it('aggression changes only toward you', () => {
    const s = makeState(['ggg'], { players: 3, difficulty: 'legendary' });
    const civ = 1;
    const plain = aiAggression({ ...s, difficulty: 'normal' }, civ, 0);
    expect(aiAggression(s, civ, 0)).toBe(plain + DIFFICULTIES.legendary.aggression);
    expect(aiAggression(s, civ, 2)).toBe(plain);
  });

  it('Novice: no demand before turn 60; Normal: from turn 20', () => {
    for (const [level, from] of [['novice', 60], ['normal', 20]] as const) {
      const s = makeState(['g'.repeat(12), 'g'.repeat(12)], { players: 2, peace: true, difficulty: level });
      addCity(s, 0, 1, 1);
      addCity(s, 1, 9, 1);
      // A hostile AI much stronger than you: it would demand if the calendar allowed.
      for (let i = 0; i < 6; i++) addUnit(s, 'legion', 1, 9, 0);
      s.diplomacy.opinion[1]![0] = -8;
      s.turn = from - 1;
      expect(canDemand(s, 1, 0), `${level} turn ${s.turn}`).toBe(false);
      s.turn = from;
      expect(canDemand(s, 1, 0), `${level} turn ${s.turn}`).toBe(true);
    }
  });

  it('Legendary: an AI may go to war with you from turn 12 (Normal: 20)', () => {
    const setup = (level: DifficultyId, turn: number) => {
      const s = makeState(['g'.repeat(12), 'g'.repeat(12)], { players: 2, peace: true, difficulty: level });
      addCity(s, 0, 1, 1);
      addCity(s, 1, 9, 1);
      for (let i = 0; i < 6; i++) addUnit(s, 'legion', 1, 9, 0);
      s.players[1]!.techs = ['bronze_working', 'iron_working'];
      s.turn = turn;
      return s;
    };
    expect(warScore(setup('legendary', 11), 1, 0)).toBe(-Infinity);
    expect(warScore(setup('legendary', 12), 1, 0)).toBeGreaterThan(0);
    expect(warScore(setup('normal', 12), 1, 0)).toBe(-Infinity);
  });

  it('Legendary AIs start with a free Warrior and Settler; you start as usual', () => {
    const s = createGame({ seed: 7, difficulty: 'legendary' });
    expect(s.difficulty).toBe('legendary');
    for (const p of civPlayers(s)) {
      const types = s.units.filter((u) => u.owner === p.id).map((u) => u.type).sort();
      expect(types).toEqual(p.id === 0 ? ['settler', 'warrior'] : ['settler', 'settler', 'warrior', 'warrior']);
    }
  });

  it('a new game is Normal unless chosen, and the level is in the save', () => {
    const s = createGame({ seed: 9 });
    expect(s.difficulty).toBe('normal');
    const v = createGame({ seed: 9, difficulty: 'veteran' });
    const back = deserializeGame(serializeGame(v, 0));
    expect(back.kind === 'ok' && back.state.difficulty).toBe('veteran');
  });

  it('a Normal game plays exactly as before Round 13 (same map, same units)', () => {
    const a = createGame({ seed: 21 });
    const b = createGame({ seed: 21, difficulty: 'normal', mapSize: 'normal' });
    expect(b).toEqual(a);
    expect(a.map.width).toBe(32);
    expect(a.map.height).toBe(24);
  });
});

// ---- B2: map size --------------------------------------------------------------------------

describe('map sizes (B2)', () => {
  for (const size of MAP_SIZE_IDS) {
    const def = MAP_SIZES[size];
    it(`${def.name}: ${def.width}×${def.height}, villages, huts, resources, and fair starts scale (6 seeds, most rivals)`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const s = createGame({ seed, mapSize: size, playerCount: def.maxRivals + 1 });
        expect(s.mapSize).toBe(size);
        expect(s.map.width).toBe(def.width);
        expect(s.map.height).toBe(def.height);
        const civs = civPlayers(s);
        expect(civs).toHaveLength(def.maxRivals + 1);
        // Villages and huts within the size's caps.
        expect(s.villages.length, `seed ${seed} villages`).toBeGreaterThanOrEqual(Math.min(def.villages.min, 1));
        expect(s.villages.length).toBeLessThanOrEqual(def.villages.max);
        const huts = s.map.tiles.filter((t) => t.hut).length;
        expect(huts, `seed ${seed} huts`).toBeGreaterThanOrEqual(Math.min(def.huts.min, 1));
        expect(huts).toBeLessThanOrEqual(def.huts.max);
        // Resources: the same share of tiles whatever the size.
        const res = s.map.tiles.filter((t) => t.resource).length / s.map.tiles.length;
        expect(res, `seed ${seed} resource share`).toBeGreaterThan(0.01);
        expect(res).toBeLessThan(0.1);
        // Fair starts: food or production resources near every start, on a big enough landmass.
        const regions = landRegionSizes(s.map);
        const starts = civs.map((p) => s.units.find((u) => u.owner === p.id)!);
        for (const [i, start] of starts.entries()) {
          const near = tilesInRadius(s.map, start, RESOURCE_RULES.startRadius).filter((c) => {
            const r = visibleResource(s, civs[i]!.id, tileIndex(s.map, c.x, c.y));
            return r && r.bonus.food + r.bonus.production > 0 && (c.x !== start.x || c.y !== start.y);
          });
          expect(near.length, `seed ${seed} civ ${i}`).toBeGreaterThanOrEqual(RESOURCE_RULES.startMinimum);
          expect(regions[tileIndex(s.map, start.x, start.y)]!).toBeGreaterThanOrEqual(mapShape(size).minStartLandmass);
          for (const other of starts.slice(i + 1)) expect(distance(start, other)).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it('more villages and huts on a bigger map (6 seeds, on average)', () => {
    const avg = (size: 'small' | 'large', f: (s: GameState) => number) => {
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) n += f(createGame({ seed, mapSize: size, playerCount: 3 }));
      return n / 6;
    };
    expect(avg('large', (s) => s.villages.length)).toBeGreaterThan(avg('small', (s) => s.villages.length));
    expect(avg('large', (s) => s.map.tiles.filter((t) => t.hut).length)).toBeGreaterThan(avg('small', (s) => s.map.tiles.filter((t) => t.hut).length));
  });

  it('each size caps its rivals', () => {
    expect(() => createGame({ seed: 1, mapSize: 'small', playerCount: 5 })).toThrow();
    expect(() => createGame({ seed: 1, mapSize: 'small', playerCount: 4 })).not.toThrow();
    expect(() => createGame({ seed: 1, playerCount: 6 })).toThrow();
    expect(() => createGame({ seed: 1, mapSize: 'large', playerCount: 6 })).not.toThrow();
  });

  it('victory goals: Normal as VICTORY says, Large higher (Round 15: Small has its own)', () => {
    expect(victoryGoals('normal')).toEqual({ culture: VICTORY.cultureGoal, gold: VICTORY.goldGoal });
    expect(victoryGoals('large').culture).toBeGreaterThan(VICTORY.cultureGoal);
    expect(victoryGoals(undefined)).toEqual(victoryGoals('normal'));
  });
});

// ---- A2: Settings --------------------------------------------------------------------------

describe('settings (A2)', () => {
  it('defaults when nothing is stored, and a round trip keeps every field', () => {
    const store = new MemoryStore();
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    const mine = { ...DEFAULT_SETTINGS, sfxOn: false, sfxVolume: 30, musicVolume: 10, animationSpeed: 'fast' as const, confirmEndTurn: false, textSize: 'large' as const, tips: false };
    expect(saveSettings(mine, store)).toBe(true);
    expect(loadSettings(store)).toEqual(mine);
  });

  it('are kept apart from saved games: saving, backing up, and starting a game never touch them', () => {
    const store = new MemoryStore();
    saveSettings({ ...DEFAULT_SETTINGS, textSize: 'large' }, store);
    saveTipsSeen(['first-city'], store);
    const game = createGame({ seed: 3 });
    saveToStorage(game, store);
    backupCurrentSave('test', 0, store);
    loadOrStart({ forceNew: true, newGame: () => createGame({ seed: 4 }), now: 1 }, store);
    expect(SETTINGS_KEY).not.toBe(SAVE_KEY);
    expect(loadSettings(store).textSize).toBe('large');
    expect(loadTipsSeen(store)).toEqual(['first-city']);
    expect(store.getItem(SAVE_KEY)).not.toContain('textSize');
  });

  it('damaged or odd values fall back field by field', () => {
    const store = new MemoryStore();
    store.setItem(SETTINGS_KEY, '{nope');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ sfxVolume: 250, musicVolume: -5, textSize: 'huge', tips: 'yes', sfxOn: false })).toEqual({
      ...DEFAULT_SETTINGS,
      sfxVolume: 100,
      musicVolume: 0,
      sfxOn: false,
    });
    store.setItem(TIPS_SEEN_KEY, '{"a":1}');
    expect(loadTipsSeen(store)).toEqual([]);
  });
});

// ---- C2: the Almanac -----------------------------------------------------------------------

describe('the Almanac (C2)', () => {
  const cards = almanacCards();
  const count = (cat: string) => cards.filter((c) => c.category === cat).length;

  it('has a card for every data entry, none missing', () => {
    expect(count('unit')).toBe(UNIT_IDS.length);
    expect(count('building')).toBe(BUILDING_IDS.length);
    expect(count('wonder')).toBe(WONDER_LIST.length);
    expect(count('project')).toBe(PROJECT_IDS.length);
    expect(count('tech')).toBe(TECH_LIST.length);
    expect(count('resource')).toBe(RESOURCE_IDS.length);
    expect(count('greatPerson')).toBe(GREAT_PERSON_KINDS.length);
    expect(count('leader')).toBe(PLAYABLE_CIVS.length);
    expect(count('difficulty')).toBe(DIFFICULTY_IDS.length);
    expect(count('mapSize')).toBe(MAP_SIZE_IDS.length);
    expect(new Set(cards.map((c) => c.category))).toEqual(new Set(ALMANAC_CATEGORIES.map((c) => c.id)));
    for (const id of UNIT_IDS) expect(findCard(`unit:${id}`)).toBeDefined();
    for (const t of TECH_LIST) expect(findCard(`tech:${t.id}`)).toBeDefined();
  });

  it('every card has a name and content, ids are unique, and every link leads to a card', () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    for (const c of cards) {
      expect(c.name.length, c.id).toBeGreaterThan(0);
      expect(c.html, c.id).toContain('<dl class="facts">');
      for (const m of c.html.matchAll(/data-card="([^"]+)"/g)) expect(findCard(m[1]!), `${c.id} → ${m[1]}`).toBeDefined();
    }
    // How to Play links too.
    for (const p of guidePages()) for (const m of p.html.matchAll(/data-card="([^"]+)"/g)) expect(findCard(m[1]!), `${p.id} → ${m[1]}`).toBeDefined();
  });

  it('a leader card shows every bonus and the starting tech', () => {
    const rome = PLAYABLE_CIVS.find((c) => c.id === 'rome')!;
    const card = findCard('leader:rome')!;
    expect(card.name).toBe(rome.leader);
    expect(card.html).toContain('data-card="tech:bronze_working"');
    expect(card.html).toContain('Drawback');
  });

  it('search: every word must match, names first, and a category narrows it', () => {
    expect(searchAlmanac('spear')[0]!.id).toBe('unit:spearman');
    expect(searchAlmanac('bronze working').map((c) => c.id)).toContain('tech:bronze_working');
    expect(searchAlmanac('', 'leader')).toHaveLength(PLAYABLE_CIVS.length);
    expect(searchAlmanac('zzzz')).toEqual([]);
  });
});

describe('How to Play (C1)', () => {
  it('covers every topic in the plan, the four victories included', () => {
    const titles = guidePages().map((p) => p.title.toLowerCase());
    for (const topic of ['founding', 'cities', 'research', 'combat', 'ships', 'diplomacy', 'villages', 'religion', 'four ways to win']) {
      expect(titles.some((t) => t.includes(topic)), topic).toBe(true);
    }
    const win = guidePages().find((p) => p.id === 'winning')!.html;
    for (const w of ['Domination', 'Culture', 'Economic', 'Technology']) expect(win).toContain(w);
  });
});

// ---- D: sound ------------------------------------------------------------------------------

describe('the sound engine rules (D3)', () => {
  const ctx = (over: Partial<SoundContext> = {}, settings = {}): SoundContext => ({
    settings: { ...DEFAULT_SETTINGS, ...settings },
    hidden: false,
    unlocked: true,
    scenario: false,
    ...over,
  });

  it('plays only once unlocked, never while hidden, and only when switched on', () => {
    expect(soundAllowed(ctx(), 'sfx')).toBe(true);
    expect(soundAllowed(ctx(), 'music')).toBe(true);
    expect(soundAllowed(ctx({ unlocked: false }), 'sfx')).toBe(false);
    expect(soundAllowed(ctx({ hidden: true }), 'sfx')).toBe(false);
    expect(soundAllowed(ctx({}, { sfxOn: false }), 'sfx')).toBe(false);
    expect(soundAllowed(ctx({}, { sfxOn: false }), 'music')).toBe(true);
    expect(soundAllowed(ctx({}, { musicOn: false }), 'music')).toBe(false);
    expect(soundAllowed(ctx({}, { sfxVolume: 0 }), 'sfx')).toBe(false);
  });

  it('a dev scenario is silent unless Settings allows it', () => {
    expect(soundAllowed(ctx({ scenario: true }), 'sfx')).toBe(false);
    expect(soundAllowed(ctx({ scenario: true }, { scenarioSound: true }), 'sfx')).toBe(true);
  });

  it('effects and music have their own volume; loudness is normalized without clipping', () => {
    const s = { ...DEFAULT_SETTINGS, sfxVolume: 50, musicVolume: 100 };
    expect(effectiveGain(s, 'sfx', 2)).toBeCloseTo(1);
    expect(effectiveGain(s, 'music', 1)).toBeCloseTo(SOUND_RULES.musicLevel);
    // Quiet file: raised to the target, but never past maxGain or so the peak clips.
    expect(normalizeGain(SOUND_RULES.targetRms / 2, 0.2)).toBeCloseTo(2);
    expect(normalizeGain(0.001, 0.01)).toBe(SOUND_RULES.maxGain);
    expect(normalizeGain(0.05, 0.9)).toBeCloseTo(0.99 / 0.9);
    expect(normalizeGain(0.5, 1)).toBeCloseTo(SOUND_RULES.targetRms / 0.5);
    const m = measure([0.5, -0.5, 0.5, -0.5]);
    expect(m.rms).toBeCloseTo(0.5);
    expect(m.peak).toBe(0.5);
  });

  const snap = (over: Partial<TurnSnapshot> = {}): TurnSnapshot => ({ techs: 3, era: 0, sizes: { 1: 2 }, buildings: { 1: 0 }, wonders: 0, alive: true, victory: false, ...over });

  it('an End Turn earns at most two sounds, most important first; a quiet turn gets the soft cue', () => {
    expect(turnSounds(snap(), snap(), { warOnYou: false })).toEqual(['new-turn']);
    expect(turnSounds(snap(), snap({ techs: 4 }), { warOnYou: false })).toEqual(['tech-learned']);
    expect(turnSounds(snap(), snap({ techs: 4, era: 1 }), { warOnYou: false })).toEqual(['era-reached']);
    const busy = turnSounds(snap(), snap({ techs: 4, sizes: { 1: 3 }, buildings: { 1: 1 } }), { warOnYou: true });
    expect(busy).toHaveLength(SOUND_RULES.maxPerTurn);
    expect(busy[0]).toBe('war-declared');
    expect(turnSounds(snap(), snap({ sizes: {} , buildings: {} }), { warOnYou: false })).toEqual(['combat-loss']);
    // The end of the game has its own sound, from the end screen.
    expect(turnSounds(snap(), snap({ victory: true, techs: 4 }), { warOnYou: false })).toEqual([]);
  });

  it('from the AIs’ turns, only war on you and a city lost make noise (among AI-caused news)', () => {
    const aiTurn = SOUND_EVENTS.filter((e) => e.aiTurn).map((e) => e.id).sort();
    expect(aiTurn).toEqual(['combat-loss', 'defeat', 'war-declared']);
  });

  it('snapshot reads your techs, era, and cities', () => {
    const s = makeState(['ggg', 'ggg', 'ggg'], { players: 2 });
    addCity(s, 0, 1, 1, { size: 4 });
    const sn = snapshot(s, 0);
    expect(Object.values(sn.sizes)).toEqual([4]);
    expect(sn.techs).toBe(0);
  });

  it('docs/SOUNDS.md and docs/sounds.html list every sound file (D1, D2)', () => {
    const md = soundsMd;
    const html = soundsHtml;
    expect(SOUND_EVENTS).toHaveLength(14);
    for (const e of SOUND_EVENTS) {
      expect(md, e.file).toContain(e.file);
      expect(html, e.file).toContain(e.file);
    }
    for (const f of MUSIC_FILES) {
      expect(md).toContain(f);
      expect(html).toContain(f);
    }
    // The check page normalizes like the game.
    expect(html).toContain(`targetRms: ${SOUND_RULES.targetRms}`);
    expect(html).toContain(`maxGain: ${SOUND_RULES.maxGain}`);
  });
});

// ---- C3: first-game tips -------------------------------------------------------------------

describe('first-game tips (C3)', () => {
  it('each is due only once its moment has come, and never again once seen', () => {
    const s = makeState(['ggggg', 'ggggg', 'ggggg'], { players: 2, met: false });
    addUnit(s, 'settler', 0, 1, 1);
    expect(dueTips(s, 0, []).map((t) => t.id)).toEqual(['first-turn']);
    expect(dueTips(s, 0, ['first-turn'])).toEqual([]);
    addCity(s, 0, 1, 1);
    s.units = s.units.filter((u) => u.type !== 'settler');
    expect(dueTips(s, 0, ['first-turn']).map((t) => t.id)).toEqual(['first-city']);
    s.players[0]!.techs = ['pottery'];
    s.diplomacy.met[0]![1] = s.diplomacy.met[1]![0] = true;
    expect(dueTips(s, 0, ['first-turn', 'first-city']).map((t) => t.id)).toEqual(['first-tech', 'first-contact']);
    s.atWar[0]![1] = s.atWar[1]![0] = true;
    expect(dueTips(s, 0, ['first-turn', 'first-city', 'first-tech', 'first-contact']).map((t) => t.id)).toEqual(['first-war']);
  });

  it('a starting tech doesn’t count as learning one', () => {
    const s = createGame({ seed: 3, civ: 'rome' });
    expect(dueTips(s, 0, []).map((t) => t.id)).not.toContain('first-tech');
    expect(TIPS.length).toBeGreaterThanOrEqual(6);
  });
});

// ---- E1: the migration, and A1's startup -----------------------------------------------------

/** A v11 save (Round 12): today's state without the Round 13 fields. */
function v11Save(): string {
  const s = createGame({ seed: 12 }) as unknown as Record<string, unknown>;
  delete s.difficulty;
  delete s.mapSize;
  s.version = 11;
  return JSON.stringify({ saveVersion: 11, savedAt: 5, state: s });
}

describe('save migration v11 → v12 (E1)', () => {
  it('an old game becomes Normal on a Normal map, and plays on', () => {
    expect(STATE_VERSION).toBe(12);
    const res = deserializeGame(v11Save());
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.migratedFrom).toBe(11);
    expect(res.state.difficulty).toBe('normal');
    expect(res.state.mapSize).toBe('normal');
    expect(migrationSummary(11)).toContain('difficulty levels and map sizes');
  });

  it('the upgrade keeps the old save as a backup', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, v11Save());
    const start = loadOrStart({ forceNew: false, newGame: () => createGame({ seed: 1 }), now: 9, saveFresh: false }, store);
    expect(start.state.difficulty).toBe('normal');
    expect(start.placeholder).toBeUndefined();
    const backup = JSON.parse(store.getItem('epoch.autosave.backup.1')!);
    expect(JSON.parse(backup.text).saveVersion).toBe(11);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).saveVersion).toBe(12);
  });

  it('a save without a level (damaged) is refused, not guessed', () => {
    const s = createGame({ seed: 12 }) as unknown as Record<string, unknown>;
    delete s.difficulty;
    expect(deserializeGame(JSON.stringify({ saveVersion: 12, savedAt: 0, state: s })).kind).toBe('corrupt');
  });
});

describe('startup with the main menu (A1)', () => {
  it('with no save, the game behind the menu is a stand-in: not saved', () => {
    const store = new MemoryStore();
    const start = loadOrStart({ forceNew: false, newGame: () => createGame({ seed: 1 }), now: 1, saveFresh: false }, store);
    expect(start.placeholder).toBe(true);
    expect(store.getItem(SAVE_KEY)).toBeNull();
  });

  it('with a save, it resumes as before (the menu offers Continue)', () => {
    const store = new MemoryStore();
    saveToStorage(createGame({ seed: 2 }), store);
    const start = loadOrStart({ forceNew: false, newGame: () => createGame({ seed: 1 }), now: 1, saveFresh: false }, store);
    expect(start.placeholder).toBeUndefined();
    expect(start.state.seed).toBe(2);
  });

  it('?new still starts (and saves) a new game at once', () => {
    const store = new MemoryStore();
    const start = loadOrStart({ forceNew: true, newGame: () => createGame({ seed: 1 }), now: 1, saveFresh: false }, store);
    expect(start.placeholder).toBeUndefined();
    expect(store.getItem(SAVE_KEY)).not.toBeNull();
  });
});
