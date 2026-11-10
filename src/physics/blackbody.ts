// Thermal radiation and colour: Planck's law, Wien, Stefan–Boltzmann, and the
// perceived colour of a blackbody computed through the CIE 1931 observer.

import { b_wien, c, h, kB, sigma } from './constants';

/** Spectral radiance B_λ(T) in W·sr⁻¹·m⁻³ (λ in metres). */
export function planck(lambda: number, T: number): number {
  const x = (h * c) / (lambda * kB * T);
  if (x > 700) return 0;
  return (2 * h * c * c) / lambda ** 5 / Math.expm1(x);
}

/** Peak wavelength in metres. */
export const wienPeak = (T: number): number => b_wien / T;
/** Emitted flux per unit area, W/m². */
export const stefanBoltzmann = (T: number): number => sigma * T ** 4;

/** B−V colour index → effective temperature (Ballesteros 2012). */
export const bvToTemperature = (bv: number): number => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));

/** Effective temperature → approximate B−V (numerical inverse of Ballesteros). */
export function temperatureToBV(T: number): number {
  let lo = -0.4;
  let hi = 2.5;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bvToTemperature(mid) > T) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// CIE 1931 2° colour-matching functions, multi-lobe Gaussian fit
// (Wyman, Sloan & Shirley 2013). λ in nm.
const g = (x: number, mu: number, s1: number, s2: number) => {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};
export const cieX = (l: number) => 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
export const cieY = (l: number) => 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
export const cieZ = (l: number) => 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);

const gammaEncode = (u: number) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055);

/** Linear sRGB from CIE XYZ. */
function xyzToLinear(X: number, Y: number, Z: number): [number, number, number] {
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ];
}

/** The chromaticity of a blackbody as sRGB 0–255, normalised so the brightest
 *  channel is full intensity (what a star's colour looks like, not how bright). */
function computeBlackbodyRGB(T: number): [number, number, number] {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const B = planck(l * 1e-9, T);
    X += B * cieX(l);
    Y += B * cieY(l);
    Z += B * cieZ(l);
  }
  let [r, gg, b] = xyzToLinear(X, Y, Z);
  // Desaturate out-of-gamut colours toward white instead of clipping hue.
  const min = Math.min(r, gg, b);
  if (min < 0) {
    r -= min;
    gg -= min;
    b -= min;
  }
  const max = Math.max(r, gg, b) || 1;
  return [r / max, gg / max, b / max].map((v) => Math.round(255 * gammaEncode(Math.max(0, v)))) as [number, number, number];
}

const LUT_MIN = 1000;
const LUT_MAX = 40000;
const LUT_STEP = 100;
let lut: Uint8Array | null = null;

/** Cached blackbody colour, 1 000–40 000 K. */
export function blackbodyRGB(T: number): [number, number, number] {
  if (!lut) {
    const n = (LUT_MAX - LUT_MIN) / LUT_STEP + 1;
    lut = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) lut.set(computeBlackbodyRGB(LUT_MIN + i * LUT_STEP), i * 3);
  }
  const t = Math.max(LUT_MIN, Math.min(LUT_MAX, T));
  const i = Math.round((t - LUT_MIN) / LUT_STEP) * 3;
  return [lut[i], lut[i + 1], lut[i + 2]];
}

export const rgbCss = ([r, g2, b]: [number, number, number], a = 1): string =>
  a >= 1 ? `rgb(${r},${g2},${b})` : `rgba(${r},${g2},${b},${a})`;

export const blackbodyCss = (T: number, a = 1): string => rgbCss(blackbodyRGB(T), a);

/** Star colour from B−V. Falls back to a neutral white when the index is unknown. */
export function bvCss(bv: number | null | undefined, a = 1): string {
  if (bv == null || !Number.isFinite(bv)) return a >= 1 ? 'rgb(235,235,240)' : `rgba(235,235,240,${a})`;
  return blackbodyCss(bvToTemperature(bv), a);
}

/** A display colour for a monochromatic wavelength (nm), for spectra.
 *  Piecewise approximation after Dan Bruton, with intensity fall-off at the edges. */
export function wavelengthRGB(nm: number): [number, number, number] {
  let r = 0, gg = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { gg = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { gg = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; gg = 1; }
  else if (nm < 645) { r = 1; gg = -(nm - 645) / 65; }
  else if (nm <= 780) { r = 1; }
  let f = 0;
  if (nm >= 380 && nm < 420) f = 0.3 + (0.7 * (nm - 380)) / 40;
  else if (nm >= 420 && nm <= 700) f = 1;
  else if (nm > 700 && nm <= 780) f = 0.3 + (0.7 * (780 - nm)) / 80;
  const k = (v: number) => Math.round(255 * (v * f) ** 0.8);
  return [k(r), k(gg), k(b)];
}

/** Morgan–Keenan class letter for an effective temperature. */
export function spectralClass(T: number): string {
  if (T >= 30000) return 'O';
  if (T >= 10000) return 'B';
  if (T >= 7500) return 'A';
  if (T >= 6000) return 'F';
  if (T >= 5200) return 'G';
  if (T >= 3700) return 'K';
  if (T >= 2400) return 'M';
  if (T >= 1300) return 'L';
  if (T >= 550) return 'T';
  return 'Y';
}

export const SPECTRAL_CLASSES = [
  { cls: 'O', range: '≥ 30 000 K', T: 35000, example: 'Mintaka (δ Ori)', note: 'Ionised helium lines; rare and short-lived.' },
  { cls: 'B', range: '10 000–30 000 K', T: 18000, example: 'Rigel, Spica', note: 'Neutral helium; hydrogen strengthening.' },
  { cls: 'A', range: '7 500–10 000 K', T: 9200, example: 'Sirius, Vega', note: 'Strongest hydrogen Balmer lines.' },
  { cls: 'F', range: '6 000–7 500 K', T: 6700, example: 'Procyon, Canopus', note: 'Ionised metals such as Ca II appear.' },
  { cls: 'G', range: '5 200–6 000 K', T: 5770, example: 'The Sun, α Cen A', note: 'Ca II H & K dominant; neutral metals.' },
  { cls: 'K', range: '3 700–5 200 K', T: 4400, example: 'Arcturus, Aldebaran', note: 'Neutral metals; molecular bands begin.' },
  { cls: 'M', range: '2 400–3 700 K', T: 3200, example: 'Betelgeuse, Proxima Cen', note: 'Titanium oxide bands dominate.' },
];
