// Round 21 (item 4): drag to move. The pure rules (dragMove.ts) and the gesture itself
// (input.ts, driven with a stand-in canvas and plain events).

import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { DRAG_EDGE, dragGrabsUnit, dragPreview, dropResult, edgeScroll, inRect } from '../src/ui/dragMove';
import { attachMapInput } from '../src/ui/input';
import { addCity, addUnit, makeState } from './helpers';

function board() {
  const state = makeState(['gggggggg', 'gggggggg', 'gggggggg', 'gggggggg']);
  const city = addCity(state, 0, 6, 1, { name: 'Oxford' });
  const legion = addUnit(state, 'legion', 0, 1, 1);
  return { state, city, legion };
}

describe('drag to move: the rules', () => {
  it('only a press on the selected unit (yours, with moves, your turn) grabs it', () => {
    const { state, legion } = board();
    expect(dragGrabsUnit(state, 0, legion.id, 1, 1)).toBe(true);
    expect(dragGrabsUnit(state, 0, legion.id, 2, 1)).toBe(false); // elsewhere: pans
    expect(dragGrabsUnit(state, 0, undefined, 1, 1)).toBe(false); // nothing selected
    legion.movesLeft = 0;
    expect(dragGrabsUnit(state, 0, legion.id, 1, 1)).toBe(false);
    legion.movesLeft = 1;
    state.currentPlayer = 1;
    expect(dragGrabsUnit(state, 0, legion.id, 1, 1)).toBe(false);
    state.currentPlayer = 0;
    const theirs = addUnit(state, 'warrior', 1, 4, 3);
    expect(dragGrabsUnit(state, 0, theirs.id, 4, 3)).toBe(false);
  });

  it('releasing does what a tap would: a move, an attack next door', () => {
    const { state, legion } = board();
    expect(dropResult(state, 0, legion.id, 3, 2)).toEqual({ kind: 'move', unitId: legion.id });
    addUnit(state, 'warrior', 1, 2, 2);
    expect(dropResult(state, 0, legion.id, 2, 2)).toEqual({ kind: 'attack', unitId: legion.id });
  });

  it('onto your own city or units from afar, it moves there (not open or select)', () => {
    const { state, city, legion } = board();
    expect(dropResult(state, 0, legion.id, city.x, city.y)).toEqual({ kind: 'move', unitId: legion.id });
    addUnit(state, 'archer', 0, 4, 3);
    expect(dropResult(state, 0, legion.id, 4, 3)).toEqual({ kind: 'move', unitId: legion.id });
  });

  it('back on the unit or off the map cancels', () => {
    const { state, legion } = board();
    expect(dropResult(state, 0, legion.id, 1, 1)).toBeUndefined();
    expect(dropResult(state, 0, legion.id, -1, 1)).toBeUndefined();
    expect(dropResult(state, 0, legion.id, 1, 9)).toBeUndefined();
  });

  it('the preview is the path and its turns for a move, the target alone for an attack', () => {
    const { state, city, legion } = board();
    const p = dragPreview(state, 0, legion.id, city.x, city.y)!;
    expect(p.path.at(-1)).toEqual({ x: city.x, y: city.y });
    expect(p.path).toHaveLength(5);
    expect(p.turns).toBe(5);
    addUnit(state, 'warrior', 1, 2, 2);
    expect(dragPreview(state, 0, legion.id, 2, 2)).toEqual({ path: [{ x: 2, y: 2 }], turns: 1 });
    expect(dragPreview(state, 0, legion.id, 1, 1)).toBeUndefined();
    // Walled in by water: no path, no preview.
    const island = makeState(['ggoogg']);
    const w = addUnit(island, 'warrior', 0, 0, 0);
    expect(dragPreview(island, 0, w.id, 5, 0)).toBeUndefined();
  });

  it('a dropped move is the ordinary move action', () => {
    const { state, legion } = board();
    expect(dropResult(state, 0, legion.id, 2, 1)!.kind).toBe('move');
    expect(applyAction(state, { type: 'move', unitId: legion.id, to: { x: 2, y: 1 } }).ok).toBe(true);
  });

  it('scrolls only near the edges of the visible map, faster closer in', () => {
    const safe = { left: 0, top: 60, right: 800, bottom: 500 };
    const { margin, maxSpeed } = DRAG_EDGE;
    expect(edgeScroll(400, 300, safe, margin, maxSpeed)).toEqual({ dx: 0, dy: 0 });
    const nearRight = edgeScroll(800 - margin / 2, 300, safe, margin, maxSpeed);
    expect(nearRight.dx).toBeCloseTo(maxSpeed / 2);
    expect(edgeScroll(799, 300, safe, margin, maxSpeed).dx).toBeGreaterThan(nearRight.dx);
    expect(edgeScroll(2, 300, safe, margin, maxSpeed).dx).toBeLessThan(0);
    // Past the edge (over the top bar): full speed, up.
    expect(edgeScroll(400, 20, safe, margin, maxSpeed)).toEqual({ dx: 0, dy: -maxSpeed });
    expect(inRect(safe, 400, 20)).toBe(false);
  });
});

// A stand-in canvas: an EventTarget with the bits input.ts uses.
function fakeCanvas(): HTMLCanvasElement {
  const t = new EventTarget() as EventTarget & Record<string, unknown>;
  t.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  t.setPointerCapture = () => {};
  return t as unknown as HTMLCanvasElement;
}

function send(c: HTMLCanvasElement, type: string, id: number, x: number, y: number, pointerType = 'touch') {
  const e = new Event(type, { cancelable: true }) as Event & Record<string, unknown>;
  Object.assign(e, { pointerId: id, clientX: x, clientY: y, pointerType, button: 0 });
  c.dispatchEvent(e);
}

function recorder(grabAt: { x: number; y: number }) {
  const log: string[] = [];
  const once = (s: string) => {
    if (!log.includes(s)) log.push(s);
  };
  const h = {
    onTap: (x: number, y: number) => void log.push(`tap ${x},${y}`),
    onPan: () => once('pan'),
    onZoom: () => once('zoom'),
    grab: (x: number, y: number) => Math.abs(x - grabAt.x) < 20 && Math.abs(y - grabAt.y) < 20,
    onDragMove: (x: number, y: number) => void log.push(`drag ${x},${y}`),
    onDragEnd: (x: number, y: number, cancelled: boolean) => void log.push(cancelled ? 'cancel' : `drop ${x},${y}`),
  };
  return { h, log };
}

describe('drag to move: the gesture', () => {
  it('a drag from the unit drags it and drops it, and never pans', () => {
    const c = fakeCanvas();
    const { h, log } = recorder({ x: 100, y: 100 });
    attachMapInput(c, h);
    send(c, 'pointerdown', 1, 100, 100);
    send(c, 'pointermove', 1, 105, 100); // under the touch threshold: nothing yet
    send(c, 'pointermove', 1, 150, 100);
    send(c, 'pointermove', 1, 200, 120);
    send(c, 'pointerup', 1, 200, 120);
    expect(log).toEqual(['drag 150,100', 'drag 200,120', 'drop 200,120']);
  });

  it('a drag from anywhere else pans, as before', () => {
    const c = fakeCanvas();
    const { h, log } = recorder({ x: 100, y: 100 });
    attachMapInput(c, h);
    send(c, 'pointerdown', 1, 300, 300);
    send(c, 'pointermove', 1, 350, 300);
    send(c, 'pointerup', 1, 350, 300);
    expect(log).toEqual(['pan']);
  });

  it('a press on the unit without moving is still a tap', () => {
    const c = fakeCanvas();
    const { h, log } = recorder({ x: 100, y: 100 });
    attachMapInput(c, h);
    send(c, 'pointerdown', 1, 100, 100, 'mouse');
    send(c, 'pointermove', 1, 103, 100, 'mouse');
    send(c, 'pointerup', 1, 103, 100, 'mouse');
    expect(log).toEqual(['tap 103,100']);
  });

  it('works with the mouse too', () => {
    const c = fakeCanvas();
    const { h, log } = recorder({ x: 100, y: 100 });
    attachMapInput(c, h);
    send(c, 'pointerdown', 1, 100, 100, 'mouse');
    send(c, 'pointermove', 1, 140, 100, 'mouse');
    send(c, 'pointerup', 1, 140, 100, 'mouse');
    expect(log).toEqual(['drag 140,100', 'drop 140,100']);
  });

  it('a second finger cancels the drag and pinches; a pointercancel cancels', () => {
    const c = fakeCanvas();
    const { h, log } = recorder({ x: 100, y: 100 });
    attachMapInput(c, h);
    send(c, 'pointerdown', 1, 100, 100);
    send(c, 'pointermove', 1, 150, 100);
    send(c, 'pointerdown', 2, 300, 300);
    send(c, 'pointermove', 2, 340, 340);
    send(c, 'pointerup', 2, 340, 340);
    send(c, 'pointerup', 1, 150, 100);
    expect(log).toEqual(['drag 150,100', 'cancel', 'pan', 'zoom']);

    const c2 = fakeCanvas();
    const r2 = recorder({ x: 100, y: 100 });
    attachMapInput(c2, r2.h);
    send(c2, 'pointerdown', 1, 100, 100);
    send(c2, 'pointermove', 1, 150, 100);
    send(c2, 'pointercancel', 1, 150, 100);
    expect(r2.log).toEqual(['drag 150,100', 'cancel']);
  });
});
