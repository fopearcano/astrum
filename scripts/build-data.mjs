#!/usr/bin/env node
// Builds the compact catalogues that Astrum loads at runtime (public/data/*.json)
// from open astronomical datasets.
//
//   node scripts/build-data.mjs            downloads sources into .cache/data-src
//   node scripts/build-data.mjs --src DIR  uses files already downloaded into DIR
//
// Sources and licences are listed in public/data/SOURCES.md.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data');
const argSrc = process.argv.indexOf('--src');
const SRC = argSrc > 0 ? resolve(process.argv[argSrc + 1]) : join(ROOT, '.cache', 'data-src');

const D3C = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/';
const SOURCES = {
  'hygdata_v41.csv': 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
  'constellations.lines.json': D3C + 'constellations.lines.json',
  'constellations.json': D3C + 'constellations.json',
  'constellations.borders.json': D3C + 'constellations.borders.json',
  'mw.json': D3C + 'mw.json',
  'messier.json': D3C + 'messier.json',
  'open_exoplanet_catalogue.txt':
    'https://raw.githubusercontent.com/OpenExoplanetCatalogue/oec_tables/master/comma_separated/open_exoplanet_catalogue.txt',
};

mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

function ensure(name) {
  const path = join(SRC, name);
  if (!existsSync(path)) {
    console.log(`downloading ${name}`);
    // curl honours HTTPS_PROXY and system CA bundles, which Node's fetch does not.
    execFileSync('curl', ['-sSfL', '-o', path, SOURCES[name]], { stdio: 'inherit' });
  }
  return readFileSync(path, 'utf8');
}

/** Minimal RFC 4180 CSV parser (quoted fields, embedded commas). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const num = (s) => (s === '' || s == null ? NaN : Number(s));
const round = (v, d) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const write = (name, data) => {
  const json = JSON.stringify(data);
  writeFileSync(join(OUT, name), json);
  console.log(`wrote ${name.padEnd(22)} ${(json.length / 1024).toFixed(0).padStart(5)} KB`);
};

const GREEK = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ',
  Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ',
  Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};
const SUP = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

function designation(s) {
  if (s.bayer) {
    const [b, n] = s.bayer.split('-');
    const g = GREEK[b] ?? b;
    return `${g}${n ? SUP[n] ?? n : ''} ${s.con}`;
  }
  if (s.flam) return `${s.flam} ${s.con}`;
  if (s.gl) return s.gl.replace(/^Gl\s*/, 'Gliese ').replace(/^GJ\s*/, 'GJ ');
  if (s.hip) return `HIP ${s.hip}`;
  if (s.hd) return `HD ${s.hd}`;
  return `HYG ${s.id}`;
}

// Equatorial (J2000) -> galactic rotation matrix.
const EQ2GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.444829630, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];
const toGal = ([x, y, z]) => EQ2GAL.map((r) => r[0] * x + r[1] * y + r[2] * z);

/* ---------------------------------------------------------------- stars */
console.log('parsing HYG v4.1 …');
const hyg = parseCSV(ensure('hygdata_v41.csv'))
  .map((s) => ({
    ...s,
    ra: num(s.ra) * 15, // hours -> degrees
    dec: num(s.dec),
    mag: num(s.mag),
    absmag: num(s.absmag),
    ci: num(s.ci),
    dist: num(s.dist),
    x: num(s.x), y: num(s.y), z: num(s.z),
  }))
  .filter((s) => s.id !== '0'); // drop Sol

const knownDist = (s) => Number.isFinite(s.dist) && s.dist > 0 && s.dist < 100000;

// Sky catalogue: naked-eye stars, brightest first so renderers can stop early.
const sky = hyg.filter((s) => s.mag <= 6.5).sort((a, b) => a.mag - b.mag);
write('stars.json', {
  count: sky.length,
  ra: sky.map((s) => round(s.ra, 4)),
  dec: sky.map((s) => round(s.dec, 4)),
  mag: sky.map((s) => round(s.mag, 2)),
  ci: sky.map((s) => (Number.isFinite(s.ci) ? round(s.ci, 2) : null)),
  dist: sky.map((s) => (knownDist(s) ? round(s.dist, 2) : null)),
  absmag: sky.map((s) => (Number.isFinite(s.absmag) && knownDist(s) ? round(s.absmag, 2) : null)),
  spect: sky.map((s) => s.spect || ''),
  name: sky.map((s) => s.proper || ''),
  desig: sky.map((s) => designation(s)),
  con: sky.map((s) => s.con || ''),
  hip: sky.map((s) => (s.hip ? Number(s.hip) : null)),
});

// Hertzsprung–Russell sample: the solar neighbourhood (good parallaxes)
// plus luminous naked-eye stars further out, which populate the giant branches.
const hr = hyg.filter(
  (s) =>
    Number.isFinite(s.ci) && Number.isFinite(s.absmag) && knownDist(s) &&
    (s.dist < 100 || (s.mag < 6.5 && s.dist < 2000)) && s.ci > -0.5 && s.ci < 2.5,
);
write('hr.json', {
  count: hr.length,
  ci: hr.map((s) => round(s.ci, 3)),
  M: hr.map((s) => round(s.absmag, 2)),
  name: hr.map((s) => s.proper || ''),
});

/* ------------------------------------------------------------ exoplanets */
console.log('parsing Open Exoplanet Catalogue …');
const hms = (s, deg) => {
  const p = s.trim().split(/\s+/).map(Number);
  if (p.length < 2 || p.some((v) => !Number.isFinite(v))) return NaN;
  const sign = s.trim().startsWith('-') ? -1 : 1;
  const v = Math.abs(p[0]) + (p[1] ?? 0) / 60 + (p[2] ?? 0) / 3600;
  return sign * v * (deg ? 1 : 15);
};
const METHOD = { transit: 'Transit', RV: 'Radial velocity', microlensing: 'Microlensing', imaging: 'Imaging', timing: 'Timing', astrometry: 'Astrometry', 'disk kinematics': 'Disk kinematics' };
const planets = parseCSV(ensure('open_exoplanet_catalogue.txt'))
  .filter((p) => p.list.includes('Confirmed planets'))
  .map((p) => ({
    name: p.name,
    method: METHOD[p.discoverymethod] ?? 'Other',
    year: num(p.discoveryyear),
    mass: num(p.mass), // Jupiter masses
    radius: num(p.radius), // Jupiter radii
    period: num(p.period), // days
    a: num(p.semimajoraxis), // AU
    e: num(p.eccentricity),
    teq: num(p.temperature), // K
    dist: num(p.system_distance), // pc
    smass: num(p.hoststar_mass),
    sradius: num(p.hoststar_radius),
    steff: num(p.hoststar_temperature),
    sfeh: num(p.hoststar_metallicity),
    ra: hms(p.system_rightascension, false),
    dec: hms(p.system_declination, true),
  }))
  .filter((p) => Number.isFinite(p.year));
planets.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
const methods = [...new Set(planets.map((p) => p.method))];
const col = (k, d) => planets.map((p) => round(p[k], d));
write('exoplanets.json', {
  count: planets.length,
  methods,
  name: planets.map((p) => p.name),
  method: planets.map((p) => methods.indexOf(p.method)),
  year: planets.map((p) => p.year),
  mass: col('mass', 5), radius: col('radius', 4), period: col('period', 5), a: col('a', 5),
  e: col('e', 3), teq: col('teq', 0), dist: col('dist', 2), smass: col('smass', 3),
  sradius: col('sradius', 3), steff: col('steff', 0), sfeh: col('sfeh', 2),
  ra: col('ra', 4), dec: col('dec', 4),
});

/* --------------------------------------------- solar neighbourhood (20 pc) */
const NEAR_PC = 20;
const near = hyg.filter((s) => knownDist(s) && s.dist <= NEAR_PC && Number.isFinite(s.absmag));
const sep = (ra1, de1, ra2, de2) => {
  const r = Math.PI / 180;
  const c = Math.sin(de1 * r) * Math.sin(de2 * r) + Math.cos(de1 * r) * Math.cos(de2 * r) * Math.cos((ra1 - ra2) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};
// Assign each nearby planet to exactly one host star. The exoplanet table stores one
// position per *system*, so match by host name first (e.g. "Proxima Centauri b" →
// Proxima Centauri, not α Cen A), then fall back to the nearest star in position and distance.
const normName = (s) => s.toLowerCase().replace(/gliese/g, 'gj').replace(/[^a-z0-9]/g, '');
const nearIndexByName = new Map();
near.forEach((s, i) => {
  for (const n of [s.proper, designation(s), s.gl, s.hd && `HD ${s.hd}`, s.hip && `HIP ${s.hip}`]) if (n) nearIndexByName.set(normName(n), i);
});
const hostCount = new Array(near.length).fill(0);
for (const p of planets) {
  if (!Number.isFinite(p.dist) || p.dist > NEAR_PC + 2 || !Number.isFinite(p.ra)) continue;
  const host = p.name.replace(/\s+[a-z]$/, '').replace(/\s+\(?[A-C]\)?$/, '');
  let idx = nearIndexByName.get(normName(host)) ?? nearIndexByName.get(normName(host.replace(/\s+[A-C]$/, '')));
  if (idx === undefined) {
    let best = 0.1;
    near.forEach((s, i) => {
      const d = sep(p.ra, p.dec, s.ra, s.dec);
      if (d < best && Math.abs(p.dist - s.dist) / s.dist < 0.15) {
        best = d;
        idx = i;
      }
    });
  }
  if (idx !== undefined) hostCount[idx]++;
}
write('nearby.json', {
  count: near.length,
  radius: NEAR_PC,
  stars: near.map((s, i) => {
    const [gx, gy, gz] = toGal([s.x, s.y, s.z]);
    const hosts = hostCount[i];
    return [
      round(gx, 3), round(gy, 3), round(gz, 3), round(s.absmag, 2),
      Number.isFinite(s.ci) ? round(s.ci, 2) : null, s.spect || '', s.proper || '', designation(s),
      round(s.mag, 2), round(s.dist, 3), hosts,
    ];
  }),
  fields: ['gx', 'gy', 'gz', 'absmag', 'ci', 'spect', 'name', 'desig', 'mag', 'dist', 'planets'],
});

/* ---------------------------------------------------------- constellations */
const raOf = (lon) => (lon < 0 ? lon + 360 : lon);
const lines = JSON.parse(ensure('constellations.lines.json'));
const names = JSON.parse(ensure('constellations.json'));
const borders = JSON.parse(ensure('constellations.borders.json'));
const nameById = Object.fromEntries(names.features.map((f) => [f.id, f]));
write('constellations.json', {
  list: names.features.map((f) => ({
    id: f.id,
    name: f.properties.name,
    gen: f.properties.gen,
    rank: Number(f.properties.rank),
    ra: round(raOf(f.geometry.coordinates[0]), 2),
    dec: round(f.geometry.coordinates[1], 2),
  })),
  lines: Object.fromEntries(
    lines.features
      .filter((f) => nameById[f.id])
      .map((f) => [f.id, f.geometry.coordinates.map((l) => l.map(([lo, la]) => [round(raOf(lo), 3), round(la, 3)]))]),
  ),
  borders: borders.features.flatMap((f) =>
    f.geometry.coordinates.map((l) => l.flatMap(([lo, la]) => [round(raOf(lo), 2), round(la, 2)])),
  ),
});

/* ----------------------------------------------------------- Milky Way band */
const mw = JSON.parse(ensure('mw.json'));
// Five nested brightness contours; decimate and round to keep the file small.
write('milkyway.json', {
  levels: mw.features.map((f) =>
    f.geometry.coordinates.map((poly) =>
      poly.map((ring) =>
        ring
          .filter((_, i) => i % 2 === 0 || i === ring.length - 1)
          .flatMap(([lo, la]) => [round(raOf(lo), 1), round(la, 1)]),
      ),
    ),
  ),
});

/* ------------------------------------------------------------------ Messier */
const TYPE = { gc: 'Globular cluster', oc: 'Open cluster', s: 'Spiral galaxy', e: 'Elliptical galaxy', i: 'Irregular galaxy', sfr: 'Star-forming nebula', pn: 'Planetary nebula', snr: 'Supernova remnant', rn: 'Reflection nebula', pos: 'Asterism / star group' };
const messier = JSON.parse(ensure('messier.json'));
write('messier.json', messier.features.map((f) => ({
  id: f.id,
  name: f.properties.alt || '',
  ngc: f.properties.desig || '',
  type: TYPE[f.properties.type] ?? f.properties.type,
  kind: f.properties.type,
  mag: f.properties.mag,
  dim: f.properties.dim,
  ra: round(raOf(f.geometry.coordinates[0]), 3),
  dec: round(f.geometry.coordinates[1], 3),
})));

console.log('done.');
