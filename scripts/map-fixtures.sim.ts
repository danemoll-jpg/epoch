// Round 14 (A3, D2): writes the late-game saves the `huge-map` and `epic-map` dev scenarios
// load (src/dev/fixtures/). Playing 150 turns of a Huge map in the browser would take far too
// long on an iPad, so the scenario starts from this save instead: the AI plays every civ
// (you too) to FIXTURE_TURN, then the game is handed to you with the whole map revealed.
// Dev only; the production build never contains them. Rerun after a save format change:
// npm run sim -- map-fixtures
import { writeFileSync, mkdirSync } from 'node:fs';
import { describe, it } from 'vitest';
import { MAP_SIZES, type MapSizeId } from '../src/data/mapSizes';
import { FIXTURE_SEEDS, FIXTURE_TURN } from '../src/dev/fixtures/fixtures';
import { createGame } from '../src/game/newGame';
import { serializeGame } from '../src/game/save';
import { endTurn, playComputerTurn } from '../src/game/turn';
import { report } from '../src/dev/sim';

function make(size: MapSizeId): void {
  // The first seed from the list whose game has no winner by then.
  for (const seed of FIXTURE_SEEDS[size]!) {
    const s = createGame({ seed, mapSize: size, playerCount: MAP_SIZES[size].maxRivals + 1 });
    s.players[0]!.kind = 'ai';
    while ((s.turn <= FIXTURE_TURN || s.currentPlayer !== 0) && !s.victory) {
      playComputerTurn(s, s.currentPlayer);
      endTurn(s);
    }
    if (s.victory) {
      report(`[fixtures] ${size} seed ${seed}: won on turn ${s.victory.turn}, trying the next seed`);
      continue;
    }
    s.players[0]!.kind = 'human';
    s.players[0]!.explored.fill(1);
    mkdirSync('src/dev/fixtures', { recursive: true });
    const text = serializeGame(s, 0);
    writeFileSync(`src/dev/fixtures/${size}-late.json`, text);
    report(`[fixtures] ${size} seed ${seed}: turn ${s.turn}, ${s.cities.length} cities, ${s.units.length} units, ${Math.round(text.length / 1024)} KB`);
    return;
  }
  throw new Error(`no ${size} seed without a winner by turn ${FIXTURE_TURN}`);
}

describe('map-fixtures', () => {
  it('huge', () => make('huge'), 600_000);
  it('epic', () => make('epic'), 600_000);
});
