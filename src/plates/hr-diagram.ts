// Plate VI — The Hertzsprung–Russell diagram, from 28,879 catalogued stars.

import { Disposer, h } from '../lib/dom';
import { createSurface, invalidator, linScale } from '../lib/canvas';
import { Tooltip, drawAxes, label, ringDot } from '../lib/chart';
import { loadHR, loadStars, HRSample } from '../lib/data';
import { isLight, onThemeChange, palette } from '../lib/theme';
import { button, panel, readout, toggle } from '../lib/ui';
import { fixed, sig } from '../lib/format';
import { bvCss, bvToTemperature, temperatureToBV } from '../physics/blackbody';
import { absMagToLuminosity, luminosityToAbsMag, radiusFromLT } from '../physics/stellar';
import { note, platePage } from './page';
import { PlateContext, plateById } from './registry';
import { navigate } from '../router';

const X0 = -0.45, X1 = 2.25, Y0 = -9.5, Y1 = 17.5;

// Stars that matter for the story but are missing or blended in the catalogue.
const EXTRA = [
  { name: 'Sun', ci: 0.653, M: 4.83 },
  { name: 'Sirius B', ci: -0.03, M: 11.18 },
  { name: 'Procyon B', ci: 0.0, M: 13.0 },
];
const NOTABLE = ['Sirius', 'Canopus', 'Arcturus', 'Vega', 'Rigel', 'Betelgeuse', 'Aldebaran', 'Antares', 'Deneb', 'Polaris', 'Procyon', 'Spica', 'Proxima Centauri', "Barnard's Star", "Van Maanen's Star", 'Capella', 'Altair', 'Regulus'];

// Schematic evolutionary tracks in (T, L☉), after standard stellar models.
const TRACKS: Record<string, [number, number][]> = {
  '1 M☉': [[5600, 0.7], [5800, 1.0], [5900, 1.6], [5300, 2.0], [4800, 2.3], [4500, 4], [4200, 20], [3800, 200], [3200, 2500], [4900, 50], [5000, 45], [4300, 100], [3600, 1000], [3100, 5000]],
  '5 M☉': [[17000, 500], [15500, 750], [14000, 950], [16000, 1050], [9000, 1100], [5500, 1000], [4300, 1200], [4100, 1600], [5000, 1500], [8000, 1700], [6500, 1900], [4300, 2400], [3800, 5000], [3400, 12000]],
  '15 M☉': [[30500, 18000], [27500, 26000], [25000, 32000], [20000, 38000], [12000, 42000], [7000, 45000], [4500, 47000], [3600, 55000]],
};
const WD_TRACK: [number, number][] = [[40000, 50], [30000, 3], [20000, 0.3], [12000, 0.02], [8000, 0.002], [5000, 1e-4]];

export function mount(root: HTMLElement, ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('hr-diagram')!, {
    dek: 'Plot each star’s colour against its true brightness and they do not scatter at random. Nine in ten fall on a narrow band, the main sequence; the rest mark later stages of stellar life. This is the single most useful diagram in astrophysics.',
    caption:
      '<b>Fig. VI.</b> 28,879 stars from the HYG v4.1 catalogue: every star within 100 parsecs with a measured colour, plus naked-eye stars out to 2,000 parsecs, which fill in the rarer giants. Horizontal axis: B−V colour index (temperature along the top). Vertical axis: absolute visual magnitude (luminosity on the right, ignoring bolometric corrections). Dashed lines mark constant stellar radius.',
    chart: true,
    stageLabel: 'Hertzsprung–Russell diagram of 28,879 stars',
  });
  root.append(page.root);
  const stage = page.stage;
  stage.append(h('div', { class: 'loading' }, 'Loading 28,879 stars…'));

  const layers = { radii: true, regions: true, notable: true, tracks: false, wd: false };
  let data: HRSample | null = null;
  let sel: { name: string; ci: number; M: number } | null = null;
  let hover: { ci: number; M: number; name: string } | null = null;
  const tip = new Tooltip(stage);
  let surf: ReturnType<typeof createSurface> | null = null;
  const redraw = invalidator(draw);
  let grid = new Map<number, number[]>();
  let geom: { box: { x: number; y: number; w: number; h: number }; x: ReturnType<typeof linScale>; y: ReturnType<typeof linScale> } | null = null;

  loadHR()
    .then((hr) => {
      data = hr;
      stage.replaceChildren();
      surf = createSurface(stage, d, () => redraw());
      stage.append(tip.el, h('div', { class: 'stage-hint' }, 'Hover a point to identify the star'));
      if (ctx.params.focus) {
        const i = hr.name.indexOf(ctx.params.focus);
        if (i >= 0) sel = { name: hr.name[i], ci: hr.ci[i], M: hr.M[i] };
      }
      showInfo();
      redraw();
    })
    .catch((e) => stage.replaceChildren(h('div', { class: 'loading' }, `Could not load the catalogue: ${e.message}`)));

  function draw(): void {
    if (!surf || !data) return;
    const { ctx, width: W, height: H } = surf;
    const pal = palette();
    const light = isLight();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const box = { x: 64, y: 52, w: W - 64 - 70, h: H - 52 - 64 };
    const x = linScale(X0, X1, box.x, box.x + box.w);
    const y = linScale(Y0, Y1, box.y, box.y + box.h);
    geom = { box, x, y };
    const temps = [20000, 10000, 7000, 5000, 4000, 3000];
    const lums = [1e5, 1e4, 1e3, 100, 10, 1, 0.1, 0.01, 1e-3, 1e-4, 1e-5];
    drawAxes(
      ctx,
      box,
      pal,
      { ticks: [-0.4, 0, 0.4, 0.8, 1.2, 1.6, 2.0], scale: x, label: (v) => fixed(v, 1), title: 'Colour index B−V' },
      { ticks: [-8, -4, 0, 4, 8, 12, 16], scale: y, label: (v) => (v > 0 ? `+${v}` : String(v)), title: 'Absolute magnitude M_V' },
      {
        top: { ticks: temps.map(temperatureToBV), scale: x, label: (v) => `${fixed(Math.round(bvToTemperature(v) / 100) * 100, 0)} K`, title: 'Surface temperature' },
        right: { ticks: lums.map(luminosityToAbsMag), scale: y, label: (v) => sig(absMagToLuminosity(v), 1) + ' L☉', title: 'Luminosity' },
      },
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    // constant-radius lines
    if (layers.radii) {
      ctx.strokeStyle = pal.axis;
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1;
      for (const R of [0.001, 0.01, 0.1, 1, 10, 100, 1000]) {
        ctx.beginPath();
        let lastPt: [number, number] | null = null;
        for (let T = 2400; T <= 45000; T *= 1.04) {
          const L = R * R * (T / 5772) ** 4;
          const px = x(temperatureToBV(T));
          const py = y(luminosityToAbsMag(L));
          if (lastPt) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          lastPt = [px, py];
        }
        ctx.stroke();
        // label where the line crosses B−V = 1.85 or nearest visible point
        const T = bvToTemperature(1.9);
        const lx = x(1.9);
        const ly = y(luminosityToAbsMag(R * R * (T / 5772) ** 4));
        if (ly > box.y + 10 && ly < box.y + box.h - 10) label(ctx, `${R >= 1 ? R : R} R☉`, lx + 4, ly - 8, pal, { color: pal.muted, font: `10px ${pal.fontMono}` });
      }
      ctx.setLineDash([]);
    }
    // stars
    grid = new Map();
    const cell = 6;
    const n = data.count;
    for (let i = 0; i < n; i++) {
      const ci = data.ci[i];
      const M = data.M[i];
      const px = x(ci);
      const py = y(M);
      if (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) continue;
      ctx.fillStyle = light ? bvInk(ci, 0.6) : bvCss(ci, 0.55);
      ctx.fillRect(px - 0.9, py - 0.9, 1.8, 1.8);
      const key = Math.floor(px / cell) * 10000 + Math.floor(py / cell);
      let list = grid.get(key);
      if (!list) grid.set(key, (list = []));
      list.push(i);
    }
    // tracks
    const drawTrack = (pts: [number, number][], name: string, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([T, L], k) => {
        const px = x(temperatureToBV(Math.min(T, 42000)));
        const py = y(luminosityToAbsMag(L));
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
      const [T0, L0] = pts[0];
      ringDot(ctx, x(temperatureToBV(T0)), y(luminosityToAbsMag(L0)), 4, color, pal.surface2);
      label(ctx, name, x(temperatureToBV(T0)) - 8, y(luminosityToAbsMag(L0)) + 2, pal, { align: 'right', color: pal.fg, font: `600 12px ${pal.fontBody}`, halo: pal.surface2 });
    };
    if (layers.tracks) Object.entries(TRACKS).forEach(([k, pts], i) => drawTrack(pts, k, pal.series[i]));
    if (layers.wd) drawTrack(WD_TRACK, 'White dwarf cooling', pal.seriesOther);
    // regions
    if (layers.regions) {
      const f = `italic 500 ${W < 700 ? 13 : 16}px ${pal.fontDisplay}`;
      const rl = (t: string, ci: number, M: number, rot = 0) => {
        ctx.save();
        ctx.translate(x(ci), y(M));
        ctx.rotate(rot);
        label(ctx, t, 0, 0, pal, { color: pal.fg, font: f, halo: pal.surface2, align: 'center' });
        ctx.restore();
      };
      rl('Main sequence', 0.55, 7.2, 0.62);
      rl('Giants', 1.35, -1.9);
      rl('Supergiants', 0.9, -7.6);
      rl('White dwarfs', 0.15, 13.6);
      rl('Red dwarfs', 1.22, 12.4, 0.5);
    }
    ctx.restore();
    // notable stars
    if (layers.notable) {
      ctx.font = `12px ${pal.fontBody}`;
      const placed: number[][] = [];
      const items = [...EXTRA, ...NOTABLE.map((nm) => {
        const i = data!.name.indexOf(nm);
        return i >= 0 ? { name: nm, ci: data!.ci[i], M: data!.M[i] } : null;
      })].filter(Boolean) as { name: string; ci: number; M: number }[];
      for (const s of items) {
        const px = x(s.ci), py = y(s.M);
        if (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) continue;
        ringDot(ctx, px, py, s.name === 'Sun' ? 5 : 3.5, s.name === 'Sun' ? pal.accent : light ? bvInk(s.ci, 1) : bvCss(s.ci), pal.surface2);
        const tw = ctx.measureText(s.name).width;
        let lx = px + 8;
        if (lx + tw > box.x + box.w) lx = px - 8 - tw;
        const bx = [lx, py - 7, lx + tw, py + 7];
        if (placed.some((b) => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) continue;
        placed.push(bx);
        label(ctx, s.name, lx, py, pal, { color: pal.fg, halo: pal.surface2, font: `${s.name === 'Sun' ? 600 : 400} 12px ${pal.fontBody}` });
      }
    }
    // selection / hover reticles
    for (const s of [sel, hover]) {
      if (!s) continue;
      const px = x(s.ci), py = y(s.M);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, s === sel ? 9 : 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    countLabel.textContent = `${data.count.toLocaleString('en-US')} stars plotted`;
  }

  function nearest(px: number, py: number): number | null {
    if (!data || !geom) return null;
    const cell = 6;
    const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    let best: number | null = null;
    let bd = 8;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        for (const k of grid.get((cx + i) * 10000 + cy + j) ?? []) {
          const dd = Math.hypot(geom.x(data.ci[k]) - px, geom.y(data.M[k]) - py) - (data.name[k] ? 2 : 0);
          if (dd < bd) {
            bd = dd;
            best = k;
          }
        }
      }
    return best;
  }

  const starInfo = (ci: number, M: number) => {
    const T = bvToTemperature(ci);
    const L = absMagToLuminosity(M);
    return { T, L, R: radiusFromLT(L, T) };
  };

  stage.addEventListener('pointermove', (e) => {
    if (!data || !geom) return;
    const r = stage.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const k = nearest(px, py);
    if (k === null) {
      hover = null;
      tip.hide();
    } else {
      hover = { ci: data.ci[k], M: data.M[k], name: data.name[k] };
      const { T, L, R } = starInfo(hover.ci, hover.M);
      tip.show(px, py, `<b>${hover.name || 'Catalogued star'}</b><div class="mono">B−V ${fixed(hover.ci, 2)} · M ${fixed(hover.M, 2)}</div><div class="mono">≈ ${fixed(Math.round(T / 10) * 10, 0)} K · ${sig(L, 2)} L☉ · ${sig(R, 2)} R☉</div>`);
    }
    redraw();
  });
  stage.addEventListener('pointerleave', () => {
    hover = null;
    tip.hide();
    redraw();
  });
  stage.addEventListener('click', (e) => {
    if (!data) return;
    const r = stage.getBoundingClientRect();
    const k = nearest(e.clientX - r.left, e.clientY - r.top);
    sel = k === null ? null : { name: data.name[k], ci: data.ci[k], M: data.M[k] };
    showInfo();
    redraw();
  });

  // ---------------------------------------------------------------- key
  const countLabel = h('p', { class: 'info-sub' });
  const info = h('section', { class: 'panel', 'aria-live': 'polite' });
  page.key.append(
    panel(
      'Layers',
      h(
        'div',
        { class: 'controls' },
        h(
          'div',
          { class: 'chips' },
          toggle('hr-radii', 'Lines of equal radius', true, (v) => { layers.radii = v; redraw(); }),
          toggle('hr-regions', 'Region names', true, (v) => { layers.regions = v; redraw(); }),
          toggle('hr-notable', 'Named stars', true, (v) => { layers.notable = v; redraw(); }),
          toggle('hr-tracks', 'Evolutionary tracks', false, (v) => { layers.tracks = v; redraw(); }),
          toggle('hr-wd', 'White dwarf cooling', false, (v) => { layers.wd = v; redraw(); }),
        ),
        countLabel,
      ),
    ),
    info,
  );
  function showInfo(): void {
    info.replaceChildren();
    if (!sel) {
      info.append(h('h2', null, 'Select a star'), h('p', { class: 'info-sub' }, 'Choose any point to estimate the star’s temperature, luminosity and radius from its position alone.'));
      return;
    }
    const { T, L, R } = starInfo(sel.ci, sel.M);
    info.append(
      h('div', { class: 'swatch-lg', style: { background: `radial-gradient(circle at 30% 50%, ${bvCss(sel.ci)} 0 14px, transparent 15px), var(--space)` } }),
      h('p', { class: 'info-title', style: { marginTop: '12px' } }, sel.name || 'Catalogued star'),
      h(
        'div',
        { class: 'info-body' },
        readout([
          ['Colour index B−V', fixed(sel.ci, 2)],
          ['Absolute magnitude', fixed(sel.M, 2)],
          ['Temperature', `≈ ${fixed(Math.round(T / 10) * 10, 0)} K`],
          ['Luminosity', `≈ ${sig(L, 3)} L☉`],
          ['Radius', `≈ ${sig(R, 3)} R☉`],
          ['Region', regionOf(sel.ci, sel.M, R)],
        ]).el,
        h('p', null, 'Radius follows from L = 4πR²σT⁴. Visual magnitudes miss light outside the V band, so very hot and very cool stars are more luminous than shown.'),
      ),
    );
    if (sel.name) info.append(h('div', { class: 'btn-row', style: { marginTop: '12px' } }, button('Find in the sky', () => goSky(sel!.name))));
  }
  function goSky(name: string): void {
    loadStars().then((s) => {
      const i = s.name.indexOf(name);
      navigate('sky', i >= 0 ? { focus: `star:${i}` } : {});
    });
  }
  showInfo();
  d.add(onThemeChange(redraw));

  page.notes.append(
    note(
      'Reading the diagram',
      `<p>Ejnar Hertzsprung and Henry Norris Russell independently plotted stars this way around 1910. Hot stars sit on the left, cool on the right; luminous at the top, faint at the bottom.</p>
       <p>A star’s position also fixes its size. Two stars of the same temperature radiate the same power per square metre, so a star a hundred times more luminous must have ten times the radius. The dashed diagonals join stars of equal radius.</p>
       <div class="eq">L = 4πR²σT⁴</div>`,
    ),
    note(
      'The main sequence is a mass sequence',
      `<p>Main-sequence stars all fuse hydrogen in their cores. What sets their place on the band is mass: a 10 M☉ star is about 4,000 times as luminous as the Sun and lives a thousand times shorter.</p>
       <div class="eq">L ∝ M<sup>3.5</sup> <small>for 2–55 M☉</small></div>
       <p>Red dwarfs, below 0.5 M☉, are by far the most common stars. Not one is visible to the naked eye; Proxima Centauri, the nearest star, shines at magnitude 11.</p>`,
    ),
    note(
      'Luminosity classes',
      `<p>The Morgan–Keenan system adds a Roman numeral to the spectral type, read from the width of absorption lines (bigger, more tenuous stars have sharper lines):</p>
       <ul><li><strong>Ia, Ib</strong> supergiants · Betelgeuse M1–M2 Ia–ab</li><li><strong>II</strong> bright giants · <strong>III</strong> giants · Arcturus K1.5 III</li><li><strong>IV</strong> subgiants · <strong>V</strong> main sequence · the Sun G2 V</li><li><strong>D</strong> white dwarfs · Sirius B DA2</li></ul>`,
    ),
  );
  return () => d.dispose();
}

function regionOf(ci: number, M: number, R: number): string {
  if (R < 0.05) return 'White dwarf';
  if (R > 100 || M < -5) return 'Supergiant';
  // main sequence approximation: M_V ≈ 1.3 + 5.5 (B−V) for 0 < B−V < 1.5
  const ms = ci < 1.5 ? 1.3 + 5.5 * ci : 9.5 + 3 * (ci - 1.5);
  if (M < ms - 2.2) return R > 8 ? 'Giant' : 'Subgiant';
  return ci > 1.4 ? 'Main sequence (red dwarf)' : 'Main sequence';
}

// On paper, true star colours are too pale to read, so the light theme uses an
// ink ramp from blue (hot) through ochre to red (cool), ordered like the spectral classes.
const INK: [number, [number, number, number]][] = [
  [-0.3, [36, 87, 197]],
  [0.0, [63, 116, 214]],
  [0.3, [95, 120, 160]],
  [0.6, [184, 137, 42]],
  [1.0, [208, 112, 30]],
  [1.5, [194, 64, 31]],
  [2.0, [158, 42, 26]],
];
function bvInk(bv: number, a: number): string {
  let c = INK[INK.length - 1][1];
  if (bv <= INK[0][0]) c = INK[0][1];
  else
    for (let i = 1; i < INK.length; i++)
      if (bv <= INK[i][0]) {
        const t = (bv - INK[i - 1][0]) / (INK[i][0] - INK[i - 1][0]);
        c = INK[i - 1][1].map((v, k) => Math.round(v + (INK[i][1][k] - v) * t)) as [number, number, number];
        break;
      }
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
