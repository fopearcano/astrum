// Plate VII — The Lives of Stars: a star's life by initial mass, phase by phase.

import { Disposer, h, prefersReducedMotion } from '../lib/dom';
import { animate, createSurface, invalidator, logScale } from '../lib/canvas';
import { label } from '../lib/chart';
import { onThemeChange, palette } from '../lib/theme';
import { icons, panel, readout, slider } from '../lib/ui';
import { duration, fixed, sig, temperature } from '../lib/format';
import { blackbodyCss } from '../physics/blackbody';
import { lifeTrack, mainSequenceLifetime, Phase, stellarFate } from '../physics/stellar';
import { note, platePage, figure } from './page';
import { PlateContext, plateById } from './registry';

interface Shell {
  name: string;
  r: number; // fraction of drawn core radius
  color: string;
  burning?: boolean;
}

function shellsFor(phase: string, M: number): Shell[] {
  const env = { name: M < 0.5 ? 'Convective envelope (H)' : 'Hydrogen envelope', r: 1, color: '#e9b36a' };
  switch (phase) {
    case 'Protostar':
      return [{ name: 'Contracting gas, no hydrogen fusion yet', r: 1, color: '#b0704a' }];
    case 'Main sequence':
      return [env, { name: 'Core: H → He', r: 0.28, color: '#f5d77a', burning: true }];
    case 'Blue dwarf':
      return [env, { name: 'Core: H → He (fully mixed)', r: 0.6, color: '#f5d77a', burning: true }];
    case 'Subgiant':
      return [env, { name: 'Shell: H → He', r: 0.3, color: '#f5d77a', burning: true }, { name: 'Inert helium core', r: 0.2, color: '#c9c3b8' }];
    case 'Red giant':
      return [env, { name: 'Shell: H → He', r: 0.2, color: '#f5d77a', burning: true }, { name: M < 2 ? 'Degenerate helium core' : 'Helium core', r: 0.14, color: '#c9c3b8' }];
    case 'Horizontal branch':
    case 'Core helium burning':
    case 'Blue supergiant':
      return [env, { name: 'Shell: H → He', r: 0.3, color: '#f5d77a', burning: true }, { name: 'Core: He → C, O', r: 0.18, color: '#f08a4b', burning: true }];
    case 'Asymptotic giant branch':
    case 'Red supergiant':
    case 'Wolf–Rayet / blue supergiant':
      return M < 8
        ? [env, { name: 'Shell: H → He', r: 0.26, color: '#f5d77a', burning: true }, { name: 'Shell: He → C, O', r: 0.18, color: '#f08a4b', burning: true }, { name: 'Degenerate C/O core', r: 0.12, color: '#9aa3b3' }]
        : [env, { name: 'Shell: H → He', r: 0.36, color: '#f5d77a', burning: true }, { name: 'Shell: He → C, O', r: 0.26, color: '#f08a4b', burning: true }, { name: 'Core: C → Ne, Mg', r: 0.16, color: '#d9534f', burning: true }];
    case 'Silicon burning':
      return [
        { name: 'H envelope', r: 1, color: '#e9b36a' },
        { name: 'H → He', r: 0.52, color: '#f5d77a', burning: true },
        { name: 'He → C, O', r: 0.42, color: '#f08a4b', burning: true },
        { name: 'C → Ne, Mg', r: 0.33, color: '#d9534f', burning: true },
        { name: 'Ne → O, Mg', r: 0.25, color: '#b8457a', burning: true },
        { name: 'O → Si, S', r: 0.18, color: '#7e57c2', burning: true },
        { name: 'Si → Fe, Ni', r: 0.11, color: '#4f7fd9', burning: true },
        { name: 'Iron core (inert)', r: 0.06, color: '#6c7380' },
      ];
    case 'Planetary nebula':
      return [{ name: 'Ejected envelope', r: 1, color: '#4fb3a9' }, { name: 'Hot C/O core', r: 0.12, color: '#dfe8ff' }];
    default:
      if (phase.includes('white dwarf')) return [{ name: phase.startsWith('Helium') ? 'Degenerate helium' : M < 6.5 ? 'Degenerate carbon and oxygen' : 'Degenerate oxygen and neon', r: 1, color: '#c9d4ea' }];
      if (phase.includes('Neutron')) return [{ name: 'Neutron-degenerate matter', r: 1, color: '#9fb8f0' }];
      return [];
  }
}

export function mount(root: HTMLElement, _ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('stellar-evolution')!, {
    dek: 'A star’s mass at birth decides almost everything that follows: how bright it shines, how long it lives, which elements it forges, and whether it ends as a white dwarf, a neutron star or a black hole. Choose a mass and scrub through a life.',
    caption:
      '<b>Fig. VII.1.</b> A schematic life for a single, non-rotating star of solar composition. Sizes are drawn on a logarithmic scale with the Sun’s radius dashed for reference; colour follows surface temperature. The cutaway shows which nuclear reactions run in the core and shells. Phase durations and properties use textbook scaling laws and are good to a factor of about two.',
    stageLabel: 'Animated stellar life cycle',
  });
  root.append(page.root);
  const stage = page.stage;

  let M = 1;
  let phases: Phase[] = lifeTrack(M);
  let u = 0.15; // scrubber position 0..1 across phases
  let playing = false;
  const reduced = prefersReducedMotion();
  let tAnim = 0;

  const surf = createSurface(stage, d, () => redraw());
  const redraw = invalidator(draw);

  // segment widths: logarithmic in duration so brief phases stay visible
  const widths = () => phases.map((p) => Math.max(0.6, Math.log10(p.years + 10)));
  function locate(): { i: number; f: number; age: number } {
    const w = widths();
    const total = w.reduce((a, b) => a + b, 0);
    let acc = 0;
    let age = 0;
    for (let i = 0; i < phases.length; i++) {
      const s = w[i] / total;
      if (u <= acc + s || i === phases.length - 1) {
        const f = Math.min(1, Math.max(0, (u - acc) / s));
        return { i, f, age: age + f * phases[i].years };
      }
      acc += s;
      age += phases[i].years;
    }
    return { i: 0, f: 0, age: 0 };
  }

  function interp(): Phase & { i: number; f: number; age: number } {
    const { i, f, age } = locate();
    const p = phases[i];
    const q = phases[i + 1];
    // ease properties toward the next phase in the last 30 % of a phase
    const k = q && !isEnd(q) && !isEnd(p) ? Math.max(0, (f - 0.7) / 0.3) : 0;
    const lerpLog = (a: number, b: number) => (a > 0 && b > 0 ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * k) : a);
    return { ...p, T: lerpLog(p.T, q?.T ?? p.T), R: lerpLog(p.R, q?.R ?? p.R), L: lerpLog(p.L, q?.L ?? p.L), i, f, age };
  }
  const isEnd = (p: Phase) => /supernova|white dwarf|Neutron|black hole|No remnant|Planetary/i.test(p.name);

  function draw(): void {
    const { ctx, width: W, height: H } = surf;
    const pal = palette();
    ctx.fillStyle = pal.space;
    ctx.fillRect(0, 0, W, H);
    const st = interp();
    const narrow = W < 720;
    const timelineH = 86;
    const cx = narrow ? W / 2 : W * 0.4;
    const cy = (H - timelineH) / 2 + 6;
    const rmax = Math.min(narrow ? W * 0.42 : W * 0.32, (H - timelineH) * 0.42);
    const rOf = (R: number) => 3 + ((Math.log10(Math.max(R, 1e-5)) + 5) / 8.6) * (rmax - 3);
    const name = st.name;
    const r = rOf(st.R);

    // reference: the Sun's radius
    ctx.strokeStyle = 'rgba(232,230,223,0.35)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rOf(1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'Sun’s radius', cx + rOf(1) * 0.72, cy - rOf(1) * 0.72 - 8, pal, { color: pal.onSpace2, font: `11px ${pal.fontMono}` });

    if (/supernova/i.test(name)) {
      const pulse = 0.85 + 0.15 * Math.sin(tAnim * 6);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rmax * 1.1 * pulse);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.15, 'rgba(255,240,200,0.95)');
      g.addColorStop(0.45, 'rgba(255,150,80,0.45)');
      g.addColorStop(1, 'rgba(120,60,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H - timelineH);
    } else if (name === 'Planetary nebula') {
      const R0 = rmax * 0.75;
      const g = ctx.createRadialGradient(cx, cy, R0 * 0.45, cx, cy, R0);
      g.addColorStop(0, 'rgba(79,179,169,0)');
      g.addColorStop(0.55, 'rgba(79,179,169,0.55)');
      g.addColorStop(0.8, 'rgba(217,90,110,0.45)');
      g.addColorStop(1, 'rgba(217,90,110,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R0, R0 * 0.8, 0.4, 0, Math.PI * 2);
      ctx.fill();
      glowDot(ctx, cx, cy, 5, '#e6eeff');
    } else if (st.T === 0) {
      // black hole: dark shadow with a bright photon ring
      const rr = Math.max(10, r * 3);
      const g = ctx.createRadialGradient(cx, cy, rr, cx, cy, rr * 2.4);
      g.addColorStop(0, 'rgba(255,170,90,0.9)');
      g.addColorStop(0.12, 'rgba(255,140,60,0.35)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rr * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
    } else if (name.includes('Neutron')) {
      const a = tAnim * 3;
      ctx.strokeStyle = 'rgba(160,190,255,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * rmax, cy - Math.sin(a) * rmax * 0.4);
      ctx.lineTo(cx + Math.cos(a) * rmax, cy + Math.sin(a) * rmax * 0.4);
      ctx.stroke();
      glowDot(ctx, cx, cy, 5, '#dfe8ff');
    } else {
      // the star: limb-darkened disc with a soft corona
      const col = blackbodyCss(st.T);
      const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.6 + 8);
      halo.addColorStop(0, blackbodyCss(st.T, 0.35));
      halo.addColorStop(1, blackbodyCss(st.T, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.6 + 8, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.15, 0, cx, cy, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, col);
      g.addColorStop(1, blackbodyCss(st.T * 0.75));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, r), 0, Math.PI * 2);
      ctx.fill();
      // cutaway quadrant showing the shells
      const shells = shellsFor(name, M);
      if (r > 30 && shells.length > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, -Math.PI / 2, 0);
        ctx.closePath();
        ctx.clip();
        for (const sh of shells) {
          ctx.fillStyle = sh.color;
          ctx.beginPath();
          ctx.arc(cx, cy, r * sh.r, 0, Math.PI * 2);
          ctx.fill();
          if (sh.burning) {
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.arc(cx, cy, r * sh.r, -Math.PI / 2, 0);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        ctx.restore();
      }
    }
    // shell legend
    const shells = shellsFor(name, M);
    if (shells.length) {
      const lx = narrow ? 14 : W * 0.72;
      let ly = narrow ? 18 : cy - shells.length * 11;
      if (!narrow) label(ctx, st.T > 0 && !/supernova/i.test(name) ? 'Inside, from the surface in' : 'Composition', lx, ly - 18, pal, { color: pal.onSpace2, font: `11px ${pal.fontMono}` });
      for (const sh of shells) {
        ctx.fillStyle = sh.color;
        ctx.fillRect(lx, ly - 5, 10, 10);
        label(ctx, sh.name + (sh.burning ? '  ·  burning' : ''), lx + 16, ly, pal, { color: pal.onSpace, font: `12px ${pal.fontBody}` });
        ly += 22;
      }
    }
    // phase title
    label(ctx, name, narrow ? W / 2 : cx, H - timelineH - 22, pal, { align: 'center', color: pal.onSpace, font: `italic 500 ${narrow ? 20 : 26}px ${pal.fontDisplay}` });

    // timeline
    const w = widths();
    const total = w.reduce((a, b) => a + b, 0);
    const tx0 = 16, tx1 = W - 16, ty = H - timelineH + 16;
    let acc = 0;
    phases.forEach((p, i) => {
      const x0 = tx0 + (acc / total) * (tx1 - tx0);
      acc += w[i];
      const x1 = tx0 + (acc / total) * (tx1 - tx0);
      ctx.fillStyle = p.T > 0 ? blackbodyCss(Math.min(p.T, 40000), i === st.i ? 0.95 : 0.4) : 'rgba(120,120,130,0.5)';
      ctx.fillRect(x0 + 1, ty, x1 - x0 - 2, 14);
      if (x1 - x0 > 70) {
        label(ctx, p.name.length > 22 ? p.name.slice(0, 20) + '…' : p.name, x0 + 3, ty + 28, pal, { color: i === st.i ? pal.onSpace : pal.onSpace2, font: `11px ${pal.fontBody}` });
        label(ctx, duration(p.years), x0 + 3, ty + 44, pal, { color: pal.onSpace2, font: `10px ${pal.fontMono}` });
      }
    });
    const px = tx0 + u * (tx1 - tx0);
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(px, ty - 2);
    ctx.lineTo(px - 6, ty - 10);
    ctx.lineTo(px + 6, ty - 10);
    ctx.fill();
    ctx.fillRect(px - 1, ty - 2, 2, 18);
    updateInfo(st);
  }

  function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
    g.addColorStop(0, color);
    g.addColorStop(0.25, 'rgba(200,215,255,0.45)');
    g.addColorStop(1, 'rgba(200,215,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------- key
  const massSlider = slider({ id: 'se-mass', label: 'Initial mass', min: 0.1, max: 60, value: M, log: true, format: (v) => `${sig(v, 2)} M☉`, onInput: (v) => setMass(v) });
  const ageSlider = slider({ id: 'se-age', label: 'Through its life', min: 0, max: 1, step: 0.001, value: u, format: () => '', onInput: (v) => { u = v; redraw(); } });
  const playBtn = h('button', { type: 'button', class: 'btn', id: 'se-play', html: `${icons.play}<span>Play its life</span>` });
  playBtn.addEventListener('click', () => {
    playing = !playing;
    if (playing && u >= 0.999) u = 0;
    playBtn.innerHTML = playing ? `${icons.pause}<span>Pause</span>` : `${icons.play}<span>Play its life</span>`;
  });
  const presets: [string, number][] = [
    ['Proxima Centauri', 0.12],
    ['The Sun', 1],
    ['Sirius A', 2.06],
    ['Spica A', 11.4],
    ['Betelgeuse', 18],
    ['Zeta Puppis', 50],
  ];
  const facts = readout([]);
  const phaseRead = readout([]);
  const phaseNote = h('p');
  page.key.append(
    panel('Star', h('div', { class: 'controls' }, massSlider.el, h('div', { class: 'btn-row' }, presets.map(([n, m]) => h('button', { type: 'button', class: 'btn', onclick: () => { massSlider.set(m); setMass(m); } }, n))), facts.el)),
    panel('Life stage', h('div', { class: 'controls' }, ageSlider.el, playBtn, phaseNote, phaseRead.el)),
  );

  function setMass(m: number): void {
    M = m;
    phases = lifeTrack(M);
    const f = stellarFate(M);
    facts.update([
      ['Main-sequence lifetime', duration(mainSequenceLifetime(M))],
      ['Ends as', f.remnant],
      ['Remnant mass', f.remnantMass ? `${sig(f.remnantMass, 2)} M☉` : '—'],
    ]);
    redraw();
    fateRedraw();
  }

  let lastPhase = -1;
  function updateInfo(st: ReturnType<typeof interp>): void {
    ageSlider.set(u);
    if (st.i !== lastPhase) {
      lastPhase = st.i;
      phaseNote.textContent = st.note;
    }
    phaseRead.update([
      ['Phase', st.name],
      ['Age', duration(st.age)],
      ['Surface temperature', st.T > 0 ? temperature(Math.round(st.T / 10) * 10) : '— (no surface)'],
      ['Radius', st.R < 0.001 ? `${fixed(st.R * 695700, 1)} km` : `${sig(st.R, 3)} R☉`],
      ['Luminosity', st.L > 0 ? `${sig(st.L, 3)} L☉` : '—'],
    ]);
  }

  animate(stage, d, (_t, dt) => {
    tAnim += dt;
    if (playing) {
      u += dt * 0.035;
      if (u >= 1) {
        u = 1;
        playing = false;
        playBtn.innerHTML = `${icons.play}<span>Play its life</span>`;
      }
      draw();
    } else if (!reduced) {
      const name = interp().name;
      if (/supernova|Neutron/i.test(name)) draw();
    }
  });
  d.add(onThemeChange(() => { redraw(); fateRedraw(); }));

  // ---------------------------------------------------------------- Fig VII.2 fate by mass
  const fateStage = h('div', { class: 'stage stage--chart', style: { height: '230px' }, role: 'img', 'aria-label': 'Stellar fate by initial mass' });
  const fateSurf = createSurface(fateStage, d, () => fateRedraw());
  const fateRedraw = invalidator(drawFate);
  const RANGES: [number, number, string, string][] = [
    [0.013, 0.08, 'Brown dwarf', 'no fusion of hydrogen'],
    [0.08, 0.5, 'Helium white dwarf', 'after trillions of years'],
    [0.5, 8, 'Carbon–oxygen white dwarf', 'via a planetary nebula'],
    [8, 20, 'Neutron star', 'after a core-collapse supernova'],
    [20, 130, 'Black hole', 'fallback or direct collapse'],
    [130, 250, 'Nothing left', 'pair-instability supernova (low metallicity)'],
  ];
  function drawFate(): void {
    const { ctx, width: W, height: H } = fateSurf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const x = logScale(0.013, 250, 24, W - 24);
    const y0 = 70, bh = 40;
    const tones = [pal.grid, pal.line, pal.lineStrong];
    RANGES.forEach(([a, b, name, sub], i) => {
      const x0 = x(a), x1 = x(b);
      ctx.fillStyle = tones[i % 3];
      ctx.fillRect(x0 + 1, y0, x1 - x0 - 2, bh);
      const tw = x1 - x0;
      if (tw > 70) {
        label(ctx, name, x0 + 6, y0 + bh + 18, pal, { color: pal.fg, font: `500 12px ${pal.fontBody}` });
        if (tw > 150) label(ctx, sub, x0 + 6, y0 + bh + 34, pal, { color: pal.muted, font: `11px ${pal.fontBody}` });
      } else {
        ctx.save();
        ctx.translate(x0 + tw / 2, y0 + bh + 10);
        ctx.rotate(0.6);
        label(ctx, name, 0, 0, pal, { color: pal.fg, font: `500 11px ${pal.fontBody}` });
        ctx.restore();
      }
    });
    ctx.font = `11px ${pal.fontMono}`;
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'center';
    for (const m of [0.08, 0.5, 1, 8, 20, 130]) ctx.fillText(`${m} M☉`, x(m), y0 - 10);
    ctx.textAlign = 'left';
    // current mass marker
    const mx = x(M);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(mx - 1.5, y0 - 4, 3, bh + 8);
    label(ctx, `${sig(M, 2)} M☉`, mx + 6, y0 - 26, pal, { color: pal.accent, font: `600 12px ${pal.fontMono}` });
  }
  page.notes.before(
    figure(
      'Fig. VII.2 · Fate by initial mass',
      fateStage,
      '<b>Fig. VII.2.</b> Outcomes for single stars of roughly solar composition. Boundaries are approximate and shift with metallicity, rotation and, above all, binary companions, which strip or feed most massive stars. The brass marker follows the mass chosen above.',
    ),
  );

  setMass(M);

  page.notes.append(
    note(
      'Why mass is destiny',
      `<p>A heavier star must hold up more weight, so its core is hotter and denser and fuses hydrogen far faster. Luminosity rises steeply with mass while the fuel supply grows only in proportion, so lifetime falls:</p>
       <div class="eq">t<sub>MS</sub> ≈ 10¹⁰ yr · (M/M☉) / (L/L☉) ≈ 10¹⁰ yr · (M/M☉)<sup>−2.5</sup></div>
       <p>The Sun gets about 10 billion years. A 20 M☉ star lives some 8 million. A 0.1 M☉ red dwarf will outlast the current age of the Universe a thousand times over.</p>`,
    ),
    note(
      'Forging the elements',
      `<p>Stars build nearly every element heavier than helium. Hydrogen burns to helium by the proton–proton chain (in the Sun) or the CNO cycle (in heavier stars). Helium fuses to carbon by the triple-alpha process, and massive stars carry on through neon, oxygen and silicon to iron, where fusion stops paying.</p>
       <p>Elements beyond iron come from neutron capture: slowly in AGB stars (the s-process) and rapidly in neutron-star mergers and some supernovae (the r-process), the source of most gold and platinum.</p>`,
    ),
    note(
      'Limits of degeneracy',
      `<p>When fusion ends, a remnant is held up by quantum degeneracy pressure, not heat. Electrons can support at most the <strong>Chandrasekhar mass</strong>, about 1.4 M☉; beyond that the core collapses to neutrons.</p>
       <p>Neutron degeneracy and the strong force hold up to roughly 2.2–2.3 M☉ (the Tolman–Oppenheimer–Volkoff limit). Above that nothing known can stop collapse, and a black hole forms.</p>`,
    ),
  );
  return () => d.dispose();
}
