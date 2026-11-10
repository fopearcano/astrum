// Plate VIII — Exoplanets: the catalogue, the transit method and the habitable zone.

import { Disposer, h, prefersReducedMotion } from '../lib/dom';
import { animate, createSurface, invalidator, linScale, logScale } from '../lib/canvas';
import { Tooltip, drawAxes, label, logLabel, niceLinearTicks, ringDot } from '../lib/chart';
import { loadExoplanets, ExoplanetCatalog } from '../lib/data';
import { onThemeChange, palette, Palette } from '../lib/theme';
import { button, panel, readout, select, slider } from '../lib/ui';
import { esc } from '../lib/dom';
import { fixed, sig } from '../lib/format';
import { blackbodyCss } from '../physics/blackbody';
import { figure, note, platePage } from './page';
import { PlateContext, plateById } from './registry';

const RJ_RE = 11.209;
const MJ_ME = 317.83;
const GROUPS = ['Transit', 'Radial velocity', 'Microlensing', 'Other methods'];

const SOLAR = [
  { name: 'Mercury', mass: 0.0553, radius: 0.383, period: 87.97, a: 0.387, S: 6.67 },
  { name: 'Venus', mass: 0.815, radius: 0.949, period: 224.7, a: 0.723, S: 1.91 },
  { name: 'Earth', mass: 1, radius: 1, period: 365.25, a: 1, S: 1 },
  { name: 'Mars', mass: 0.107, radius: 0.532, period: 687, a: 1.524, S: 0.43 },
  { name: 'Jupiter', mass: 317.8, radius: 11.21, period: 4331, a: 5.2, S: 0.037 },
  { name: 'Saturn', mass: 95.2, radius: 9.45, period: 10747, a: 9.58, S: 0.011 },
  { name: 'Uranus', mass: 14.5, radius: 4.01, period: 30589, a: 19.2, S: 0.0027 },
  { name: 'Neptune', mass: 17.1, radius: 3.88, period: 59800, a: 30.07, S: 0.0011 },
];

type AxisKey = 'period' | 'a' | 'mass' | 'radius' | 'year' | 'steff' | 'dist';
const AXES: Record<AxisKey, { label: string; log: boolean; range: [number, number]; unit: string }> = {
  period: { label: 'Orbital period (days)', log: true, range: [0.1, 1e6], unit: 'd' },
  a: { label: 'Semi-major axis (AU)', log: true, range: [0.003, 3000], unit: 'AU' },
  mass: { label: 'Planet mass (Earth masses)', log: true, range: [0.05, 2e4], unit: 'M⊕' },
  radius: { label: 'Planet radius (Earth radii)', log: true, range: [0.25, 30], unit: 'R⊕' },
  year: { label: 'Year of discovery', log: false, range: [1988, 2025], unit: '' },
  steff: { label: 'Host star temperature (K)', log: false, range: [2200, 10000], unit: 'K' },
  dist: { label: 'Distance (parsecs)', log: true, range: [1, 30000], unit: 'pc' },
};

// Kopparapu et al. (2013, 2014) habitable-zone boundaries: S_eff = S☉ + aT + bT² + cT³ + dT⁴, T = Teff − 5780 K
const HZ = {
  recentVenus: [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15],
  runaway: [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15],
  maxGreenhouse: [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16],
  earlyMars: [0.32, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16],
};
const seff = (c: number[], Teff: number) => {
  const t = Teff - 5780;
  return c[0] + c[1] * t + c[2] * t * t + c[3] * t ** 3 + c[4] * t ** 4;
};

export function mount(root: HTMLElement, ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('exoplanets')!, {
    dek: 'Thirty years ago no planet was known around a Sun-like star. The catalogue below holds 5,288. Most were found by the shadows they cast or the wobble they impart; plot them against each other and families appear that the Solar System never hinted at.',
    caption:
      '<b>Fig. VIII.1.</b> Confirmed planets from the Open Exoplanet Catalogue (entries through 2023), coloured by discovery method. Brass rings mark the Solar System’s planets. Each method sees a different slice: transits favour close-in planets, radial velocities favour massive ones, microlensing finds cold planets far from their stars. Hover for a planet; select one for its data.',
    chart: true,
    stageLabel: 'Scatter plot of known exoplanets',
  });
  root.append(page.root);
  const stage = page.stage;
  stage.append(h('div', { class: 'loading' }, 'Loading 5,288 planets…'));

  let cat: ExoplanetCatalog | null = null;
  let group: number[] = [];
  let xKey: AxisKey = 'period';
  let yKey: AxisKey = 'mass';
  const shown = [true, true, true, true];
  let sel: number | null = null;
  let hoverIdx: number | null = null;
  const tip = new Tooltip(stage);
  let surf: ReturnType<typeof createSurface> | null = null;
  const redraw = invalidator(drawScatter);
  let pts: { i: number; x: number; y: number }[] = [];

  const val = (k: AxisKey, i: number): number | null => {
    if (!cat) return null;
    switch (k) {
      case 'mass': return cat.mass[i] != null ? cat.mass[i]! * MJ_ME : null;
      case 'radius': return cat.radius[i] != null ? cat.radius[i]! * RJ_RE : null;
      case 'a': return cat.a[i] ?? (cat.period[i] && cat.smass[i] ? ((cat.smass[i]! * (cat.period[i]! / 365.25) ** 2) ** (1 / 3)) : null);
      default: return (cat[k] as (number | null)[])[i] ?? null;
    }
  };
  const solarVal = (k: AxisKey, p: (typeof SOLAR)[number]): number | null => (k === 'year' ? null : k === 'steff' ? 5772 : k === 'dist' ? null : (p as unknown as Record<string, number>)[k] ?? null);

  loadExoplanets()
    .then((c) => {
      cat = c;
      group = c.method.map((m) => {
        const name = c.methods[m];
        return name === 'Transit' ? 0 : name === 'Radial velocity' ? 1 : name === 'Microlensing' ? 2 : 3;
      });
      stage.replaceChildren();
      surf = createSurface(stage, d, () => redraw());
      stage.append(tip.el);
      if (ctx.params.focus) {
        const i = c.name.indexOf(ctx.params.focus);
        if (i >= 0) sel = i;
      }
      buildLegend();
      showInfo();
      redraw();
      yearRedraw();
      hzRedraw();
    })
    .catch((e) => stage.replaceChildren(h('div', { class: 'loading' }, `Could not load the catalogue: ${e.message}`)));

  const colorOf = (g: number, pal: Palette) => (g < 3 ? pal.series[g] : pal.seriesOther);

  function drawScatter(): void {
    if (!surf || !cat) return;
    const { ctx, width: W, height: H } = surf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const box = { x: 66, y: 24, w: W - 66 - 24, h: H - 24 - 62 };
    const ax = AXES[xKey], ay = AXES[yKey];
    const x = ax.log ? logScale(ax.range[0], ax.range[1], box.x, box.x + box.w) : linScale(ax.range[0], ax.range[1], box.x, box.x + box.w);
    const y = ay.log ? logScale(ay.range[0], ay.range[1], box.y + box.h, box.y) : linScale(ay.range[0], ay.range[1], box.y + box.h, box.y);
    const ticks = (a: typeof ax) => (a.log ? Array.from({ length: Math.round(Math.log10(a.range[1] / a.range[0])) + 2 }, (_, k) => 10 ** (Math.ceil(Math.log10(a.range[0])) + k)).filter((v) => v >= a.range[0] && v <= a.range[1]) : niceLinearTicks(a.range[0], a.range[1], 7));
    drawAxes(
      ctx,
      box,
      pal,
      { ticks: ticks(ax), scale: x, label: ax.log ? logLabel : (v) => (xKey === 'year' ? String(v) : fixed(v, 0)), title: ax.label },
      { ticks: ticks(ay), scale: y, label: ay.log ? logLabel : (v) => fixed(v, 0), title: ay.label },
    );
    pts = [];
    let n = 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    // draw in fixed group order so colours stay attached to their methods
    for (const g of [0, 1, 3, 2]) {
      if (!shown[g]) continue;
      ctx.fillStyle = colorOf(g, pal);
      for (let i = 0; i < cat.count; i++) {
        if (group[i] !== g) continue;
        const vx = val(xKey, i), vy = val(yKey, i);
        if (vx == null || vy == null || (ax.log && vx <= 0) || (ay.log && vy <= 0)) continue;
        const px = x(vx), py = y(vy);
        if (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) continue;
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.arc(px, py, 2.6, 0, Math.PI * 2);
        ctx.fill();
        pts.push({ i, x: px, y: py });
        n++;
      }
    }
    ctx.globalAlpha = 1;
    // Solar System references
    for (const p of SOLAR) {
      const vx = solarVal(xKey, p), vy = solarVal(yKey, p);
      if (vx == null || vy == null) continue;
      const px = x(vx), py = y(vy);
      ctx.strokeStyle = pal.surface2;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      label(ctx, p.name, px + 9, py - 1, pal, { color: pal.fg, font: `600 11px ${pal.fontBody}`, halo: pal.surface2 });
    }
    for (const k of [sel, hoverIdx]) {
      if (k == null) continue;
      const vx = val(xKey, k), vy = val(yKey, k);
      if (vx == null || vy == null) continue;
      ringDot(ctx, x(vx), y(vy), 5, colorOf(group[k], pal), pal.surface2);
      if (k === sel) {
        ctx.strokeStyle = pal.fg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x(vx), y(vy), 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    countEl.textContent = `${n.toLocaleString('en-US')} planets have both values`;
  }

  stage.addEventListener('pointermove', (e) => {
    if (!cat) return;
    const r = stage.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best: number | null = null;
    let bd = 9;
    for (const p of pts) {
      const dd = Math.hypot(p.x - px, p.y - py);
      if (dd < bd) {
        bd = dd;
        best = p.i;
      }
    }
    if (best !== hoverIdx) {
      hoverIdx = best;
      redraw();
    }
    if (best == null) tip.hide();
    else tip.show(px, py, planetTip(best));
  });
  stage.addEventListener('pointerleave', () => {
    hoverIdx = null;
    tip.hide();
    redraw();
  });
  stage.addEventListener('click', () => {
    if (hoverIdx != null) {
      sel = hoverIdx;
      showInfo();
      redraw();
    }
  });

  function planetTip(i: number): string {
    const c = cat!;
    const parts = [
      val('mass', i) != null ? `${sig(val('mass', i)!, 3)} M⊕` : null,
      val('radius', i) != null ? `${sig(val('radius', i)!, 3)} R⊕` : null,
      c.period[i] != null ? `${sig(c.period[i]!, 3)} d` : null,
    ].filter(Boolean);
    return `<b>${esc(c.name[i])}</b><div>${esc(c.methods[c.method[i]])} · ${c.year[i]}</div><div class="mono">${parts.join(' · ')}</div>`;
  }

  // ---------------------------------------------------------------- key
  const countEl = h('p', { class: 'info-sub' });
  const legend = h('div', { class: 'chips' });
  const info = h('section', { class: 'panel', 'aria-live': 'polite' });
  const axisOpts = (keys: AxisKey[]) => keys.map((k) => ({ value: k, label: AXES[k].label }));
  const xSel = select('exo-x', 'Horizontal axis', axisOpts(['period', 'a', 'year', 'steff', 'dist']), xKey, (v) => { xKey = v; redraw(); });
  const ySel = select('exo-y', 'Vertical axis', axisOpts(['mass', 'radius', 'a', 'dist']), yKey, (v) => { yKey = v; redraw(); });
  page.key.append(
    panel(
      'Plot',
      h(
        'div',
        { class: 'controls' },
        xSel.el,
        ySel.el,
        h('div', { class: 'btn-row' },
          button('Mass vs period', () => { xKey = 'period'; yKey = 'mass'; xSel.input.value = xKey; ySel.input.value = yKey; redraw(); }),
          button('Radius vs period', () => { xKey = 'period'; yKey = 'radius'; xSel.input.value = xKey; ySel.input.value = yKey; redraw(); }),
          button('Distance vs year', () => { xKey = 'year'; yKey = 'dist'; xSel.input.value = xKey; ySel.input.value = yKey; redraw(); }),
        ),
        h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Discovery method'), legend),
        countEl,
      ),
    ),
    info,
  );
  function buildLegend(): void {
    if (!cat) return;
    const counts = [0, 0, 0, 0];
    group.forEach((g) => counts[g]++);
    legend.replaceChildren(
      ...GROUPS.map((g, k) => {
        const id = `exo-g${k}`;
        const input = h('input', { type: 'checkbox', id, checked: shown[k] });
        input.addEventListener('change', () => { shown[k] = input.checked; redraw(); });
        return h('label', { class: 'chip', for: id }, input, h('i', { class: 'swatch', style: { background: k < 3 ? `var(--series-${k + 1})` : 'var(--series-other)' } }), `${g} · ${counts[k].toLocaleString('en-US')}`);
      }),
    );
  }
  function showInfo(): void {
    info.replaceChildren();
    if (!cat || sel == null) {
      info.append(h('h2', null, 'Select a planet'), h('p', { class: 'info-sub' }, 'Choose a point, or search for a planet by name with the / key, for example TRAPPIST-1 e or 51 Peg b.'));
      return;
    }
    const c = cat;
    const i = sel;
    const rows: [string, string][] = [
      ['Discovered', `${c.year[i]} · ${c.methods[c.method[i]]}`],
      ['Mass', val('mass', i) != null ? `${sig(val('mass', i)!, 3)} M⊕ (${sig(c.mass[i]!, 3)} M_J)` : '—'],
      ['Radius', val('radius', i) != null ? `${sig(val('radius', i)!, 3)} R⊕ (${sig(c.radius[i]!, 3)} R_J)` : '—'],
      ['Orbital period', c.period[i] != null ? `${sig(c.period[i]!, 4)} days` : '—'],
      ['Semi-major axis', val('a', i) != null ? `${sig(val('a', i)!, 3)} AU` : '—'],
      ['Eccentricity', c.e[i] != null ? fixed(c.e[i]!, 3) : '—'],
      ['Equilibrium temperature', c.teq[i] != null ? `${fixed(c.teq[i]!, 0)} K` : '—'],
      ['Host star', [c.steff[i] != null ? `${fixed(c.steff[i]!, 0)} K` : null, c.smass[i] != null ? `${sig(c.smass[i]!, 3)} M☉` : null, c.sradius[i] != null ? `${sig(c.sradius[i]!, 3)} R☉` : null].filter(Boolean).join(' · ') || '—'],
      ['Distance', c.dist[i] != null ? `${sig(c.dist[i]!, 3)} pc (${sig(c.dist[i]! * 3.2616, 3)} ly)` : '—'],
    ];
    const ins = insolation(i);
    if (ins != null) rows.push(['Starlight received', `${sig(ins, 3)} × Earth’s`]);
    const vm = val('mass', i), vr = val('radius', i);
    if (vm != null && vr != null) rows.push(['Bulk density', `${fixed((vm / vr ** 3) * 5.51, 2)} g/cm³`]);
    info.append(
      h('div', { class: 'swatch-lg', style: { background: c.steff[i] != null ? `radial-gradient(circle at 20% 50%, ${blackbodyCss(c.steff[i]!)} 0 16px, transparent 17px), var(--space)` : 'var(--space)' } }),
      h('p', { class: 'info-title', style: { marginTop: '12px' } }, c.name[i]),
      h('div', { class: 'info-body' }, readout(rows).el),
    );
  }
  function insolation(i: number): number | null {
    const c = cat!;
    const T = c.steff[i], R = c.sradius[i], a = val('a', i);
    if (T == null || R == null || a == null) return null;
    return (R * R * (T / 5772) ** 4) / (a * a);
  }

  // ---------------------------------------------------------------- Fig VIII.2 discoveries per year
  const yStage = h('div', { class: 'stage stage--chart', style: { height: '340px' }, role: 'img', 'aria-label': 'Exoplanet discoveries per year by method' });
  const ySurf = createSurface(yStage, d, () => yearRedraw());
  const yearRedraw = invalidator(drawYears);
  const yTip = new Tooltip(yStage);
  let bars: { year: number; x: number; w: number; counts: number[] }[] = [];
  function drawYears(): void {
    if (!cat) return;
    const { ctx, width: W, height: H } = ySurf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const years: Record<number, number[]> = {};
    for (let i = 0; i < cat.count; i++) (years[cat.year[i]] ??= [0, 0, 0, 0])[group[i]]++;
    const y0 = 1989, y1 = Math.max(...cat.year);
    const max = Math.max(...Object.values(years).map((c) => c.reduce((a, b) => a + b, 0)));
    const box = { x: 54, y: 20, w: W - 54 - 20, h: H - 20 - 48 };
    const step = box.w / (y1 - y0 + 1);
    const yS = linScale(0, max * 1.08, box.y + box.h, box.y);
    drawAxes(ctx, box, pal, { ticks: [], scale: (v) => v, grid: false }, { ticks: niceLinearTicks(0, max, 5), scale: yS, label: (v) => v.toLocaleString('en-US') });
    ctx.fillStyle = pal.muted;
    ctx.font = `11px ${pal.fontMono}`;
    ctx.textAlign = 'center';
    bars = [];
    for (let yr = y0; yr <= y1; yr++) {
      const cx = box.x + (yr - y0 + 0.5) * step;
      if ((yr - y0) % 5 === 0 || yr === y1) {
        ctx.fillStyle = pal.muted;
        ctx.fillText(String(yr), cx, box.y + box.h + 16);
      }
      const c = years[yr];
      if (!c) continue;
      const bw = Math.min(24, step - 2);
      let acc = 0;
      const order = [0, 1, 2, 3];
      const tot = c.reduce((a, b) => a + b, 0);
      order.forEach((g, k) => {
        if (!c[g]) return;
        const top = yS(acc + c[g]);
        const bot = yS(acc);
        ctx.fillStyle = colorOf(g, pal);
        const hgt = bot - top - (k < order.length - 1 ? 0 : 0);
        const isTop = acc + c[g] === tot;
        roundTop(ctx, cx - bw / 2, top, bw, Math.max(1, hgt - 2), isTop ? Math.min(4, bw / 2) : 0);
        acc += c[g];
      });
      bars.push({ year: yr, x: cx, w: step, counts: c });
    }
    ctx.textAlign = 'left';
    const peak = Object.entries(years).sort((a, b) => b[1].reduce((x, y) => x + y) - a[1].reduce((x, y) => x + y))[0];
    label(ctx, `${peak[0]}: ${peak[1].reduce((a, b) => a + b).toLocaleString('en-US')} planets, mostly Kepler transits`, box.x + 10, box.y + 10, pal, { color: pal.fg2, font: `12px ${pal.fontBody}` });
  }
  yStage.addEventListener('pointermove', (e) => {
    const r = yStage.getBoundingClientRect();
    const px = e.clientX - r.left;
    const b = bars.find((q) => Math.abs(q.x - px) < q.w / 2);
    if (!b) return yTip.hide();
    yTip.show(px, e.clientY - r.top, `<b>${b.year}</b>${b.counts.map((c, k) => (c ? `<div>${GROUPS[k]} <span class="mono">${c}</span></div>` : '')).join('')}`);
  });
  yStage.addEventListener('pointerleave', () => yTip.hide());
  page.notes.before(
    figure(
      'Fig. VIII.2 · Discoveries by year',
      yStage,
      '<b>Fig. VIII.2.</b> Planets confirmed each year, stacked by method in the same colours as Fig. VIII.1. The spikes in 2014 and 2016 are batch validations of NASA Kepler candidates. Hover a bar for its counts.',
      h('div', { class: 'key' }, panel('Methods', h('div', { class: 'legend' }, ...GROUPS.map((g, k) => h('span', null, h('i', { style: { background: k < 3 ? `var(--series-${k + 1})` : 'var(--series-other)' } }), g))))),
    ),
  );

  // ---------------------------------------------------------------- Fig VIII.3 transit simulator
  const tStage = h('div', { class: 'stage', style: { height: '420px' }, role: 'img', 'aria-label': 'Transit light curve simulator' });
  const tSurf = createSurface(tStage, d, () => tRedraw());
  const tRedraw = invalidator(drawTransit);
  let Rp = 1; // Earth radii
  let Rs = 1; // solar radii
  let b = 0.3;
  let phase = -1.4;
  const u1 = 0.44, u2 = 0.23; // quadratic limb darkening, Sun-like in visible light
  const I = (mu: number) => 1 - u1 * (1 - mu) - u2 * (1 - mu) ** 2;
  const Inorm = 1 - u1 / 3 - u2 / 6;
  function overlapArea(r: number, p: number, z: number): number {
    // area of a circle radius p at distance z from the centre of a circle radius r, inside it
    if (z >= r + p) return 0;
    if (z <= r - p) return Math.PI * p * p;
    if (z <= p - r) return Math.PI * r * r;
    const a1 = p * p * Math.acos((z * z + p * p - r * r) / (2 * z * p));
    const a2 = r * r * Math.acos((z * z + r * r - p * p) / (2 * z * r));
    const a3 = 0.5 * Math.sqrt((-z + p + r) * (z + p - r) * (z - p + r) * (z + p + r));
    return a1 + a2 - a3;
  }
  const flux = (x: number) => {
    const k = (Rp / RJ_RE / 9.731) / Rs; // Rp in R☉ over Rs; 1 R☉ = 9.731 R_J
    const z = Math.hypot(x, b);
    const A = overlapArea(1, k, z);
    if (A === 0) return 1;
    const rr = Math.min(0.999, Math.max(0, z));
    const mu = Math.sqrt(1 - rr * rr);
    return 1 - (A / Math.PI) * (I(mu) / Inorm);
  };
  function drawTransit(): void {
    const { ctx, width: W, height: H } = tSurf;
    const pal = palette();
    ctx.fillStyle = pal.space;
    ctx.fillRect(0, 0, W, H);
    const k = (Rp / RJ_RE / 9.731) / Rs;
    // star disc with limb darkening
    const sr = Math.min(H * 0.24, W * 0.18);
    const sx = W / 2, sy = H * 0.3;
    const T = Rs < 0.5 ? 3200 : Rs < 0.9 ? 4600 : Rs < 1.3 ? 5800 : 7500;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    for (let t = 0; t <= 1; t += 0.1) g.addColorStop(t, blackbodyCss(T * (0.75 + 0.25 * I(Math.sqrt(1 - t * t)))));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    // planet
    ctx.fillStyle = '#05060a';
    ctx.beginPath();
    ctx.arc(sx + phase * sr, sy + b * sr, Math.max(1.5, k * sr), 0, Math.PI * 2);
    ctx.fill();
    // light curve
    const box = { x: 70, y: H * 0.6, w: W - 100, h: H * 0.32 };
    const depth = 1 - flux(0);
    const ymin = 1 - Math.max(depth * 1.3, 1e-4);
    const y = linScale(ymin, 1 + (1 - ymin) * 0.15, box.y + box.h, box.y);
    const x = linScale(-1.6, 1.6, box.x, box.x + box.w);
    ctx.strokeStyle = 'rgba(141,148,166,0.3)';
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = box.x; px <= box.x + box.w; px++) {
      const f = flux(x.invert(px));
      if (px === box.x) ctx.moveTo(px, y(f));
      else ctx.lineTo(px, y(f));
    }
    ctx.stroke();
    ringDot(ctx, x(phase), y(flux(phase)), 4, pal.accent, pal.space);
    label(ctx, 'Brightness', box.x - 8, box.y + 8, pal, { align: 'right', color: pal.onSpace2, font: `11px ${pal.fontMono}` });
    label(ctx, '100 %', box.x - 8, y(1), pal, { align: 'right', color: pal.onSpace2, font: `11px ${pal.fontMono}` });
    label(ctx, `−${sig(depth * 100, 2)} %`, box.x - 8, y(1 - depth), pal, { align: 'right', color: pal.onSpace, font: `11px ${pal.fontMono}` });
    label(ctx, 'Time →', box.x + box.w, box.y + box.h + 14, pal, { align: 'right', color: pal.onSpace2, font: `11px ${pal.fontMono}` });
    tRead.update([
      ['Radius ratio Rp/R★', fixed(k, 4)],
      ['Transit depth', `${sig(depth * 1e6, 3)} ppm (${sig(depth * 100, 2)} %)`],
      ['Approx. (Rp/R★)²', `${sig(k * k * 1e6, 3)} ppm`],
      ['Transit visible?', b < 1 + k ? 'Yes' : 'No: the planet misses the star'],
    ]);
  }
  const tRead = readout([]);
  const presets: [string, number, number][] = [
    ['Earth & Sun', 1, 1],
    ['Jupiter & Sun', 11.2, 1],
    ['TRAPPIST-1 e', 0.92, 0.119],
    ['Hot Jupiter', 15, 1.2],
  ];
  const rpS = slider({ id: 'exo-rp', label: 'Planet radius', min: 0.3, max: 25, value: Rp, log: true, format: (v) => `${sig(v, 3)} R⊕`, onInput: (v) => { Rp = v; tRedraw(); } });
  const rsS = slider({ id: 'exo-rs', label: 'Star radius', min: 0.1, max: 2.5, value: Rs, log: true, format: (v) => `${sig(v, 3)} R☉`, onInput: (v) => { Rs = v; tRedraw(); } });
  const bS = slider({ id: 'exo-b', label: 'Impact parameter b', min: 0, max: 1.3, step: 0.01, value: b, format: (v) => fixed(v, 2), onInput: (v) => { b = v; tRedraw(); } });
  page.notes.before(
    figure(
      'Fig. VIII.3 · Finding a planet by its shadow',
      tStage,
      '<b>Fig. VIII.3.</b> A planet crossing its star blocks a fraction of the light roughly equal to the ratio of their areas, (Rp/R★)². Limb darkening (quadratic law, u₁ = 0.44, u₂ = 0.23) rounds the bottom of the dip. Earth would dim the Sun by 84 parts per million; the same planet around a small red dwarf gives a dip a hundred times deeper.',
      h('div', { class: 'key' }, panel('Transit', h('div', { class: 'controls' }, rpS.el, rsS.el, bS.el, h('div', { class: 'btn-row' }, presets.map(([n, rp, rs]) => button(n, () => { Rp = rp; Rs = rs; rpS.set(rp); rsS.set(rs); tRedraw(); }))), tRead.el))),
    ),
  );
  const reduced = prefersReducedMotion();
  phase = reduced ? 0 : phase;
  animate(tStage, d, (_t, dt) => {
    if (reduced) return;
    phase += dt * 0.35;
    if (phase > 1.6) phase = -1.6;
    drawTransit();
  });

  // ---------------------------------------------------------------- Fig VIII.4 habitable zone
  const hzStage = h('div', { class: 'stage stage--chart', style: { height: '460px' }, role: 'img', 'aria-label': 'Habitable zone diagram' });
  const hzSurf = createSurface(hzStage, d, () => hzRedraw());
  const hzRedraw = invalidator(drawHZ);
  const hzTip = new Tooltip(hzStage);
  let hzPts: { i: number; x: number; y: number }[] = [];
  function drawHZ(): void {
    if (!cat) return;
    const { ctx, width: W, height: H } = hzSurf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const box = { x: 66, y: 20, w: W - 66 - 24, h: H - 20 - 60 };
    const x = logScale(20, 0.08, box.x, box.x + box.w);
    const y = linScale(2600, 7200, box.y + box.h, box.y);
    drawAxes(ctx, box, pal, { ticks: [20, 10, 5, 2, 1, 0.5, 0.2, 0.1], scale: x, label: (v) => String(v), title: 'Starlight received (Earth = 1)' }, { ticks: [3000, 4000, 5000, 6000, 7000], scale: y, label: (v) => `${v} K`, title: 'Star temperature' });
    // HZ bands
    const band = (inner: number[], outer: number[], fill: string) => {
      ctx.beginPath();
      for (let T = 2600; T <= 7200; T += 50) ctx.lineTo(x(seff(inner, T)), y(T));
      for (let T = 7200; T >= 2600; T -= 50) ctx.lineTo(x(seff(outer, T)), y(T));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    band(HZ.recentVenus, HZ.earlyMars, hexAlpha(pal.series[2], 0.12));
    band(HZ.runaway, HZ.maxGreenhouse, hexAlpha(pal.series[2], 0.24));
    hzPts = [];
    ctx.fillStyle = pal.series[0];
    for (let i = 0; i < cat.count; i++) {
      const T = cat.steff[i];
      if (T == null || T < 2600 || T > 7200) continue;
      const vr = val('radius', i), vm = val('mass', i);
      const small = (vr != null && vr < 2.5) || (vr == null && vm != null && vm < 10);
      if (!small) continue;
      const S = insolation(i);
      if (S == null || S > 20 || S < 0.08) continue;
      const px = x(S), py = y(T);
      ringDot(ctx, px, py, 3.2, pal.series[0], pal.surface2);
      hzPts.push({ i, x: px, y: py });
    }
    for (const p of SOLAR.slice(0, 4)) {
      const px = x(p.S), py = y(5772);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, p.name, px, py - 14, pal, { align: 'center', color: pal.fg, font: `600 11px ${pal.fontBody}`, halo: pal.surface2 });
    }
    ctx.restore();
    label(ctx, 'Conservative habitable zone', x(seff(HZ.maxGreenhouse, 3300)) + 6, y(3150), pal, { color: pal.fg, font: `italic 14px ${pal.fontDisplay}`, halo: pal.surface2 });
    label(ctx, 'Too hot', box.x + 10, box.y + 14, pal, { color: pal.muted, font: `11px ${pal.fontMono}` });
    label(ctx, 'Too cold', box.x + box.w - 10, box.y + 14, pal, { align: 'right', color: pal.muted, font: `11px ${pal.fontMono}` });
    const notable = ['TRAPPIST-1 e', 'TRAPPIST-1 f', 'Proxima Centauri b', 'Kepler-186 f', 'Kepler-452 b', 'TOI-700 d', 'LHS 1140 b', "Teegarden's Star b"];
    for (const nm of notable) {
      const p = hzPts.find((q) => cat!.name[q.i] === nm);
      if (p) label(ctx, nm, p.x + 7, p.y + 1, pal, { color: pal.fg2, font: `11px ${pal.fontBody}`, halo: pal.surface2 });
    }
    hzCount.textContent = `${hzPts.length} small planets (under 2.5 R⊕ or 10 M⊕) with enough data to place`;
  }
  hzStage.addEventListener('pointermove', (e) => {
    const r = hzStage.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const p = hzPts.find((q) => Math.hypot(q.x - px, q.y - py) < 7);
    if (!p) return hzTip.hide();
    hzTip.show(px, py, `${planetTip(p.i)}<div class="mono">${sig(insolation(p.i)!, 3)} × Earth’s light · ${fixed(cat!.steff[p.i]!, 0)} K star</div>`);
  });
  hzStage.addEventListener('pointerleave', () => hzTip.hide());
  const hzCount = h('p', { class: 'info-sub' });
  page.notes.before(
    figure(
      'Fig. VIII.4 · The habitable zone',
      hzStage,
      '<b>Fig. VIII.4.</b> Small planets by the starlight they receive and their star’s temperature. The dark green band is the conservative habitable zone of Kopparapu et al. (2013), between the runaway-greenhouse and maximum-greenhouse limits; the paler band is the optimistic zone set by recent Venus and early Mars. Cooler stars emit more infrared, which warms planets more efficiently, so the zone shifts to lower insolation.',
      h('div', { class: 'key' }, panel('Reading it', h('div', { class: 'info-body' }, h('p', null, 'Inside the band, a rocky planet with an Earth-like atmosphere could keep liquid water at its surface. Being inside is no guarantee: atmosphere, magnetic field, tidal locking and stellar flares all matter.'), hzCount))),
    ),
  );
  d.add(onThemeChange(() => { redraw(); yearRedraw(); hzRedraw(); tRedraw(); }));

  page.notes.append(
    note(
      'Four ways to find a planet',
      `<ul><li><strong>Transits</strong>: a dip in brightness as the planet crosses the star. Gives the radius. Kepler and TESS found thousands.</li><li><strong>Radial velocity</strong>: the star’s Doppler wobble, down to below 1 m/s. Gives a minimum mass, m sin i.</li><li><strong>Microlensing</strong>: a planet’s gravity briefly brightens a background star. Sensitive to cold planets several AU out.</li><li><strong>Direct imaging</strong>: blocking the starlight to photograph young, hot giants on wide orbits.</li></ul>`,
    ),
    note(
      'Worlds without a Solar System analogue',
      `<p><strong>Hot Jupiters</strong> orbit in days, roasting at over 1,000 K; 51 Pegasi b, found in 1995, was one. The commonest planets in the Galaxy appear to be <strong>super-Earths and sub-Neptunes</strong>, 1–4 Earth radii, which our Solar System lacks.</p>
       <p>A dearth of planets near 1.8 R⊕, the <strong>radius valley</strong>, likely marks where young planets lost their hydrogen envelopes to stellar radiation.</p>`,
    ),
    note(
      'Weighing and sizing',
      `<p>With both mass and radius, density follows, and density hints at composition: rock and iron near 5 g/cm³, water worlds lower, puffy gas giants below 1. The transit depth gives the radius; Kepler’s third law with the star’s mass gives the orbit:</p>
       <div class="eq">a³ = G M★ P² / 4π²</div>`,
    ),
  );
  return () => d.dispose();
}

function roundTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + hh);
  ctx.lineTo(x, y + r);
  if (r) ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  if (r) ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + hh);
  ctx.closePath();
  ctx.fill();
}

function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
