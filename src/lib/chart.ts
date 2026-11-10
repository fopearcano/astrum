// Canvas chart primitives: axes with clean ticks, gridlines, tooltips.
// All chart text uses theme text tokens; only marks carry data colour.

import { Palette } from './theme';
import { sup } from './format';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Scale = ((v: number) => number) & { invert: (p: number) => number };

export function niceLinearTicks(min: number, max: number, count = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

export function logTicks(min: number, max: number): number[] {
  const t: number[] = [];
  for (let e = Math.ceil(Math.log10(min) - 1e-9); e <= Math.floor(Math.log10(max) + 1e-9); e++) t.push(10 ** e);
  return t;
}

export function logLabel(v: number): string {
  const e = Math.round(Math.log10(v));
  if (e >= -2 && e <= 4) return String(Number(v.toPrecision(3)));
  return `10${sup(e)}`;
}

export interface AxisOpts {
  ticks: number[];
  scale: (v: number) => number;
  label?: (v: number) => string;
  title?: string;
  grid?: boolean;
}

/** Draws a hairline grid plus bottom and left axes with tick labels. */
export function drawAxes(
  ctx: CanvasRenderingContext2D,
  box: Box,
  pal: Palette,
  x: AxisOpts,
  y: AxisOpts,
  opts: { top?: AxisOpts; right?: AxisOpts } = {},
): void {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = `11px ${pal.fontMono}`;
  ctx.fillStyle = pal.muted;
  // grid
  ctx.strokeStyle = pal.grid;
  ctx.beginPath();
  if (x.grid !== false)
    for (const t of x.ticks) {
      const px = Math.round(x.scale(t)) + 0.5;
      if (px < box.x - 0.5 || px > box.x + box.w + 0.5) continue;
      ctx.moveTo(px, box.y);
      ctx.lineTo(px, box.y + box.h);
    }
  if (y.grid !== false)
    for (const t of y.ticks) {
      const py = Math.round(y.scale(t)) + 0.5;
      if (py < box.y - 0.5 || py > box.y + box.h + 0.5) continue;
      ctx.moveTo(box.x, py);
      ctx.lineTo(box.x + box.w, py);
    }
  ctx.stroke();
  // frame
  ctx.strokeStyle = pal.axis;
  ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
  // x labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of x.ticks) {
    const px = x.scale(t);
    if (px < box.x - 1 || px > box.x + box.w + 1) continue;
    ctx.fillText((x.label ?? String)(t), px, box.y + box.h + 6);
  }
  // y labels
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of y.ticks) {
    const py = y.scale(t);
    if (py < box.y - 1 || py > box.y + box.h + 1) continue;
    ctx.fillText((y.label ?? String)(t), box.x - 6, py);
  }
  if (opts.top) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const t of opts.top.ticks) {
      const px = opts.top.scale(t);
      if (px < box.x - 1 || px > box.x + box.w + 1) continue;
      ctx.fillText((opts.top.label ?? String)(t), px, box.y - 6);
    }
  }
  if (opts.right) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const t of opts.right.ticks) {
      const py = opts.right.scale(t);
      if (py < box.y - 1 || py > box.y + box.h + 1) continue;
      ctx.fillText((opts.right.label ?? String)(t), box.x + box.w + 6, py);
    }
  }
  // titles
  ctx.font = `12px ${pal.fontBody}`;
  ctx.fillStyle = pal.fg2;
  if (x.title) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(x.title, box.x + box.w / 2, box.y + box.h + 40);
  }
  if (y.title) {
    ctx.save();
    ctx.translate(box.x - 46, box.y + box.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(y.title, 0, 0);
    ctx.restore();
  }
  if (opts.top?.title) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opts.top.title, box.x + box.w / 2, box.y - 24);
  }
  if (opts.right?.title) {
    ctx.save();
    ctx.translate(box.x + box.w + 50, box.y + box.h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opts.right.title, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** Floating tooltip positioned inside a stage, flipped to stay within bounds. */
export class Tooltip {
  el: HTMLDivElement;
  constructor(private host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    this.el.hidden = true;
    host.appendChild(this.el);
  }
  show(x: number, y: number, html: string): void {
    this.el.innerHTML = html;
    this.el.hidden = false;
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    const W = this.host.clientWidth;
    const H = this.host.clientHeight;
    const left = x + 12 + w > W - 8 ? x - w - 24 : x;
    const top = y + 12 + hgt > H - 8 ? y - hgt - 24 : y;
    this.el.style.left = `${Math.max(0, left)}px`;
    this.el.style.top = `${Math.max(0, top)}px`;
  }
  hide(): void {
    this.el.hidden = true;
  }
}

/** Marker with a 2px surface ring so it stays legible over other marks. */
export function ringDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, ring: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  pal: Palette,
  opts: { align?: CanvasTextAlign; baseline?: CanvasTextBaseline; color?: string; font?: string; halo?: string } = {},
): void {
  ctx.save();
  ctx.font = opts.font ?? `12px ${pal.fontBody}`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.baseline ?? 'middle';
  if (opts.halo) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = opts.halo;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = opts.color ?? pal.fg2;
  ctx.fillText(text, x, y);
  ctx.restore();
}
