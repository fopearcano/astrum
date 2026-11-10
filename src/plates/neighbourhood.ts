// Plate IV — The Solar Neighbourhood: every catalogued star within 20 parsecs, in 3D.

import * as THREE from 'three';
import { Disposer, h, prefersReducedMotion } from '../lib/dom';
import { animate } from '../lib/canvas';
import { loadNearby, NearbyStar } from '../lib/data';
import { button, panel, readout, slider, toggle } from '../lib/ui';
import { fixed, sig } from '../lib/format';
import { bvToTemperature, blackbodyRGB, bvCss } from '../physics/blackbody';
import { absMagToLuminosity } from '../physics/stellar';
import { createStage3D, Label } from '../three/stage3d';
import { note, platePage } from './page';
import { PlateContext, plateById } from './registry';

const LY = 3.26156;
const D2R = Math.PI / 180;

const VERT = /* glsl */ `
attribute float size;
attribute vec3 color;
attribute float visible;
varying vec3 vColor;
varying float vVis;
void main() {
  vColor = color;
  vVis = visible;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / max(8.0, -mv.z)) * 0.18 + size * 0.55;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vVis;
void main() {
  if (vVis < 0.5) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float core = smoothstep(0.25, 0.0, d);
  gl_FragColor = vec4(vColor * (0.55 + 0.75 * core), core);
}`;

const CLASS_ORDER = ['O', 'B', 'A', 'F', 'G', 'K', 'M', 'D', 'L/T', '?'];

export function mount(root: HTMLElement, ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('neighbourhood')!, {
    dek: 'Within 65 light-years of the Sun lie about 1,900 catalogued stars. Most are dim red dwarfs invisible to the naked eye; only a handful of the brightest stars in our sky are among them. Here they are in three dimensions, with the galactic plane as the floor.',
    caption:
      '<b>Fig. IV.</b> Stars within 20 parsecs from the HYG v4.1 catalogue (Hipparcos, Yale Bright Star and Gliese catalogues), in galactic coordinates with the Sun at the centre. Point size follows luminosity; colour follows B−V. Drop lines show height above or below the galactic plane. Rings mark brass-circled stars with planets in the Open Exoplanet Catalogue. Faint nearby objects, especially brown dwarfs, are still being found, so the census is incomplete beyond about 10 parsecs.',
    stageLabel: 'Three-dimensional map of nearby stars',
  });
  root.append(page.root);
  const stage = page.stage;
  stage.append(h('div', { class: 'loading' }, 'Loading 1,900 stars…'));

  let st: ReturnType<typeof createStage3D>;
  try {
    st = createStage3D(stage, d, { fov: 50, near: 0.01, far: 500 });
  } catch {
    stage.replaceChildren(h('div', { class: 'loading' }, 'This plate needs WebGL, which is not available in this browser.'));
    return () => d.dispose();
  }
  const { scene, camera, controls, renderer } = st;
  camera.position.set(14, 11, 18);
  controls.minDistance = 0.5;
  controls.maxDistance = 120;

  let radius = 10; // pc
  let showDrops = true;
  let showHosts = true;
  let stars: NearbyStar[] = [];
  let sel: number | null = null;
  const toW = (s: NearbyStar) => new THREE.Vector3(s[0], s[2], -s[1]);

  // galactic plane grid
  const grid = new THREE.Group();
  scene.add(grid);
  const ringMat = new THREE.LineBasicMaterial({ color: 0x39435c, transparent: true, opacity: 0.7 });
  for (const r of [5, 10, 15, 20]) {
    const pts = Array.from({ length: 161 }, (_, k) => new THREE.Vector3(Math.cos((k / 160) * Math.PI * 2) * r, 0, Math.sin((k / 160) * Math.PI * 2) * r));
    grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
    st.labels.add(`${r} pc · ${fixed(r * LY, 0)} ly`, new THREE.Vector3(r * 0.71, 0, r * 0.71), 'label3d--minor');
  }
  for (let l = 0; l < 360; l += 30) {
    const dir = new THREE.Vector3(Math.cos(l * D2R), 0, -Math.sin(l * D2R));
    grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([dir.clone().multiplyScalar(1), dir.clone().multiplyScalar(20)]), ringMat));
    const name = l === 0 ? 'l = 0°, toward the Galactic Centre' : l === 90 ? 'l = 90°, direction of rotation' : l === 180 ? 'l = 180°, anticentre' : `l = ${l}°`;
    st.labels.add(name, dir.clone().multiplyScalar(21.5), 'label3d--minor');
  }
  // the Sun
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12), new THREE.MeshBasicMaterial({ color: 0xffe7b0 }));
  scene.add(sun);
  st.labels.add('Sun', new THREE.Vector3(0, 0, 0), 'label3d--accent');

  let points: THREE.Points | null = null;
  let drops: THREE.LineSegments | null = null;
  const hostRings = new THREE.Group();
  scene.add(hostRings);
  const starLabels: { i: number; lbl: Label }[] = [];
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.38, 40), new THREE.MeshBasicMaterial({ color: 0xd6ac62, side: THREE.DoubleSide, transparent: true, depthTest: false }));
  reticle.visible = false;
  scene.add(reticle);

  loadNearby()
    .then((data) => {
      stars = data.stars;
      stage.querySelector('.loading')?.remove();
      const n = stars.length;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), vis = new Float32Array(n);
      const dropPos: number[] = [];
      stars.forEach((s, i) => {
        const p = toW(s);
        pos.set([p.x, p.y, p.z], i * 3);
        const [r, g, b] = blackbodyRGB(bvToTemperature(s[4] ?? 1.4));
        col.set([r / 255, g / 255, b / 255], i * 3);
        const L = absMagToLuminosity(s[3]);
        size[i] = Math.max(2.2, Math.min(16, 4 + 2.2 * Math.log10(L + 1e-4) + 2));
        dropPos.push(p.x, p.y, p.z, p.x, 0, p.z);
        if (s[10] > 0) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 32), new THREE.MeshBasicMaterial({ color: 0xd6ac62, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
          ring.position.copy(p);
          ring.userData.i = i;
          hostRings.add(ring);
        }
        if (s[6] && (s[9] < 6 || s[3] < 3)) starLabels.push({ i, lbl: st.labels.add(s[6], p, '', () => select(i)) });
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('size', new THREE.BufferAttribute(size, 1));
      g.setAttribute('visible', new THREE.BufferAttribute(vis, 1));
      points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      scene.add(points);
      const dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.Float32BufferAttribute(dropPos, 3));
      drops = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x5b6680, transparent: true, opacity: 0.35 }));
      scene.add(drops);
      applyRadius();
      buildCensus();
      if (ctx.params.focus) {
        const i = stars.findIndex((s) => s[6] === ctx.params.focus || s[7] === ctx.params.focus);
        if (i >= 0) select(i);
      } else {
        const i = stars.findIndex((s) => s[6] === 'Rigil Kentaurus');
        if (i >= 0) select(i, false);
      }
    })
    .catch((e) => stage.replaceChildren(h('div', { class: 'loading' }, `Could not load the catalogue: ${e.message}`)));

  function applyRadius(): void {
    if (!points || !drops) return;
    const vis = points.geometry.attributes.visible as THREE.BufferAttribute;
    const dropIdx: number[] = [];
    stars.forEach((s, i) => {
      const on = s[9] <= radius;
      vis.setX(i, on ? 1 : 0);
      if (on) dropIdx.push(i * 2, i * 2 + 1);
    });
    vis.needsUpdate = true;
    drops.geometry.setIndex(dropIdx);
    drops.visible = showDrops;
    hostRings.children.forEach((r) => (r.visible = showHosts && stars[r.userData.i][9] <= radius));
    for (const { i, lbl } of starLabels) lbl.visible = stars[i][9] <= radius;
    countEl.textContent = `${stars.filter((s) => s[9] <= radius).length.toLocaleString('en-US')} stars within ${radius} pc (${fixed(radius * LY, 0)} light-years)`;
    buildCensus();
  }

  // ---------------------------------------------------------------- picking
  const v = new THREE.Vector3();
  let downAt: { x: number; y: number } | null = null;
  d.on(renderer.domElement, 'pointerdown', ((e: PointerEvent) => {
    downAt = { x: e.clientX, y: e.clientY };
  }) as EventListener);
  d.on(renderer.domElement, 'pointerup', ((e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best: number | null = null;
    let bd = 14;
    stars.forEach((s, i) => {
      if (s[9] > radius) return;
      v.copy(toW(s)).project(camera);
      if (v.z > 1) return;
      const dd = Math.hypot((v.x * 0.5 + 0.5) * st.width - x, (-v.y * 0.5 + 0.5) * st.height - y);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    if (best !== null) select(best);
  }) as EventListener);

  let flight: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t0: number } | null = null;
  function select(i: number, fly = true): void {
    sel = i;
    const p = toW(stars[i]);
    reticle.position.copy(p);
    reticle.visible = true;
    if (fly) {
      const off = camera.position.clone().sub(controls.target);
      const dist = Math.min(off.length(), 9);
      flight = { from: controls.target.clone(), to: p, camFrom: camera.position.clone(), camTo: p.clone().add(off.normalize().multiplyScalar(dist)), t0: performance.now() };
    }
    showInfo();
  }

  // ---------------------------------------------------------------- loop
  let rotate = !prefersReducedMotion();
  animate(stage, d, (_t, dt) => {
    if (flight) {
      const k = Math.min(1, (performance.now() - flight.t0) / 1000);
      const e = 1 - (1 - k) ** 3;
      controls.target.lerpVectors(flight.from, flight.to, e);
      camera.position.lerpVectors(flight.camFrom, flight.camTo, e);
      if (k >= 1) flight = null;
    } else if (rotate) {
      const off = camera.position.clone().sub(controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.04);
      camera.position.copy(controls.target).add(off);
    }
    controls.update();
    reticle.quaternion.copy(camera.quaternion);
    hostRings.children.forEach((r) => r.quaternion.copy(camera.quaternion));
    renderer.render(scene, camera);
    st.labels.update(camera, st.width, st.height);
  });
  d.on(renderer.domElement, 'pointerdown', (() => (rotate = false)) as EventListener);

  // ---------------------------------------------------------------- key
  const countEl = h('p', { class: 'info-sub' });
  const census = h('div', { style: { display: 'grid', gap: '6px' } });
  const info = h('section', { class: 'panel', 'aria-live': 'polite' });
  stage.append(h('div', { class: 'stage-hint' }, 'Drag to orbit · scroll to zoom · select a star'));
  page.key.append(
    panel(
      'View',
      h(
        'div',
        { class: 'controls' },
        slider({ id: 'nb-radius', label: 'Radius', min: 3, max: 20, step: 0.5, value: radius, format: (r) => `${fixed(r, 1)} pc · ${fixed(r * LY, 0)} ly`, onInput: (r) => { radius = r; applyRadius(); } }).el,
        countEl,
        h('div', { class: 'chips' },
          toggle('nb-drops', 'Drop lines', true, (on) => { showDrops = on; if (drops) drops.visible = on; }),
          toggle('nb-hosts', 'Planet hosts', true, (on) => { showHosts = on; applyRadius(); }),
          toggle('nb-grid', 'Galactic plane', true, (on) => (grid.visible = on)),
          toggle('nb-rotate', 'Turn slowly', rotate, (on) => (rotate = on)),
        ),
        h('div', { class: 'btn-row' },
          button('Back to the Sun', () => { flight = { from: controls.target.clone(), to: new THREE.Vector3(), camFrom: camera.position.clone(), camTo: new THREE.Vector3(14, 11, 18), t0: performance.now() }; }),
          button('Top view', () => { flight = { from: controls.target.clone(), to: new THREE.Vector3(), camFrom: camera.position.clone(), camTo: new THREE.Vector3(0, 34, 0.01), t0: performance.now() }; }),
        ),
      ),
    ),
    info,
    panel('Census by spectral class', census),
  );

  function classOf(s: NearbyStar): string {
    const sp = s[5].toUpperCase();
    if (sp.startsWith('D') || sp.startsWith('SD') === false && /^W?D[ABOQZC]/.test(sp)) return 'D';
    const c = sp.replace(/^SD/, '')[0];
    if (!c) return '?';
    if (c === 'L' || c === 'T' || c === 'Y') return 'L/T';
    return CLASS_ORDER.includes(c) ? c : '?';
  }
  function buildCensus(): void {
    if (!stars.length) return;
    const counts: Record<string, number> = {};
    for (const s of stars) if (s[9] <= radius) counts[classOf(s)] = (counts[classOf(s)] ?? 0) + 1;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const max = Math.max(...Object.values(counts));
    const sample: Record<string, number> = { O: 0.0, B: -0.15, A: 0.05, F: 0.45, G: 0.65, K: 1.0, M: 1.5, D: 0.0, 'L/T': 2.0, '?': 1.2 };
    census.replaceChildren(
      ...CLASS_ORDER.filter((c) => counts[c]).map((c) =>
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: '3.2em minmax(0,1fr) 5.5em', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' } },
          h('span', { class: 'mono' }, c === 'D' ? 'WD' : c),
          h('span', { style: { height: '10px', borderRadius: '0 4px 4px 0', background: c === '?' ? 'var(--series-other)' : bvCss(sample[c]), width: `${Math.max(2, (counts[c] / max) * 100)}%`, border: '1px solid var(--line)' } }),
          h('span', { class: 'mono', style: { textAlign: 'right' } }, `${counts[c]} · ${fixed((counts[c] / total) * 100, 0)} %`),
        ),
      ),
      h('p', { class: 'info-sub' }, 'WD = white dwarf; ? = no spectral type in the catalogue.'),
    );
  }

  function showInfo(): void {
    info.replaceChildren();
    if (sel === null) {
      info.append(h('h2', null, 'Select a star'));
      return;
    }
    const s = stars[sel];
    const L = absMagToLuminosity(s[3]);
    const yearLeft = new Date().getUTCFullYear() - Math.round(s[9] * LY);
    info.append(
      h('div', { class: 'swatch-lg', style: { background: `radial-gradient(circle at 30% 50%, ${bvCss(s[4])} 0 14px, transparent 15px), var(--space)` } }),
      h('p', { class: 'info-title', style: { marginTop: '12px' } }, s[6] || s[7]),
      h('p', { class: 'info-sub' }, s[6] ? s[7] : 'Catalogued star'),
      h(
        'div',
        { class: 'info-body' },
        readout([
          ['Distance', `${fixed(s[9] * LY, 2)} ly (${fixed(s[9], 3)} pc)`],
          ['Light you see left in', `${yearLeft}`],
          ['Spectral type', s[5] || '—'],
          ['Apparent magnitude', `${fixed(s[8], 2)}${s[8] > 6.5 ? ' (needs a telescope)' : ''}`],
          ['Absolute magnitude', fixed(s[3], 2)],
          ['Luminosity (visual)', `${sig(L, 3)} L☉`],
          ['Height above the plane', `${fixed(s[2], 2)} pc`],
          ['Known planets', s[10] ? String(s[10]) : 'None catalogued'],
        ]).el,
      ),
    );
  }

  page.notes.append(
    note(
      'Measuring the distance to a star',
      `<p>As Earth orbits the Sun, a nearby star shifts back and forth against far more distant ones. Half that annual wobble is the <strong>parallax</strong> p, and the distance in parsecs is simply its reciprocal:</p>
       <div class="eq">d (pc) = 1 / p (arcseconds)</div>
       <p>Friedrich Bessel measured the first parallax, of 61 Cygni, in 1838: 0.31″, about the width of a coin seen from 10 km. The Hipparcos satellite reached milliarcseconds; Gaia now reaches tens of microarcseconds for over a billion stars.</p>`,
    ),
    note(
      'Mostly red dwarfs',
      `<p>Turn the census into a pie and three-quarters of it is class M: cool, dim red dwarfs. Not one is visible without a telescope. Sun-like G stars are under a tenth of the total.</p>
       <p>This is the true population of the Galaxy. The naked-eye sky is biased toward rare luminous stars that we can see from far away.</p>`,
    ),
    note(
      'The nearest neighbours',
      `<p>The α Centauri system, 4.2–4.4 light-years away, holds the nearest stars: Proxima Centauri, a flaring red dwarf with at least one Earth-mass planet in its habitable zone, and the Sun-like pair α Centauri A and B. Next come Barnard’s Star (5.96 ly), a pair of brown dwarfs (Luhman 16) and Wolf 359.</p>
       <p>Stars move: in about 10,000 years Barnard’s Star will pass within 3.8 light-years, and in 1.3 million years the star Gliese 710 will skim through the Oort cloud.</p>`,
    ),
  );
  return () => d.dispose();
}
