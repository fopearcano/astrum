// Plate X — The Milky Way and other galaxies.

import * as THREE from 'three';
import { Disposer, h, prefersReducedMotion } from '../lib/dom';
import { animate, createSurface, invalidator, linScale } from '../lib/canvas';
import { Tooltip, drawAxes, label, niceLinearTicks } from '../lib/chart';
import { onThemeChange, palette, Palette } from '../lib/theme';
import { button, panel, readout, slider, toggle } from '../lib/ui';
import { fixed } from '../lib/format';
import { createStage3D } from '../three/stage3d';
import { makeNoise } from '../three/noise';
import { figure, note, platePage } from './page';
import { PlateContext, plateById } from './registry';

const R0 = 8.2; // kpc, Sun–Galactic Centre
const PITCH = (12 * Math.PI) / 180;
const D2R = Math.PI / 180;
const ARMS = [
  { name: 'Perseus Arm', phi0: -23, w: 1, major: true },
  { name: 'Norma and Outer Arm', phi0: 53, w: 0.7, major: false },
  { name: 'Scutum–Centaurus Arm', phi0: 157, w: 1, major: true },
  { name: 'Sagittarius–Carina Arm', phi0: 233, w: 0.75, major: false },
];
/** Logarithmic spiral, trailing the clockwise rotation (seen from the north galactic pole). */
const armPhi = (phi0: number, r: number) => phi0 * D2R - Math.log(r / 4) / Math.tan(PITCH);
const polar = (r: number, phi: number, y = 0) => new THREE.Vector3(r * Math.cos(phi), y, r * Math.sin(phi));

const VERT = /* glsl */ `
attribute float size;
attribute vec3 color;
varying vec3 vColor;
uniform float uScale;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 64.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec3 vColor;
uniform float uAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float a = exp(-d * 14.0) * uAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;

export function mount(root: HTMLElement, _ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('galaxies')!, {
    dek: 'We live inside a barred spiral some 30 kiloparsecs across, two-thirds of the way out, between two spiral arms. Below: a model of that disk, the rotation curve that revealed dark matter, and the scheme Edwin Hubble used to sort the galaxies beyond.',
    caption:
      '<b>Fig. X.1.</b> A particle model of the Milky Way: an old central bar and bulge, an exponential stellar disk, four spiral arms traced by young blue stars, star-forming regions and dust, and a halo of globular clusters. Arm geometry follows logarithmic spirals with a 12° pitch fitted to the Sun’s position between the Sagittarius and Perseus arms. Real arm positions are still debated, because we see the disk edge-on from inside. Drag to orbit, scroll to zoom.',
    stageLabel: 'Three-dimensional model of the Milky Way',
  });
  root.append(page.root);
  const stage = page.stage;

  let st: ReturnType<typeof createStage3D>;
  try {
    st = createStage3D(stage, d, { fov: 50, near: 0.05, far: 2000 });
  } catch {
    stage.append(h('div', { class: 'loading' }, 'This plate needs WebGL, which is not available in this browser.'));
    return () => d.dispose();
  }
  const { scene, camera, controls, renderer } = st;
  camera.position.set(0, 26, 22);
  controls.minDistance = 1;
  controls.maxDistance = 300;

  const galaxy = new THREE.Group();
  scene.add(galaxy);
  const { rnd } = makeNoise(7);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

  const pos: number[] = [], col: number[] = [], siz: number[] = [];
  const dpos: number[] = [], dcol: number[] = [], dsiz: number[] = [];
  const add = (v: THREE.Vector3, c: [number, number, number], s: number) => {
    pos.push(v.x, v.y, v.z);
    col.push(...c);
    siz.push(s);
  };
  const jitter = (c: [number, number, number], k = 0.08): [number, number, number] => c.map((x) => Math.max(0, Math.min(1, x + (rnd() - 0.5) * k))) as [number, number, number];

  // bar and bulge (old, yellow)
  const barAngle = Math.atan2(Math.cos(27 * D2R), -Math.sin(27 * D2R));
  for (let i = 0; i < 26000; i++) {
    const bar = rnd() < 0.6;
    const x = gauss() * (bar ? 1.9 : 0.8), y = gauss() * (bar ? 0.35 : 0.6), z = gauss() * (bar ? 0.6 : 0.8);
    const v = new THREE.Vector3(x * Math.cos(barAngle) - z * Math.sin(barAngle), y, x * Math.sin(barAngle) + z * Math.cos(barAngle));
    add(v, jitter([1.0, 0.82, 0.55]), 0.9 + rnd() * 0.6);
  }
  // exponential thin disk
  for (let i = 0; i < 60000; i++) {
    const r = Math.min(16, -2.6 * Math.log(rnd() * rnd() + 1e-6) * 0.7 + 1);
    const phi = rnd() * Math.PI * 2;
    add(polar(r, phi, gauss() * 0.22), jitter([0.95, 0.88, 0.78]), 0.7 + rnd() * 0.5);
  }
  // spiral arms: young stars, HII regions, dust on the inner edge
  for (const arm of ARMS) {
    const n = Math.round(30000 * arm.w);
    for (let i = 0; i < n; i++) {
      const r = 4 + (arm.major ? 12 : 11) * rnd() ** 0.9;
      const phi = armPhi(arm.phi0, r) + gauss() * 0.06;
      const spread = 0.35 + 0.05 * r;
      const v = polar(r, phi).add(new THREE.Vector3(gauss() * spread, gauss() * 0.12, gauss() * spread));
      add(v, jitter([0.62, 0.74, 1.0], 0.12), 0.9 + rnd() * 1.2);
      if (rnd() < 0.05) add(v.clone().add(new THREE.Vector3(gauss() * 0.1, 0, gauss() * 0.1)), [1.0, 0.42, 0.55], 2.4 + rnd() * 2);
      if (rnd() < 0.3) {
        const dv = polar(r - 0.35, phi + 0.02).add(new THREE.Vector3(gauss() * 0.25, gauss() * 0.06, gauss() * 0.25));
        dpos.push(dv.x, dv.y, dv.z);
        dcol.push(0.0, 0.0, 0.0);
        dsiz.push(2.2 + rnd() * 2);
      }
    }
  }
  // Orion Spur, the Sun's local arm segment
  for (let i = 0; i < 1600; i++) {
    const t = rnd();
    const r = 7.3 + 1.9 * t;
    const phi = (112 - 42 * t) * D2R;
    add(polar(r, phi).add(new THREE.Vector3(gauss() * 0.25, gauss() * 0.1, gauss() * 0.25)), jitter([0.7, 0.8, 1.0]), 0.9 + rnd());
  }
  // globular clusters in the halo
  const gcs: number[] = [];
  for (let i = 0; i < 160; i++) {
    const r = Math.min(40, 1.2 / Math.pow(rnd() + 0.02, 0.9));
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    gcs.push(r * s * Math.cos(th), r * u * 0.8, r * s * Math.sin(th));
  }

  const mkPoints = (p: number[], c: number[], s: number[], blending: THREE.Blending, alpha: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 80 }, uAlpha: { value: alpha } },
      transparent: true,
      depthWrite: false,
      blending,
    });
    if (blending === THREE.NormalBlending) m.fragmentShader = FRAG.replace('gl_FragColor = vec4(vColor * a, a);', 'gl_FragColor = vec4(vColor, a);');
    return new THREE.Points(g, m);
  };
  const stars = mkPoints(pos, col, siz, THREE.AdditiveBlending, 0.55);
  const dust = mkPoints(dpos, dcol, dsiz, THREE.NormalBlending, 0.2);
  dust.renderOrder = 2;
  galaxy.add(stars, dust);
  const gcPoints = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gcs, 3)),
    new THREE.PointsMaterial({ color: 0xffd9a0, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.55 }),
  );
  galaxy.add(gcPoints);

  // Sun marker and labels
  const sunPos = new THREE.Vector3(0, 0, R0);
  const sunMark = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 48), new THREE.MeshBasicMaterial({ color: 0xe2586b, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
  sunMark.rotation.x = -Math.PI / 2;
  sunMark.position.copy(sunPos);
  galaxy.add(sunMark);
  // distance rings every 5 kpc
  const rings = new THREE.Group();
  for (const r of [5, 10, 15]) {
    const pts = Array.from({ length: 129 }, (_, k) => polar(r, (k / 128) * Math.PI * 2));
    rings.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x39435c, transparent: true, opacity: 0.6 })));
  }
  galaxy.add(rings);

  const labelAnchors: { obj: THREE.Vector3; lbl: ReturnType<typeof st.labels.add> }[] = [];
  const addLabel = (text: string, v: THREE.Vector3, cls = '') => {
    const anchor = v.clone();
    const lbl = st.labels.add(text, anchor.clone(), cls);
    labelAnchors.push({ obj: anchor, lbl });
    return lbl;
  };
  addLabel('Sun', sunPos, 'label3d--accent');
  addLabel('Galactic Centre · Sgr A*', new THREE.Vector3(0, 0.3, 0));
  addLabel('Central bar', new THREE.Vector3(-Math.sin(27 * D2R) * 3.5, 0.3, Math.cos(27 * D2R) * 3.5), 'label3d--muted');
  for (const arm of ARMS) addLabel(arm.name, polar(12.5, armPhi(arm.phi0, 12.5), 0.2), 'label3d--muted');
  addLabel('Orion Spur', polar(9.2, 68 * D2R, 0.2), 'label3d--muted');
  for (const r of [5, 10, 15]) addLabel(`${r} kpc`, polar(r, -Math.PI / 2 - 0.15, 0), 'label3d--minor');
  // Magellanic Clouds, placed from galactic coordinates as seen from the Sun
  const fromSun = (l: number, b: number, dist: number) => {
    const cb = Math.cos(b * D2R);
    return sunPos.clone().add(new THREE.Vector3(-cb * Math.sin(l * D2R), Math.sin(b * D2R), -cb * Math.cos(l * D2R)).multiplyScalar(dist));
  };
  for (const [name, l, b, dist, size] of [['Large Magellanic Cloud', 280.5, -32.9, 50, 2.6], ['Small Magellanic Cloud', 302.8, -44.3, 62, 1.6]] as [string, number, number, number, number][]) {
    const p = fromSun(l, b, dist);
    const blob = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x9fb7ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })() }));
    blob.position.copy(p);
    blob.scale.set(size * 2, size, 1);
    galaxy.add(blob);
    addLabel(name, p, 'label3d--muted');
  }

  // ---------------------------------------------------------------- animation
  let spinning = !prefersReducedMotion();
  let myr = 0;
  const OMEGA = (2 * Math.PI) / 230; // rad per Myr at the Sun
  const hud = h('div', { class: 'hud hud--tl' });
  stage.append(hud, h('div', { class: 'stage-hint' }, 'Drag to orbit · scroll to zoom'));
  const tmp = new THREE.Vector3();
  animate(stage, d, (_t, dt) => {
    if (spinning) myr += dt * 2;
    galaxy.rotation.y = -OMEGA * myr;
    controls.update();
    renderer.render(scene, camera);
    for (const a of labelAnchors) a.lbl.pos.copy(tmp.copy(a.obj).applyMatrix4(galaxy.matrixWorld));
    st.labels.update(camera, st.width, st.height);
    hud.innerHTML = `<div class="hud-label">Model time</div><div class="hud-big">${myr >= 0 ? '+' : ''}${fixed(myr, 0)} Myr</div><div class="hud-label">${spinning ? '2 million years per second' : 'Paused'} · one galactic year = 230 Myr</div>`;
  });

  const fly = (p: THREE.Vector3, t: THREE.Vector3) => {
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    const start = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 1000);
      const e = 1 - (1 - k) ** 3;
      camera.position.lerpVectors(p0, p, e);
      controls.target.lerpVectors(t0, t, e);
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  };
  page.key.append(
    panel(
      'View',
      h(
        'div',
        { class: 'controls' },
        h('div', { class: 'btn-row' },
          button('Face-on', () => fly(new THREE.Vector3(0, 38, 0.01), new THREE.Vector3())),
          button('Edge-on', () => fly(new THREE.Vector3(38, 1.5, 0), new THREE.Vector3())),
          button('Near the Sun', () => { const s = sunPos.clone().applyMatrix4(galaxy.matrixWorld); fly(s.clone().add(new THREE.Vector3(0, 4, 5)), s); }),
          button('With the Magellanic Clouds', () => fly(new THREE.Vector3(70, 40, 90), new THREE.Vector3(10, -10, 5))),
        ),
        h('div', { class: 'chips' },
          toggle('gx-spin', 'Rotate', spinning, (v) => (spinning = v)),
          toggle('gx-dust', 'Dust lanes', true, (v) => (dust.visible = v)),
          toggle('gx-gc', 'Globular clusters', true, (v) => (gcPoints.visible = v)),
          toggle('gx-rings', 'Distance rings', true, (v) => (rings.visible = v)),
        ),
      ),
    ),
    panel(
      'The Milky Way in numbers',
      readout([
        ['Type', 'SBbc barred spiral'],
        ['Stellar disk diameter', '≈ 30 kpc (100,000 ly)'],
        ['Stars', '100–400 billion'],
        ['Total mass (with dark matter)', '≈ 1 × 10¹² M☉'],
        ['Sun to centre', '8.2 kpc (26,700 ly)'],
        ['Sun’s orbital speed', '≈ 229 km/s'],
        ['Galactic year', '≈ 230 million years'],
        ['Age of the oldest stars', '≈ 13.5 billion years'],
      ]).el,
    ),
  );

  // ---------------------------------------------------------------- Fig X.2 rotation curve
  const rcStage = h('div', { class: 'stage stage--chart', style: { height: '420px' }, role: 'img', 'aria-label': 'Milky Way rotation curve' });
  const rcSurf = createSurface(rcStage, d, () => rcRedraw());
  const rcRedraw = invalidator(drawRC);
  let haloScale = 1;
  const rcTip = new Tooltip(rcStage);
  let rcHover: number | null = null;
  const G = 4.30091e-6; // kpc (km/s)² / M☉
  const vBulge = (r: number) => Math.sqrt((G * 1.0e10 * r) / (r + 0.6) ** 2);
  const vDisk = (r: number) => {
    const Md = 5.2e10, Rd = 2.6;
    const y = r / (2 * Rd);
    const S0 = Md / (2 * Math.PI * Rd * Rd);
    return Math.sqrt(Math.max(0, 4 * Math.PI * G * S0 * Rd * y * y * (besselI0(y) * besselK0(y) - besselI1(y) * besselK1(y))));
  };
  // NFW halo, scale radius 16 kpc, normalised so the total matches 229 km/s at the Sun.
  const vHalo = (r: number) => {
    const u = r / 16;
    const f = (Math.log(1 + u) - u / (1 + u)) / u;
    return Math.sqrt(haloScale * 126400 * Math.max(0, f));
  };
  const vTot = (r: number) => Math.sqrt(vBulge(r) ** 2 + vDisk(r) ** 2 + vHalo(r) ** 2);
  const vObs = (r: number) => 229 - 1.7 * (r - 8.12); // Eilers et al. 2019 fit, 5–25 kpc
  function drawRC(): void {
    const { ctx, width: W, height: H } = rcSurf;
    const pal: Palette = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, W, H);
    const box = { x: 60, y: 22, w: W - 60 - 130, h: H - 22 - 58 };
    const x = linScale(0, 25, box.x, box.x + box.w);
    const y = linScale(0, 300, box.y + box.h, box.y);
    drawAxes(ctx, box, pal, { ticks: niceLinearTicks(0, 25, 5), scale: x, label: (v) => String(v), title: 'Distance from the Galactic Centre (kpc)' }, { ticks: niceLinearTicks(0, 300, 6), scale: y, label: (v) => String(v), title: 'Orbital speed (km/s)' });
    const curves = [
      { name: 'Total model', f: vTot, color: pal.fg, w: 2.5 },
      { name: 'Stellar disk', f: vDisk, color: pal.series[0], w: 2 },
      { name: 'Bulge and bar', f: vBulge, color: pal.series[1], w: 2 },
      { name: 'Dark matter halo', f: vHalo, color: pal.series[2], w: 2 },
    ];
    // Keplerian fall-off if all visible mass sat at the centre
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = pal.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let r = 3; r <= 25; r += 0.1) {
      const v = Math.sqrt((G * 6.2e10) / r);
      if (r === 3) ctx.moveTo(x(r), y(v));
      else ctx.lineTo(x(r), y(v));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'Visible mass, all at the centre', x(17), y(Math.sqrt((G * 6.2e10) / 17)) + 14, pal, { color: pal.muted, font: `11px ${pal.fontBody}` });
    for (const c of curves) {
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.w;
      ctx.beginPath();
      for (let r = 0.05; r <= 25; r += 0.05) {
        const v = c.f(r);
        if (r === 0.05) ctx.moveTo(x(r), y(v));
        else ctx.lineTo(x(r), y(v));
      }
      ctx.stroke();
      label(ctx, c.name, box.x + box.w + 8, y(c.f(25)), pal, { color: pal.fg2, font: `12px ${pal.fontBody}` });
    }
    // observations: a band around the measured trend
    for (let r = 5; r <= 25; r += 1) {
      const px = x(r), py = y(vObs(r));
      ctx.strokeStyle = pal.fg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, y(vObs(r) - 8));
      ctx.lineTo(px, y(vObs(r) + 8));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = pal.surface2;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    label(ctx, 'Measured (Gaia + APOGEE)', x(13.5), y(vObs(13.5)) - 18, pal, { color: pal.fg, font: `600 12px ${pal.fontBody}`, halo: pal.surface2 });
    // Sun
    ctx.fillStyle = pal.mark;
    ctx.beginPath();
    ctx.arc(x(R0), y(229), 5, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'Sun', x(R0) - 8, y(229) + 16, pal, { align: 'right', color: pal.fg, font: `600 12px ${pal.fontBody}`, halo: pal.surface2 });
    if (rcHover !== null) {
      ctx.strokeStyle = pal.axis;
      ctx.beginPath();
      ctx.moveTo(x(rcHover), box.y);
      ctx.lineTo(x(rcHover), box.y + box.h);
      ctx.stroke();
    }
    (rcStage as unknown as { _x: typeof x; _box: typeof box })._x = x;
    (rcStage as unknown as { _box: typeof box })._box = box;
  }
  rcStage.addEventListener('pointermove', (e) => {
    const g = rcStage as unknown as { _x?: ReturnType<typeof linScale>; _box?: { x: number; w: number } };
    if (!g._x || !g._box) return;
    const r = rcStage.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < g._box.x || px > g._box.x + g._box.w) {
      rcHover = null;
      rcTip.hide();
      return rcRedraw();
    }
    rcHover = Math.max(0.1, g._x.invert(px));
    const rr = rcHover;
    rcTip.show(px, e.clientY - r.top, `<b>${fixed(rr, 1)} kpc</b><div>Total <span class="mono">${fixed(vTot(rr), 0)} km/s</span></div><div>Disk <span class="mono">${fixed(vDisk(rr), 0)}</span> · Bulge <span class="mono">${fixed(vBulge(rr), 0)}</span> · Halo <span class="mono">${fixed(vHalo(rr), 0)}</span></div>${rr >= 5 ? `<div>Measured <span class="mono">${fixed(vObs(rr), 0)} km/s</span></div>` : ''}`);
    rcRedraw();
  });
  rcStage.addEventListener('pointerleave', () => { rcHover = null; rcTip.hide(); rcRedraw(); });
  const haloS = slider({ id: 'gx-halo', label: 'Dark matter halo mass', min: 0, max: 2, step: 0.01, value: 1, format: (v) => `${fixed(v * 100, 0)} % of best fit`, onInput: (v) => { haloScale = v; rcRedraw(); } });
  page.notes.before(
    figure(
      'Fig. X.2 · The rotation curve and dark matter',
      rcStage,
      '<b>Fig. X.2.</b> How fast stars and gas orbit at each distance from the centre. Points follow the trend measured by Eilers et al. (2019) from Gaia and APOGEE, v ≈ 229 − 1.7 (R − 8.1) km/s, with ±8 km/s bars. The coloured curves are a simple mass model: a Hernquist bulge, an exponential (Freeman) disk, and a Navarro–Frenk–White dark halo. Set the halo to zero to see what visible matter alone predicts.',
      h('div', { class: 'key' }, panel('Mass model', h('div', { class: 'controls' }, haloS.el, h('p', { class: 'info-sub' }, 'Without the halo, speeds should fall with distance like the planets’ do around the Sun. They stay flat instead. Vera Rubin and Kent Ford found the same in other spiral galaxies in the 1970s.')))),
    ),
  );

  // ---------------------------------------------------------------- Fig X.3 Hubble tuning fork
  const tfStage = h('div', { class: 'stage', style: { height: '420px' }, role: 'img', 'aria-label': 'Hubble tuning fork classification of galaxies' });
  const tfSurf = createSurface(tfStage, d, () => tfRedraw());
  const tfRedraw = invalidator(drawFork);
  const TYPES = [
    { id: 'E0', x: 0.07, y: 0.5, kind: 'E', q: 1, info: 'Round elliptical. Old red stars, little gas or dust. Example: M87 in Virgo, home of M87*.' },
    { id: 'E3', x: 0.17, y: 0.5, kind: 'E', q: 0.7, info: 'Moderately flattened elliptical (axis ratio 0.7). Example: M49 (E2–E4).' },
    { id: 'E7', x: 0.27, y: 0.5, kind: 'E', q: 0.3, info: 'The flattest ellipticals. Example: NGC 3377 (E5–6); M110 is E5 with a peculiar shape.' },
    { id: 'S0', x: 0.4, y: 0.5, kind: 'S0', q: 0.4, info: 'Lenticular: a disk and bulge but no spiral arms, little star formation. Example: NGC 3115, the Spindle Galaxy.' },
    { id: 'Sa', x: 0.56, y: 0.24, kind: 'S', q: 0.55, arm: 0.3, info: 'Large bulge, tightly wound smooth arms. Example: M104, the Sombrero Galaxy.' },
    { id: 'Sb', x: 0.7, y: 0.24, kind: 'S', q: 0.55, arm: 0.55, info: 'Intermediate bulge and arms. Examples: M31 Andromeda, M81.' },
    { id: 'Sc', x: 0.84, y: 0.24, kind: 'S', q: 0.55, arm: 0.85, info: 'Small bulge, loose clumpy arms full of star formation. Examples: M51 Whirlpool (Sbc), M33 Triangulum, M101.' },
    { id: 'SBa', x: 0.56, y: 0.76, kind: 'SB', q: 0.55, arm: 0.3, info: 'Barred, large bulge, tight arms. Example: NGC 4314.' },
    { id: 'SBb', x: 0.7, y: 0.76, kind: 'SB', q: 0.55, arm: 0.55, info: 'Barred intermediate spiral. Examples: NGC 1300, M95, and probably the Milky Way (SBbc).' },
    { id: 'SBc', x: 0.84, y: 0.76, kind: 'SB', q: 0.55, arm: 0.85, info: 'Barred, loose arms, small bulge. Example: NGC 2903 (SBbc), M83 (SABc).' },
    { id: 'Irr', x: 0.95, y: 0.5, kind: 'Irr', q: 0.6, info: 'No regular structure, often gas-rich and star-forming. Examples: the Large and Small Magellanic Clouds, M82.' },
  ];
  let tfSel = 'Sb';
  const tfInfo = h('div', { class: 'info-body' });
  function drawFork(): void {
    const { ctx, width: W, height: H } = tfSurf;
    if (W < 80 || H < 120) return;
    const pal = palette();
    ctx.fillStyle = pal.space;
    ctx.fillRect(0, 0, W, H);
    const P = (t: (typeof TYPES)[number]) => [t.x * W, 28 + t.y * (H - 70)] as [number, number];
    // the fork
    ctx.strokeStyle = 'rgba(141,148,166,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(P(TYPES[0])[0], P(TYPES[0])[1]);
    ctx.lineTo(P(TYPES[3])[0], P(TYPES[3])[1]);
    ctx.lineTo(P(TYPES[4])[0] - 40, P(TYPES[4])[1]);
    ctx.lineTo(P(TYPES[6])[0], P(TYPES[6])[1]);
    ctx.moveTo(P(TYPES[3])[0], P(TYPES[3])[1]);
    ctx.lineTo(P(TYPES[7])[0] - 40, P(TYPES[7])[1]);
    ctx.lineTo(P(TYPES[9])[0], P(TYPES[9])[1]);
    ctx.stroke();
    const R = Math.min(W * 0.05, (H - 70) * 0.16);
    for (const t of TYPES) {
      const [cx, cy] = P(t);
      drawGalaxyIcon(ctx, t.kind, cx, cy, R, t.q, (t as { arm?: number }).arm ?? 0.5, t.id.length * 13 + t.x * 100);
      if (t.id === tfSel) {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
        ctx.stroke();
      }
      label(ctx, t.id, cx, cy + R * 1.35 + 14, pal, { align: 'center', color: t.id === tfSel ? pal.accent : pal.onSpace, font: `italic 600 15px ${pal.fontDisplay}` });
    }
    label(ctx, 'Ellipticals', P(TYPES[1])[0], 18, pal, { align: 'center', color: pal.onSpace2, font: `11px ${pal.fontMono}` });
    label(ctx, 'Normal spirals', P(TYPES[5])[0], 16, pal, { align: 'center', color: pal.onSpace2, font: `11px ${pal.fontMono}` });
    label(ctx, 'Barred spirals', P(TYPES[8])[0], H - 12, pal, { align: 'center', color: pal.onSpace2, font: `11px ${pal.fontMono}` });
    const t = TYPES.find((q) => q.id === tfSel)!;
    tfInfo.replaceChildren(h('p', { class: 'info-title' }, t.id), h('p', null, t.info));
  }
  tfStage.addEventListener('click', (e) => {
    const r = tfStage.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const W = r.width, H = r.height;
    let best: string | null = null;
    let bd = 60;
    for (const t of TYPES) {
      const dd = Math.hypot(t.x * W - px, 28 + t.y * (H - 70) - py);
      if (dd < bd) {
        bd = dd;
        best = t.id;
      }
    }
    if (best) {
      tfSel = best;
      tfRedraw();
    }
  });
  page.notes.before(
    figure(
      'Fig. X.3 · Hubble’s tuning fork',
      tfStage,
      '<b>Fig. X.3.</b> Hubble’s 1926 classification. Ellipticals run from round (E0) to flattened (E7); spirals split into normal (S) and barred (SB) branches, from large bulges and tight arms (a) to small bulges and open arms (c). Despite appearances it is not an evolutionary sequence. Select a type for examples.',
      h('div', { class: 'key' }, panel('Galaxy type', tfInfo)),
    ),
  );
  d.add(onThemeChange(() => { rcRedraw(); tfRedraw(); }));

  page.notes.append(
    note(
      'Our address',
      `<p>The Sun sits in the Orion Spur, a minor arm segment between the Sagittarius and Perseus arms, about 20 parsecs above the midplane. It orbits the centre at 229 km/s and bobs up and down through the disk every 60–70 million years or so.</p>
       <p>From inside, the disk appears as the band of the Milky Way across the night sky, brightest toward Sagittarius, where the centre lies behind 25 magnitudes of visual extinction by dust.</p>`,
    ),
    note(
      'Weighing a galaxy',
      `<p>A star in a circular orbit balances gravity against its centripetal acceleration, so its speed measures the mass enclosed:</p>
       <div class="eq">v² = G M(&lt;r) / r</div>
       <p>If the light traced the mass, v would fall as 1/√r beyond the disk. Flat rotation curves mean M(&lt;r) keeps rising in proportion to r, long after the starlight fades. About 85 % of the matter in the Universe is dark.</p>`,
    ),
    note(
      'The black hole at the centre',
      `<p>Infrared observers followed the star S2 around an invisible point for more than a full 16-year orbit. Its orbit, with a closest approach of 120 AU, requires 4.3 million solar masses inside a region smaller than the Solar System. Reinhard Genzel and Andrea Ghez shared the 2020 Nobel Prize for this work, and the EHT imaged the shadow of Sagittarius A* in 2022.</p>`,
    ),
  );
  return () => d.dispose();
}

/** Procedural galaxy icon for the tuning fork. */
function drawGalaxyIcon(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, R: number, q: number, arm: number, seed: number): void {
  const { rnd } = makeNoise(Math.round(seed));
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  ctx.save();
  ctx.translate(cx, cy);
  if (kind === 'E' || kind === 'S0') {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, 'rgba(255,236,200,0.95)');
    g.addColorStop(0.25, 'rgba(255,214,160,0.55)');
    g.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.scale(1, q);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'S0') {
      ctx.scale(1, 0.4);
      const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.3);
      g2.addColorStop(0, 'rgba(255,230,190,0.5)');
      g2.addColorStop(1, 'rgba(255,230,190,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  ctx.scale(1, q);
  ctx.rotate(-0.3);
  if (kind === 'Irr') {
    for (let i = 0; i < 700; i++) {
      const x = gauss() * R * 0.45 + (rnd() < 0.3 ? R * 0.3 : 0), y = gauss() * R * 0.3;
      ctx.fillStyle = rnd() < 0.15 ? 'rgba(255,140,170,0.8)' : 'rgba(190,210,255,0.55)';
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.restore();
    return;
  }
  const bulge = R * (0.42 - 0.25 * arm);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, bulge * 1.6);
  g.addColorStop(0, 'rgba(255,236,200,0.95)');
  g.addColorStop(1, 'rgba(255,214,160,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, bulge * 1.6, 0, Math.PI * 2);
  ctx.fill();
  const barLen = kind === 'SB' ? R * 0.45 : 0;
  if (barLen) {
    ctx.fillStyle = 'rgba(255,225,180,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, barLen, bulge * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const pitch = 0.18 + arm * 0.35;
  const r0 = Math.max(barLen, bulge * 0.8);
  for (let i = 0; i < 1400; i++) {
    const a = rnd() < 0.5 ? 0 : Math.PI;
    const t = rnd();
    const r = r0 + t * (R - r0);
    const th = a + Math.log(r / r0) / Math.tan(pitch) * 0.55 + gauss() * (0.12 + arm * 0.15);
    ctx.fillStyle = rnd() < 0.08 * arm ? 'rgba(255,140,170,0.85)' : 'rgba(180,200,255,0.6)';
    ctx.fillRect(Math.cos(th) * r, Math.sin(th) * r, 1.3, 1.3);
  }
  ctx.restore();
}

// Modified Bessel functions (Abramowitz & Stegun 9.8.1–9.8.8 polynomial fits).
function besselI0(x: number): number {
  const t = x / 3.75;
  if (x < 3.75) { const y = t * t; return 1 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813))))); }
  const y = 3.75 / x;
  return (Math.exp(x) / Math.sqrt(x)) * (0.39894228 + y * (0.01328592 + y * (0.00225319 + y * (-0.00157565 + y * (0.00916281 + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))));
}
function besselI1(x: number): number {
  const t = x / 3.75;
  if (x < 3.75) { const y = t * t; return x * (0.5 + y * (0.87890594 + y * (0.51498869 + y * (0.15084934 + y * (0.02658733 + y * (0.00301532 + y * 0.00032411)))))); }
  const y = 3.75 / x;
  return (Math.exp(x) / Math.sqrt(x)) * (0.39894228 + y * (-0.03988024 + y * (-0.00362018 + y * (0.00163801 + y * (-0.01031555 + y * (0.02282967 + y * (-0.02895312 + y * (0.01787654 - y * 0.00420059))))))));
}
function besselK0(x: number): number {
  if (x <= 2) { const y = (x * x) / 4; return -Math.log(x / 2) * besselI0(x) + (-0.57721566 + y * (0.4227842 + y * (0.23069756 + y * (0.0348859 + y * (0.00262698 + y * (0.0001075 + y * 0.0000074)))))); }
  const y = 2 / x;
  return (Math.exp(-x) / Math.sqrt(x)) * (1.25331414 + y * (-0.07832358 + y * (0.02189568 + y * (-0.01062446 + y * (0.00587872 + y * (-0.0025154 + y * 0.00053208))))));
}
function besselK1(x: number): number {
  if (x <= 2) { const y = (x * x) / 4; return Math.log(x / 2) * besselI1(x) + (1 / x) * (1 + y * (0.15443144 + y * (-0.67278579 + y * (-0.18156897 + y * (-0.01919402 + y * (-0.00110404 - y * 0.00004686)))))); }
  const y = 2 / x;
  return (Math.exp(-x) / Math.sqrt(x)) * (1.25331414 + y * (0.23498619 + y * (-0.0365562 + y * (0.01504268 + y * (-0.00780353 + y * (0.00325614 - y * 0.00068245))))));
}
