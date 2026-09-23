// Pointer input for the map canvas. One code path for mouse, touch, and pen via Pointer
// Events: tap/click, one-finger or mouse drag to pan, two-finger pinch (plus mouse wheel) to
// zoom. Nothing here depends on hover, right-click, or the keyboard.

export interface MapInputHandlers {
  onTap(sx: number, sy: number): void;
  onPan(dx: number, dy: number): void;
  onZoom(factor: number, sx: number, sy: number): void;
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
    } else if (pointers.size === 2) {
      multiTouch = true;
      pinch = pinchInfo();
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
      if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) > threshold) {
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
      if (!cancelled && !dragging && !multiTouch) h.onTap(p.x, p.y);
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
  // Page bounce / pull-to-refresh: nothing on the page scrolls, so block all touch scrolling.
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
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
