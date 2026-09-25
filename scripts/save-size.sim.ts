// Round 16 (B4): how big a cloud save gets. Plays the Epic late-game fixture (turn 151) on to
// turn 220 with the AI playing every civ, then reports the save's size raw and gzipped (as it
// goes to the cloud) every 10 turns, and the largest. Run: npm run sim -- save-size
import { describe, expect, it } from 'vitest';
import { CLOUD } from '../src/data/firebase';
import { gzipText } from '../src/cloud/compress';
import { lateGame } from '../src/dev/fixtures/fixtures';
import { report } from '../src/dev/sim';
import { serializeGame } from '../src/game/save';
import { endTurn, playComputerTurn } from '../src/game/turn';

const UNTIL = Number(process.env.TURNS ?? 220);

describe('save-size', () => {
  it(`Epic save sizes to turn ${UNTIL}`, async () => {
    const s = lateGame('epic');
    s.players[0]!.kind = 'ai';
    let worst = { turn: 0, raw: 0, gz: 0 };
    const measure = async () => {
      const text = serializeGame(s, 0);
      const gz = (await gzipText(text)).length;
      report(`[save-size] epic turn ${s.turn}: ${Math.round(text.length / 1024)} KB raw, ${Math.round(gz / 1024)} KB gzipped (${s.cities.length} cities, ${s.units.length} units, ${s.log.length} log entries)`);
      if (gz > worst.gz) worst = { turn: s.turn, raw: text.length, gz };
    };
    await measure();
    while (s.turn < UNTIL && !s.victory) {
      playComputerTurn(s, s.currentPlayer);
      const before = s.turn;
      endTurn(s);
      if (s.turn !== before && s.turn % 10 === 0) await measure();
    }
    await measure();
    report(`[save-size] largest: turn ${worst.turn}, ${Math.round(worst.raw / 1024)} KB raw → ${Math.round(worst.gz / 1024)} KB gzipped; the cloud's limit is ${CLOUD.maxSaveBytes / 1024} KB (Firestore's is 1024 KB a document)${s.victory ? `; the game was won on turn ${s.victory.turn}` : ''}`);
    expect(worst.gz).toBeLessThan(CLOUD.maxSaveBytes);
  }, 600_000);
});
