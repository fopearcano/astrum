// Black holes and gravitational waves.

import { G, M_SUN, YEAR, c, hbar, kB } from './constants';

/** Schwarzschild radius in metres for a mass in kg. */
export const schwarzschildRadius = (M: number): number => (2 * G * M) / (c * c);

export interface BlackHoleProps {
  rs: number; // m
  photonSphere: number; // m
  isco: number; // m
  density: number; // kg/m³ (mass over the volume inside the horizon)
  hawkingT: number; // K
  evaporation: number; // years
  tidal: number; // m/s² head-to-foot difference for a 2 m body at the horizon
  iscoPeriod: number; // s
  surfaceGravity: number; // m/s²
}

export function blackHole(Msolar: number): BlackHoleProps {
  const M = Msolar * M_SUN;
  const rs = schwarzschildRadius(M);
  const isco = 3 * rs;
  return {
    rs,
    photonSphere: 1.5 * rs,
    isco,
    density: M / ((4 / 3) * Math.PI * rs ** 3),
    hawkingT: (hbar * c ** 3) / (8 * Math.PI * G * M * kB),
    evaporation: (5120 * Math.PI * G * G * M ** 3) / (hbar * c ** 4) / YEAR,
    tidal: (2 * G * M * 2) / rs ** 3,
    iscoPeriod: 2 * Math.PI * Math.sqrt(isco ** 3 / (G * M)),
    surfaceGravity: c ** 4 / (4 * G * M),
  };
}

/** Chirp mass in M☉. */
export const chirpMass = (m1: number, m2: number): number => (m1 * m2) ** 0.6 / (m1 + m2) ** 0.2;

/** Gravitational-wave frequency (Hz) of the leading-order inspiral at time τ (s) before coalescence. */
export function gwFrequency(McSolar: number, tau: number): number {
  const tM = (G * McSolar * M_SUN) / c ** 3;
  return (1 / Math.PI) * (5 / (256 * tau)) ** (3 / 8) * tM ** (-5 / 8);
}

/** Time to coalescence (s) from GW frequency f (Hz). */
export function gwTimeToMerge(McSolar: number, f: number): number {
  const tM = (G * McSolar * M_SUN) / c ** 3;
  return (5 / 256) * tM ** (-5 / 3) * (Math.PI * f) ** (-8 / 3);
}

/** GW frequency at the innermost stable circular orbit of the total mass (Hz). */
export const iscoFrequency = (MtotSolar: number): number => c ** 3 / (6 ** 1.5 * Math.PI * G * MtotSolar * M_SUN);

export interface Chirp {
  sampleRate: number;
  h: Float32Array; // normalised strain
  f: Float32Array; // instantaneous frequency
  duration: number; // s
  mergerIndex: number;
  fRing: number;
}

/** Leading-order (Newtonian) inspiral joined to a damped ringdown. Illustrative only:
 *  real templates add post-Newtonian phase terms and numerical-relativity merger fits. */
export function chirpWaveform(m1: number, m2: number, fStart: number, sampleRate = 8192): Chirp {
  const Mc = chirpMass(m1, m2);
  const Mtot = m1 + m2;
  const fMerge = Math.max(fStart * 1.5, 2.2 * iscoFrequency(Mtot));
  const tStart = gwTimeToMerge(Mc, fStart);
  const tEnd = gwTimeToMerge(Mc, fMerge);
  const spin = 0.69; // typical remnant spin for comparable masses
  const Mf = 0.952 * Mtot;
  const fRing = ((c ** 3 / (2 * Math.PI * G * Mf * M_SUN)) * (1 - 0.63 * (1 - spin) ** 0.3));
  const Q = 2 * (1 - spin) ** -0.45;
  const tauRing = Q / (Math.PI * fRing);
  const nIn = Math.max(2, Math.ceil((tStart - tEnd) * sampleRate));
  const nRing = Math.ceil(tauRing * 8 * sampleRate);
  const h = new Float32Array(nIn + nRing);
  const f = new Float32Array(nIn + nRing);
  let phase = 0;
  let amp = 0;
  let fi = fStart;
  for (let i = 0; i < nIn; i++) {
    const tau = tStart - i / sampleRate;
    fi = gwFrequency(Mc, Math.max(tau, tEnd));
    phase += (2 * Math.PI * fi) / sampleRate;
    amp = (fi / fMerge) ** (2 / 3);
    h[i] = amp * Math.cos(phase);
    f[i] = fi;
  }
  // Ringdown: frequency eases from the merger value toward the quasi-normal mode.
  for (let j = 0; j < nRing; j++) {
    const t = j / sampleRate;
    const fr = fRing + (fi - fRing) * Math.exp(-t / (tauRing * 0.3));
    phase += (2 * Math.PI * fr) / sampleRate;
    h[nIn + j] = amp * Math.exp(-t / tauRing) * Math.cos(phase);
    f[nIn + j] = fr;
  }
  return { sampleRate, h, f, duration: (nIn + nRing) / sampleRate, mergerIndex: nIn, fRing };
}
