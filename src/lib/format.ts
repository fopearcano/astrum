// Number formatting for astronomical quantities.

const SUPERS: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};
export const sup = (n: number | string): string => String(n).replace(/[-0-9]/g, (c) => SUPERS[c]);

/** Scientific notation with a real times sign: 6.674 × 10⁻¹¹ */
export function sci(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e < 5) return fixed(v, Math.max(0, digits - 1 - e));
  const m = v / 10 ** e;
  const ms = m.toFixed(Math.max(0, digits - 1)).replace(/\.?0+$/, '');
  return `${ms} × 10${sup(e)}`;
}

/** Grouped fixed notation, dropping trailing zeros. */
export function fixed(v: number, d = 2): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  return s === '-0' ? '0' : s;
}

/** Significant-figure formatting that switches to scientific for extremes. */
export function sig(v: number, s = 3): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) return sci(v, s);
  const d = Math.max(0, s - 1 - Math.floor(Math.log10(a)));
  return fixed(Number(v.toPrecision(s)), d);
}

export function compact(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return sig(v / 1e12, 3) + ' trillion';
  if (a >= 1e9) return sig(v / 1e9, 3) + ' billion';
  if (a >= 1e6) return sig(v / 1e6, 3) + ' million';
  return sig(v, 3);
}

const LY = 9.4607304725808e15;
const AU = 1.495978707e11;
const PC = 3.0856775814913673e16;

/** A length in metres, expressed in the unit a reader would reach for. */
export function length(m: number): string {
  const a = Math.abs(m);
  if (a < 1e-2) return sig(m * 1000, 3) + ' mm';
  if (a < 1) return sig(m * 100, 3) + ' cm';
  if (a < 1e4) return sig(m, 3) + ' m';
  if (a < 0.1 * AU) return compact(m / 1000) + ' km';
  if (a < 0.2 * LY) return sig(m / AU, 3) + ' AU';
  if (a < 1e6 * LY) return compact(m / LY) + ' light-years';
  return compact(m / LY) + ' light-years';
}

export function duration(years: number): string {
  const a = Math.abs(years);
  if (a < 1 / 365.25 / 24 / 60) return sig(years * 3.15576e7, 3) + ' s';
  if (a < 1 / 365.25 / 24) return sig(years * 525960, 3) + ' min';
  if (a < 1 / 365.25) return sig(years * 8766, 3) + ' h';
  if (a < 1) return sig(years * 365.25, 3) + ' days';
  if (a < 1e3) return sig(years, 3) + ' yr';
  if (a < 1e6) return sig(years / 1e3, 3) + ' thousand yr';
  if (a < 1e9) return sig(years / 1e6, 3) + ' million yr';
  if (a < 1e12) return sig(years / 1e9, 3) + ' billion yr';
  return sci(years, 3) + ' yr';
}

export function seconds(s: number): string {
  const a = Math.abs(s);
  if (a < 1e-6) return sci(s, 3) + ' s';
  if (a < 1e-3) return sig(s * 1e6, 3) + ' µs';
  if (a < 1) return sig(s * 1e3, 3) + ' ms';
  if (a < 120) return sig(s, 3) + ' s';
  if (a < 7200) return sig(s / 60, 3) + ' min';
  if (a < 172800) return sig(s / 3600, 3) + ' h';
  return duration(s / 3.15576e7);
}

export function temperature(k: number): string {
  if (!Number.isFinite(k)) return '—';
  if (k >= 1e5) return sci(k, 3) + ' K';
  return fixed(Math.round(k), 0) + ' K';
}

export const deg = (v: number, d = 1): string => `${fixed(v, d)}°`;

/** Right ascension in degrees -> 05h 55m 10s */
export function ra(degrees: number): string {
  let h = (((degrees / 15) % 24) + 24) % 24;
  const hh = Math.floor(h);
  h = (h - hh) * 60;
  const mm = Math.floor(h);
  const ss = Math.round((h - mm) * 60);
  const [m2, s2] = ss === 60 ? [mm + 1, 0] : [mm, ss];
  return `${String(hh).padStart(2, '0')}h ${String(m2).padStart(2, '0')}m ${String(s2).padStart(2, '0')}s`;
}

/** Declination in degrees -> +07° 24′ 25″ */
export function dec(degrees: number): string {
  const sgn = degrees < 0 ? '−' : '+';
  let a = Math.abs(degrees);
  const d = Math.floor(a);
  a = (a - d) * 60;
  const m = Math.floor(a);
  const s = Math.round((a - m) * 60);
  const [m2, s2] = s === 60 ? [m + 1, 0] : [m, s];
  return `${sgn}${String(d).padStart(2, '0')}° ${String(m2).padStart(2, '0')}′ ${String(s2).padStart(2, '0')}″`;
}

export const units = { LY, AU, PC };
