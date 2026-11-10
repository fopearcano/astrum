// Procedural equirectangular textures for Solar System bodies.
// Stylised but faithful to each body's real palette and large-scale features.

import * as THREE from 'three';
import type { Body } from '../data/solar-system';
import { makeNoise } from './noise';

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export function planetTexture(body: Body, size = 512): THREE.CanvasTexture {
  const W = size;
  const H = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const seed = [...body.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const { fbm, noise } = makeNoise(seed);
  const cols = body.colors.map(hex);

  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W) * Math.PI * 2;
      const x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      let c: number[];
      switch (body.surface) {
        case 'banded': {
          const warp = fbm(x * 3, y * 3, z * 3, 4) - 0.5;
          const band = Math.sin((y + warp * 0.08) * (body.id === 'jupiter' ? 26 : 18) + fbm(x * 1.5, y * 9, z * 1.5, 3) * 3);
          const t = band * 0.5 + 0.5;
          c = mix(cols[0], cols[1 + (Math.floor((y + 1) * 6) % (cols.length - 1))], t * 0.75);
          c = mix(c, cols[cols.length - 1], clamp01((fbm(x * 8, y * 30, z * 8, 3) - 0.55) * 2));
          if (body.id === 'jupiter') {
            // Great Red Spot, about 22° south
            const dLat = (lat * 180) / Math.PI + 22;
            const dLon = ((((lon * 180) / Math.PI - 60 + 540) % 360) - 180);
            const e = (dLat / 5.5) ** 2 + (dLon / 11) ** 2;
            if (e < 1) c = mix(c, [190, 110, 80], (1 - e) * 0.85);
          }
          break;
        }
        case 'ice': {
          const t = fbm(x * 2, y * 10, z * 2, 3);
          c = mix(cols[0], cols[1], t);
          c = mix(c, cols[2], clamp01((Math.abs(y) - 0.7) * 2));
          if (body.id === 'neptune') {
            const dLat = (lat * 180) / Math.PI + 20;
            const dLon = ((((lon * 180) / Math.PI - 200 + 540) % 360) - 180);
            if ((dLat / 6) ** 2 + (dLon / 12) ** 2 < 1) c = mix(c, [30, 40, 110], 0.6);
          }
          break;
        }
        case 'earth': {
          const n = fbm(x * 2.2, y * 2.2, z * 2.2, 6);
          const land = n > 0.52;
          const ice = Math.abs(y) > 0.9 - fbm(x * 4, y * 4, z * 4, 3) * 0.12;
          if (ice) c = [240, 244, 248];
          else if (land) {
            const dry = clamp01((1 - Math.abs(y) * 2.2) * 1.4 + (fbm(x * 5, y * 5, z * 5, 3) - 0.5));
            c = mix(cols[1], cols[2], dry * 0.8);
          } else c = mix(cols[0], [10, 40, 90], clamp01((0.52 - n) * 4));
          const cloud = fbm(x * 4 + 10, y * 7, z * 4, 5);
          c = mix(c, [250, 252, 255], clamp01((cloud - 0.55) * 2.6) * 0.85);
          break;
        }
        case 'mars': {
          const n = fbm(x * 3, y * 3, z * 3, 6);
          c = mix(cols[0], cols[1], clamp01((n - 0.45) * 3));
          c = mix(c, cols[2], clamp01((0.4 - n) * 3));
          if (Math.abs(y) > 0.93) c = mix(c, [245, 240, 232], 0.9);
          break;
        }
        case 'venus': {
          const n = fbm(x * 2 + fbm(x * 4, y * 4, z * 4, 2), y * 5, z * 2, 5);
          c = mix(cols[1], cols[2], n);
          break;
        }
        case 'pluto': {
          const n = fbm(x * 3, y * 3, z * 3, 5);
          c = mix(cols[1], cols[0], clamp01(n * 1.4 - 0.1));
          if (body.id === 'pluto') {
            // Tombaugh Regio, the bright "heart"
            const dLat = (lat * 180) / Math.PI - 15;
            const dLon = ((((lon * 180) / Math.PI - 180 + 540) % 360) - 180);
            if ((dLat / 28) ** 2 + (dLon / 30) ** 2 < 1) c = mix(c, cols[2], 0.85);
          }
          break;
        }
        case 'sun': {
          const n = fbm(x * 12, y * 12, z * 12, 4);
          c = mix(cols[1], cols[0], clamp01(n * 1.6 - 0.3));
          break;
        }
        default: {
          // rocky, cratered
          const n = fbm(x * 4, y * 4, z * 4, 6);
          c = mix(cols[1], cols[2], n);
          const cr = noise(x * 18, y * 18, z * 18);
          if (cr > 0.82) c = mix(c, cols[1], 0.5);
          if (cr < 0.12) c = mix(c, cols[2], 0.4);
        }
      }
      const k = (j * W + i) * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Saturn-style ring texture: radial bands along u (inner → outer). */
export function ringTexture(kind: 'saturn' | 'uranus' | 'jupiter'): THREE.CanvasTexture {
  const W = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  const { fbm } = makeNoise(kind.length * 17);
  for (let i = 0; i < W; i++) {
    const t = i / W;
    let a = 0;
    let col = [220, 205, 170];
    if (kind === 'saturn') {
      // radii in Saturn radii from 1.24 (inner C ring) to 2.27 (outer A ring)
      const r = 1.24 + t * (2.27 - 1.24);
      if (r < 1.53) a = 0.25; // C ring
      else if (r < 1.95) a = 0.9; // B ring
      else if (r < 2.03) a = 0.06; // Cassini division
      else if (r < 2.21 || r > 2.225) a = 0.65; // A ring with the Encke gap
      a *= 0.75 + 0.5 * fbm(t * 60, 0.5, 0.5, 3);
      col = r < 1.53 ? [170, 160, 140] : [225, 210, 178];
    } else if (kind === 'uranus') {
      a = Math.abs(t - 0.95) < 0.02 || Math.abs(t - 0.5) < 0.01 || Math.abs(t - 0.3) < 0.008 ? 0.5 : 0.02;
      col = [190, 200, 210];
    } else {
      a = 0.08 * fbm(t * 20, 0.2, 0.2, 2);
      col = [200, 180, 160];
    }
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.max(0, Math.min(1, a))})`;
    ctx.fillRect(i, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft radial glow sprite texture. */
export function glowTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,170,60,0)'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.2, inner.replace(/[\d.]+\)$/, '0.6)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Round point sprite with soft edges, for star and particle fields. */
export function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
