// Geocentric positions and magnitudes of the Sun, Moon and planets.

import { PLANETS, Body } from '../data/solar-system';
import { elementsAt, position, Vec3 } from './kepler';
import { eclipticToEquatorial, moonPosition, separation, vecToRadec } from './coords';

export interface SkyBody {
  id: string;
  name: string;
  ra: number;
  dec: number;
  mag: number;
  distAU: number;
  color: string;
  elongation: number; // degrees from the Sun
  phase?: number; // illuminated fraction
}

const D2R = Math.PI / 180;

// Apparent-magnitude laws (Astronomical Almanac style): V(1,0) and phase coefficients.
function planetMagnitude(id: string, r: number, d: number, i: number): number {
  const base = 5 * Math.log10(r * d);
  switch (id) {
    case 'mercury': return -0.42 + base + 0.038 * i - 0.000273 * i * i + 0.000002 * i ** 3;
    case 'venus': return -4.4 + base + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i ** 3;
    case 'mars': return -1.52 + base + 0.016 * i;
    case 'jupiter': return -9.4 + base + 0.005 * i;
    case 'saturn': return -8.88 + base + 0.044 * i;
    case 'uranus': return -7.19 + base;
    case 'neptune': return -6.87 + base;
    default: return 99;
  }
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

export function skyBodies(jd: number): SkyBody[] {
  const earthBody = PLANETS.find((p) => p.id === 'earth')!;
  const earth = position(elementsAt(earthBody.elements!, jd));
  const sunGeo = eclipticToEquatorial({ x: -earth.x, y: -earth.y, z: -earth.z });
  const sun = vecToRadec(sunGeo.x, sunGeo.y, sunGeo.z);
  const out: SkyBody[] = [
    { id: 'sun', name: 'Sun', ra: sun.ra, dec: sun.dec, mag: -26.74, distAU: len(earth), color: '#fff1c9', elongation: 0 },
  ];
  const moon = moonPosition(jd);
  const elongM = separation(moon.ra, moon.dec, sun.ra, sun.dec);
  const phaseAngle = 180 - elongM;
  out.push({
    id: 'moon',
    name: 'Moon',
    ra: moon.ra,
    dec: moon.dec,
    mag: -12.73 + 0.026 * Math.abs(phaseAngle) + 4e-9 * phaseAngle ** 4,
    distAU: moon.distKm / 1.495978707e8,
    color: '#e9e6dc',
    elongation: elongM,
    phase: (1 + Math.cos(phaseAngle * D2R)) / 2,
  });
  for (const p of PLANETS as Body[]) {
    if (p.id === 'earth') continue;
    const helio = position(elementsAt(p.elements!, jd));
    const geo = sub(helio, earth);
    const r = len(helio);
    const d = len(geo);
    const i = Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - len(earth) ** 2) / (2 * r * d)))) / D2R;
    const eq = eclipticToEquatorial(geo);
    const { ra, dec } = vecToRadec(eq.x, eq.y, eq.z);
    out.push({
      id: p.id,
      name: p.name,
      ra,
      dec,
      mag: planetMagnitude(p.id, r, d, i),
      distAU: d,
      color: p.colors[0],
      elongation: separation(ra, dec, sun.ra, sun.dec),
      phase: (1 + Math.cos(i * D2R)) / 2,
    });
  }
  return out;
}
