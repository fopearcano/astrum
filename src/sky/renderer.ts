// Planetarium-style renderer for the celestial sphere on a 2D canvas.
// Stereographic or orthographic projection, equatorial or horizon (alt-az) frame.

import type { ConstellationData, MessierObject, MilkyWayData, StarCatalog } from '../lib/data';
import { Mat3, OBLIQUITY, eclipticToEquatorial, equatorialToHorizontalMatrix, matMul, radecToVec } from '../physics/coords';
import type { SkyBody } from '../physics/ephemeris';
import { bvCss } from '../physics/blackbody';
import { lst as localSiderealTime } from '../physics/time';
import type { Palette } from '../lib/theme';

const D2R = Math.PI / 180;

export type Frame = 'equatorial' | 'horizon';
export type Projection = 'stereographic' | 'orthographic';

export interface SkyView {
  frame: Frame;
  projection: Projection;
  /** View centre in frame coordinates: RA/Dec, or azimuth/altitude. */
  lon: number;
  lat: number;
  fov: number; // degrees across the shorter side of the canvas
  jd: number;
  latitude: number; // observer
  longitude: number; // observer, east positive
}

export interface SkyLayers {
  lines: boolean;
  borders: boolean;
  conNames: boolean;
  starNames: boolean;
  grid: boolean;
  ecliptic: boolean;
  milkyway: boolean;
  messier: boolean;
  planets: boolean;
}

export type Pick =
  | { kind: 'star'; index: number }
  | { kind: 'body'; body: SkyBody }
  | { kind: 'dso'; obj: MessierObject }
  | { kind: 'con'; id: string };

export interface SkyData {
  stars: StarCatalog;
  cons?: ConstellationData;
  mw?: MilkyWayData;
  messier?: MessierObject[];
}

/** Rows: screen-right, screen-up, forward, for a view centred at (lon, lat). */
export function viewMatrix(lonDeg: number, latDeg: number): Mat3 {
  const l = lonDeg * D2R;
  const b = latDeg * D2R;
  const f = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  const u = [-Math.sin(b) * Math.cos(l), -Math.sin(b) * Math.sin(l), Math.cos(b)];
  const r = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
  return [r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Sky colour for a given solar altitude, night to full day. */
export function skyColour(sunAlt: number): string {
  const stops: [number, string][] = [
    [-18, '#03050a'],
    [-12, '#070d1e'],
    [-6, '#14264a'],
    [0, '#3a5f93'],
    [10, '#5d8fcb'],
  ];
  if (sunAlt <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (sunAlt <= stops[i][0]) {
      const t = (sunAlt - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return mixHex(stops[i - 1][1], stops[i][1], t);
    }
  }
  return stops[stops.length - 1][1];
}

export function twilightName(sunAlt: number): string {
  if (sunAlt > 0) return 'Daylight';
  if (sunAlt > -6) return 'Civil twilight';
  if (sunAlt > -12) return 'Nautical twilight';
  if (sunAlt > -18) return 'Astronomical twilight';
  return 'Night';
}

export class SkyRenderer {
  private starVec: Float32Array;
  private starColor: string[];
  private lineVecs: { id: string; segs: Float32Array[] }[] = [];
  private borderVecs: Float32Array[] = [];
  private mwVecs: Float32Array[][][] = [];
  private messierVec: Float32Array = new Float32Array(0);
  private ecliptic: Float32Array;
  private bodies: SkyBody[] = [];
  // screen positions from the last draw, for picking
  private drawnStars: number[] = [];
  private drawnBodies: { body: SkyBody; x: number; y: number; r: number }[] = [];
  private drawnDso: { obj: MessierObject; x: number; y: number }[] = [];
  private drawnCons: { id: string; x: number; y: number }[] = [];
  private M: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private H: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private S = 1;
  private cx = 0;
  private cy = 0;
  private proj: Projection = 'stereographic';
  sunAlt = -90;

  constructor(public data: SkyData) {
    const s = data.stars;
    this.starVec = new Float32Array(s.count * 3);
    this.starColor = new Array(s.count);
    for (let i = 0; i < s.count; i++) {
      this.starVec.set(radecToVec(s.ra[i], s.dec[i]), i * 3);
      this.starColor[i] = bvCss(s.ci[i]);
    }
    if (data.cons) {
      for (const [id, lines] of Object.entries(data.cons.lines))
        this.lineVecs.push({ id, segs: lines.map((l) => Float32Array.from(l.flatMap(([ra, dec]) => radecToVec(ra, dec)))) });
      this.borderVecs = data.cons.borders.map((b) => {
        const out: number[] = [];
        for (let i = 0; i < b.length; i += 2) out.push(...radecToVec(b[i], b[i + 1]));
        return Float32Array.from(out);
      });
    }
    if (data.mw)
      this.mwVecs = data.mw.levels.map((level) =>
        level.map((poly) =>
          poly.map((ring) => {
            const out: number[] = [];
            for (let i = 0; i < ring.length; i += 2) out.push(...radecToVec(ring[i], ring[i + 1]));
            return Float32Array.from(out);
          }),
        ),
      );
    if (data.messier) this.messierVec = Float32Array.from(data.messier.flatMap((m) => radecToVec(m.ra, m.dec)));
    const ecl: number[] = [];
    for (let l = 0; l <= 360; l += 2) {
      const v = eclipticToEquatorial({ x: Math.cos(l * D2R), y: Math.sin(l * D2R), z: 0 });
      ecl.push(v.x, v.y, v.z);
    }
    this.ecliptic = Float32Array.from(ecl);
  }

  setBodies(b: SkyBody[]): void {
    this.bodies = b;
  }

  /** Equatorial → horizontal matrix for the current view (identity in equatorial frame). */
  horizonMatrix(v: SkyView): Mat3 {
    return equatorialToHorizontalMatrix(localSiderealTime(v.jd, v.longitude), v.latitude);
  }

  private setup(v: SkyView, w: number, h: number): void {
    this.proj = v.projection;
    this.cx = w / 2;
    this.cy = h / 2;
    const half = Math.min(w, h) / 2;
    this.S = v.projection === 'stereographic' ? half / (2 * Math.tan((v.fov * D2R) / 4)) : half / Math.sin(Math.min(v.fov / 2, 90) * D2R);
    if (v.frame === 'horizon') {
      this.H = this.horizonMatrix(v);
      // In the horizontal frame the y axis points west, so azimuth runs the other way.
      this.M = matMul(viewMatrix(-v.lon, v.lat), this.H);
    } else {
      this.H = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      this.M = viewMatrix(v.lon, v.lat);
    }
  }

  /** Projects an equatorial unit vector. Returns false when it is behind the view. */
  private p(x: number, y: number, z: number, out: number[], cut: number): boolean {
    const M = this.M;
    let u = M[0] * x + M[1] * y + M[2] * z;
    let vv = M[3] * x + M[4] * y + M[5] * z;
    let w = M[6] * x + M[7] * y + M[8] * z;
    if (w < cut) {
      if (cut <= -1) return false;
      // clamp onto the cut circle so polygons stay closed
      const k = Math.sqrt(1 - cut * cut) / (Math.hypot(u, vv) || 1);
      u *= k;
      vv *= k;
      w = cut;
      out[2] = 1;
    } else out[2] = 0;
    if (this.proj === 'stereographic') {
      const k = 2 / (1 + w);
      out[0] = this.cx + this.S * k * u;
      out[1] = this.cy - this.S * k * vv;
    } else {
      out[0] = this.cx + this.S * u;
      out[1] = this.cy - this.S * vv;
    }
    return true;
  }

  /** Public projection of RA/Dec to screen, or null if hidden. */
  project(ra: number, dec: number, v: SkyView, w: number, h: number): { x: number; y: number } | null {
    this.setup(v, w, h);
    const [x, y, z] = radecToVec(ra, dec);
    const o = [0, 0, 0];
    if (!this.p(x, y, z, o, this.proj === 'stereographic' ? -0.6 : 0) || o[2]) return null;
    return { x: o[0], y: o[1] };
  }

  /** Inverse projection: screen position → frame coordinates (lon/lat) of the view frame. */
  unproject(sx: number, sy: number, v: SkyView, w: number, h: number): { lon: number; lat: number } | null {
    this.setup(v, w, h);
    const X = (sx - this.cx) / this.S;
    const Y = -(sy - this.cy) / this.S;
    let u: number, vv: number, ww: number;
    if (this.proj === 'stereographic') {
      const r2 = X * X + Y * Y;
      const d = 4 + r2;
      u = (4 * X) / d;
      vv = (4 * Y) / d;
      ww = (4 - r2) / d;
    } else {
      const r2 = X * X + Y * Y;
      if (r2 > 1) return null;
      u = X;
      vv = Y;
      ww = Math.sqrt(1 - r2);
    }
    const V = v.frame === 'horizon' ? viewMatrix(-v.lon, v.lat) : viewMatrix(v.lon, v.lat);
    // V is orthonormal: frame vector = Vᵀ · camera
    const fx = V[0] * u + V[3] * vv + V[6] * ww;
    const fy = V[1] * u + V[4] * vv + V[7] * ww;
    const fz = V[2] * u + V[5] * vv + V[8] * ww;
    let lon = Math.atan2(fy, fx) / D2R;
    if (v.frame === 'horizon') lon = -lon;
    return { lon: ((lon % 360) + 360) % 360, lat: Math.asin(clamp(fz, -1, 1)) / D2R };
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, v: SkyView, layers: SkyLayers, pal: Palette, opts: { print: boolean; highlight?: Pick | null; hero?: boolean }): void {
    this.setup(v, w, h);
    const print = opts.print;
    const horizon = v.frame === 'horizon';
    const H = this.H;
    const o = [0, 0, 0];
    const o2 = [0, 0, 0];
    const cut = this.proj === 'stereographic' ? -0.35 : 0;
    const polyCut = this.proj === 'stereographic' ? -0.5 : 0;

    // Sun altitude drives the sky colour and how many stars show.
    const sun = this.bodies.find((b) => b.id === 'sun');
    this.sunAlt = -90;
    if (sun && horizon) {
      const [x, y, z] = radecToVec(sun.ra, sun.dec);
      this.sunAlt = Math.asin(clamp(H[6] * x + H[7] * y + H[8] * z, -1, 1)) / D2R;
    }
    const daylight = horizon ? clamp((this.sunAlt + 18) / 18, 0, 1) : 0;

    // Background
    ctx.fillStyle = print ? pal.surface2 : horizon ? skyColour(this.sunAlt) : pal.space;
    ctx.fillRect(0, 0, w, h);
    if (this.proj === 'orthographic') {
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.S, 0, Math.PI * 2);
      ctx.strokeStyle = print ? pal.axis : 'rgba(141,148,166,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Milky Way
    if (layers.milkyway && this.mwVecs.length && daylight < 0.9) {
      const a = (print ? 0.07 : 0.055) * (1 - daylight);
      ctx.fillStyle = print ? `rgba(70,96,150,${a})` : `rgba(170,186,225,${a})`;
      for (const level of this.mwVecs) {
        ctx.beginPath();
        for (const poly of level) {
          for (const ring of poly) {
            let any = false;
            let first = true;
            for (let i = 0; i < ring.length; i += 3) {
              this.p(ring[i], ring[i + 1], ring[i + 2], o, polyCut);
              if (!o[2]) any = true;
              if (first) {
                ctx.moveTo(o[0], o[1]);
                first = false;
              } else ctx.lineTo(o[0], o[1]);
            }
            if (!any) continue;
            ctx.closePath();
          }
        }
        ctx.fill('evenodd');
      }
    }

    // Coordinate grid
    if (layers.grid) {
      ctx.strokeStyle = print ? pal.grid : 'rgba(110,130,170,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const toVec = (lon: number, lat: number): [number, number, number] => {
        if (!horizon) return radecToVec(lon, lat);
        // horizontal frame: x north, y west, z zenith → convert to equatorial via Hᵀ
        const a = lon * D2R;
        const b = lat * D2R;
        const hx = Math.cos(b) * Math.cos(a);
        const hy = -Math.cos(b) * Math.sin(a);
        const hz = Math.sin(b);
        return [H[0] * hx + H[3] * hy + H[6] * hz, H[1] * hx + H[4] * hy + H[7] * hz, H[2] * hx + H[5] * hy + H[8] * hz];
      };
      const fine = v.fov < 25;
      const lonStep = horizon ? (fine ? 5 : 15) : fine ? 7.5 : 15;
      const latStep = fine ? 5 : horizon ? 10 : 15;
      const line = (pts: [number, number][]) => {
        let pen = false;
        for (const [lo, la] of pts) {
          const [x, y, z] = toVec(lo, la);
          if (!this.p(x, y, z, o, cut) || o[2]) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(o[0], o[1]);
          else ctx.moveTo(o[0], o[1]);
          pen = true;
        }
      };
      for (let lo = 0; lo < 360; lo += lonStep) {
        const pts: [number, number][] = [];
        for (let la = -80; la <= 80; la += 2) pts.push([lo, la]);
        line(pts);
      }
      for (let la = -90 + latStep; la < 90; la += latStep) {
        const pts: [number, number][] = [];
        for (let lo = 0; lo <= 360; lo += 2) pts.push([lo, la]);
        line(pts);
      }
      ctx.stroke();
      if (!horizon) {
        // celestial equator emphasised
        ctx.strokeStyle = print ? pal.axis : 'rgba(110,130,170,0.4)';
        ctx.beginPath();
        const pts: [number, number][] = [];
        for (let lo = 0; lo <= 360; lo += 2) pts.push([lo, 0]);
        line(pts);
        ctx.stroke();
      }
    }

    // Ecliptic
    if (layers.ecliptic) {
      ctx.strokeStyle = print ? pal.accent : 'rgba(214,172,98,0.5)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      this.polyline(ctx, this.ecliptic, cut, o);
      ctx.setLineDash([]);
    }

    // Constellation borders
    if (layers.borders && this.borderVecs.length) {
      ctx.strokeStyle = print ? pal.line : 'rgba(141,148,166,0.22)';
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      for (const b of this.borderVecs) this.polyline(ctx, b, cut, o);
      ctx.setLineDash([]);
    }

    // Constellation figures
    if (layers.lines && this.lineVecs.length) {
      const hl = opts.highlight?.kind === 'con' ? opts.highlight.id : null;
      ctx.lineWidth = opts.hero ? 1 : 1.1;
      ctx.strokeStyle = print ? pal.lineStrong : opts.hero ? 'rgba(170,186,225,0.32)' : `rgba(150,170,215,${0.42 * (1 - daylight * 0.8)})`;
      ctx.beginPath();
      for (const c of this.lineVecs) {
        if (c.id === hl) continue;
        for (const s of c.segs) this.segments(ctx, s, cut, o, o2);
      }
      ctx.stroke();
      if (hl) {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const c of this.lineVecs) if (c.id === hl) for (const s of c.segs) this.segments(ctx, s, cut, o, o2);
        ctx.stroke();
      }
    }

    // Stars
    const s = this.data.stars;
    const glow = 1 - daylight;
    let limit = Math.min(6.5, 4.8 + 2.3 * Math.log10(180 / Math.max(v.fov, 1)));
    if (horizon) limit = lerp(limit, -1.5, clamp((this.sunAlt + 18) / 15, 0, 1));
    if (opts.hero) limit = Math.min(limit, 5.6);
    const sizeK = clamp(1 + 0.3 * Math.log10(90 / v.fov), 0.85, 1.7) * (opts.hero ? 0.9 : 1);
    this.drawnStars.length = 0;
    const SV = this.starVec;
    const M = this.M;
    const halo = print ? pal.surface2 : '';
    for (let i = 0; i < s.count; i++) {
      const mag = s.mag[i];
      if (mag > limit) break; // catalogue is sorted by magnitude
      const x = SV[i * 3], y = SV[i * 3 + 1], z = SV[i * 3 + 2];
      if (horizon && H[6] * x + H[7] * y + H[8] * z < -0.01) continue;
      const ww = M[6] * x + M[7] * y + M[8] * z;
      if (ww < cut + 0.05) continue;
      this.p(x, y, z, o, cut);
      const sx = o[0], sy = o[1];
      if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue;
      const r = sizeK * Math.max(0.5, (limit + 1.6 - mag) * 0.42);
      this.drawnStars.push(sx, sy, i);
      if (print) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 1.2, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = pal.fg;
        ctx.fill();
        continue;
      }
      const alpha = clamp((limit - mag) / 1.2 + 0.35, 0.25, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.starColor[i];
      if (r < 1.1) ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      else {
        if (mag < 1.6 && glow > 0.3) {
          const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4.5);
          g.addColorStop(0, this.starColor[i].replace('rgb', 'rgba').replace(')', ',0.35)'));
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(sx - r * 4.5, sy - r * 4.5, r * 9, r * 9);
          ctx.fillStyle = this.starColor[i];
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Messier objects, drawn with classical atlas symbols
    this.drawnDso.length = 0;
    if (layers.messier && this.data.messier && v.fov < 160) {
      const dsoCol = print ? pal.accent : `rgba(214,172,98,${0.75 * (1 - daylight)})`;
      ctx.strokeStyle = dsoCol;
      ctx.lineWidth = 1;
      this.data.messier.forEach((m, i) => {
        const x = this.messierVec[i * 3], y = this.messierVec[i * 3 + 1], z = this.messierVec[i * 3 + 2];
        if (horizon && H[6] * x + H[7] * y + H[8] * z < 0) return;
        if (!this.p(x, y, z, o, cut) || o[2]) return;
        if (o[0] < -10 || o[1] < -10 || o[0] > w + 10 || o[1] > h + 10) return;
        this.drawnDso.push({ obj: m, x: o[0], y: o[1] });
        dsoSymbol(ctx, m.kind, o[0], o[1], v.fov < 40 ? 6 : 4.5);
      });
    }

    // Sun, Moon and planets
    this.drawnBodies.length = 0;
    if (layers.planets && this.bodies.length) {
      const pxPerRad = this.S; // near the centre
      const sunB = this.bodies.find((b) => b.id === 'sun');
      for (const b of [...this.bodies].sort((a, c) => c.distAU - a.distAU)) {
        const [x, y, z] = radecToVec(b.ra, b.dec);
        if (horizon && H[6] * x + H[7] * y + H[8] * z < -0.005) continue;
        if (!this.p(x, y, z, o, cut) || o[2]) continue;
        if (o[0] < -30 || o[1] < -30 || o[0] > w + 30 || o[1] > h + 30) continue;
        let r: number;
        if (b.id === 'sun' || b.id === 'moon') {
          r = Math.max(b.id === 'sun' ? 7 : 6, 0.0045 * pxPerRad);
          if (b.id === 'sun') {
            const g = ctx.createRadialGradient(o[0], o[1], r * 0.5, o[0], o[1], r * 4);
            g.addColorStop(0, print ? 'rgba(214,150,40,0.35)' : 'rgba(255,230,170,0.45)');
            g.addColorStop(1, 'rgba(255,230,170,0)');
            ctx.fillStyle = g;
            ctx.fillRect(o[0] - r * 4, o[1] - r * 4, r * 8, r * 8);
            ctx.beginPath();
            ctx.arc(o[0], o[1], r, 0, Math.PI * 2);
            ctx.fillStyle = print ? '#d9a032' : '#fff1c9';
            ctx.fill();
          } else {
            let ang = 0;
            if (sunB) {
              const sp = [0, 0, 0];
              const [sx, sy, sz] = radecToVec(sunB.ra, sunB.dec);
              this.p(sx, sy, sz, sp, -0.99);
              ang = Math.atan2(sp[1] - o[1], sp[0] - o[0]);
            }
            drawMoon(ctx, o[0], o[1], r, b.phase ?? 1, ang, print ? pal.fg : '#ece9df', print ? pal.line : '#2a2f3d');
          }
        } else {
          r = clamp(2.2 + (1.5 - b.mag) * 0.55, 2, 5.5) * sizeK;
          ringFill(ctx, o[0], o[1], r, print ? pal.fg : b.color, print ? pal.surface2 : 'rgba(3,5,10,0.9)');
          if (!print) {
            ctx.strokeStyle = 'rgba(214,172,98,0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(o[0], o[1], r + 3.5, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        this.drawnBodies.push({ body: b, x: o[0], y: o[1], r });
      }
    }

    // Ground and horizon
    if (horizon) this.drawGround(ctx, w, h, v, pal, print);

    // Labels with simple collision avoidance
    const occ = new Occupancy(w, h);
    ctx.textBaseline = 'middle';
    // planets first
    for (const d of this.drawnBodies) {
      const text = d.body.name;
      ctx.font = `600 12px ${pal.fontBody}`;
      const tw = ctx.measureText(text).width;
      const x = d.x + d.r + 7;
      if (occ.take(x, d.y - 8, tw, 16)) labelText(ctx, text, x, d.y, print ? pal.fg : '#f1e3c2', print ? pal.surface2 : 'rgba(3,5,10,0.85)');
    }
    // constellation names
    this.drawnCons.length = 0;
    if (layers.conNames && this.data.cons && v.fov < 170) {
      ctx.font = `italic 500 ${v.fov < 40 ? 13 : 11}px ${pal.fontDisplay}`;
      const col = print ? pal.muted : `rgba(141,160,200,${0.85 * (1 - daylight * 0.8)})`;
      for (const c of this.data.cons.list) {
        if (v.fov > 100 && c.rank > 2) continue;
        const [x, y, z] = radecToVec(c.ra, c.dec);
        if (horizon && H[6] * x + H[7] * y + H[8] * z < 0.02) continue;
        if (!this.p(x, y, z, o, cut) || o[2]) continue;
        const text = c.name.toUpperCase().split('').join(' ');
        const tw = ctx.measureText(text).width;
        if (o[0] < tw / 2 || o[0] > w - tw / 2 || o[1] < 10 || o[1] > h - 10) continue;
        this.drawnCons.push({ id: c.id, x: o[0], y: o[1] });
        if (!occ.take(o[0] - tw / 2, o[1] - 7, tw, 14)) continue;
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.fillText(text, o[0], o[1]);
      }
      ctx.textAlign = 'left';
    }
    // star names and Bayer letters
    if (layers.starNames) {
      const nameLimit = v.fov > 120 ? 1.6 : v.fov > 60 ? 2.4 : v.fov > 30 ? 3.6 : 5;
      const greek = v.fov < 45;
      for (let k = 0; k < this.drawnStars.length; k += 3) {
        const i = this.drawnStars[k + 2];
        const mag = s.mag[i];
        const name = s.name[i];
        let text = '';
        let font = `12px ${pal.fontBody}`;
        if (name && mag < nameLimit) text = name;
        else if (greek && mag < limit - 1.2) {
          const g = s.desig[i].split(' ')[0];
          if (/^[α-ω]/.test(g)) {
            text = g;
            font = `italic 12px ${pal.fontDisplay}`;
          }
        }
        if (!text) continue;
        ctx.font = font;
        const tw = ctx.measureText(text).width;
        const x = this.drawnStars[k] + 6;
        const y = this.drawnStars[k + 1] - 7;
        if (occ.take(x, y - 7, tw, 14)) {
          ctx.fillStyle = print ? pal.fg2 : `rgba(225,226,232,${0.82 * (1 - daylight * 0.6)})`;
          ctx.fillText(text, x, y);
        }
      }
    }
    // deep-sky labels when zoomed in
    if (layers.messier && v.fov < 70) {
      ctx.font = `11px ${pal.fontMono}`;
      for (const d of this.drawnDso) {
        const text = d.obj.id;
        const tw = ctx.measureText(text).width;
        if (occ.take(d.x + 7, d.y - 6, tw, 12)) {
          ctx.fillStyle = print ? pal.accent : 'rgba(214,172,98,0.85)';
          ctx.fillText(text, d.x + 7, d.y);
        }
      }
    }

    // Selection reticle
    const hp = opts.highlight ? this.positionOf(opts.highlight, o) : null;
    if (hp) {
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.5;
      const R = 14;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, R, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(hp.x + dx * (R + 3), hp.y + dy * (R + 3));
        ctx.lineTo(hp.x + dx * (R + 9), hp.y + dy * (R + 9));
      }
      ctx.stroke();
    }
  }

  private positionOf(pk: Pick, o: number[]): { x: number; y: number } | null {
    let vec: [number, number, number] | null = null;
    if (pk.kind === 'star') vec = [this.starVec[pk.index * 3], this.starVec[pk.index * 3 + 1], this.starVec[pk.index * 3 + 2]];
    else if (pk.kind === 'body') vec = radecToVec(pk.body.ra, pk.body.dec);
    else if (pk.kind === 'dso') vec = radecToVec(pk.obj.ra, pk.obj.dec);
    if (!vec) return null;
    if (!this.p(vec[0], vec[1], vec[2], o, -0.35) || o[2]) return null;
    return { x: o[0], y: o[1] };
  }

  private polyline(ctx: CanvasRenderingContext2D, pts: Float32Array, cut: number, o: number[]): void {
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < pts.length; i += 3) {
      if (!this.p(pts[i], pts[i + 1], pts[i + 2], o, cut) || o[2]) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(o[0], o[1]);
      else ctx.moveTo(o[0], o[1]);
      pen = true;
    }
    ctx.stroke();
  }

  /** Adds visible segments of a constellation line to the current path, with a gap at each star. */
  private segments(ctx: CanvasRenderingContext2D, pts: Float32Array, cut: number, a: number[], b: number[]): void {
    const H = this.H;
    const horizonCheck = H[8] !== 1 || H[0] !== 1;
    for (let i = 0; i + 5 < pts.length; i += 3) {
      if (horizonCheck) {
        const za = H[6] * pts[i] + H[7] * pts[i + 1] + H[8] * pts[i + 2];
        const zb = H[6] * pts[i + 3] + H[7] * pts[i + 4] + H[8] * pts[i + 5];
        if (za < 0 && zb < 0) continue;
      }
      if (!this.p(pts[i], pts[i + 1], pts[i + 2], a, cut) || a[2]) continue;
      if (!this.p(pts[i + 3], pts[i + 4], pts[i + 5], b, cut) || b[2]) continue;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      if (L < 9) continue;
      const g = 4.5 / L;
      ctx.moveTo(a[0] + dx * g, a[1] + dy * g);
      ctx.lineTo(b[0] - dx * g, b[1] - dy * g);
    }
  }

  private drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, v: SkyView, pal: Palette, print: boolean): void {
    const V = viewMatrix(-v.lon, v.lat);
    const o = [0, 0];
    const proj = (hx: number, hy: number, hz: number, cut: number): boolean => {
      let u = V[0] * hx + V[1] * hy + V[2] * hz;
      let vv = V[3] * hx + V[4] * hy + V[5] * hz;
      let ww = V[6] * hx + V[7] * hy + V[8] * hz;
      if (ww < cut) {
        const k = Math.sqrt(1 - cut * cut) / (Math.hypot(u, vv) || 1);
        u *= k;
        vv *= k;
        ww = cut;
      }
      if (this.proj === 'stereographic') {
        const k = 2 / (1 + ww);
        o[0] = this.cx + this.S * k * u;
        o[1] = this.cy - this.S * k * vv;
      } else {
        o[0] = this.cx + this.S * u;
        o[1] = this.cy - this.S * vv;
      }
      return true;
    };
    const cut = this.proj === 'stereographic' ? -0.9 : 0;
    const loop: [number, number][] = [];
    for (let az = 0; az <= 360; az += 1) {
      const a = az * D2R;
      proj(Math.cos(a), -Math.sin(a), 0, cut);
      loop.push([o[0], o[1]]);
    }
    // Is the nadir inside the horizon loop on screen?
    const nadirW = -V[8];
    let inside = false;
    if (nadirW > cut) {
      proj(0, 0, -1, cut);
      inside = pointInPoly(o[0], o[1], loop);
    }
    ctx.save();
    ctx.beginPath();
    if (!inside) ctx.rect(-10, -10, w + 20, h + 20);
    loop.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = print ? pal.surface : 'rgba(9,11,16,0.97)';
    ctx.fill('evenodd');
    ctx.restore();
    // horizon line
    ctx.beginPath();
    loop.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = print ? pal.lineStrong : 'rgba(214,172,98,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // cardinal points
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    ctx.font = `600 12px ${pal.fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    names.forEach((n, i) => {
      const a = i * 45 * D2R;
      const hx = Math.cos(a), hy = -Math.sin(a);
      if (V[6] * hx + V[7] * hy < -0.2) return;
      proj(hx, hy, 0, cut);
      if (o[0] < 0 || o[0] > w || o[1] < 0 || o[1] > h - 16) return;
      ctx.fillStyle = n.length === 1 ? pal.accent : print ? pal.muted : '#8d94a6';
      ctx.fillText(n, o[0], o[1] + 6);
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
  }

  pick(x: number, y: number): Pick | null {
    let best: Pick | null = null;
    let bestScore = 16;
    for (const d of this.drawnBodies) {
      const dist = Math.hypot(d.x - x, d.y - y) - d.r;
      if (dist < 12 && dist - 4 < bestScore) {
        bestScore = dist - 4;
        best = { kind: 'body', body: d.body };
      }
    }
    for (const d of this.drawnDso) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < 10 && dist - 1 < bestScore) {
        bestScore = dist - 1;
        best = { kind: 'dso', obj: d.obj };
      }
    }
    const s = this.data.stars;
    for (let k = 0; k < this.drawnStars.length; k += 3) {
      const dist = Math.hypot(this.drawnStars[k] - x, this.drawnStars[k + 1] - y);
      if (dist > 14) continue;
      const score = dist + s.mag[this.drawnStars[k + 2]] * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = { kind: 'star', index: this.drawnStars[k + 2] };
      }
    }
    return best;
  }
}

class Occupancy {
  private cells: Uint8Array;
  private cols: number;
  private rows: number;
  constructor(w: number, h: number, private size = 8) {
    this.cols = Math.ceil(w / size) + 1;
    this.rows = Math.ceil(h / size) + 1;
    this.cells = new Uint8Array(this.cols * this.rows);
  }
  take(x: number, y: number, w: number, h: number): boolean {
    const c0 = Math.floor(x / this.size), c1 = Math.floor((x + w) / this.size);
    const r0 = Math.floor(y / this.size), r1 = Math.floor((y + h) / this.size);
    if (c0 < 0 || r0 < 0 || c1 >= this.cols || r1 >= this.rows) return false;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.cells[r * this.cols + c]) return false;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c] = 1;
    return true;
  }
}

function pointInPoly(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringFill(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, ring: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function labelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, halo: string): void {
  ctx.lineWidth = 3;
  ctx.strokeStyle = halo;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Moon with its phase: bright limb toward the Sun at angle `ang` (screen radians). */
export function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, ang: number, lit: string, dark: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill();
  // lit half faces +x (toward the Sun); the terminator is an ellipse of half-width |1−2k|·r
  const e = r * Math.abs(1 - 2 * k);
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  if (k >= 0.5) ctx.ellipse(0, 0, e, r, 0, Math.PI / 2, -Math.PI / 2);
  else ctx.ellipse(0, 0, e, r, 0, Math.PI / 2, (3 * Math.PI) / 2, true);
  ctx.closePath();
  ctx.fillStyle = lit;
  ctx.fill();
  ctx.restore();
}

/** Classical star-atlas symbols for deep-sky objects. */
export function dsoSymbol(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number): void {
  ctx.beginPath();
  switch (kind) {
    case 'gc':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
      return;
    case 'oc':
    case 'pos':
      ctx.setLineDash([2, 2]);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    case 's':
    case 'e':
    case 'i':
      ctx.ellipse(x, y, r * 1.3, r * 0.6, -0.5, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case 'pn':
      ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(x + dx * r * 0.6, y + dy * r * 0.6);
        ctx.lineTo(x + dx * r * 1.2, y + dy * r * 1.2);
      }
      ctx.stroke();
      return;
    default:
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
      ctx.stroke();
  }
}

export const ECLIPTIC_OBLIQUITY = OBLIQUITY;
