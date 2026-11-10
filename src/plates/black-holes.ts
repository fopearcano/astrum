// Plate IX — Black Holes and Gravitational Waves.
// A Schwarzschild black hole ray-traced on the GPU, a calculator, and an audible chirp.

import * as THREE from 'three';
import { Disposer, h, prefersReducedMotion } from '../lib/dom';
import { animate, createSurface, gestures, invalidator, linScale } from '../lib/canvas';
import { drawAxes, label, niceLinearTicks } from '../lib/chart';
import { onThemeChange, palette } from '../lib/theme';
import { button, icons, panel, readout, segmented, slider, toggle } from '../lib/ui';
import { duration, fixed, sci, seconds, sig, length as fmtLength } from '../lib/format';
import { blackbodyRGB } from '../physics/blackbody';
import { blackHole, chirpMass, chirpWaveform, gwTimeToMerge, iscoFrequency } from '../physics/relativity';
import { figure, note, platePage } from './page';
import { PlateContext, plateById } from './registry';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Units: Schwarzschild radius r_s = 1. Photon paths obey the Schwarzschild orbit
// equation, which in Cartesian form is a central acceleration a = −(3/2) h² r̂ / r⁴
// (h = |r × v| is conserved). Integrated with velocity Verlet and an adaptive step.
const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform vec3 uCam;
uniform mat3 uBasis;
uniform float uFov;
uniform float uTime;
uniform float uDisk;
uniform float uDoppler;
uniform float uLens;
uniform float uGrid;
uniform float uOuter;
uniform float uTdisk;
uniform sampler2D uLut;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 blackbody(float T) {
  float u = clamp((log(T) - log(1000.0)) / (log(40000.0) - log(1000.0)), 0.0, 1.0);
  return texture2D(uLut, vec2(u, 0.5)).rgb;
}
vec3 background(vec3 d) {
  if (uGrid > 0.5) {
    float lon = atan(d.z, d.x); float lat = asin(clamp(d.y, -1.0, 1.0));
    float gx = abs(fract(lon / 3.14159 * 9.0) - 0.5); float gy = abs(fract(lat / 3.14159 * 9.0) - 0.5);
    float line = smoothstep(0.47, 0.5, max(gx, gy));
    vec3 base = mix(vec3(0.05, 0.07, 0.12), vec3(0.12, 0.1, 0.06), step(0.0, d.y));
    return base + line * vec3(0.55, 0.48, 0.32);
  }
  vec3 col = vec3(0.0);
  // faint galactic band and nebulosity
  float band = exp(-pow(d.y * 3.0 + 0.4 * d.x, 2.0));
  float n = noise(d * 4.0) * 0.6 + noise(d * 9.0) * 0.3;
  col += vec3(0.10, 0.11, 0.16) * band * n;
  // stars on a 3D lattice
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 90.0 : 220.0;
    vec3 p = d * sc; vec3 c = floor(p);
    float h = hash(c);
    if (h > (k == 0 ? 0.985 : 0.992)) {
      vec3 sp = c + 0.5 + 0.35 * (vec3(hash(c + 1.3), hash(c + 2.7), hash(c + 4.1)) - 0.5);
      float dist = length(p - sp);
      float b = smoothstep(0.35, 0.0, dist) * (k == 0 ? 1.4 : 0.7);
      vec3 tint = blackbody(3000.0 + 9000.0 * hash(c + 7.7));
      col += tint * b;
    }
  }
  return col;
}

void main() {
  vec2 uv = (vUv * 2.0 - 1.0) * vec2(uRes.x / uRes.y, 1.0);
  vec3 dir = normalize(uBasis * vec3(uv * tan(uFov * 0.5), 1.0));
  vec3 pos = uCam;
  vec3 vel = dir;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool done = false;
  for (int i = 0; i < 520; i++) {
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    if (r < 1.0) { done = true; break; }
    float dt = clamp(0.026 * r * r, 0.01, 0.9);
    vec3 acc = uLens > 0.5 ? -1.5 * h2 * pos / (r2 * r2 * r) : vec3(0.0);
    vec3 npos = pos + vel * dt + 0.5 * acc * dt * dt;
    float nr2 = dot(npos, npos);
    vec3 nacc = uLens > 0.5 ? -1.5 * h2 * npos / (nr2 * nr2 * sqrt(nr2)) : vec3(0.0);
    vec3 nvel = vel + 0.5 * (acc + nacc) * dt;
    if (uDisk > 0.5 && pos.y * npos.y < 0.0) {
      float t = pos.y / (pos.y - npos.y);
      vec3 hit = mix(pos, npos, t);
      float rr = length(hit.xz);
      if (rr > 3.0 && rr < uOuter) {
        // Novikov–Thorne / Shakura–Sunyaev temperature profile with an inner edge at the ISCO
        float prof = pow(rr / 3.0, -0.75) * pow(max(1.0 - sqrt(3.0 / rr), 0.0), 0.25);
        float T = uTdisk * prof / 0.488;
        float g = 1.0;
        if (uDoppler > 0.5) {
          float beta = sqrt(0.5 / (rr - 1.0));
          vec3 vdir = normalize(vec3(-hit.z, 0.0, hit.x));
          float cosT = dot(vdir, -normalize(vel));
          float gamma = 1.0 / sqrt(1.0 - beta * beta);
          g = sqrt(1.0 - 1.0 / rr) / (gamma * (1.0 - beta * cosT));
        }
        float swirl = 0.75 + 0.25 * noise(vec3(rr * 2.2, atan(hit.z, hit.x) * 3.0 - uTime * 0.6 / pow(rr, 1.5) * 8.0, 0.0));
        float edge = smoothstep(uOuter, uOuter * 0.7, rr) * smoothstep(3.0, 3.4, rr);
        vec3 emit = blackbody(T * g) * pow(g, 3.0) * prof * 1.1 * swirl * edge;
        float a = clamp(0.92 * edge, 0.0, 1.0);
        col += (1.0 - alpha) * emit * a;
        alpha += (1.0 - alpha) * a;
        if (alpha > 0.98) { done = true; break; }
      }
    }
    pos = npos; vel = nvel;
    if (r > 80.0 && dot(pos, vel) > 0.0) break;
  }
  if (!done) col += (1.0 - alpha) * background(normalize(vel));
  // filmic tone map
  col = col / (1.0 + col);
  col = pow(col, vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}
`;

const NOTABLE = [
  { name: 'Gaia BH1', mass: 9.62, dist: '1,560 ly', note: 'The nearest known black hole, found in 2022 from its companion star’s wobble. Dormant: nothing falls in.' },
  { name: 'Cygnus X-1', mass: 21.2, dist: '7,200 ly', note: 'An X-ray binary that was the first object widely accepted as a black hole, in the early 1970s.' },
  { name: 'Gaia BH3', mass: 33, dist: '1,930 ly', note: 'The most massive stellar black hole known in the Milky Way, announced in 2024.' },
  { name: 'GW150914 remnant', mass: 62, dist: '1.3 billion ly', note: 'Formed when two black holes of 36 and 29 M☉ merged: the first gravitational-wave detection, 14 September 2015.' },
  { name: 'Sagittarius A*', mass: 4.3e6, dist: '26,700 ly', note: 'The black hole at the centre of the Milky Way. Its mass comes from decades of tracking stars such as S2; imaged by the EHT in 2022.' },
  { name: 'M87*', mass: 6.5e9, dist: '55 million ly', note: 'The first black hole ever imaged, by the Event Horizon Telescope in 2019. It launches a jet 5,000 light-years long.' },
  { name: 'TON 618', mass: 4e10, dist: '10.8 billion ly (light travel)', note: 'One of the most massive black holes known, powering a quasar 140 trillion times as luminous as the Sun.' },
];

export function mount(root: HTMLElement, _ctx: PlateContext): () => void {
  const d = new Disposer();
  const page = platePage(plateById('black-holes')!, {
    dek: 'A black hole is a region of spacetime from which nothing escapes. Its shadow, ringed by light bent through nearly a full circle, is what the Event Horizon Telescope photographed. This plate ray-traces that picture live on your graphics card.',
    caption:
      '<b>Fig. IX.1.</b> A non-spinning (Schwarzschild) black hole with a thin accretion disk, rendered by integrating the path of each light ray backwards from the camera. The disk’s inner edge sits at the innermost stable circular orbit, 3 r<sub>s</sub>. Light from the far side of the disk is lensed over the top and under the bottom of the shadow. Doppler beaming brightens and blues the side moving toward you. Disk colours assume a peak temperature you can set; real disks around supermassive black holes peak in the ultraviolet. Drag to orbit; scroll to change distance.',
    stageLabel: 'Ray-traced black hole',
  });
  root.append(page.root);
  const stage = page.stage;

  // ---------------------------------------------------------------- renderer
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  } catch {
    stage.append(h('div', { class: 'loading' }, 'This plate needs WebGL, which is not available in this browser.'));
    return () => d.dispose();
  }
  const canvas = renderer.domElement;
  stage.prepend(canvas);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  const scene = new THREE.Scene();
  const cam = new THREE.Camera();
  const lutData = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const T = Math.exp(Math.log(1000) + (i / 255) * (Math.log(40000) - Math.log(1000)));
    const [r, g, b] = blackbodyRGB(T);
    lutData.set([r, g, b, 255], i * 4);
  }
  const lut = new THREE.DataTexture(lutData, 256, 1, THREE.RGBAFormat);
  lut.magFilter = lut.minFilter = THREE.LinearFilter;
  lut.colorSpace = THREE.NoColorSpace;
  lut.needsUpdate = true;
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uCam: { value: new THREE.Vector3() },
    uBasis: { value: new THREE.Matrix3() },
    uFov: { value: (55 * Math.PI) / 180 },
    uTime: { value: 0 },
    uDisk: { value: 1 },
    uDoppler: { value: 1 },
    uLens: { value: 1 },
    uGrid: { value: 0 },
    uOuter: { value: 14 },
    uTdisk: { value: 4500 },
    uLut: { value: lut },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

  let quality = 0.6;
  let W = 1, H = 1;
  const fit = () => {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    uniforms.uRes.value.set(W, H);
    dirty = true;
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  d.add(() => {
    ro.disconnect();
    mat.dispose();
    lut.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  });

  // orbit camera
  let dist = 22;
  let az = 0.35;
  let el = 0.13; // radians above the disk plane
  let dirty = true;
  let spin = !prefersReducedMotion();
  const updateCam = () => {
    const p = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(dist);
    const f = p.clone().multiplyScalar(-1).normalize();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, f).normalize();
    uniforms.uCam.value.copy(p);
    uniforms.uBasis.value.set(right.x, up.x, f.x, right.y, up.y, f.y, right.z, up.z, f.z);
    dirty = true;
  };
  updateCam();
  fit();
  gestures(stage, d, {
    onDrag: (dx, dy) => {
      az -= dx * 0.005;
      el = Math.max(-1.45, Math.min(1.45, el + dy * 0.005));
      updateCam();
    },
    onZoom: (f) => {
      dist = Math.max(4, Math.min(80, dist / f));
      updateCam();
    },
  });
  const hud = h('div', { class: 'hud hud--tl' });
  stage.append(hud, h('div', { class: 'stage-hint' }, 'Drag to orbit · scroll to move closer'));
  const paintHud = () => {
    hud.innerHTML = `<div class="hud-label">Camera</div><div class="mono">${fixed(dist, 1)} r<sub>s</sub> from the centre</div><div class="mono">${fixed((el * 180) / Math.PI, 0)}° above the disk</div>`;
  };
  animate(stage, d, (_t, dt) => {
    uniforms.uTime.value += dt;
    if (spin) {
      az += dt * 0.03;
      updateCam();
    }
    if (dirty || uniforms.uDisk.value) {
      renderer.render(scene, cam);
      dirty = false;
      paintHud();
    }
  });

  // ---------------------------------------------------------------- key: render options
  page.key.append(
    panel(
      'Rendering',
      h(
        'div',
        { class: 'controls' },
        h(
          'div',
          { class: 'chips' },
          toggle('bh-disk', 'Accretion disk', true, (v) => { uniforms.uDisk.value = v ? 1 : 0; dirty = true; }),
          toggle('bh-doppler', 'Doppler beaming', true, (v) => { uniforms.uDoppler.value = v ? 1 : 0; dirty = true; }),
          toggle('bh-lens', 'Bend light', true, (v) => { uniforms.uLens.value = v ? 1 : 0; dirty = true; }),
          toggle('bh-grid', 'Grid backdrop', false, (v) => { uniforms.uGrid.value = v ? 1 : 0; dirty = true; }),
          toggle('bh-spin', 'Orbit slowly', spin, (v) => { spin = v; }),
        ),
        slider({ id: 'bh-tdisk', label: 'Peak disk temperature', min: 2000, max: 30000, value: 4500, log: true, format: (v) => `${fixed(v, 0)} K`, onInput: (v) => { uniforms.uTdisk.value = v; dirty = true; } }).el,
        segmented({ label: 'Resolution', options: [{ value: '0.4', label: 'Fast' }, { value: '0.6', label: 'Balanced' }, { value: '1', label: 'Sharp' }], value: '0.6', onChange: (v) => { quality = Number(v); fit(); } }).el,
        h('div', { class: 'btn-row' },
          button('Edge-on', () => { el = 0.05; updateCam(); }),
          button('From above', () => { el = 1.2; updateCam(); }),
          button('Close in', () => { dist = 7; el = 0.15; updateCam(); }),
        ),
      ),
    ),
  );

  // ---------------------------------------------------------------- key: calculator
  let Msol = 4.3e6;
  const calc = readout([]);
  const calcNote = h('p', { class: 'info-sub' });
  const mSlider = slider({ id: 'bh-mass', label: 'Mass', min: 1e-8, max: 1e11, value: Msol, log: true, format: (v) => `${sig(v, 3)} M☉`, onInput: (v) => { Msol = v; paintCalc(); } });
  function paintCalc(): void {
    const b = blackHole(Msol);
    calc.update([
      ['Event horizon radius r_s', fmtLength(b.rs)],
      ['Photon sphere', fmtLength(b.photonSphere)],
      ['Innermost stable orbit', fmtLength(b.isco)],
      ['Orbit period at ISCO', seconds(b.iscoPeriod)],
      ['Mean density inside r_s', `${sci(b.density, 3)} kg/m³`],
      ['Tidal stretch on a 2 m body at r_s', `${sci(b.tidal, 3)} m/s²`],
      ['Hawking temperature', `${sci(b.hawkingT, 3)} K`],
      ['Evaporation time', duration(b.evaporation)],
    ]);
    calcNote.textContent =
      b.tidal > 1e4
        ? 'Tides would tear a person apart well outside the horizon (spaghettification).'
        : 'Tides at the horizon are gentle: you could cross it intact, never to return.';
  }
  paintCalc();
  page.key.append(
    panel(
      'Calculator',
      h(
        'div',
        { class: 'controls' },
        mSlider.el,
        h('div', { class: 'btn-row' }, ...[['Earth', 3.0e-6], ['Sun', 1], ['Cygnus X-1', 21.2], ['Sgr A*', 4.3e6], ['M87*', 6.5e9]].map(([n, m]) => button(n as string, () => { Msol = m as number; mSlider.set(Msol); paintCalc(); }))),
        calc.el,
        calcNote,
        h('p', { class: 'info-sub' }, 'The rendering is the same for every mass: in units of r_s a Schwarzschild black hole has no other scale.'),
      ),
    ),
  );

  // ---------------------------------------------------------------- Fig IX.2 chirp
  const gwStage = h('div', { class: 'stage stage--chart', style: { height: '320px' }, role: 'img', 'aria-label': 'Gravitational-wave strain against time' });
  let m1 = 36, m2 = 29;
  let shift = 4;
  const gwSurf = createSurface(gwStage, d, () => gwRedraw());
  const gwRedraw = invalidator(drawChirp);
  let wave = chirpWaveform(m1, m2, 20, 4096);
  let playhead: number | null = null;
  function drawChirp(): void {
    const { ctx, width: Wd, height: Ht } = gwSurf;
    const pal = palette();
    ctx.fillStyle = pal.surface2;
    ctx.fillRect(0, 0, Wd, Ht);
    const box = { x: 56, y: 20, w: Wd - 56 - 20, h: Ht - 20 - 50 };
    const tMerge = wave.mergerIndex / wave.sampleRate;
    const tShow = Math.min(tMerge, 0.6);
    const t0 = -tShow;
    const t1 = (wave.h.length - wave.mergerIndex) / wave.sampleRate;
    const x = linScale(t0, t1, box.x, box.x + box.w);
    const y = linScale(-1.15, 1.15, box.y + box.h, box.y);
    drawAxes(ctx, box, pal, { ticks: niceLinearTicks(t0, t1, 6), scale: x, label: (v) => `${fixed(v, 2)} s`, title: 'Time relative to merger' }, { ticks: [-1, 0, 1], scale: y, label: (v) => fixed(v, 0), title: 'Strain (normalised)' });
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.strokeStyle = pal.series[0];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const i0 = Math.max(0, wave.mergerIndex - Math.round(tShow * wave.sampleRate));
    const perPx = Math.max(1, Math.floor((wave.h.length - i0) / box.w / 2));
    for (let i = i0; i < wave.h.length; i += perPx) {
      const t = (i - wave.mergerIndex) / wave.sampleRate;
      if (i === i0) ctx.moveTo(x(t), y(wave.h[i]));
      else ctx.lineTo(x(t), y(wave.h[i]));
    }
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = pal.axis;
    ctx.beginPath();
    ctx.moveTo(x(0), box.y);
    ctx.lineTo(x(0), box.y + box.h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'Merger', x(0) + 6, box.y + 12, pal, { color: pal.fg2, font: `11px ${pal.fontMono}` });
    if (playhead !== null) {
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x(playhead), box.y);
      ctx.lineTo(x(playhead), box.y + box.h);
      ctx.stroke();
    }
    gwRead.update([
      ['Chirp mass', `${fixed(chirpMass(m1, m2), 1)} M☉`],
      ['Time in band from 20 Hz', seconds(gwTimeToMerge(chirpMass(m1, m2), 20))],
      ['Frequency at ISCO', `${fixed(iscoFrequency(m1 + m2), 0)} Hz`],
      ['Ringdown frequency', `${fixed(wave.fRing, 0)} Hz`],
      ['Final mass (≈ 95 %)', `${fixed(0.952 * (m1 + m2), 1)} M☉`],
      ['Energy radiated', `${fixed(0.048 * (m1 + m2), 1)} M☉c²`],
    ]);
  }
  const gwRead = readout([]);
  const rebuild = () => {
    wave = chirpWaveform(m1, m2, 20, 4096);
    gwRedraw();
  };
  const m1S = slider({ id: 'gw-m1', label: 'Mass 1', min: 1.2, max: 100, value: m1, log: true, format: (v) => `${fixed(v, 1)} M☉`, onInput: (v) => { m1 = v; rebuild(); } });
  const m2S = slider({ id: 'gw-m2', label: 'Mass 2', min: 1.2, max: 100, value: m2, log: true, format: (v) => `${fixed(v, 1)} M☉`, onInput: (v) => { m2 = v; rebuild(); } });
  let audio: AudioContext | null = null;
  const playBtn = h('button', { type: 'button', class: 'btn btn--primary', id: 'gw-play', html: `${icons.sound}<span>Play the chirp</span>` });
  playBtn.addEventListener('click', () => {
    try {
      audio ??= new AudioContext();
      const sr = audio.sampleRate;
      // Resample the strain at `shift` times the true frequency.
      const tStart = Math.max(0, wave.mergerIndex / wave.sampleRate - 4);
      const total = wave.h.length / wave.sampleRate - tStart;
      const n = Math.ceil((total / shift) * sr) + Math.ceil(0.15 * sr);
      const buf = audio.createBuffer(1, n, sr);
      const out = buf.getChannelData(0);
      for (let k = 0; k < n; k++) {
        const t = tStart + (k / sr) * shift;
        const j = Math.floor(t * wave.sampleRate);
        if (j >= wave.h.length) break;
        const env = Math.min(1, k / (0.05 * sr));
        out[k] = 0.6 * env * wave.h[j];
      }
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.connect(audio.destination);
      const startAt = audio.currentTime;
      src.start();
      const mergeAt = (wave.mergerIndex / wave.sampleRate - tStart) / shift;
      const tick = () => {
        if (!audio) return;
        const el2 = audio.currentTime - startAt;
        if (el2 > n / sr) {
          playhead = null;
          gwRedraw();
          return;
        }
        playhead = (el2 - mergeAt) * shift;
        gwRedraw();
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      gwNote.textContent = 'Audio is not available in this browser.';
    }
  });
  d.add(() => audio?.close());
  const gwNote = h('p', { class: 'info-sub' });
  page.notes.before(
    figure(
      'Fig. IX.2 · The sound of two black holes merging',
      gwStage,
      '<b>Fig. IX.2.</b> The gravitational-wave strain from two black holes spiralling together. Frequency and amplitude climb as the orbit shrinks (the “chirp”), then the merged hole rings down. Inspiral from the leading-order (quadrupole) formula, ringdown from the fundamental quasi-normal mode of a spinning remnant; real templates add many higher-order terms. Stellar-mass mergers chirp at audio frequencies.',
      h(
        'div',
        { class: 'key' },
        panel(
          'Binary',
          h(
            'div',
            { class: 'controls' },
            m1S.el,
            m2S.el,
            h('div', { class: 'btn-row' }, ...[['GW150914', 36, 29], ['GW170817 (neutron stars)', 1.46, 1.27], ['Light pair', 8, 6]].map(([n, a, b]) => button(n as string, () => { m1 = a as number; m2 = b as number; m1S.set(m1); m2S.set(m2); rebuild(); }))),
            segmented({ label: 'Playback pitch', options: [{ value: '1', label: 'True pitch' }, { value: '4', label: 'Two octaves up' }], value: '4', onChange: (v) => (shift = Number(v)) }).el,
            playBtn,
            gwNote,
            gwRead.el,
          ),
        ),
      ),
    ),
  );
  d.add(onThemeChange(gwRedraw));

  // ---------------------------------------------------------------- notable black holes
  const tbl = h(
    'table',
    null,
    h('thead', null, h('tr', null, h('th', null, 'Black hole'), h('th', { class: 'num' }, 'Mass (M☉)'), h('th', { class: 'num' }, 'Horizon radius'), h('th', null, 'Distance'), h('th', null, 'Why it matters'))),
    h(
      'tbody',
      null,
      NOTABLE.map((b) => {
        const tr = h('tr', { class: 'is-clickable', tabindex: '0' }, h('td', null, b.name), h('td', { class: 'num' }, sig(b.mass, 3)), h('td', { class: 'num' }, fmtLength(blackHole(b.mass).rs)), h('td', null, b.dist), h('td', null, b.note));
        const go = () => { Msol = b.mass; mSlider.set(Msol); paintCalc(); page.key.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        tr.addEventListener('click', go);
        tr.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        return tr;
      }),
    ),
  );
  page.notes.append(
    note(
      'Anatomy of a black hole',
      `<p>For a non-spinning black hole of mass M every length scales with the <strong>Schwarzschild radius</strong>:</p>
       <div class="eq">r<sub>s</sub> = 2GM / c² ≈ 2.95 km × (M / M☉)</div>
       <ul><li><strong>Event horizon</strong> at r<sub>s</sub>: the point of no return.</li><li><strong>Photon sphere</strong> at 1.5 r<sub>s</sub>: light can circle here, unstably.</li><li><strong>Shadow</strong>: a dark disc of radius 2.6 r<sub>s</sub>, the size the EHT measures.</li><li><strong>ISCO</strong> at 3 r<sub>s</sub>: inside this, orbiting gas plunges.</li></ul>`,
    ),
    note(
      'Why the disk looks bent',
      `<p>Gravity bends light by an angle that grows sharply close to the hole. Light leaving the top of the disk behind the hole is bent over the shadow and reaches you, so the far side appears as an arch. Light from the underside comes round below, forming a thinner ring.</p>
       <p>Gas orbits at up to half the speed of light near the ISCO. The side coming toward you is <strong>beamed</strong>: brighter and bluer. The receding side is dimmer and redder.</p>`,
    ),
    note(
      'Hearing spacetime ring',
      `<p>On 14 September 2015 the two LIGO detectors, 3,000 km apart, each stretched by about a thousandth of a proton’s width as waves from a merger 1.3 billion light-years away passed through. Three solar masses of energy left as gravitational waves in a fifth of a second.</p>
       <p>The rate at which frequency rises reveals the <strong>chirp mass</strong>:</p>
       <div class="eq">ḟ = (96/5) π<sup>8/3</sup> (G𝓜/c³)<sup>5/3</sup> f<sup>11/3</sup></div>`,
    ),
    h('section', { class: 'note note--wide' }, h('h2', null, 'Notable black holes'), h('p', null, 'Select a row to load its mass into the calculator.'), h('div', { class: 'table-wrap' }, tbl)),
  );
  return () => d.dispose();
}
