// HiDPI canvas sizing, animation loops that sleep when offscreen, and pointer gestures.

import { Disposer } from './dom';

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number; // CSS pixels
  height: number;
  dpr: number;
}

/** Creates a canvas that fills `host`, keeps its backing store at device resolution,
 *  and calls `onResize` whenever the host changes size. */
export function createSurface(host: HTMLElement, d: Disposer, onResize: (s: Surface) => void): Surface {
  const canvas = document.createElement('canvas');
  host.prepend(canvas);
  const ctx = canvas.getContext('2d')!;
  const s: Surface = { canvas, ctx, width: 1, height: 1, dpr: 1 };
  let ready = false;
  const fit = () => {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width));
    const hgt = Math.max(1, Math.round(r.height));
    if (w === s.width && hgt === s.height && dpr === s.dpr) return;
    s.width = w;
    s.height = hgt;
    s.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The first notification is deferred so callers can finish wiring their closures.
    if (ready) onResize(s);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  d.add(() => ro.disconnect());
  fit();
  queueMicrotask(() => {
    ready = true;
    onResize(s);
  });
  return s;
}

/** requestAnimationFrame loop that pauses while the element is offscreen or the tab hidden. */
export function animate(el: Element, d: Disposer, frame: (t: number, dt: number) => void): { wake: () => void } {
  let visible = true;
  let raf = 0;
  let last = performance.now();
  const tick = (t: number) => {
    raf = 0;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    frame(t / 1000, dt);
    schedule();
  };
  const schedule = () => {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) {
      last = performance.now();
      schedule();
    }
  });
  io.observe(el);
  const onVis = () => {
    last = performance.now();
    schedule();
  };
  document.addEventListener('visibilitychange', onVis);
  d.add(() => {
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    if (raf) cancelAnimationFrame(raf);
  });
  schedule();
  return { wake: schedule };
}

/** Redraw-on-demand helper for static charts: coalesces many invalidations into one frame. */
export function invalidator(draw: () => void): () => void {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  };
}

export interface DragHandlers {
  onDrag?: (dx: number, dy: number, e: PointerEvent) => void;
  onZoom?: (factor: number, x: number, y: number) => void;
  onTap?: (x: number, y: number, e: PointerEvent) => void;
  onHover?: (x: number, y: number, e: PointerEvent) => void;
  onLeave?: () => void;
}

/** Unified mouse/touch handling: drag, wheel + pinch zoom, tap and hover. */
export function gestures(el: HTMLElement, d: Disposer, h: DragHandlers): void {
  const pts = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch = 0;
  const local = (e: PointerEvent | WheelEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  d.on(el, 'pointerdown', ((e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }) as EventListener);
  d.on(el, 'pointermove', ((e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && h.onHover) {
        const l = local(e);
        h.onHover(l.x, l.y, e);
      }
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 2 && h.onZoom) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) {
        const r = el.getBoundingClientRect();
        h.onZoom(dist / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
      pinch = dist;
    } else if (pts.size === 1) h.onDrag?.(dx, dy, e);
  }) as EventListener);
  const end = ((e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = 0;
    if (moved < 6 && pts.size === 0 && e.type === 'pointerup' && h.onTap) {
      const l = local(e);
      h.onTap(l.x, l.y, e);
    }
  }) as EventListener;
  d.on(el, 'pointerup', end);
  d.on(el, 'pointercancel', end);
  d.on(el, 'pointerleave', (() => h.onLeave?.()) as EventListener);
  if (h.onZoom) {
    d.on(
      el,
      'wheel',
      ((e: WheelEvent) => {
        e.preventDefault();
        const l = local(e);
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        h.onZoom!(Math.exp(-delta * 0.0015), l.x, l.y);
      }) as EventListener,
      { passive: false },
    );
  }
}

/** Maps a value onto a log axis. */
export const logScale = (d0: number, d1: number, r0: number, r1: number) => {
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  const f = (v: number) => r0 + ((Math.log10(v) - l0) / (l1 - l0)) * (r1 - r0);
  f.invert = (p: number) => 10 ** (l0 + ((p - r0) / (r1 - r0)) * (l1 - l0));
  return f;
};
export const linScale = (d0: number, d1: number, r0: number, r1: number) => {
  const f = (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  f.invert = (p: number) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0);
  return f;
};
