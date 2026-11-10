// Celestial coordinate transforms. All angles in degrees unless noted.

import { Vec3 } from './kepler';
import { centuries } from './time';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
export const OBLIQUITY = 23.4392911; // mean obliquity of the ecliptic at J2000

export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Unit vector for right ascension/declination (x→RA 0h, z→north celestial pole). */
export function radecToVec(ra: number, dec: number): [number, number, number] {
  const a = ra * D2R;
  const d = dec * D2R;
  const cd = Math.cos(d);
  return [cd * Math.cos(a), cd * Math.sin(a), Math.sin(d)];
}

export function vecToRadec(x: number, y: number, z: number): { ra: number; dec: number } {
  const r = Math.hypot(x, y, z);
  return { ra: ((Math.atan2(y, x) * R2D) % 360 + 360) % 360, dec: Math.asin(z / r) * R2D };
}

export function eclipticToEquatorial(v: Vec3): Vec3 {
  const e = OBLIQUITY * D2R;
  return { x: v.x, y: v.y * Math.cos(e) - v.z * Math.sin(e), z: v.y * Math.sin(e) + v.z * Math.cos(e) };
}

export function equatorialToEcliptic(v: Vec3): Vec3 {
  const e = OBLIQUITY * D2R;
  return { x: v.x, y: v.y * Math.cos(e) + v.z * Math.sin(e), z: -v.y * Math.sin(e) + v.z * Math.cos(e) };
}

export const mul = (m: Mat3, x: number, y: number, z: number): [number, number, number] => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
];

export function matMul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
}

export const rotX = (t: number): Mat3 => {
  const c = Math.cos(t), s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
export const rotY = (t: number): Mat3 => {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
export const rotZ = (t: number): Mat3 => {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

/** Equatorial unit vector → horizontal frame (x = north, y = west, z = zenith)
 *  for local sidereal time `lstDeg` and latitude `latDeg`. */
export function equatorialToHorizontalMatrix(lstDeg: number, latDeg: number): Mat3 {
  // Rotate so the meridian is at x, then tilt the pole down to the latitude.
  const h = rotZ(-lstDeg * D2R); // hour-angle frame
  const t = rotY((latDeg - 90) * D2R);
  // After t, z = zenith, x = south; flip to make x = north, y = west.
  const flip: Mat3 = [-1, 0, 0, 0, -1, 0, 0, 0, 1];
  return matMul(flip, matMul(t, h));
}

/** Altitude/azimuth (azimuth from north through east) from a horizontal-frame vector. */
export function horizontalAltAz(v: [number, number, number]): { alt: number; az: number } {
  const [x, y, z] = v;
  return { alt: Math.asin(Math.max(-1, Math.min(1, z))) * R2D, az: ((Math.atan2(-y, x) * R2D) % 360 + 360) % 360 };
}

/** Equatorial → galactic (J2000). */
export const EQ_TO_GAL: Mat3 = [
  -0.0548755604, -0.8734370902, -0.4838350155, 0.4941094279, -0.44482963, 0.7469822445, -0.867666149, -0.1980763734,
  0.4559837762,
];

/** Low-precision geocentric Moon (Meeus ch. 47 leading terms; ~0.3° accuracy). */
export function moonPosition(jd: number): { ra: number; dec: number; distKm: number; lon: number; lat: number } {
  const T = centuries(jd);
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = (297.8501921 + 445267.1114034 * T) * D2R;
  const M = (357.5291092 + 35999.0502909 * T) * D2R;
  const Mp = (134.9633964 + 477198.8675055 * T) * D2R;
  const F = (93.272095 + 483202.0175233 * T) * D2R;
  const lon =
    Lp +
    6.288774 * Math.sin(Mp) +
    1.274027 * Math.sin(2 * D - Mp) +
    0.658314 * Math.sin(2 * D) +
    0.213618 * Math.sin(2 * Mp) -
    0.185116 * Math.sin(M) -
    0.114332 * Math.sin(2 * F) +
    0.058793 * Math.sin(2 * D - 2 * Mp) +
    0.057066 * Math.sin(2 * D - M - Mp) +
    0.053322 * Math.sin(2 * D + Mp) +
    0.045758 * Math.sin(2 * D - M);
  const lat =
    5.128122 * Math.sin(F) +
    0.280602 * Math.sin(Mp + F) +
    0.277693 * Math.sin(Mp - F) +
    0.173237 * Math.sin(2 * D - F) +
    0.055413 * Math.sin(2 * D - Mp + F) +
    0.046271 * Math.sin(2 * D - Mp - F);
  const distKm = 385000.56 - 20905.355 * Math.cos(Mp) - 3699.111 * Math.cos(2 * D - Mp) - 2955.968 * Math.cos(2 * D) - 569.925 * Math.cos(2 * Mp);
  const l = lon * D2R;
  const b = lat * D2R;
  const ecl = { x: Math.cos(b) * Math.cos(l), y: Math.cos(b) * Math.sin(l), z: Math.sin(b) };
  const eq = eclipticToEquatorial(ecl);
  const { ra, dec } = vecToRadec(eq.x, eq.y, eq.z);
  return { ra, dec, distKm, lon: ((lon % 360) + 360) % 360, lat };
}

/** Angular separation in degrees. */
export function separation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const c =
    Math.sin(dec1 * D2R) * Math.sin(dec2 * D2R) + Math.cos(dec1 * D2R) * Math.cos(dec2 * D2R) * Math.cos((ra1 - ra2) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
}
