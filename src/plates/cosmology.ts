// Plate XI — The Expanding Universe: cosmic history, expansion models and distances.

import { Disposer, h } from '../lib/dom';
import { createSurface, invalidator, linScale, logScale } from '../lib/canvas';
import { Tooltip, drawAxes, label, logLabel, niceLinearTicks, ringDot } from '../lib/chart';
import { onThemeChange, palette } from '../lib/theme';
import { button, panel, readout, slider } from '../lib/ui';
import { fixed, seconds, sig, sup } from '../lib/format';
import {
  Cosmology, PLANCK18, ageAt, ageAtRedshift, angularDiameterDistance, comovingDistance, expansionHistory, lookbackTime,
  luminosityDistance, Ok, particleHorizon, age, hubbleTime,
} from '../physics/cosmology';
import { EPOCHS, Epoch } from '../data/timeline';
import { figure, note, platePage } from './page';
import { PlateContext, plateById } from './registry';

const YR = 3.15576e7;
const MPC_TO_GLY = 3.26156e-3;

export function mount(root: HTMLElement, _ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('cosmology')!, {
    dek: 'Run the expansion backwards and everything was once hotter and denser. The Big Bang theory traces that history from a fraction of a second to today, and three numbers measured from the cosmic microwave background tell us how old, how big and how full the Universe is.',
    caption:
      '<b>Fig. XI.1.</b> The history of the Universe on a logarithmic time axis, from the Planck time to today, with the temperature of the radiation that fills space. Temperature follows T ∝ 1/a, with a(t) integrated from the Friedmann equation for Planck 2018 ΛCDM; at early times it ignores the small reheating when particle species annihilate. Hover for values; select an epoch to read about it.',
    chart: true,
    stageLabel: 'Timeline of cosmic history with temperature',
  });
  root.append(page.root);
  const stage = page.stage;

  // a(t) lookup for the Planck model, plus a radiation-era extension
  const table: { lt: number; la: number }[] = [];
  for (let k = 0; k <= 240; k++) {
    const a = 10 ** (-6 + (6 * k) / 240);
    table.push({ lt: Math.log10(ageAt(PLANCK18, a) * 1e9 * YR), la: Math.log10(a) });
  }
  const t0s = table[table.length - 1].lt;
  const logA = (lt: number): number => {
    if (lt <= table[0].lt) return table[0].la + 0.5 * (lt - table[0].lt); // a ∝ t^½
    for (let k = 1; k < table.length; k++)
      if (lt <= table[k].lt) {
        const f = (lt - table[k - 1].lt) / (table[k].lt - table[k - 1].lt);
        return table[k - 1].la + f * (table[k].la - table[k - 1].la);
      }
    return 0;
  };
  const Tof = (lt: number) => 2.7255 / 10 ** logA(lt);

  let selEpoch: Epoch | null = EPOCHS.find((e) => e.name.startsWith('Recombination'))!;
  let hoverLt: number | null = null;
  const tip = new Tooltip(stage);
  const surf = createSurface(stage, d, () => redraw());
  const redraw = invalidator(drawTimeline);
  let lanes: { e: Epoch; x0: number; x1: number; y: number }[] = [];
  let geom: { x: ReturnType<typeof linScale>; box: { x: number; y: number; w: number; h: number } } | null = null;

  function drawTimeline(): void {
    const { ctx, width: W, height: H } = surf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const box = { x: 70, y: 24, w: W - 70 - 24, h: Math.round(H * 0.42) };
    const x = linScale(-44, t0s + 0.3, box.x, box.x + box.w);
    const y = linScale(-1, 33, box.y + box.h, box.y);
    geom = { x, box };
    const xt = [-40, -32, -24, -16, -8, 0, 8, 16];
    drawAxes(
      ctx,
      box,
      pal,
      { ticks: xt, scale: x, label: (v) => (v === 0 ? '1 s' : `10${sup(v)} s`) },
      { ticks: [0, 8, 16, 24, 32], scale: y, label: (v) => `10${sup(v)} K`, title: 'Temperature' },
    );
    // human-scale markers on the time axis
    for (const [lt, txt] of [[Math.log10(60), '1 min'], [Math.log10(YR), '1 yr'], [Math.log10(1e6 * YR), '1 Myr'], [Math.log10(1e9 * YR), '1 Gyr']] as [number, string][]) {
      ctx.strokeStyle = pal.axis;
      ctx.beginPath();
      ctx.moveTo(x(lt), box.y + box.h);
      ctx.lineTo(x(lt), box.y + box.h + 4);
      ctx.stroke();
      label(ctx, txt, x(lt), box.y + box.h + 26, pal, { align: 'center', color: pal.muted, font: `10px ${pal.fontMono}` });
    }
    // temperature curve
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let lt = -43.3; lt <= t0s; lt += 0.05) {
      const px = x(lt), py = y(Math.log10(Tof(lt)));
      if (lt === -43.3) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ringDot(ctx, x(t0s), y(Math.log10(2.7255)), 4, pal.accent, pal.surface2);
    label(ctx, '2.7 K today', x(t0s) - 8, y(Math.log10(2.7255)) - 14, pal, { align: 'right', color: pal.fg, font: `600 12px ${pal.fontBody}`, halo: pal.surface2 });
    // epochs in lanes
    lanes = [];
    const laneTop = box.y + box.h + 50;
    const laneH = 26;
    const used: [number, number][][] = [];
    ctx.font = `12px ${pal.fontBody}`;
    for (const e of EPOCHS) {
      const x0 = x(Math.log10(e.start));
      const x1 = e.end ? x(Math.log10(e.end)) : x0;
      const tw = ctx.measureText(e.name).width;
      // Near the right edge, labels hang to the left of their marker.
      const flip = x0 + tw + 14 > W - 8;
      const span: [number, number] = flip ? [Math.min(x0, x1) - tw - 14, Math.max(x1, x0) + 4] : [x0 - 4, Math.max(x1, x0 + tw + 14)];
      let lane = 0;
      while (used[lane]?.some(([a, b]) => span[0] < b && span[1] > a)) lane++;
      (used[lane] ??= []).push(span);
      const yy = laneTop + lane * laneH;
      if (yy > H - 14) continue;
      const selected = e === selEpoch;
      ctx.fillStyle = selected ? pal.accent : pal.lineStrong;
      if (e.end) ctx.fillRect(x0, yy - 3, Math.max(3, x1 - x0), 6);
      else {
        ctx.beginPath();
        ctx.arc(x0, yy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (flip) label(ctx, e.name, Math.min(x0, x1) - 8, yy, pal, { align: 'right', color: selected ? pal.fg : pal.fg2, font: `${selected ? 600 : 400} 12px ${pal.fontBody}` });
      else label(ctx, e.name, x0 + (e.end ? 0 : 8), yy + (e.end ? 13 : 0), pal, { color: selected ? pal.fg : pal.fg2, font: `${selected ? 600 : 400} 12px ${pal.fontBody}`, baseline: 'middle' });
      lanes.push({ e, x0: span[0], x1: span[1], y: yy });
      // faint guide up to the temperature curve
      if (selected) {
        ctx.strokeStyle = pal.accent;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, yy - 6);
        ctx.lineTo(x0, y(Math.log10(Tof(Math.log10(e.start)))));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (hoverLt !== null) {
      ctx.strokeStyle = pal.axis;
      ctx.beginPath();
      ctx.moveTo(x(hoverLt), box.y);
      ctx.lineTo(x(hoverLt), box.y + box.h);
      ctx.stroke();
      ringDot(ctx, x(hoverLt), y(Math.log10(Tof(hoverLt))), 4, pal.accent, pal.surface2);
    }
  }
  stage.addEventListener('pointermove', (e) => {
    if (!geom) return;
    const r = stage.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const { box, x } = geom;
    if (px < box.x || px > box.x + box.w || py > box.y + box.h + 30) {
      hoverLt = null;
      tip.hide();
      return redraw();
    }
    hoverLt = Math.min(t0s, x.invert(px));
    const a = 10 ** logA(hoverLt);
    tip.show(px, py, `<b>${fmtTime(10 ** hoverLt)}</b><div class="mono">T ≈ ${sig(Tof(hoverLt), 2)} K</div><div class="mono">z ≈ ${sig(1 / a - 1, 3)} · a = ${sig(a, 3)}</div>`);
    redraw();
  });
  stage.addEventListener('pointerleave', () => { hoverLt = null; tip.hide(); redraw(); });
  stage.addEventListener('click', (e) => {
    const r = stage.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const hit = lanes.find((l) => px >= l.x0 && px <= l.x1 && Math.abs(py - l.y) < 14);
    if (hit) {
      selEpoch = hit.e;
      showEpoch();
      redraw();
    }
  });

  const epochInfo = h('div', { class: 'info-body' });
  function showEpoch(): void {
    if (!selEpoch) return;
    const e = selEpoch;
    const lt = Math.log10(e.start);
    const a = 10 ** logA(lt);
    epochInfo.replaceChildren(
      h('p', { class: 'info-title' }, e.name),
      h('p', null, e.note),
      readout([
        ['Time after the Big Bang', e.end ? `${fmtTime(e.start)} – ${fmtTime(e.end)}` : fmtTime(e.start)],
        ['Redshift', e.z ?? (a < 1e-5 ? `≈ ${sig(1 / a, 2)}` : sig(1 / a - 1, 3))],
        ['Radiation temperature', `≈ ${sig(Tof(lt), 2)} K`],
      ]).el,
    );
  }
  showEpoch();
  page.key.append(panel('Epoch', epochInfo));

  // ---------------------------------------------------------------- Fig XI.2 expansion history
  const cm: Cosmology = { ...PLANCK18 };
  const exStage = h('div', { class: 'stage stage--chart', style: { height: '440px' }, role: 'img', 'aria-label': 'Scale factor against time for several universes' });
  const exSurf = createSurface(exStage, d, () => exRedraw());
  const exRedraw = invalidator(drawExpansion);
  const refs = [
    { name: 'Planck ΛCDM', m: PLANCK18 },
    { name: 'Matter only (Ω_m = 1)', m: { H0: 67.66, Om: 1, OL: 0, Or: 0 } },
    { name: 'Closed (Ω_m = 3)', m: { H0: 67.66, Om: 3, OL: 0, Or: 0 } },
  ];
  const refHist = refs.map((r) => expansionHistory(r.m, -25, 40, 0.02));
  function drawExpansion(): void {
    const { ctx, width: W, height: H } = exSurf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const box = { x: 56, y: 20, w: W - 56 - 150, h: H - 20 - 56 };
    const x = linScale(-25, 40, box.x, box.x + box.w);
    const y = linScale(0, 4, box.y + box.h, box.y);
    drawAxes(ctx, box, pal, { ticks: niceLinearTicks(-25, 40, 8), scale: x, label: (v) => (v > 0 ? `+${v}` : String(v)), title: 'Billions of years from today' }, { ticks: [0, 1, 2, 3, 4], scale: y, label: (v) => String(v), title: 'Scale factor a (today = 1)' });
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = pal.axis;
    ctx.beginPath();
    ctx.moveTo(x(0), box.y);
    ctx.lineTo(x(0), box.y + box.h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'Today', x(0) + 6, box.y + 10, pal, { color: pal.muted, font: `11px ${pal.fontMono}` });
    const usedY: number[] = [];
    const plot = (hist: ReturnType<typeof expansionHistory>, color: string, w: number, name: string) => {
      const pts = [...hist.past, ...hist.future.slice(1)].filter((p) => p.t >= -25 && p.t <= 40);
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p.a)) : ctx.moveTo(x(p.t), y(p.a))));
      ctx.stroke();
      ctx.restore();
      const last = pts[pts.length - 1];
      let ly = Math.max(box.y + 8, Math.min(box.y + box.h - 8, y(last.a)));
      while (usedY.some((u) => Math.abs(u - ly) < 15)) ly += 15;
      usedY.push(ly);
      const lx = last.t >= 39.5 ? box.x + box.w + 8 : x(last.t) + 8;
      label(ctx, name, lx, ly, pal, { color: pal.fg2, font: `12px ${pal.fontBody}`, halo: pal.surface2 });
      if (hist.bigBang !== null && hist.bigBang > -25) ringDot(ctx, x(hist.bigBang), y(0), 3.5, color, pal.surface2);
    };
    const mine = expansionHistory(cm, -25, 40, 0.02);
    refs.forEach((r, i) => plot(refHist[i], pal.series[i], 2, r.name));
    plot(mine, pal.accent, 3, 'Your universe');
  }

  const modelRead = readout([]);
  function paintModel(): void {
    const hist = expansionHistory(cm, -60, 200, 0.05);
    const k = Ok(cm);
    const q0 = cm.Om / 2 + cm.Or - cm.OL;
    let fate: string;
    if (hist.crunch !== null) fate = `Recollapses: Big Crunch in ${fixed(hist.crunch, 0)} Gyr`;
    else if (q0 < 0) fate = 'Expands forever, accelerating';
    else fate = 'Expands forever, slowing down';
    const hasBang = hist.bigBang !== null;
    modelRead.update([
      ['Age', hasBang ? `${fixed(age(cm), 2)} billion years` : 'No Big Bang (the model bounces)'],
      ['Hubble time 1/H₀', `${fixed(hubbleTime(cm), 2)} Gyr`],
      ['Curvature Ω_k', `${fixed(k, 3)} (${Math.abs(k) < 0.005 ? 'flat' : k > 0 ? 'open' : 'closed'})`],
      ['Deceleration q₀', fixed(q0, 3)],
      ['Fate', fate],
    ]);
    exRedraw();
    calcPaint();
  }
  const h0S = slider({ id: 'cos-h0', label: 'Hubble constant H₀', min: 50, max: 90, step: 0.1, value: cm.H0, format: (v) => `${fixed(v, 1)} km/s/Mpc`, onInput: (v) => { cm.H0 = v; paintModel(); } });
  const omS = slider({ id: 'cos-om', label: 'Matter Ω_m', min: 0, max: 3, step: 0.005, value: cm.Om, format: (v) => fixed(v, 3), onInput: (v) => { cm.Om = v; paintModel(); } });
  const olS = slider({ id: 'cos-ol', label: 'Dark energy Ω_Λ', min: -0.5, max: 2, step: 0.005, value: cm.OL, format: (v) => fixed(v, 3), onInput: (v) => { cm.OL = v; paintModel(); } });
  const setModel = (m: Cosmology) => {
    Object.assign(cm, m);
    h0S.set(cm.H0);
    omS.set(cm.Om);
    olS.set(cm.OL);
    paintModel();
  };
  page.notes.before(
    figure(
      'Fig. XI.2 · How the Universe expands',
      exStage,
      '<b>Fig. XI.2.</b> The scale factor a(t), the relative size of the Universe, integrated from the Friedmann equation, H² = H₀²[Ω_r a⁻⁴ + Ω_m a⁻³ + Ω_k a⁻² + Ω_Λ]. Every model is matched to today’s expansion rate, so they share a slope at the present. Dots mark each model’s Big Bang. Change the ingredients to build your own universe.',
      h(
        'div',
        { class: 'key' },
        panel(
          'Your universe',
          h(
            'div',
            { class: 'controls' },
            h0S.el,
            omS.el,
            olS.el,
            h('div', { class: 'btn-row' },
              button('Planck 2018', () => setModel(PLANCK18)),
              button('Einstein–de Sitter', () => setModel({ H0: 67.66, Om: 1, OL: 0, Or: 0 })),
              button('Open, no Λ', () => setModel({ H0: 67.66, Om: 0.3, OL: 0, Or: 0 })),
              button('Closed', () => setModel({ H0: 67.66, Om: 3, OL: 0, Or: 0 })),
            ),
            modelRead.el,
          ),
        ),
      ),
    ),
  );

  // ---------------------------------------------------------------- Fig XI.3 distances
  let z = 1;
  const dStage = h('div', { class: 'stage stage--chart', style: { height: '400px' }, role: 'img', 'aria-label': 'Cosmological distance measures against redshift' });
  const dSurf = createSurface(dStage, d, () => dRedraw());
  const dRedraw = invalidator(drawDistances);
  function drawDistances(): void {
    const { ctx, width: W, height: H } = dSurf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const box = { x: 60, y: 20, w: W - 60 - 170, h: H - 20 - 56 };
    const x = logScale(0.01, 1100, box.x, box.x + box.w);
    const y = logScale(0.01, 1000, box.y + box.h, box.y);
    drawAxes(ctx, box, pal, { ticks: [0.01, 0.1, 1, 10, 100, 1000], scale: x, label: logLabel, title: 'Redshift z' }, { ticks: [0.01, 0.1, 1, 10, 100, 1000], scale: y, label: logLabel, title: 'Distance (billion light-years)' });
    const series = [
      { name: 'Luminosity distance', f: (zz: number) => luminosityDistance(cm, zz), color: pal.series[1] },
      { name: 'Comoving distance', f: (zz: number) => comovingDistance(cm, zz), color: pal.series[0] },
      { name: 'Angular-diameter distance', f: (zz: number) => angularDiameterDistance(cm, zz), color: pal.series[2] },
    ];
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let first = true;
      for (let lz = -2; lz <= Math.log10(1100); lz += 0.04) {
        const v = s.f(10 ** lz) * MPC_TO_GLY;
        if (!(v > 0)) continue;
        if (first) ctx.moveTo(x(10 ** lz), y(v));
        else ctx.lineTo(x(10 ** lz), y(v));
        first = false;
      }
      ctx.stroke();
    }
    ctx.restore();
    for (const s of series) {
      const v = s.f(1100) * MPC_TO_GLY;
      label(ctx, s.name, box.x + box.w + 8, Math.max(box.y + 8, Math.min(box.y + box.h - 8, y(v))), pal, { color: pal.fg2, font: `12px ${pal.fontBody}` });
    }
    // chosen z
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x(z), box.y);
    ctx.lineTo(x(z), box.y + box.h);
    ctx.stroke();
    for (const s of series) {
      const v = s.f(z) * MPC_TO_GLY;
      if (v > 0.01 && v < 1000) ringDot(ctx, x(z), y(v), 4, s.color, pal.surface2);
    }
    label(ctx, `z = ${sig(z, 3)}`, x(z) + 6, box.y + 10, pal, { color: pal.fg, font: `600 12px ${pal.fontMono}` });
  }
  const calcRead = readout([]);
  function calcPaint(): void {
    const hasBang = expansionHistory(cm, -60, 1, 0.05).bigBang !== null;
    if (!hasBang) {
      calcRead.update([['Distances', 'Undefined for a model without a Big Bang']]);
      dRedraw();
      return;
    }
    const Dc = comovingDistance(cm, z);
    const Da = angularDiameterDistance(cm, z);
    calcRead.update([
      ['Age of the Universe then', `${fixed(ageAtRedshift(cm, z), 3)} Gyr`],
      ['Light left it', `${fixed(lookbackTime(cm, z), 3)} Gyr ago`],
      ['Comoving distance now', `${fixed(Dc * MPC_TO_GLY, 3)} Gly (${fixed(Dc, 0)} Mpc)`],
      ['Luminosity distance', `${fixed(luminosityDistance(cm, z) * MPC_TO_GLY, 3)} Gly`],
      ['Angular-diameter distance', `${fixed(Da * MPC_TO_GLY, 3)} Gly`],
      ['Scale on the sky', `${fixed((Da * 1000) / 206264.806, 3)} kpc per arcsecond`],
      ['Distance then (when light left)', `${fixed((Dc / (1 + z)) * MPC_TO_GLY, 3)} Gly`],
      ['CMB temperature then', `${fixed(2.7255 * (1 + z), 2)} K`],
      ['Edge of the observable universe', `${fixed(particleHorizon(cm) * MPC_TO_GLY, 1)} Gly`],
    ]);
    dRedraw();
  }
  const zS = slider({ id: 'cos-z', label: 'Redshift z', min: 0.001, max: 1100, value: z, log: true, format: (v) => sig(v, 3), onInput: (v) => { z = v; calcPaint(); } });
  page.notes.before(
    figure(
      'Fig. XI.3 · How far is far?',
      dStage,
      '<b>Fig. XI.3.</b> In an expanding universe “distance” has several meanings. The comoving distance is how far away a galaxy is now. The luminosity distance is what its brightness implies, and the angular-diameter distance what its apparent size implies. Past z ≈ 1.6 the angular-diameter distance shrinks: very distant galaxies look larger again, because the light left when they were close to us.',
      h(
        'div',
        { class: 'key' },
        panel(
          'Calculator',
          h(
            'div',
            { class: 'controls' },
            zS.el,
            h('div', { class: 'btn-row' }, ...[['Virgo Cluster', 0.0036], ['3C 273', 0.158], ['z = 1', 1], ['GN-z11', 10.6], ['JADES-GS-z14-0', 14.32], ['CMB', 1089.9]].map(([n, v]) => button(n as string, () => { z = v as number; zS.set(z); calcPaint(); }))),
            calcRead.el,
            h('p', { class: 'info-sub' }, 'Uses the universe set in Fig. XI.2.'),
          ),
        ),
      ),
    ),
  );
  paintModel();
  d.add(onThemeChange(() => { redraw(); exRedraw(); dRedraw(); }));

  // ---------------------------------------------------------------- composition
  const comp = [
    ['Dark energy', 68.9, 'var(--series-3)'],
    ['Dark matter', 26.2, 'var(--series-1)'],
    ['Ordinary matter', 4.9, 'var(--series-2)'],
  ] as const;
  const bar = h(
    'div',
    { style: { display: 'flex', gap: '2px', height: '44px', borderRadius: '4px', overflow: 'hidden', marginTop: '6px' }, role: 'img', 'aria-label': 'Energy content of the Universe today' },
    comp.map(([, v, c]) => h('div', { style: { flex: `${v} 0 0`, background: c } })),
  );
  page.notes.append(
    h(
      'section',
      { class: 'note note--wide' },
      h('h2', null, 'What the Universe is made of'),
      bar,
      h('div', { class: 'legend' }, comp.map(([n, v, c]) => h('span', null, h('i', { style: { background: c } }), `${n} · ${v} %`))),
      h('p', { class: 'info-sub' }, 'Energy density today from Planck 2018: Ω_Λ = 0.689, Ω_c = 0.262, Ω_b = 0.049. Radiation is now only 0.009 %. Everything ever seen through a telescope belongs to the thinnest slice.'),
    ),
    note(
      'Hubble’s law',
      `<p>Distant galaxies recede at speeds proportional to their distance:</p>
       <div class="eq">v = H₀ d</div>
       <p>This is not motion through space but the stretching of space itself, which also stretches the light in transit: 1 + z = a<sub>now</sub>/a<sub>then</sub>. The CMB’s redshift of about 1,090 means the Universe has grown 1,090-fold since that light set out.</p>
       <p>Measurements disagree: the CMB implies H₀ ≈ 67.7, while Cepheids and supernovae give about 73 km/s/Mpc. This <strong>Hubble tension</strong> is one of today’s open problems.</p>`,
    ),
    note(
      'Evidence for the hot Big Bang',
      `<ol><li><strong>The expansion</strong> itself, discovered by Lemaître (1927) and Hubble (1929).</li><li><strong>The cosmic microwave background</strong>, found by Penzias and Wilson in 1965: a near-perfect 2.7255 K blackbody, uniform to 1 part in 100,000.</li><li><strong>Light-element abundances</strong>: about 25 % helium by mass everywhere, matching nucleosynthesis predictions.</li><li><strong>Evolution</strong>: distant galaxies and quasars look younger and different from nearby ones.</li></ol>`,
    ),
    note(
      'The observable universe',
      `<p>Light has had 13.8 billion years to travel, but the regions it left have since receded. The most distant matter whose light could have reached us is now about 46 billion light-years away, so the observable universe is about 93 billion light-years across. The whole Universe may be far larger, even infinite.</p>
       <p>Because the expansion is accelerating, galaxies beyond about 16 billion light-years today can never be reached by light we emit now.</p>`,
    ),
  );
  return () => d.dispose();
}

function fmtTime(s: number): string {
  if (s < 1e-3) return `${sig(s, 2).replace(' × ', ' × ')} s`;
  if (s < 3.15576e7) return seconds(s);
  const yr = s / 3.15576e7;
  if (yr < 1e3) return `${sig(yr, 3)} years`;
  if (yr < 1e6) return `${sig(yr / 1e3, 3)} thousand years`;
  if (yr < 1e9) return `${sig(yr / 1e6, 3)} million years`;
  return `${sig(yr / 1e9, 4)} billion years`;
}
