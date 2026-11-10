// Plate V — Light and Spectra: blackbody radiation, spectral lines and the Doppler shift.

import { Disposer, h } from '../lib/dom';
import { createSurface, invalidator, logScale, linScale } from '../lib/canvas';
import { Tooltip, drawAxes, logLabel, niceLinearTicks, label } from '../lib/chart';
import { onThemeChange, palette } from '../lib/theme';
import { panel, readout, segmented, select, slider, toggle } from '../lib/ui';
import { fixed, sci, sig } from '../lib/format';
import { blackbodyCss, planck, spectralClass, stefanBoltzmann, wienPeak, wavelengthRGB } from '../physics/blackbody';
import { R_inf } from '../physics/constants';
import { EMISSION, HYDROGEN_SERIES, STELLAR } from '../data/spectra';
import { figure, note, platePage } from './page';
import { PlateContext, plateById } from './registry';

const C_KMS = 299792.458;

export function mount(root: HTMLElement, _ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('light')!, {
    dek: 'Almost everything we know about stars arrives as light. Its spectrum gives a star’s temperature, its composition and its motion toward or away from us. Start with the blackbody curve that a hot object emits, then read the lines written across it.',
    caption:
      '<b>Fig. V.1.</b> Planck spectral radiance B<sub>λ</sub>(T) against wavelength on a logarithmic axis. The rainbow band marks the range the eye sees, 380–750 nm. The swatch shows the colour of a blackbody at that temperature, computed through the CIE 1931 colour-matching functions. Hover the chart to read values.',
    chart: true,
    stageLabel: 'Blackbody spectrum chart',
  });
  root.append(page.root);

  // ---------------------------------------------------------------- Fig V.1 Planck
  let T = 5772;
  let logY = false;
  const refs = [
    { name: 'Sun', T: 5772, on: true },
    { name: 'Betelgeuse', T: 3600, on: true },
    { name: 'Rigel', T: 12100, on: false },
  ];
  const stage = page.stage;
  const hud = h('div', { class: 'controls' });
  const tip = new Tooltip(stage);
  let hoverNm: number | null = null;
  const surf = createSurface(stage, d, () => redraw());
  const redraw = invalidator(drawPlanck);

  function drawPlanck(): void {
    const { ctx, width: W, height: H } = surf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
        const box = { x: 70, y: 34, w: W - 70 - 24, h: H - 34 - 72 };
    const x = logScale(100, 5000, box.x, box.x + box.w);
    const curves = [{ name: 'Selected', T, color: pal.accent, main: true }, ...refs.map((r, i) => ({ ...r, i })).filter((r) => r.on && Math.abs(r.T - T) / T > 0.01).map((r) => ({ name: r.name, T: r.T, color: pal.series[r.i], main: false }))];
    // y scale: per-nm radiance in kW·sr⁻¹·m⁻²·nm⁻¹
    const B = (nm: number, t: number) => planck(nm * 1e-9, t) * 1e-12;
    let ymax = 0;
    for (const c of curves) ymax = Math.max(ymax, B(Math.min(5000, Math.max(100, wienPeak(c.T) * 1e9)), c.T));
    ymax *= 1.1;
    const ymin = logY ? ymax / 1e6 : 0;
    const y = logY ? logScale(ymin, ymax, box.y + box.h, box.y) : linScale(0, ymax, box.y + box.h, box.y);
    // visible band tint
    const x0 = x(380), x1 = x(750);
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    for (let nm = 380; nm <= 750; nm += 10) {
      const [r, g, b] = wavelengthRGB(nm);
      grad.addColorStop((nm - 380) / 370, `rgba(${r},${g},${b},${pal.light ? 0.13 : 0.1})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x0, box.y, x1 - x0, box.h);
    const strip = ctx.createLinearGradient(x0, 0, x1, 0);
    for (let nm = 380; nm <= 750; nm += 10) {
      const [r, g, b] = wavelengthRGB(nm);
      strip.addColorStop((nm - 380) / 370, `rgb(${r},${g},${b})`);
    }
    ctx.fillStyle = strip;
    ctx.fillRect(x0, box.y + box.h - 6, x1 - x0, 6);
    const yt = logY ? Array.from({ length: 7 }, (_, i) => ymax / 10 ** i).map((v) => 10 ** Math.round(Math.log10(v))) : niceLinearTicks(0, ymax, 5);
    drawAxes(
      ctx,
      box,
      pal,
      { ticks: [100, 200, 300, 500, 700, 1000, 2000, 3000, 5000], scale: x, label: (v) => (v >= 1000 ? `${v / 1000} µm` : `${v}`), title: 'Wavelength (nm)' },
      { ticks: yt, scale: y, label: (v) => (logY ? logLabel(v) : sig(v, 2)), title: 'Spectral radiance (kW · sr⁻¹ · m⁻² · nm⁻¹)' },
    );
    // region names
    label(ctx, 'ULTRAVIOLET', x(190), box.y + 14, pal, { align: 'center', color: pal.muted, font: `10px ${pal.fontMono}` });
    label(ctx, 'VISIBLE', (x0 + x1) / 2, box.y + 14, pal, { align: 'center', color: pal.muted, font: `10px ${pal.fontMono}` });
    label(ctx, 'INFRARED', x(2200), box.y + 14, pal, { align: 'center', color: pal.muted, font: `10px ${pal.fontMono}` });
    // curves (references first, selected on top)
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    for (const c of [...curves].reverse()) {
      ctx.beginPath();
      let first = true;
      for (let px = box.x; px <= box.x + box.w; px += 2) {
        const nm = x.invert(px);
        const v = Math.max(ymin, B(nm, c.T));
        const py = y(v);
        if (first) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        first = false;
      }
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c.color;
      ctx.stroke();
      if (c.main) {
        ctx.lineTo(box.x + box.w, box.y + box.h);
        ctx.lineTo(box.x, box.y + box.h);
        ctx.closePath();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = c.color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    // peak markers and direct labels
    for (const c of curves) {
      const pk = wienPeak(c.T) * 1e9;
      if (pk < 100 || pk > 5000) continue;
      const px = x(pk);
      const py = y(B(pk, c.T));
      if (c.main) {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = pal.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, box.y + box.h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pal.surface2;
      ctx.stroke();
      label(ctx, `${c.main ? '' : c.name + ' · '}${fixed(c.T, 0)} K`, px + 8, py - 10, pal, { color: pal.fg, font: `${c.main ? 600 : 400} 12px ${pal.fontBody}`, halo: pal.surface2 });
    }
    // hover crosshair
    if (hoverNm !== null) {
      const px = x(hoverNm);
      ctx.strokeStyle = pal.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, box.y);
      ctx.lineTo(px, box.y + box.h);
      ctx.stroke();
      for (const c of curves) {
        const v = B(hoverNm, c.T);
        if (v < ymin) continue;
        ctx.beginPath();
        ctx.arc(px, y(v), 4, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();
      }
    }
    paintHud();
    (stage as unknown as { _box: typeof box; _x: typeof x })._box = box;
    (stage as unknown as { _x: typeof x })._x = x;
  }

  function paintHud(): void {
    const pk = wienPeak(T) * 1e9;
    hud.innerHTML = `<div class="swatch-lg" style="background:radial-gradient(circle at 50% 50%, ${blackbodyCss(T)} 0 22px, ${blackbodyCss(T, 0.25)} 34px, var(--space) 60px)"></div>
      <dl class="readout"><dt>Temperature</dt><dd>${fixed(T, 0)} K</dd><dt>Peak (Wien)</dt><dd>${pk >= 1000 ? fixed(pk / 1000, 2) + ' µm' : fixed(pk, 0) + ' nm'}</dd><dt>Flux σT⁴</dt><dd>${sci(stefanBoltzmann(T), 3)} W/m²</dd><dt>Spectral class</dt><dd>${spectralClass(T)}</dd></dl>`;
  }

  stage.addEventListener('pointermove', (e) => {
    const box = (stage as unknown as { _box?: { x: number; y: number; w: number; h: number } })._box;
    const x = (stage as unknown as { _x?: ReturnType<typeof logScale> })._x;
    if (!box || !x) return;
    const r = stage.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) {
      hoverNm = null;
      tip.hide();
      redraw();
      return;
    }
    hoverNm = x.invert(px);
    const pal = palette();
    const rows = [{ name: 'Selected', T }, ...refs.filter((q) => q.on)]
      .map((c, i) => `<div><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${i ? pal.series[i - 1] : pal.accent};margin-right:6px"></i>${c.name === 'Selected' ? fixed(T, 0) + ' K' : c.name} <span class="mono">${sig(planck(hoverNm! * 1e-9, c.T) * 1e-12, 3)}</span></div>`)
      .join('');
    tip.show(px, py, `<b>${hoverNm >= 1000 ? fixed(hoverNm / 1000, 2) + ' µm' : fixed(hoverNm, 0) + ' nm'}</b>${rows}`);
    redraw();
  });
  stage.addEventListener('pointerleave', () => {
    hoverNm = null;
    tip.hide();
    redraw();
  });

  const tSlider = slider({ id: 'light-T', label: 'Temperature', min: 1000, max: 40000, value: T, log: true, format: (v) => `${fixed(v, 0)} K`, onInput: (v) => { T = v; redraw(); } });
  const presets: [string, number][] = [
    ['Tungsten bulb', 2700],
    ['Proxima Cen', 3042],
    ['Sun', 5772],
    ['Sirius', 9940],
    ['Rigel', 12100],
    ['Spica', 22400],
    ['O star', 40000],
  ];
  page.key.append(
    panel(
      'Blackbody',
      h(
        'div',
        { class: 'controls' },
        hud,
        tSlider.el,
        h('div', { class: 'btn-row' }, presets.map(([n, t]) => h('button', { type: 'button', class: 'btn', onclick: () => { T = t; tSlider.set(t); redraw(); } }, n))),
        segmented({ label: 'Intensity axis', options: [{ value: 'lin', label: 'Linear' }, { value: 'log', label: 'Logarithmic' }], value: 'lin', onChange: (v) => { logY = v === 'log'; redraw(); } }).el,
        h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Compare with'), h('div', { class: 'chips' }, refs.map((r, i) => toggle(`light-ref-${i}`, `${r.name} · ${fixed(r.T, 0)} K`, r.on, (on) => { r.on = on; redraw(); }, `var(--series-${i + 1})`)))),
      ),
    ),
  );
  d.add(onThemeChange(redraw));

  // ---------------------------------------------------------------- Fig V.2 spectra and redshift
  const specStage = h('div', { class: 'stage stage--chart', style: { height: '340px' }, role: 'img', 'aria-label': 'Spectrum strips at rest and shifted' });
  let specMode: 'star' | 'element' = 'star';
  let starIdx = 4; // G
  let element = 'H';
  let velocity = 0; // km/s, positive = receding
  const specSurf = createSurface(specStage, d, () => specRedraw());
  const specRedraw = invalidator(drawSpectra);
  const zOf = (v: number) => Math.sqrt((1 + v / C_KMS) / (1 - v / C_KMS)) - 1;

  function drawSpectra(): void {
    const { ctx, width: W, height: H } = specSurf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const pad = 28;
    const x = linScale(370, 760, pad, W - pad);
    const z = zOf(velocity);
    const stripH = Math.min(90, (H - 120) / 2);
    const drawStrip = (y0: number, shift: number, title: string) => {
      // continuum
      for (let px = Math.floor(x(380)); px <= x(750); px++) {
        const nm = x.invert(px);
        const [r, g, b] = wavelengthRGB(nm);
        let k = 1;
        if (specMode === 'star') {
          const s = STELLAR[starIdx];
          const rest = nm / (1 + shift);
          const bb = planck(rest * 1e-9, s.T) / planck(Math.min(750, Math.max(380, wienPeak(s.T) * 1e9)) * 1e-9, s.T);
          k = Math.min(1, 0.25 + 0.85 * bb);
          for (const ln of s.lines) {
            const dl = Math.abs(rest - ln.nm);
            k *= 1 - ln.strength * 0.9 * Math.exp(-((dl / (ln.strength > 0.8 ? 1.4 : 0.8)) ** 2));
          }
          for (const bd of s.bands ?? []) if (rest > bd.from && rest < bd.to) k *= 1 - bd.depth * (1 - (rest - bd.from) / (bd.to - bd.from)) ** 0.5;
          ctx.fillStyle = `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
        } else {
          ctx.fillStyle = '#05060a';
        }
        ctx.fillRect(px, y0, 1.5, stripH);
      }
      if (specMode === 'element') {
        for (const ln of EMISSION[element].lines) {
          const obs = ln.nm * (1 + shift);
          if (obs < 380 || obs > 750) continue;
          const [r, g, b] = wavelengthRGB(obs);
          const px = x(obs);
          const glow = ctx.createLinearGradient(px - 4, 0, px + 4, 0);
          glow.addColorStop(0, `rgba(${r},${g},${b},0)`);
          glow.addColorStop(0.5, `rgba(${r},${g},${b},${0.35 + 0.65 * ln.strength})`);
          glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = glow;
          ctx.fillRect(px - 4, y0, 8, stripH);
          ctx.fillStyle = `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)},${0.6 + 0.4 * ln.strength})`;
          ctx.fillRect(px - 0.75, y0, 1.5, stripH);
        }
      }
      ctx.strokeStyle = pal.axis;
      ctx.strokeRect(x(380) + 0.5, y0 + 0.5, x(750) - x(380), stripH);
      label(ctx, title, pad, y0 - 12, pal, { color: pal.fg2, font: `500 12px ${pal.fontBody}` });
    };
    const y1 = 34;
    const y2 = y1 + stripH + 60;
    drawStrip(y1, 0, 'At rest (laboratory)');
    drawStrip(y2, z, velocity === 0 ? 'Observed' : `Observed · ${velocity > 0 ? 'receding' : 'approaching'} at ${fixed(Math.abs(velocity), 0)} km/s · z = ${fixed(z, 4)}`);
    // line identifications and shift connectors
    const lines = specMode === 'star' ? STELLAR[starIdx].lines.filter((l) => l.label) : EMISSION[element].lines.filter((l) => l.label);
    ctx.font = `11px ${pal.fontMono}`;
    ctx.textAlign = 'center';
    for (const ln of lines) {
      const a = x(ln.nm);
      const b = x(ln.nm * (1 + z));
      if (ln.nm < 380 || ln.nm > 750) continue;
      ctx.fillStyle = pal.fg2;
      ctx.fillText(ln.label!, a, y1 + stripH + 14);
      if (b >= x(380) && b <= x(750)) {
        ctx.strokeStyle = pal.axis;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(a, y1 + stripH + 20);
        ctx.lineTo(b, y2 - 4);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.textAlign = 'left';
    // wavelength axis
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'center';
    for (let nm = 400; nm <= 750; nm += 50) ctx.fillText(`${nm}`, x(nm), y2 + stripH + 16);
    ctx.fillText('nm', x(760) - 6, y2 + stripH + 16);
    ctx.textAlign = 'left';
    specInfo.update([
      ['Velocity', `${fixed(velocity, 0)} km/s`],
      ['Redshift z (relativistic)', fixed(z, 4)],
      ['Hα observed at', `${fixed(656.28 * (1 + z), 2)} nm`],
      ['Hubble distance for this z', velocity > 0 ? `${fixed(velocity / 70, 1)} Mpc (if cosmological)` : '—'],
    ]);
  }
  const specInfo = readout([]);
  const specNote = h('p', { class: 'info-sub' });
  const setSpecNote = () => {
    specNote.textContent = specMode === 'star' ? `Class ${STELLAR[starIdx].cls} · about ${fixed(STELLAR[starIdx].T, 0)} K · e.g. ${STELLAR[starIdx].example}` : EMISSION[element].note;
  };
  setSpecNote();
  const starSel = select('light-star', 'Stellar class', STELLAR.map((s, i) => ({ value: String(i), label: `${s.cls} · ${fixed(s.T, 0)} K · ${s.example}` })), String(starIdx), (v) => { starIdx = Number(v); setSpecNote(); specRedraw(); });
  const elSel = select('light-element', 'Element', Object.entries(EMISSION).map(([k, e]) => ({ value: k, label: e.name })), element, (v) => { element = v; setSpecNote(); specRedraw(); });
  elSel.el.hidden = true;
  const vSlider = slider({ id: 'light-v', label: 'Line-of-sight velocity', min: -60000, max: 120000, step: 100, value: 0, format: (v) => `${fixed(v, 0)} km/s`, onInput: (v) => { velocity = v; specRedraw(); } });
  const specKey = h(
    'div',
    { class: 'key' },
    panel(
      'Spectrum',
      h(
        'div',
        { class: 'controls' },
        segmented({ label: 'Source', options: [{ value: 'star', label: 'Star (absorption)' }, { value: 'element', label: 'Gas (emission)' }], value: 'star', onChange: (v) => { specMode = v as 'star' | 'element'; starSel.el.hidden = specMode !== 'star'; elSel.el.hidden = specMode !== 'element'; setSpecNote(); specRedraw(); } }).el,
        starSel.el,
        elSel.el,
        specNote,
        vSlider.el,
        h('div', { class: 'btn-row' }, ...[['At rest', 0], ['Andromeda (−300)', -300], ['Virgo cluster (+1,100)', 1100], ['3C 273 (z = 0.158)', 43800]].map(([n, v]) => h('button', { type: 'button', class: 'btn', onclick: () => { velocity = v as number; vSlider.set(velocity); specRedraw(); } }, n as string))),
        specInfo.el,
      ),
    ),
  );
  page.notes.before(
    figure(
      'Fig. V.2 · Fingerprints and the Doppler shift',
      specStage,
      '<b>Fig. V.2.</b> Top: a spectrum at rest. Bottom: the same light from a source moving along the line of sight, using the relativistic Doppler formula 1 + z = √((1 + v/c)/(1 − v/c)). Receding sources shift to the red, approaching ones to the blue. Absorption strengths are schematic.',
      specKey,
    ),
  );

  // ---------------------------------------------------------------- Fig V.3 hydrogen atom
  const hStage = h('div', { class: 'stage stage--chart', style: { height: '440px' }, role: 'img', 'aria-label': 'Hydrogen energy level diagram' });
  let nUp = 3;
  let nLo = 2;
  const hSurf = createSurface(hStage, d, () => hRedraw());
  const hRedraw = invalidator(drawHydrogen);
  const hInfo = readout([]);
  function drawHydrogen(): void {
    const { ctx, width: W, height: H } = hSurf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const top = 30, bot = H - 30;
    const E = (n: number) => -13.6057 / (n * n);
    // Square-root energy axis so the crowded upper levels stay legible.
    const yl = linScale(-Math.sqrt(14.2), 0.25, bot, top);
    const y = (e: number) => yl(-Math.sqrt(-Math.min(0, e)));
    const x0 = 90, x1 = W - 30;
    ctx.font = `11px ${pal.fontMono}`;
    for (let n = 1; n <= 7; n++) {
      const yy = y(E(n));
      ctx.strokeStyle = n === nUp || n === nLo ? pal.fg : pal.axis;
      ctx.lineWidth = n === nUp || n === nLo ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      ctx.lineTo(x1, yy);
      ctx.stroke();
      if (n <= 4 || n === 7) {
        ctx.fillStyle = pal.muted;
        ctx.textAlign = 'right';
        ctx.fillText(`n = ${n}`, x0 - 10, yy - (n > 4 ? 6 : 0));
        ctx.fillText(`${fixed(E(n), 2)} eV`, x0 - 10, yy + 12);
      }
    }
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = pal.axis;
    ctx.beginPath();
    ctx.moveTo(x0, y(0));
    ctx.lineTo(x1, y(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pal.muted;
    ctx.fillText('n = ∞ (ionised)', x0 - 10, y(0) - 8);
    ctx.textAlign = 'left';
    // all transitions down to nLo, faint; selected one bold
    const series = [1, 2, 3];
    series.forEach((lo, si) => {
      const xs = x0 + 40 + si * ((x1 - x0 - 80) / 3);
      label(ctx, HYDROGEN_SERIES[lo].split(' ')[0], xs, top - 12, pal, { color: pal.fg2, font: `500 12px ${pal.fontBody}` });
      for (let up = lo + 1; up <= 7; up++) {
        const xx = xs + (up - lo - 1) * 14;
        const lam = 1e9 / (R_inf * (1 / lo ** 2 - 1 / up ** 2));
        const sel = up === nUp && lo === nLo;
        const [r, g, b] = lam >= 380 && lam <= 750 ? wavelengthRGB(lam) : [0, 0, 0];
        ctx.strokeStyle = sel ? (lam >= 380 && lam <= 750 ? `rgb(${r},${g},${b})` : pal.accent) : pal.grid;
        ctx.lineWidth = sel ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(xx, y(E(up)));
        ctx.lineTo(xx, y(E(lo)) - 6);
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(xx - 4, y(E(lo)) - 8);
        ctx.lineTo(xx + 4, y(E(lo)) - 8);
        ctx.lineTo(xx, y(E(lo)) - 1);
        ctx.fill();
      }
    });
    const lam = 1e9 / (R_inf * (1 / nLo ** 2 - 1 / nUp ** 2));
    const dE = E(nUp) - E(nLo);
    hInfo.update([
      ['Transition', `n = ${nUp} → ${nLo}`],
      ['Series', HYDROGEN_SERIES[nLo] ?? '—'],
      ['Photon energy', `${fixed(dE, 3)} eV`],
      ['Wavelength (vacuum)', lam >= 1000 ? `${fixed(lam / 1000, 3)} µm` : `${fixed(lam, 2)} nm`],
      ['Frequency', `${sci(299792458 / (lam * 1e-9), 4)} Hz`],
    ]);
    swatch.style.background = lam >= 380 && lam <= 750 ? `rgb(${wavelengthRGB(lam).join(',')})` : 'transparent';
    swatch.textContent = lam >= 380 && lam <= 750 ? '' : lam < 380 ? 'Ultraviolet: invisible to the eye' : 'Infrared: invisible to the eye';
  }
  const swatch = h('div', { class: 'swatch-lg', style: { display: 'grid', placeItems: 'center', fontSize: '0.8125rem', color: 'var(--muted)' } });
  const upSel = select('light-nup', 'Upper level', [2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: `n = ${n}` })), String(nUp), (v) => { nUp = Number(v); if (nLo >= nUp) { nLo = nUp - 1; loSel.input.value = String(nLo); } hRedraw(); });
  const loSel = select('light-nlo', 'Lower level', [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `n = ${n}` })), String(nLo), (v) => { nLo = Number(v); if (nUp <= nLo) { nUp = nLo + 1; upSel.input.value = String(nUp); } hRedraw(); });
  page.notes.before(
    figure(
      'Fig. V.3 · Why hydrogen glows red',
      hStage,
      '<b>Fig. V.3.</b> Energy levels of the hydrogen atom, Eₙ = −13.6 eV / n², on a square-root energy axis. An electron falling between levels emits one photon carrying the energy difference, at a wavelength given by the Rydberg formula 1/λ = R∞(1/n₁² − 1/n₂²). Only the Balmer series, ending on n = 2, falls in visible light.',
      h('div', { class: 'key' }, panel('Transition', h('div', { class: 'controls' }, upSel.el, loSel.el, swatch, hInfo.el))),
    ),
  );
  d.add(onThemeChange(() => { specRedraw(); hRedraw(); }));

  // ---------------------------------------------------------------- commentary
  page.notes.append(
    note(
      'Three laws of thermal radiation',
      `<p>A dense, hot object glows with a continuous spectrum fixed by its temperature alone. Planck derived its shape in 1900 by assuming energy comes in quanta, the birth of quantum theory.</p>
       <div class="eq">B<sub>λ</sub>(T) = (2hc²/λ⁵) · 1 / (e<sup>hc/λk<sub>B</sub>T</sup> − 1)</div>
       <p>Two consequences follow. <strong>Wien’s law</strong>: the peak moves to shorter wavelengths as temperature rises, λ<sub>max</sub> = 2.898 mm·K / T. <strong>Stefan–Boltzmann</strong>: the total output per square metre climbs as T⁴, so doubling the temperature gives sixteen times the power.</p>`,
    ),
    note(
      'Kirchhoff’s rules for lines',
      `<ol><li>A hot dense body gives a continuous spectrum.</li><li>A hot thin gas gives bright <strong>emission lines</strong> at wavelengths unique to each element.</li><li>A cooler thin gas in front of a hotter continuum gives dark <strong>absorption lines</strong> at those same wavelengths.</li></ol>
       <p>Stars are case 3: their cooler outer layers print the fingerprints of their atoms across the continuum. Fraunhofer catalogued 574 dark lines in sunlight in 1814; the letters he gave them, such as the D lines of sodium, are still used.</p>`,
    ),
    note(
      'Measuring motion with light',
      `<p>Motion along the line of sight stretches or compresses light waves. For speeds much less than light, the shift is simply</p>
       <div class="eq">z = Δλ / λ ≈ v / c</div>
       <p>This one effect finds exoplanets (stars wobbling by metres per second), weighs galaxies (rotation curves), and revealed the expanding Universe: in 1929 Hubble found that galaxy redshifts grow in proportion to distance.</p>`,
    ),
  );

  return () => d.dispose();
}
