// Pointer input for the map canvas. One code path for mouse, touch, and pen via Pointer
// Events: tap/click, one-finger or mouse drag to pan, two-finger pinch (plus mouse wheel) to
// zoom. Nothing here depends on hover, right-click, or the keyboard.
//
// Round 21 (item 4): drag to move. A press that `grab` accepts (the selected unit's tile) turns
// a drag into a unit drag: `onDragMove` as it goes, `onDragEnd` on release (cancelled by a
// second finger or a pointercancel), and the map doesn't pan. Any other press pans as before.
// A press on the unit that never moves past the threshold is still a tap.

export interface MapInputHandlers {
  onTap(sx: number, sy: number): void;
  onPan(dx: number, dy: number): void;
  onZoom(factor: number, sx: number, sy: number): void;
  /** Does a press here grab something to drag (instead of panning the map)? */
  grab?(sx: number, sy: number): boolean;
  onDragMove?(sx: number, sy: number): void;
  /** The drag ended: dropped at (sx, sy), or cancelled. */
  onDragEnd?(sx: number, sy: number, cancelled: boolean): void;
}

/** Movement (CSS px) before a press counts as a drag instead of a tap. */
const DRAG_THRESHOLD_MOUSE = 6;
const DRAG_THRESHOLD_TOUCH = 12;

export function attachMapInput(canvas: HTMLCanvasElement, h: MapInputHandlers): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | undefined;
  let dragging = false;
  let multiTouch = false; // any second finger during this gesture cancels the tap
  let pinch: { dist: number; mx: number; my: number } | undefined;
  let grabbed = false; // this press grabbed a unit: a drag moves it, not the map

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return undefined;
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for a pointer the browser already released; input still works.
    }
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      start = p;
      dragging = false;
      multiTouch = false;
      grabbed = !!h.grab?.(p.x, p.y);
    } else if (pointers.size === 2) {
      multiTouch = true;
      pinch = pinchInfo();
      // A second finger turns a unit drag into a pinch: the drag is cancelled.
      if (grabbed) {
        grabbed = false;
        if (dragging) h.onDragEnd?.(p.x, p.y, true);
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    e.preventDefault();
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1 && start) {
      const threshold = e.pointerType === 'mouse' ? DRAG_THRESHOLD_MOUSE : DRAG_THRESHOLD_TOUCH;
      if (grabbed) {
        if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) > threshold) dragging = true;
        if (dragging) h.onDragMove?.(p.x, p.y);
      } else if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) > threshold) {
        dragging = true;
        h.onPan(p.x - start.x, p.y - start.y);
      } else if (dragging) {
        h.onPan(p.x - prev.x, p.y - prev.y);
      }
    } else if (pointers.size === 2 && pinch) {
      const now = pinchInfo();
      if (!now || now.dist < 1 || pinch.dist < 1) return;
      h.onPan(now.mx - pinch.mx, now.my - pinch.my);
      h.onZoom(now.dist / pinch.dist, now.mx, now.my);
      pinch = now;
    }
  });

  const end = (e: PointerEvent, cancelled: boolean) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      // Pinch ended with one finger still down: keep panning from where that finger is,
      // but never turn the leftover finger into a tap.
      pinch = undefined;
      start = [...pointers.values()][0];
      dragging = true;
      return;
    }
    if (pointers.size === 0) {
      if (grabbed && dragging) h.onDragEnd?.(p.x, p.y, cancelled);
      else if (!cancelled && !dragging && !multiTouch) h.onTap(p.x, p.y);
      grabbed = false;
      start = undefined;
      pinch = undefined;
      dragging = false;
    }
  };
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      // Trackpad pinch arrives as ctrl+wheel with small deltas; scale those up.
      const speed = e.ctrlKey ? 0.01 : 0.0015;
      h.onZoom(Math.exp(-e.deltaY * speed), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Page-level guards against Safari's own gestures on the game surface. */
export function preventBrowserGestures(): void {
  // iOS Safari pinch-to-zoom the page (non-standard gesture events).
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  // Page bounce / pull-to-refresh: block touch scrolling everywhere except inside panels
  // marked .scroll (the city panel), which scroll on their own.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.target instanceof Element && e.target.closest('.scroll')) return;
      e.preventDefault();
    },
    { passive: false },
  );
  // Double-tap zoom fallback for older Safari that ignores touch-action.
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = e.timeStamp;
      if (now - lastTouchEnd < 300 && e.target instanceof HTMLCanvasElement) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());
}
