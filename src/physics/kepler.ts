// Two-body orbits: Kepler's equation and heliocentric positions from orbital elements.

import { centuries } from './time';

const D2R = Math.PI / 180;

/** Solves Kepler's equation M = E − e sin E for the eccentric anomaly (radians). */
export function solveKepler(M: number, e: number): number {
  M = ((M % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; // wrap to [−π, π)
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** Classical elements: a (AU), e, i, Ω (node), ϖ (longitude of perihelion), L (mean longitude), degrees. */
export interface Elements {
  a: number;
  e: number;
  i: number;
  node: number;
  peri: number; // longitude of perihelion ϖ = Ω + ω
  L: number; // mean longitude
}

/** JPL "Approximate Positions of the Planets" (E. M. Standish), valid 1800–2050.
 *  [value at J2000, rate per Julian century]. */
export type RatedElements = Record<keyof Elements, [number, number]>;

export function elementsAt(el: RatedElements, jd: number): Elements {
  const T = centuries(jd);
  const v = (k: keyof Elements) => el[k][0] + el[k][1] * T;
  return { a: v('a'), e: v('e'), i: v('i'), node: v('node'), peri: v('peri'), L: v('L') };
}

/** Elements defined by time of perihelion instead of mean longitude (comets, dwarf planets). */
export interface PerihelionElements {
  a: number;
  e: number;
  i: number;
  node: number;
  argPeri: number; // ω
  tp: number; // JD of perihelion passage
}

export function fromPerihelion(p: PerihelionElements, jd: number): Elements {
  const n = 0.9856076686 / p.a ** 1.5; // mean motion, degrees/day
  const M = n * (jd - p.tp);
  const peri = p.node + p.argPeri;
  return { a: p.a, e: p.e, i: p.i, node: p.node, peri, L: M + peri };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Heliocentric position in the J2000 ecliptic frame, AU. */
export function position(el: Elements): Vec3 {
  const M = (el.L - el.peri) * D2R;
  const w = (el.peri - el.node) * D2R;
  const E = solveKepler(M, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  return orient(xp, yp, w, el.node * D2R, el.i * D2R);
}

function orient(xp: number, yp: number, w: number, O: number, I: number): Vec3 {
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: sw * sI * xp + cw * sI * yp,
  };
}

/** Samples the full orbital ellipse (closed path) in the ecliptic frame. */
export function orbitPath(el: Elements, n = 256): Vec3[] {
  const w = (el.peri - el.node) * D2R;
  const O = el.node * D2R;
  const I = el.i * D2R;
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  const pts: Vec3[] = [];
  for (let k = 0; k <= n; k++) {
    // Sample in eccentric anomaly so points crowd near perihelion of eccentric orbits.
    const E = (k / n) * 2 * Math.PI;
    pts.push(orient(el.a * (Math.cos(E) - el.e), b * Math.sin(E), w, O, I));
  }
  return pts;
}

export const distance = (a: Vec3, b: Vec3 = { x: 0, y: 0, z: 0 }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Orbital period in years from Kepler's third law (solar-mass primary). */
export const periodYears = (aAU: number, massSolar = 1): number => Math.sqrt(aAU ** 3 / massSolar);
