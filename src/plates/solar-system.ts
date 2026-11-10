// Plate II — The Solar System: a 3D orrery driven by real orbital elements.

import * as THREE from 'three';
import { Disposer, h, prefersReducedMotion } from '../lib/dom';
import { animate } from '../lib/canvas';
import { button, icons, panel, readout, segmented, toggle } from '../lib/ui';
import { fixed, sig, sci } from '../lib/format';
import { createStage3D, eclToWorld, Label } from '../three/stage3d';
import { dotTexture, glowTexture, planetTexture, ringTexture } from '../three/planet-textures';
import { ALL_BODIES, Body, PLANETS } from '../data/solar-system';
import { Elements, elementsAt, fromPerihelion, orbitPath, position, Vec3 } from '../physics/kepler';
import { dateFromJulian, julianDate } from '../physics/time';
import { loadStars } from '../lib/data';
import { radecToVec, OBLIQUITY } from '../physics/coords';
import { bvToTemperature, blackbodyRGB } from '../physics/blackbody';
import { note, platePage } from './page';
import { PlateContext, plateById } from './registry';
import { makeNoise } from '../three/noise';

const AU_KM = 149597870.7;
const GM_SUN = 1.32712440018e20;
const D2R = Math.PI / 180;

interface Obj {
  body: Body;
  group: THREE.Group; // positioned at the body
  mesh: THREE.Mesh;
  orbit?: THREE.Line;
  label: Label;
  pos: Vec3; // heliocentric ecliptic AU
  el?: Elements;
  moons: { mesh: THREE.Mesh; moon: NonNullable<Body['majorMoons']>[number]; label: Label }[];
  moonGroup: THREE.Group;
}

const visibleRadius = (b: Body) => (b.kind === 'star' ? 0.1 : 0.02 * (b.radiusKm / 6371) ** 0.45);
const trueRadius = (b: Body) => b.radiusKm / AU_KM;

export function mount(root: HTMLElement, ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('solar-system')!, {
    dek: 'Eight planets, the largest dwarf planets and Halley’s comet, each placed by solving Kepler’s equation for the date you choose. Distances are true to scale; switch the bodies to true size to see how empty the Solar System is.',
    caption:
      '<b>Fig. II.</b> Heliocentric positions from the JPL approximate Keplerian elements (Standish), good to a few arcminutes between 1800 and 2050. Dwarf-planet and comet elements are rounded osculating values. Orbits in the ecliptic frame of J2000; the background stars are the real sky in the same frame. Moon orbits are compressed when bodies are shown enlarged.',
    stageLabel: 'Three-dimensional model of the Solar System',
  });
  root.append(page.root);
  const stage = page.stage;

  let st: ReturnType<typeof createStage3D>;
  try {
    st = createStage3D(stage, d, { fov: 45, near: 1e-6, far: 1e5, logDepth: true });
  } catch (e) {
    stage.append(h('div', { class: 'loading' }, 'This plate needs WebGL, which is not available in this browser.'));
    return () => d.dispose();
  }
  const { scene, camera, controls, renderer } = st;
  camera.position.set(0, 3.4, 5.4);
  controls.target.set(0, 0, 0);
  controls.minDistance = 1e-4;
  controls.maxDistance = 3000;

  // ---------------------------------------------------------------- state
  let jd = julianDate(new Date());
  let playing = !prefersReducedMotion();
  let rate = 10; // days per second
  let trueScale = false;
  let showOrbits = true;
  let showLabels = true;
  let showBelts = true;
  let focus: Obj | null = null;
  let flight: { from: THREE.Vector3; to: number; t0: number; dir: THREE.Vector3; startDist: number } | null = null;

  // ---------------------------------------------------------------- scene
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const sunLight = new THREE.PointLight(0xffffff, 2.6, 0, 0);
  scene.add(sunLight);

  const objs: Obj[] = [];
  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);
  const dot = dotTexture();

  for (const body of ALL_BODIES) {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, body.kind === 'planet' || body.kind === 'star' ? 64 : 32, body.kind === 'planet' || body.kind === 'star' ? 32 : 16);
    const tex = planetTexture(body, body.kind === 'planet' || body.kind === 'star' ? 512 : 256);
    const mat = body.kind === 'star' ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    // Axial tilt relative to the orbit normal (pole azimuth is schematic).
    if (body.tilt) mesh.rotation.z = -body.tilt * D2R;
    group.add(mesh);
    if (body.kind === 'star') {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(5);
      mesh.add(glow);
    }
    if (body.rings) {
      const kind = body.id === 'saturn' ? 'saturn' : body.id === 'uranus' ? 'uranus' : 'jupiter';
      const rg = new THREE.RingGeometry(body.rings.inner, body.rings.outer, 128, 1);
      const pos = rg.attributes.position;
      const uv = rg.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, (r - body.rings.inner) / (body.rings.outer - body.rings.inner), 0.5);
      }
      const ring = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: ringTexture(kind), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
      ring.rotation.x = -Math.PI / 2;
      mesh.add(ring);
    }
    scene.add(group);
    const moonGroup = new THREE.Group();
    group.add(moonGroup);
    const o: Obj = { body, group, mesh, label: st.labels.add(body.name, group.position, body.kind === 'planet' || body.kind === 'star' ? '' : 'label3d--muted', () => setFocus(o)), pos: { x: 0, y: 0, z: 0 }, moons: [], moonGroup };
    for (const m of body.majorMoons ?? []) {
      const mm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshStandardMaterial({ color: 0xb9b4aa, roughness: 1 }));
      moonGroup.add(mm);
      const lbl = st.labels.add(m.name, new THREE.Vector3(), 'label3d--minor');
      o.moons.push({ mesh: mm, moon: m, label: lbl });
    }
    moonGroup.visible = false;
    objs.push(o);
  }
  const sunObj = objs[0];

  // point markers keep tiny bodies visible at any zoom
  const markerGeo = new THREE.BufferGeometry();
  const markerPos = new Float32Array(objs.length * 3);
  const markerCol = new Float32Array(objs.length * 3);
  objs.forEach((o, i) => {
    const c = new THREE.Color(o.body.kind === 'star' ? '#ffe7b0' : o.body.colors[0]);
    markerCol.set([c.r, c.g, c.b], i * 3);
  });
  markerGeo.setAttribute('position', new THREE.BufferAttribute(markerPos, 3));
  markerGeo.setAttribute('color', new THREE.BufferAttribute(markerCol, 3));
  const markers = new THREE.Points(markerGeo, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, map: dot, transparent: true, depthWrite: false, alphaTest: 0.05 }));
  scene.add(markers);

  // orbit lines
  const orbitMat = (b: Body) =>
    new THREE.LineBasicMaterial({ color: b.kind === 'comet' ? 0x8fb7d9 : b.kind === 'dwarf' ? 0x6b7489 : 0xb79a62, transparent: true, opacity: b.kind === 'planet' ? 0.55 : 0.4 });
  function buildOrbits(): void {
    orbitGroup.clear();
    for (const o of objs) {
      if (!o.el) continue;
      const pts = orbitPath(o.el, o.body.kind === 'comet' ? 720 : 360).map((p) => eclToWorld(p.x, p.y, p.z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), orbitMat(o.body));
      orbitGroup.add(line);
      o.orbit = line;
    }
  }

  // asteroid and Kuiper belts: random but realistic element distributions
  const { rnd } = makeNoise(42);
  const belt = (n: number, aMin: number, aMax: number, eMax: number, iMax: number) =>
    Array.from({ length: n }, () => ({
      a: aMin + (aMax - aMin) * rnd() ** 0.9,
      e: eMax * rnd() ** 1.5,
      i: iMax * rnd() ** 2,
      node: rnd() * 360,
      argPeri: rnd() * 360,
      M0: rnd() * 360,
    }));
  const asteroids = belt(3500, 2.15, 3.3, 0.22, 18);
  const kuiper = [...belt(1800, 42, 48, 0.12, 12), ...belt(900, 39.2, 39.7, 0.3, 20)];
  const beltPoints = (n: number, color: number, size: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, map: dot, transparent: true, opacity: 0.7, depthWrite: false }));
    scene.add(p);
    return p;
  };
  const astPts = beltPoints(asteroids.length, 0x8a8172, 2);
  const kbPts = beltPoints(kuiper.length, 0x6e7f9c, 2);
  const updateBelt = (pts: THREE.Points, list: typeof asteroids) => {
    const arr = (pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const t = jd - 2451545;
    list.forEach((b, k) => {
      const n = 0.9856076686 / b.a ** 1.5;
      const peri = b.node + b.argPeri;
      const p = position({ a: b.a, e: b.e, i: b.i, node: b.node, peri, L: b.M0 + n * t + peri });
      arr[k * 3] = p.x;
      arr[k * 3 + 1] = p.z;
      arr[k * 3 + 2] = -p.y;
    });
    pts.geometry.attributes.position.needsUpdate = true;
  };

  // background: the real naked-eye sky in the ecliptic frame
  loadStars()
    .then((s) => {
      const n = Math.min(s.count, 5000);
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const e = OBLIQUITY * D2R;
      const R = 4000;
      for (let i = 0; i < n; i++) {
        const [x, y, z] = radecToVec(s.ra[i], s.dec[i]);
        const ye = y * Math.cos(e) + z * Math.sin(e);
        const ze = -y * Math.sin(e) + z * Math.cos(e);
        pos.set([x * R, ze * R, -ye * R], i * 3);
        const [r, g, b] = blackbodyRGB(bvToTemperature(s.ci[i] ?? 0.6));
        const k = Math.max(0.12, Math.min(1, (6.6 - s.mag[i]) / 6));
        col.set([(r / 255) * k, (g / 255) * k, (b / 255) * k], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, map: dot, transparent: true, depthWrite: false }));
      stars.renderOrder = -1;
      scene.add(stars);
    })
    .catch(() => {});

  // ---------------------------------------------------------------- positions
  function elementsFor(b: Body, t: number): Elements | undefined {
    if (b.elements) return elementsAt(b.elements, t);
    if (b.perihelion) return fromPerihelion(b.perihelion, t);
    return undefined;
  }

  let lastOrbitJd = -1e9;
  function updatePositions(): void {
    for (const o of objs) {
      o.el = elementsFor(o.body, jd);
      o.pos = o.el ? position(o.el) : { x: 0, y: 0, z: 0 };
      eclToWorld(o.pos.x, o.pos.y, o.pos.z, o.group.position);
      // spin: rotation period in hours → radians
      if (o.body.rotationH) o.mesh.rotation.y = ((jd * 24) / o.body.rotationH) * Math.PI * 2;
      const R = trueScale ? trueRadius(o.body) : visibleRadius(o.body);
      o.mesh.scale.setScalar(R);
      // moons
      if (o.moons.length) {
        o.moonGroup.visible = focus === o;
        if (o.moonGroup.visible) {
          o.moons.forEach(({ mesh, moon, label }) => {
            const rp = o.body.radiusKm;
            const dist = trueScale ? moon.aKm / AU_KM : R * 1.4 * (moon.aKm / rp) ** 0.55;
            const rad = trueScale ? moon.radiusKm / AU_KM : Math.max(R * 0.06, R * (moon.radiusKm / rp) ** 0.6 * 0.9);
            const ang = (2 * Math.PI * (jd - 2451545)) / moon.periodDays;
            mesh.position.set(Math.cos(ang) * dist, 0, -Math.sin(ang) * dist);
            mesh.scale.setScalar(rad);
            label.pos.copy(mesh.position).add(o.group.position);
            label.visible = showLabels;
            label.maxDist = dist * 30;
          });
        } else o.moons.forEach((m) => (m.label.visible = false));
      }
    }
    objs.forEach((o, i) => markerPos.set([o.group.position.x, o.group.position.y, o.group.position.z], i * 3));
    markerGeo.attributes.position.needsUpdate = true;
    if (Math.abs(jd - lastOrbitJd) > 3650) {
      buildOrbits();
      lastOrbitJd = jd;
    }
    if (showBelts) {
      updateBelt(astPts, asteroids);
      updateBelt(kbPts, kuiper);
    }
  }

  // ---------------------------------------------------------------- focus and flight
  function setFocus(o: Obj | null, fly = true): void {
    focus = o;
    updatePositions();
    const target = o ?? sunObj;
    if (fly) {
      const R = trueScale ? trueRadius(target.body) : visibleRadius(target.body);
      const want = o && o.body.kind !== 'star' ? Math.max(R * (o.body.majorMoons?.length ? 26 : 9), 0.00015) : 4.8;
      const dir = camera.position.clone().sub(controls.target).normalize();
      if (dir.y < 0.15) dir.y = 0.3;
      dir.normalize();
      flight = { from: controls.target.clone(), to: want, t0: performance.now(), dir, startDist: camera.position.distanceTo(controls.target) };
    }
    showInfo();
  }

  function preset(dist: number, elev: number): void {
    focus = null;
    const dir = new THREE.Vector3(0, Math.sin(elev * D2R), Math.cos(elev * D2R));
    flight = { from: controls.target.clone(), to: dist, t0: performance.now(), dir, startDist: camera.position.distanceTo(controls.target) };
    showInfo();
  }

  // ---------------------------------------------------------------- HUD + key
  const hudDate = h('div', { class: 'hud hud--tl' });
  const hudScale = h('div', { class: 'hud hud--bl' });
  stage.append(hudDate, hudScale, h('div', { class: 'stage-hint' }, 'Drag to orbit · scroll to zoom · select a body'));

  const playBtn = h('button', { type: 'button', class: 'btn', id: 'ss-play', 'aria-pressed': String(playing) });
  const paintPlay = () => {
    playBtn.innerHTML = `${playing ? icons.pause : icons.play}<span>${playing ? 'Pause' : 'Play'}</span>`;
    playBtn.setAttribute('aria-pressed', String(playing));
  };
  paintPlay();
  playBtn.addEventListener('click', () => {
    playing = !playing;
    paintPlay();
  });
  const rateSeg = segmented({
    label: 'Speed',
    options: [
      { value: '1', label: '1 day/s' },
      { value: '10', label: '10 d/s' },
      { value: '60', label: '2 mo/s' },
      { value: '365.25', label: '1 yr/s' },
    ],
    value: '10',
    onChange: (v) => (rate = Number(v) * (reverse ? -1 : 1)),
  });
  let reverse = false;
  const revToggle = toggle('ss-reverse', 'Run backwards', false, (on) => {
    reverse = on;
    rate = Math.abs(rate) * (on ? -1 : 1);
  });
  const dateInput = h('input', { type: 'date', id: 'ss-date', min: '1800-01-01', max: '2100-12-31' }) as HTMLInputElement;
  dateInput.addEventListener('change', () => {
    if (!dateInput.value) return;
    jd = julianDate(new Date(dateInput.value + 'T00:00:00Z'));
    updatePositions();
  });
  const todayBtn = button('Today', () => {
    jd = julianDate(new Date());
    updatePositions();
  });

  const bodyBtns = h(
    'div',
    { class: 'chips' },
    objs.map((o) => h('button', { type: 'button', class: 'chip', onclick: () => setFocus(o) }, h('i', { class: 'swatch', style: { background: o.body.kind === 'star' ? '#ffd27a' : o.body.colors[0] } }), o.body.name)),
  );

  page.key.append(
    panel(
      'Time',
      h('div', { class: 'controls' }, h('div', { class: 'btn-row' }, playBtn, todayBtn), rateSeg.el, h('div', { class: 'chips' }, revToggle), h('div', { class: 'field' }, h('label', { for: 'ss-date' }, 'Go to date'), dateInput)),
    ),
    panel(
      'View',
      h(
        'div',
        { class: 'controls' },
        segmented({
          label: 'Body sizes',
          options: [
            { value: 'visible', label: 'Enlarged' },
            { value: 'true', label: 'True scale' },
          ],
          value: 'visible',
          onChange: (v) => {
            trueScale = v === 'true';
            updatePositions();
            if (focus) setFocus(focus);
            paintScale();
          },
        }).el,
        h(
          'div',
          { class: 'btn-row' },
          button('Inner planets', () => preset(4.8, 38)),
          button('Outer planets', () => preset(75, 30)),
          button('Kuiper Belt', () => preset(150, 55)),
          button('Above', () => preset(9, 89)),
        ),
        h(
          'div',
          { class: 'chips' },
          toggle('ss-orbits', 'Orbits', true, (on) => (showOrbits = on)),
          toggle('ss-labels', 'Labels', true, (on) => (showLabels = on)),
          toggle('ss-belts', 'Asteroid and Kuiper belts', true, (on) => {
            showBelts = on;
            if (on) updatePositions();
          }),
        ),
      ),
    ),
    panel('Bodies', bodyBtns),
  );
  const info = h('section', { class: 'panel', 'aria-live': 'polite' });
  page.key.append(info);

  function paintScale(): void {
    hudScale.innerHTML = trueScale
      ? '<span class="hud-label">True scale</span><br>Sizes and distances both to scale'
      : '<span class="hud-label">Distances to scale</span><br>Bodies enlarged up to ~3,000×';
  }
  paintScale();

  function showInfo(): void {
    const o = focus ?? sunObj;
    const b = o.body;
    info.replaceChildren();
    const earth = objs.find((x) => x.body.id === 'earth')!;
    const r = Math.hypot(o.pos.x, o.pos.y, o.pos.z);
    const rows: [string, string][] = [];
    if (o.el) {
      const a = o.el.a;
      const v = Math.sqrt(GM_SUN * (2 / (r * 1.495978707e11) - 1 / (a * 1.495978707e11))) / 1000;
      rows.push(
        ['Distance from Sun', `${fixed(r, 3)} AU`],
        ['Light time from Sun', `${fixed((r * 499.005) / 60, 1)} min`],
        ['Distance from Earth', b.id === 'earth' ? '—' : `${fixed(Math.hypot(o.pos.x - earth.pos.x, o.pos.y - earth.pos.y, o.pos.z - earth.pos.z), 3)} AU`],
        ['Orbital speed now', `${fixed(v, 1)} km/s`],
        ['Semi-major axis', `${fixed(a, 3)} AU`],
        ['Orbital period', a ** 1.5 < 2 ? `${fixed(a ** 1.5 * 365.25, 1)} days` : `${fixed(a ** 1.5, 2)} years`],
        ['Eccentricity', fixed(o.el.e, 4)],
        ['Inclination', `${fixed(o.el.i, 2)}°`],
      );
    }
    const vol = (4 / 3) * Math.PI * (b.radiusKm * 1000) ** 3;
    rows.push(
      ['Mean radius', `${fixed(b.radiusKm, b.radiusKm < 100 ? 1 : 0)} km`],
      ['Mass', b.kind === 'star' ? `${sci(b.massKg, 4)} kg` : `${sig(b.massKg / 5.9722e24, 3)} M⊕`],
      ['Mean density', `${fixed(b.massKg / vol / 1000, 2)} g/cm³`],
    );
    if (b.gravity) rows.push(['Surface gravity', `${fixed(b.gravity, 2)} m/s²`]);
    if (b.escape) rows.push(['Escape velocity', `${fixed(b.escape, 1)} km/s`]);
    if (b.rotationH) rows.push(['Sidereal rotation', Math.abs(b.rotationH) > 48 ? `${fixed(Math.abs(b.rotationH) / 24, 2)} days${b.rotationH < 0 ? ' (retrograde)' : ''}` : `${fixed(Math.abs(b.rotationH), 2)} h${b.rotationH < 0 ? ' (retrograde)' : ''}`]);
    if (b.dayH) rows.push(['Length of day', b.dayH > 48 ? `${fixed(b.dayH / 24, 1)} days` : `${fixed(b.dayH, 2)} h`]);
    if (b.tilt !== undefined) rows.push(['Axial tilt', `${fixed(b.tilt, 2)}°`]);
    if (b.tempC !== undefined) rows.push([b.kind === 'star' ? 'Photosphere' : 'Mean temperature', `${b.tempC} °C`]);
    if (b.moons !== undefined) rows.push(['Known moons', String(b.moons)]);
    info.append(
      h('p', { class: 'eyebrow' }, b.kind === 'star' ? 'Our star' : b.kind === 'planet' ? 'Planet' : b.kind === 'dwarf' ? 'Dwarf planet' : 'Periodic comet'),
      h('p', { class: 'info-title', style: { marginTop: '6px' } }, b.name),
      h('div', { class: 'info-body' }, h('p', null, b.blurb), b.atmosphere ? h('p', null, h('strong', null, 'Atmosphere: '), b.atmosphere) : null, readout(rows).el),
    );
    if (b.majorMoons?.length)
      info.append(
        h('h3', { style: { marginTop: '16px' } }, 'Major moons'),
        readout(b.majorMoons.map((m) => [m.name, `${fixed(m.radiusKm, 0)} km · ${fixed(Math.abs(m.periodDays), 2)} d${m.periodDays < 0 ? ' retro.' : ''}`])).el,
      );
    if (focus) info.append(h('div', { class: 'btn-row', style: { marginTop: '14px' } }, button('Back to the Sun', () => setFocus(null))));
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
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best: Obj | null = null;
    let bd = 22;
    for (const o of objs) {
      v.copy(o.group.position).project(camera);
      if (v.z > 1) continue;
      const dd = Math.hypot((v.x * 0.5 + 0.5) * st.width - x, (-v.y * 0.5 + 0.5) * st.height - y);
      if (dd < bd) {
        bd = dd;
        best = o;
      }
    }
    if (best) setFocus(best);
  }) as EventListener);

  // ---------------------------------------------------------------- loop
  const fmtDate = (t: number) => {
    const dt = dateFromJulian(t);
    const y = dt.getUTCFullYear();
    return `${y < 0 ? y : String(y).padStart(4, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  };
  let infoTimer = 0;
  updatePositions();
  showInfo();
  const prevTarget = new THREE.Vector3();
  animate(stage, d, (_t, dt) => {
    if (playing) {
      jd += rate * dt;
      // stay inside the validity window of the elements
      if (jd > 2524593.5) jd = 2378496.5;
      if (jd < 2378496.5) jd = 2524593.5;
      updatePositions();
      infoTimer += dt;
      if (infoTimer > 0.5) {
        infoTimer = 0;
        showInfo();
      }
    }
    // follow the focused body
    const tgt = (focus ?? sunObj).group.position;
    if (flight) {
      const k = Math.min(1, (performance.now() - flight.t0) / 1200);
      const e = 1 - (1 - k) ** 3;
      controls.target.lerpVectors(flight.from, tgt, e);
      const dist = flight.startDist * (flight.to / flight.startDist) ** e;
      camera.position.copy(controls.target).addScaledVector(flight.dir, dist);
      if (k >= 1) flight = null;
    } else {
      const delta = tgt.clone().sub(prevTarget);
      controls.target.add(delta);
      camera.position.add(delta);
    }
    prevTarget.copy(tgt);
    controls.update();
    orbitGroup.visible = showOrbits;
    astPts.visible = kbPts.visible = showBelts;
    hudDate.innerHTML = `<div class="hud-label">Date (UTC)</div><div class="hud-big">${fmtDate(jd)}</div><div class="hud-label" style="margin-top:4px">${playing ? `${fixed(Math.abs(rate), 2)} days per second${rate < 0 ? ', reversed' : ''}` : 'Paused'}</div>`;
    if (!document.activeElement || document.activeElement !== dateInput) dateInput.value = fmtDate(jd);
    renderer.render(scene, camera);
    for (const o of objs) o.label.visible = showLabels;
    st.labels.update(camera, st.width, st.height);
  });

  // ---------------------------------------------------------------- focus from search
  if (ctx.params.focus) {
    const o = objs.find((x) => x.body.id === ctx.params.focus);
    if (o) setTimeout(() => setFocus(o), 50);
  }

  // ---------------------------------------------------------------- commentary
  page.notes.append(
    note(
      'Kepler’s three laws',
      `<ol><li>Each planet moves on an ellipse with the Sun at one focus.</li><li>A line from the Sun to a planet sweeps out equal areas in equal times, so planets move fastest at perihelion.</li><li>The square of the period is proportional to the cube of the semi-major axis.</li></ol>
       <div class="eq">P² = a³ <small>P in years, a in AU, around one solar mass</small></div>
       <p>Newton showed all three follow from an inverse-square force. The speed at any point is given by the vis-viva equation, v² = GM(2/r − 1/a).</p>`,
    ),
    note(
      'Six numbers fix an orbit',
      `<p>Size and shape come from the <strong>semi-major axis</strong> a and <strong>eccentricity</strong> e. Orientation needs three angles: the <strong>inclination</strong> i to the ecliptic, the <strong>longitude of the ascending node</strong> Ω, and the <strong>argument of perihelion</strong> ω. The sixth, the <strong>mean anomaly</strong> M, says where the body is along the ellipse at a given time.</p>
       <p>To place a planet, this plate solves Kepler’s equation for the eccentric anomaly E by Newton’s method:</p>
       <div class="eq">M = E − e sin E</div>`,
    ),
    note(
      'How empty it is',
      `<p>Switch to true scale. The Sun is 1.4 million km across, yet a light-beam leaving it takes 8 minutes 19 seconds to reach Earth and over 4 hours to reach Neptune. If the Sun were a 10 cm ball, Earth would be a grain of sand 11 metres away and Neptune would orbit at 320 metres.</p>
       <p>The asteroid belt is no obstacle course either: its millions of bodies add up to about 3 % of the Moon’s mass, and spacecraft cross it without manoeuvring.</p>`,
    ),
  );
  const tbl = h(
    'table',
    null,
    h(
      'thead',
      null,
      h('tr', null, ...['Planet', 'a (AU)', 'Period (yr)', 'e', 'i (°)', 'Radius (km)', 'Mass (M⊕)', 'Density (g/cm³)', 'Moons'].map((t, i) => h('th', { class: i ? 'num' : '' }, t))),
    ),
    h(
      'tbody',
      null,
      PLANETS.map((p) => {
        const el = p.elements!;
        const vol = (4 / 3) * Math.PI * (p.radiusKm * 1000) ** 3;
        return h(
          'tr',
          null,
          h('td', null, p.name),
          h('td', { class: 'num' }, fixed(el.a[0], 3)),
          h('td', { class: 'num' }, fixed(el.a[0] ** 1.5, 2)),
          h('td', { class: 'num' }, fixed(el.e[0], 3)),
          h('td', { class: 'num' }, fixed(el.i[0], 2)),
          h('td', { class: 'num' }, fixed(p.radiusKm, 0)),
          h('td', { class: 'num' }, sig(p.massKg / 5.9722e24, 3)),
          h('td', { class: 'num' }, fixed(p.massKg / vol / 1000, 2)),
          h('td', { class: 'num' }, String(p.moons)),
        );
      }),
    ),
  );
  page.notes.append(h('section', { class: 'note note--wide' }, h('h2', null, 'The planets at J2000'), h('div', { class: 'table-wrap' }, tbl)));

  return () => d.dispose();
}
