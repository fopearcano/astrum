// Plate I — The Scale of the Cosmos: a continuous zoom across 27 orders of magnitude.

import { Disposer, h, prefersReducedMotion } from '../lib/dom';
import { createSurface, gestures, invalidator } from '../lib/canvas';
import { icons, panel, readout, select, slider } from '../lib/ui';
import { length, sci, seconds, sig, sup } from '../lib/format';
import { palette } from '../lib/theme';
import { SCALE_OBJECTS, ScaleObject } from '../data/scale';
import { makeNoise } from '../three/noise';
import { note, platePage } from './page';
import { PlateContext, plateById } from './registry';

const C = 299792458;
const LY = 9.4607e15;
const AU = 1.495978707e11;
const GAP = 1.3;

export function mount(root: HTMLElement, _ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('scale')!, {
    dek: 'Thirty-eight objects lined up by size, from a person to the observable universe. Each step of the zoom slider multiplies the field of view by ten; the whole plate spans about 27 such steps.',
    caption:
      '<b>Fig. I.</b> Objects drawn to scale with their neighbours. Spheres show diameters, regions their widest extent, and the bracketed spans are distances. The ruler and the light-crossing time update as you zoom. Scroll, pinch or drag the slider; select an object to read about it.',
    stageLabel: 'Zoomable comparison of sizes in the Universe',
  });
  root.append(page.root);
  const stage = page.stage;

  const objs = SCALE_OBJECTS;
  const L = objs.map((o) => Math.log10(o.size));
  // Cumulative placement so neighbours never overlap.
  const X: number[] = [0];
  for (let i = 1; i < objs.length; i++) X[i] = X[i - 1] + (GAP * (objs[i - 1].size + objs[i].size)) / 2;

  let z = Math.log10(4e7); // log10 of the field width in metres
  let target: number | null = null;
  let selected: ScaleObject | null = null;
  const Z_MIN = Math.log10(2.5);
  const Z_MAX = Math.log10(3e27);

  // precomputed point clouds for the procedural drawings
  const clouds = new Map<number, Float32Array>();
  const cloud = (i: number, n: number, gen: (r: () => number, out: number[]) => void): Float32Array => {
    let c = clouds.get(i);
    if (!c) {
      const { rnd } = makeNoise(i * 97 + 13);
      const out: number[] = [];
      for (let k = 0; k < n; k++) gen(rnd, out);
      c = Float32Array.from(out);
      clouds.set(i, c);
    }
    return c;
  };
  const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

  const centreX = (): number => {
    const t = z - 0.45;
    if (t <= L[0]) return X[0];
    for (let i = 0; i < objs.length - 1; i++) {
      if (t < L[i + 1]) {
        const f = (t - L[i]) / (L[i + 1] - L[i]);
        return X[i] + (X[i + 1] - X[i]) * f;
      }
    }
    return X[objs.length - 1];
  };

  const hud = h('div', { class: 'hud hud--tl' });
  stage.append(hud, h('div', { class: 'stage-hint' }, 'Scroll or pinch to zoom · select an object'));
  let surf: ReturnType<typeof createSurface>;
  const redraw = invalidator(() => draw());
  surf = createSurface(stage, d, () => redraw());

  let hit: { i: number; x: number; y: number; r: number }[] = [];

  function draw(): void {
    const { ctx, width: W, height: H } = surf;
    const pal = palette();
    const V = 10 ** z;
    const k = W / V; // px per metre
    const cx = centreX();
    const cy = H * 0.45;
    ctx.fillStyle = pal.space;
    ctx.fillRect(0, 0, W, H);
    hit = [];
    const labels: { x: number; y: number; name: string; size: string; i: number }[] = [];
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const r = (o.size * k) / 2;
      if (r < 0.5 || r > W * 6) continue;
      const x = W / 2 + (X[i] - cx) * k;
      if (x + r < -20 || x - r > W + 20) continue;
      const fadeIn = Math.min(1, (r - 0.5) / 3);
      const fadeOut = o.kind === 'orbit' || o.kind === 'shell' || o.kind === 'distance' || o.kind === 'universe' ? 1 : Math.min(1, Math.max(0, (W * 4 - r) / (W * 2)));
      ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
      drawObject(ctx, o, i, x, cy, r);
      ctx.globalAlpha = 1;
      hit.push({ i, x, y: cy, r: Math.max(r, 6) });
      if (r > 1.2 && r < W * 0.9) labels.push({ x, y: cy + (o.kind === 'distance' ? -18 : Math.max(r, 4) + 20), name: o.name, size: length(o.size), i });
    }
    // labels with overlap culling, larger objects first
    const boxes: number[][] = [];
    ctx.textAlign = 'center';
    for (const lb of labels.sort((a, b) => objs[b.i].size - objs[a.i].size)) {
      ctx.font = `500 13px ${pal.fontBody}`;
      const w1 = ctx.measureText(lb.name).width;
      ctx.font = `11px ${pal.fontMono}`;
      const w2 = ctx.measureText(lb.size).width;
      const bw = Math.max(w1, w2) + 8;
      let y = Math.min(lb.y, H - 46);
      const box = [lb.x - bw / 2, y - 12, lb.x + bw / 2, y + 22];
      if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      boxes.push(box);
      ctx.font = `500 13px ${pal.fontBody}`;
      ctx.fillStyle = objs[lb.i] === selected ? pal.accent : pal.onSpace;
      ctx.fillText(lb.name, lb.x, y);
      ctx.font = `11px ${pal.fontMono}`;
      ctx.fillStyle = pal.onSpace2;
      ctx.fillText(lb.size, lb.x, y + 16);
      y += 0;
    }
    ctx.textAlign = 'left';
    drawRuler(ctx, W, H, V, pal.onSpace, pal.onSpace2, pal.fontMono);
    const e = Math.floor(z);
    hud.innerHTML = `<div class="hud-label">Field of view</div><div class="hud-big">${length(V)}</div><div class="mono">${sci(V, 2)} m · 10${sup(e)}</div><div class="hud-label" style="margin-top:6px">Light crosses it in ${seconds(V / C)}</div>`;
    zoomSlider.set(z);
  }

  function drawRuler(ctx: CanvasRenderingContext2D, W: number, H: number, V: number, fg: string, muted: string, mono: string): void {
    const raw = V * 0.22;
    const p = 10 ** Math.floor(Math.log10(raw));
    const m = raw / p;
    const len = (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
    const px = (len / V) * W;
    const x0 = 20;
    const y0 = H - 22;
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + px, y0);
    for (let t = 0; t <= 10; t++) {
      const tx = x0 + (px * t) / 10;
      ctx.moveTo(tx, y0);
      ctx.lineTo(tx, y0 - (t % 5 === 0 ? 8 : 4));
    }
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = `11px ${mono}`;
    ctx.fillText(length(len), x0 + px + 8, y0 - 1);
  }

  function drawObject(ctx: CanvasRenderingContext2D, o: ScaleObject, i: number, x: number, y: number, r: number): void {
    const [c0, c1 = c0] = o.colors;
    switch (o.kind) {
      case 'person': {
        const hh = r * 2;
        ctx.fillStyle = c0;
        ctx.strokeStyle = c0;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, hh * 0.07);
        ctx.beginPath();
        ctx.arc(x, y - hh * 0.42, hh * 0.075, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y - hh * 0.33);
        ctx.lineTo(x, y + hh * 0.05);
        ctx.moveTo(x, y - hh * 0.25);
        ctx.lineTo(x - hh * 0.16, y - hh * 0.02);
        ctx.moveTo(x, y - hh * 0.25);
        ctx.lineTo(x + hh * 0.16, y - hh * 0.02);
        ctx.moveTo(x, y + hh * 0.05);
        ctx.lineTo(x - hh * 0.1, y + hh * 0.5);
        ctx.moveTo(x, y + hh * 0.05);
        ctx.lineTo(x + hh * 0.1, y + hh * 0.5);
        ctx.stroke();
        return;
      }
      case 'station': {
        ctx.fillStyle = c0;
        ctx.fillRect(x - r, y - r * 0.02, r * 2, r * 0.04);
        ctx.fillRect(x - r * 0.08, y - r * 0.18, r * 0.16, r * 0.36);
        ctx.fillStyle = c1;
        for (const s of [-0.9, -0.62, 0.62, 0.9])
          for (const side of [-1, 1]) ctx.fillRect(x + s * r - r * 0.1, y + side * r * 0.06 + (side < 0 ? -r * 0.32 : 0), r * 0.2, r * 0.32);
        return;
      }
      case 'crater': {
        const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.1, r * 0.1, x, y, r);
        g.addColorStop(0, c1);
        g.addColorStop(0.75, c1);
        g.addColorStop(0.82, c0);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 'comet': {
        for (const [dx, dy, rr] of [[-0.35, 0.1, 0.55], [0.4, -0.12, 0.42]]) {
          const g = ctx.createRadialGradient(x + dx * r - rr * r * 0.3, y + dy * r - rr * r * 0.3, 0, x + dx * r, y + dy * r, rr * r);
          g.addColorStop(0, '#8d8984');
          g.addColorStop(1, c1);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      case 'mountain': {
        ctx.fillStyle = c0;
        ctx.beginPath();
        ctx.moveTo(x - r * 1.6, y + r);
        ctx.lineTo(x - r * 0.2, y - r);
        ctx.lineTo(x + r * 1.6, y + r);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = c1;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.2, y - r);
        ctx.lineTo(x - r * 0.62, y - r * 0.4);
        ctx.lineTo(x - r * 0.3, y - r * 0.5);
        ctx.lineTo(x - r * 0.05, y - r * 0.35);
        ctx.lineTo(x + r * 0.3, y - r * 0.45);
        ctx.closePath();
        ctx.fill();
        return;
      }
      case 'neutron':
      case 'dwarf': {
        const gr = o.kind === 'neutron' ? r * 3 : r * 1.5;
        const g = ctx.createRadialGradient(x, y, r * 0.9, x, y, gr);
        g.addColorStop(0, 'rgba(210,225,255,0.4)');
        g.addColorStop(1, 'rgba(210,225,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - gr, y - gr, gr * 2, gr * 2);
        const g3 = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        g3.addColorStop(0, '#ffffff');
        g3.addColorStop(1, '#c9d8ff');
        ctx.fillStyle = g3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (o.kind === 'neutron') {
          ctx.strokeStyle = 'rgba(160,190,255,0.6)';
          ctx.lineWidth = Math.max(1, r * 0.25);
          ctx.beginPath();
          ctx.moveTo(x - r * 0.9, y - r * 4);
          ctx.lineTo(x + r * 0.9, y + r * 4);
          ctx.stroke();
        }
        return;
      }
      case 'rock':
      case 'planet':
      case 'gas': {
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        g.addColorStop(0, lighten(c0));
        g.addColorStop(0.7, c0);
        g.addColorStop(1, c1);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (o.kind === 'gas' && r > 4) {
          ctx.save();
          ctx.clip();
          ctx.globalAlpha *= 0.35;
          ctx.fillStyle = c1;
          for (let b = -5; b <= 5; b++) ctx.fillRect(x - r, y + (b / 6) * r - r * 0.04, r * 2, r * (0.05 + 0.03 * (b % 2)));
          ctx.restore();
        }
        if (o.name === 'Earth' && r > 4) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = c1;
          for (const [dx, dy, rr] of [[-0.3, -0.2, 0.35], [0.35, 0.15, 0.28], [0.05, 0.5, 0.2]]) {
            ctx.beginPath();
            ctx.ellipse(x + dx * r, y + dy * r, rr * r, rr * r * 0.7, dx, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        shade(ctx, x, y, r);
        return;
      }
      case 'star': {
        const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.6);
        g.addColorStop(0, hexA(c0, 0.45));
        g.addColorStop(1, hexA(c0, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
        g2.addColorStop(0, '#fffaf0');
        g2.addColorStop(0.55, c0);
        g2.addColorStop(1, hexA(c0, 0.85));
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 'blackhole': {
        const g = ctx.createRadialGradient(x, y, r * 1.1, x, y, r * 2.6);
        g.addColorStop(0, hexA(c0, 0.9));
        g.addColorStop(0.15, hexA(c0, 0.35));
        g.addColorStop(1, hexA(c0, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      case 'orbit': {
        ctx.strokeStyle = hexA(c0, 0.7);
        ctx.lineWidth = 1;
        const rings = o.name === 'Orbits of the planets' ? [0.387, 0.723, 1, 1.524, 5.2, 9.58, 19.2, 30.07].map((a) => a / 30.07) : [1];
        for (const f of rings) {
          ctx.beginPath();
          ctx.arc(x, y, r * f, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = o.name === 'The Moon’s orbit' ? '#2f6db5' : '#ffd27a';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, Math.min(4, r * 0.02)), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = c0;
        ctx.beginPath();
        ctx.arc(x + r * Math.cos(-0.7), y + r * Math.sin(-0.7), 2.5, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 'shell': {
        const pts = cloud(i, 900, (rnd, out) => {
          const a = rnd() * Math.PI * 2;
          const rr = 0.82 + 0.18 * Math.sqrt(rnd());
          out.push(Math.cos(a) * rr, Math.sin(a) * rr);
        });
        const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
        g.addColorStop(0, hexA(c0, 0));
        g.addColorStop(1, hexA(c0, 0.18));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexA(c0, 0.7);
        for (let p = 0; p < pts.length; p += 2) ctx.fillRect(x + pts[p] * r, y + pts[p + 1] * r, 1.2, 1.2);
        ctx.fillStyle = '#ffd27a';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 'distance': {
        ctx.strokeStyle = hexA(c0, 0.85);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x - r, y);
        ctx.lineTo(x + r, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x - r, y - 8);
        ctx.lineTo(x - r, y + 8);
        ctx.moveTo(x + r, y - 8);
        ctx.lineTo(x + r, y + 8);
        ctx.stroke();
        for (const [px, col] of [[x - r, '#ffd27a'], [x + r, c0]] as [number, string][]) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(px, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      case 'nebula': {
        const pts = cloud(i, 26, (rnd, out) => out.push(gauss(rnd) * 0.35, gauss(rnd) * 0.3, 0.25 + rnd() * 0.45, rnd()));
        for (let p = 0; p < pts.length; p += 4) {
          const px = x + pts[p] * r, py = y + pts[p + 1] * r, rr = pts[p + 2] * r;
          const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
          g.addColorStop(0, hexA(pts[p + 3] > 0.35 ? c0 : c1, 0.28));
          g.addColorStop(1, hexA(c0, 0));
          ctx.fillStyle = g;
          ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
        }
        ctx.fillStyle = '#e8f0ff';
        for (const [dx, dy] of [[0.02, 0], [-0.03, 0.02], [0.01, 0.03], [0.04, -0.01]]) ctx.fillRect(x + dx * r, y + dy * r, 1.5, 1.5);
        return;
      }
      case 'cluster': {
        const pts = cloud(i, 1400, (rnd, out) => {
          const rr = Math.min(1, 0.12 * Math.abs(gauss(rnd)) / Math.sqrt(rnd() + 0.02));
          const a = rnd() * Math.PI * 2;
          out.push(Math.cos(a) * rr, Math.sin(a) * rr);
        });
        ctx.fillStyle = hexA(c0, 0.85);
        const s = Math.max(0.8, Math.min(2, r / 150));
        for (let p = 0; p < pts.length; p += 2) ctx.fillRect(x + pts[p] * r, y + pts[p + 1] * r, s, s);
        return;
      }
      case 'galaxy':
      case 'irregular': {
        const spiral = o.kind === 'galaxy';
        const pts = cloud(i, 6000, (rnd, out) => {
          if (!spiral) {
            out.push(gauss(rnd) * 0.35 + (rnd() < 0.3 ? 0.2 : 0), gauss(rnd) * 0.22, rnd());
            return;
          }
          const arm = rnd() < 0.5 ? 0 : Math.PI;
          const t = rnd() ** 0.7;
          const rr = 0.08 + t * 0.92;
          const th = arm + Math.log(rr / 0.08) / Math.tan((14 * Math.PI) / 180) + gauss(rnd) * 0.28;
          const flat = o.name.startsWith('Andromeda') ? 0.35 : 0.85;
          const kind = rnd();
          if (kind < 0.2) {
            out.push(gauss(rnd) * 0.09, gauss(rnd) * 0.07, 0);
            return;
          }
          if (kind < 0.45) {
            // smooth exponential disk between the arms
            const rd = Math.min(1, -Math.log(rnd() + 1e-6) * 0.28);
            const a = rnd() * Math.PI * 2;
            out.push(Math.cos(a) * rd, Math.sin(a) * rd * flat, 0.3);
            return;
          }
          out.push(Math.cos(th) * rr + gauss(rnd) * 0.02, Math.sin(th) * rr * flat, 1);
        });
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.3);
        g.addColorStop(0, hexA(c0, 0.6));
        g.addColorStop(1, hexA(c0, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6);
        const s = Math.max(0.6, Math.min(1.4, r / 300));
        for (let p = 0; p < pts.length; p += 3) {
          ctx.fillStyle = pts[p + 2] > 0.5 ? hexA(c1, 0.75) : pts[p + 2] > 0.2 ? hexA(c0, 0.35) : hexA(c0, 0.8);
          ctx.fillRect(x + pts[p] * r, y + pts[p + 1] * r, s, s);
        }
        return;
      }
      case 'group': {
        const members: [number, number, number, number][] = [[-0.35, 0.05, 0.045, 0], [0.38, -0.08, 0.06, 0], [0.42, 0.06, 0.02, 1], [-0.3, 0.12, 0.012, 1], [-0.28, 0.14, 0.008, 1]];
        const extra = cloud(i, 70, (rnd, out) => out.push(gauss(rnd) * 0.35, gauss(rnd) * 0.25));
        ctx.fillStyle = hexA(c0, 0.6);
        for (let p = 0; p < extra.length; p += 2) ctx.fillRect(x + extra[p] * r, y + extra[p + 1] * r, 1.5, 1.5);
        for (const [dx, dy, rr] of members) {
          const g = ctx.createRadialGradient(x + dx * r, y + dy * r, 0, x + dx * r, y + dy * r, rr * r * 2);
          g.addColorStop(0, 'rgba(255,240,220,0.9)');
          g.addColorStop(1, 'rgba(160,180,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(x + dx * r, y + dy * r, rr * r * 2, rr * r * 1.1, dx, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(207,217,255,0.25)';
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      case 'web':
      case 'universe': {
        const nodes = cloud(i, 60, (rnd, out) => {
          const a = rnd() * Math.PI * 2;
          const rr = Math.sqrt(rnd()) * 0.85;
          out.push(Math.cos(a) * rr, Math.sin(a) * rr);
        });
        if (o.kind === 'universe') {
          const ring = cloud(i + 1000, 2400, (rnd, out) => {
            const a = rnd() * Math.PI * 2;
            out.push(Math.cos(a) * (0.94 + rnd() * 0.06), Math.sin(a) * (0.94 + rnd() * 0.06), rnd());
          });
          for (let p = 0; p < ring.length; p += 3) {
            ctx.fillStyle = ring[p + 2] > 0.5 ? 'rgba(217,138,90,0.7)' : 'rgba(90,127,217,0.7)';
            ctx.fillRect(x + ring[p] * r, y + ring[p + 1] * r, 2, 2);
          }
        }
        ctx.strokeStyle = hexA(c0, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let a = 0; a < nodes.length; a += 2) {
          // connect each node to its two nearest neighbours: a crude cosmic web
          const near = [] as [number, number][];
          for (let b = 0; b < nodes.length; b += 2) if (a !== b) near.push([Math.hypot(nodes[a] - nodes[b], nodes[a + 1] - nodes[b + 1]), b]);
          near.sort((p, q) => p[0] - q[0]);
          for (const [, b] of near.slice(0, 2)) {
            ctx.moveTo(x + nodes[a] * r, y + nodes[a + 1] * r);
            ctx.lineTo(x + nodes[b] * r, y + nodes[b + 1] * r);
          }
        }
        ctx.stroke();
        ctx.fillStyle = hexA(c0, 0.9);
        for (let a = 0; a < nodes.length; a += 2) ctx.fillRect(x + nodes[a] * r - 1.5, y + nodes[a + 1] * r - 1.5, 3, 3);
        if (o.kind === 'universe') {
          ctx.fillStyle = '#e8e6df';
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
    }
  }

  // ---------------------------------------------------------------- controls
  const zoomSlider = slider({
    id: 'scale-zoom',
    label: 'Field of view',
    min: Z_MIN,
    max: Z_MAX,
    step: 0.01,
    value: z,
    format: (v) => `10${sup(Math.floor(v))} m`,
    onInput: (v) => {
      z = v;
      target = null;
      redraw();
    },
  });
  let touring = false;
  const tourBtn = h('button', { type: 'button', class: 'btn btn--primary', id: 'scale-tour', html: `${icons.play}<span>Zoom from a person to the Universe</span>` });
  tourBtn.addEventListener('click', () => {
    touring = !touring;
    tourBtn.innerHTML = touring ? `${icons.pause}<span>Stop</span>` : `${icons.play}<span>Zoom from a person to the Universe</span>`;
    if (touring) {
      if (z > Z_MAX - 0.5) z = Z_MIN;
      target = null;
      tick();
    }
  });
  const jump = select(
    'scale-jump',
    'Jump to',
    objs.map((o, i) => ({ value: String(i), label: `${o.name} · ${length(o.size)}` })),
    '12',
    (v) => {
      selected = objs[Number(v)];
      flyTo(Math.log10(selected.size * 2.6));
      showInfo();
    },
  );
  const info = h('section', { class: 'panel', 'aria-live': 'polite' });
  page.key.append(panel('Zoom', h('div', { class: 'controls' }, zoomSlider.el, tourBtn, jump.el)), info);

  function showInfo(): void {
    const o = selected ?? objs[12];
    const rows: [string, string][] = [
      ['Size', length(o.size)],
      ['In metres', `${sci(o.size, 3)} m`],
      ['Light-travel time across', seconds(o.size / C)],
    ];
    if (o.size > 1e9) rows.push(['In astronomical units', `${sig(o.size / AU, 3)} AU`]);
    if (o.size > 1e14) rows.push(['In light-years', `${sig(o.size / LY, 3)} ly`]);
    rows.push(['Compared with Earth', `${sig(o.size / 12742000, 3)} ×`]);
    info.replaceChildren(h('p', { class: 'eyebrow' }, selected ? 'Selected' : 'For example'), h('p', { class: 'info-title', style: { marginTop: '6px' } }, o.name), h('div', { class: 'info-body' }, h('p', null, o.note), readout(rows).el));
  }

  // ---------------------------------------------------------------- motion
  let raf = 0;
  let last = 0;
  function tick(): void {
    if (raf) return;
    last = performance.now();
    const step = (t: number) => {
      raf = 0;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      let busy = false;
      if (touring) {
        z += dt * 0.9;
        if (z >= Z_MAX - 0.3) {
          z = Z_MAX - 0.3;
          touring = false;
          tourBtn.innerHTML = `${icons.play}<span>Zoom from a person to the Universe</span>`;
        } else busy = true;
      } else if (target !== null) {
        const dz = target - z;
        z += dz * Math.min(1, dt * 4);
        if (Math.abs(dz) < 0.002) target = null;
        else busy = true;
      }
      draw();
      if (busy) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  d.add(() => cancelAnimationFrame(raf));
  const flyTo = (zz: number) => {
    target = Math.max(Z_MIN, Math.min(Z_MAX, zz));
    touring = false;
    tick();
  };

  gestures(stage, d, {
    onZoom: (f) => {
      z = Math.max(Z_MIN, Math.min(Z_MAX, z - Math.log10(f) * 1.6));
      target = null;
      redraw();
    },
    onDrag: (_dx, dy) => {
      z = Math.max(Z_MIN, Math.min(Z_MAX, z + dy * 0.01));
      redraw();
    },
    onTap: (x, y) => {
      let best: number | null = null;
      let bd = Infinity;
      for (const ht of hit) {
        const dd = Math.hypot(ht.x - x, ht.y - y);
        if (dd < ht.r + 6 && ht.r < bd) {
          bd = ht.r;
          best = ht.i;
        }
      }
      if (best !== null) {
        selected = objs[best];
        jump.input.value = String(best);
        showInfo();
        flyTo(Math.log10(selected.size * 2.6));
      }
    },
  });
  showInfo();
  if (prefersReducedMotion()) redraw();

  // ---------------------------------------------------------------- commentary
  page.notes.append(
    note(
      'Units for the very large',
      `<p>The <strong>astronomical unit</strong>, 149,597,870,700 m, is the mean Earth–Sun distance and suits the Solar System. A <strong>light-year</strong> is the distance light covers in a year, 9.46 × 10¹⁵ m. Professional astronomers prefer the <strong>parsec</strong>, the distance at which one astronomical unit spans one arcsecond: 3.26 light-years.</p>
       <div class="eq">1 pc = 206,265 AU = 3.0857 × 10¹⁶ m</div>`,
    ),
    note(
      'The cosmic distance ladder',
      `<p>No single method reaches across the Universe, so each rung calibrates the next.</p>
       <ol><li><strong>Radar</strong> ranging measures the astronomical unit.</li><li><strong>Parallax</strong>, the yearly shift of nearby stars, reaches thousands of parsecs with the Gaia satellite.</li><li><strong>Cepheid variables</strong>, whose pulsation period sets their luminosity, reach about 40 Mpc.</li><li><strong>Type Ia supernovae</strong>, exploding white dwarfs of nearly fixed peak brightness, reach billions of light-years.</li><li><strong>Hubble’s law</strong> turns redshift into distance across the rest of the cosmos.</li></ol>`,
    ),
    note(
      'Looking back in time',
      `<p>Light’s finite speed makes every view a view of the past. The Moon is 1.3 light-seconds away, the Sun 8.3 light-minutes, Andromeda 2.5 million light-years.</p>
       <p>The edge of the observable universe is set by how far light has travelled since the Big Bang. Because space kept expanding while that light was in flight, the regions it came from now lie 46.5 billion light-years away in every direction.</p>`,
    ),
  );
  return () => d.dispose();
}

function shade(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.3, x, y, r * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * 0.35));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
