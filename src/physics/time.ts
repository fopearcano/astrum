// Time scales. Positions use UT as an approximation of TT (ΔT ≈ 69 s is
// negligible at the precision of these visualisations).

export const J2000 = 2451545.0;

export const julianDate = (d: Date): number => d.getTime() / 86400000 + 2440587.5;
export const dateFromJulian = (jd: number): Date => new Date((jd - 2440587.5) * 86400000);
/** Julian centuries since J2000.0 */
export const centuries = (jd: number): number => (jd - J2000) / 36525;

/** Greenwich mean sidereal time in degrees (IAU 1982 expression). */
export function gmst(jd: number): number {
  const T = centuries(jd);
  const g = 280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - (T * T * T) / 38710000;
  return ((g % 360) + 360) % 360;
}

/** Local sidereal time in degrees for an east-positive longitude. */
export const lst = (jd: number, lonDeg: number): number => (((gmst(jd) + lonDeg) % 360) + 360) % 360;

export function formatUTC(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
