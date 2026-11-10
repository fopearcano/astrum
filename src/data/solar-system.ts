// Solar System bodies: orbital elements and physical data.
// Planet elements: JPL "Keplerian Elements for Approximate Positions of the Major Planets"
// (Standish), table 1, valid 1800–2050. Physical data: NASA planetary fact sheets
// and IAU/WGCCRE mean radii. Dwarf-planet and comet elements are osculating values
// rounded for display and good to a few degrees over the modern era.

import type { PerihelionElements, RatedElements } from '../physics/kepler';

export type Surface = 'rocky' | 'venus' | 'earth' | 'mars' | 'banded' | 'ice' | 'pluto' | 'sun';

export interface Moon {
  name: string;
  radiusKm: number;
  aKm: number;
  periodDays: number; // negative = retrograde
}

export interface Body {
  id: string;
  name: string;
  kind: 'star' | 'planet' | 'dwarf' | 'comet';
  elements?: RatedElements;
  perihelion?: PerihelionElements;
  radiusKm: number;
  massKg: number;
  gravity?: number; // m/s²
  escape?: number; // km/s
  rotationH?: number; // sidereal, negative = retrograde
  dayH?: number; // solar day
  tilt?: number; // degrees
  tempC?: number;
  moons?: number | string;
  atmosphere?: string;
  surface: Surface;
  colors: string[];
  rings?: { inner: number; outer: number }; // planet radii
  majorMoons?: Moon[];
  blurb: string;
}

const EL = (a: number[], r: number[]): RatedElements => ({
  a: [a[0], r[0]],
  e: [a[1], r[1]],
  i: [a[2], r[2]],
  L: [a[3], r[3]],
  peri: [a[4], r[4]],
  node: [a[5], r[5]],
});

export const SUN: Body = {
  id: 'sun',
  name: 'Sun',
  kind: 'star',
  radiusKm: 695700,
  massKg: 1.98892e30,
  gravity: 274,
  escape: 617.6,
  rotationH: 609.12,
  tilt: 7.25,
  tempC: 5499,
  surface: 'sun',
  colors: ['#fff4dc', '#ffcf6b', '#ff9d2e'],
  atmosphere: 'Photosphere 73 % H, 25 % He by mass; corona above 1 million K',
  blurb:
    'A G2V main-sequence star 4.6 billion years old, holding 99.86 % of the Solar System’s mass. Its core fuses about 600 million tonnes of hydrogen every second.',
};

export const PLANETS: Body[] = [
  {
    id: 'mercury', name: 'Mercury', kind: 'planet',
    elements: EL([0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]),
    radiusKm: 2439.7, massKg: 3.3011e23, gravity: 3.7, escape: 4.25, rotationH: 1407.6, dayH: 4222.6, tilt: 0.034, tempC: 167, moons: 0,
    atmosphere: 'Trace exosphere of O, Na, H, He, K', surface: 'rocky', colors: ['#8f8c88', '#6f6c69', '#b3afa9'],
    blurb: 'The smallest planet and the closest to the Sun. It turns three times for every two orbits, so a solar day lasts 176 Earth days, and its surface swings from 430 °C to −180 °C.',
  },
  {
    id: 'venus', name: 'Venus', kind: 'planet',
    elements: EL([0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]),
    radiusKm: 6051.8, massKg: 4.8675e24, gravity: 8.87, escape: 10.36, rotationH: -5832.5, dayH: 2802, tilt: 177.4, tempC: 464, moons: 0,
    atmosphere: '96.5 % CO₂, 3.5 % N₂; 92 bar surface pressure', surface: 'venus', colors: ['#e9d9a6', '#cdb67c', '#f3e7c4'],
    blurb: 'Earth’s near-twin in size, wrapped in a crushing carbon-dioxide atmosphere. A runaway greenhouse makes it the hottest planet. It spins backwards, slower than it orbits.',
  },
  {
    id: 'earth', name: 'Earth', kind: 'planet',
    elements: EL([1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]),
    radiusKm: 6371.0, massKg: 5.9722e24, gravity: 9.81, escape: 11.19, rotationH: 23.934, dayH: 24, tilt: 23.44, tempC: 15, moons: 1,
    atmosphere: '78 % N₂, 21 % O₂, 0.9 % Ar; 1 bar', surface: 'earth', colors: ['#1d4f91', '#2f7a4a', '#c9b98a', '#f4f6f8'],
    majorMoons: [{ name: 'Moon', radiusKm: 1737.4, aKm: 384400, periodDays: 27.322 }],
    blurb: 'The densest planet and the only one known to host life, with liquid water across 71 % of its surface. Elements here are the Earth–Moon barycentre, 4,700 km from Earth’s centre.',
  },
  {
    id: 'mars', name: 'Mars', kind: 'planet',
    elements: EL([1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]),
    radiusKm: 3389.5, massKg: 6.4171e23, gravity: 3.72, escape: 5.03, rotationH: 24.623, dayH: 24.66, tilt: 25.19, tempC: -65, moons: 2,
    atmosphere: '95 % CO₂, 2.8 % N₂, 2 % Ar; 0.006 bar', surface: 'mars', colors: ['#b5532a', '#8a3b1e', '#d9905e'],
    majorMoons: [
      { name: 'Phobos', radiusKm: 11.3, aKm: 9376, periodDays: 0.319 },
      { name: 'Deimos', radiusKm: 6.2, aKm: 23463, periodDays: 1.263 },
    ],
    blurb: 'A cold desert world with the tallest volcano (Olympus Mons) and the deepest canyon system (Valles Marineris) in the Solar System. Ancient river valleys record a wetter past.',
  },
  {
    id: 'jupiter', name: 'Jupiter', kind: 'planet',
    elements: EL([5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]),
    radiusKm: 69911, massKg: 1.89813e27, gravity: 24.79, escape: 59.5, rotationH: 9.925, dayH: 9.93, tilt: 3.13, tempC: -110, moons: '95+',
    atmosphere: '90 % H₂, 10 % He by number; ammonia clouds', surface: 'banded', colors: ['#e6d8b8', '#c49a6c', '#a7704a', '#efe6d2', '#b3825c'],
    rings: { inner: 1.29, outer: 1.81 },
    majorMoons: [
      { name: 'Io', radiusKm: 1821.6, aKm: 421700, periodDays: 1.769 },
      { name: 'Europa', radiusKm: 1560.8, aKm: 671034, periodDays: 3.551 },
      { name: 'Ganymede', radiusKm: 2634.1, aKm: 1070412, periodDays: 7.155 },
      { name: 'Callisto', radiusKm: 2410.3, aKm: 1882709, periodDays: 16.689 },
    ],
    blurb: 'A gas giant 2.5 times more massive than all other planets combined. The Great Red Spot is a storm wider than Earth that has raged for at least 190 years.',
  },
  {
    id: 'saturn', name: 'Saturn', kind: 'planet',
    elements: EL([9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]),
    radiusKm: 58232, massKg: 5.6834e26, gravity: 10.44, escape: 35.5, rotationH: 10.561, dayH: 10.56, tilt: 26.73, tempC: -140, moons: 274,
    atmosphere: '96 % H₂, 3 % He by number', surface: 'banded', colors: ['#eadcb4', '#d4bd88', '#c2a56e', '#f2e8cc'],
    rings: { inner: 1.24, outer: 2.27 },
    majorMoons: [
      { name: 'Mimas', radiusKm: 198.2, aKm: 185539, periodDays: 0.942 },
      { name: 'Enceladus', radiusKm: 252.1, aKm: 237948, periodDays: 1.37 },
      { name: 'Tethys', radiusKm: 531.1, aKm: 294619, periodDays: 1.888 },
      { name: 'Dione', radiusKm: 561.4, aKm: 377396, periodDays: 2.737 },
      { name: 'Rhea', radiusKm: 763.8, aKm: 527108, periodDays: 4.518 },
      { name: 'Titan', radiusKm: 2574.7, aKm: 1221870, periodDays: 15.945 },
      { name: 'Iapetus', radiusKm: 734.5, aKm: 3560820, periodDays: 79.32 },
    ],
    blurb: 'The least dense planet, less dense than water. Its rings span 280,000 km but are mostly tens of metres thick, made of water-ice fragments from dust to house size.',
  },
  {
    id: 'uranus', name: 'Uranus', kind: 'planet',
    elements: EL([19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]),
    radiusKm: 25362, massKg: 8.681e25, gravity: 8.69, escape: 21.3, rotationH: -17.24, dayH: 17.24, tilt: 97.77, tempC: -195, moons: 29,
    atmosphere: '83 % H₂, 15 % He, 2.3 % CH₄', surface: 'ice', colors: ['#a6dbe2', '#8cc9d3', '#c3e9ee'],
    rings: { inner: 1.64, outer: 2.01 },
    majorMoons: [
      { name: 'Miranda', radiusKm: 235.8, aKm: 129390, periodDays: 1.413 },
      { name: 'Ariel', radiusKm: 578.9, aKm: 191020, periodDays: 2.52 },
      { name: 'Umbriel', radiusKm: 584.7, aKm: 266000, periodDays: 4.144 },
      { name: 'Titania', radiusKm: 788.4, aKm: 435910, periodDays: 8.706 },
      { name: 'Oberon', radiusKm: 761.4, aKm: 583520, periodDays: 13.46 },
    ],
    blurb: 'An ice giant tipped on its side, so each pole spends 42 years in sunlight and 42 in darkness. Methane in the upper atmosphere absorbs red light, giving its cyan colour.',
  },
  {
    id: 'neptune', name: 'Neptune', kind: 'planet',
    elements: EL([30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]),
    radiusKm: 24622, massKg: 1.02413e26, gravity: 11.15, escape: 23.5, rotationH: 16.11, dayH: 16.11, tilt: 28.32, tempC: -200, moons: 16,
    atmosphere: '80 % H₂, 19 % He, 1.5 % CH₄', surface: 'ice', colors: ['#3f63c8', '#2f4fa8', '#7b9be6'],
    majorMoons: [{ name: 'Triton', radiusKm: 1353.4, aKm: 354759, periodDays: -5.877 }],
    blurb: 'Found in 1846 by mathematics before telescopes: its pull on Uranus gave it away. It has the fastest winds measured on any planet, up to 2,100 km/h.',
  },
];

export const PLUTO: Body = {
  id: 'pluto', name: 'Pluto', kind: 'dwarf',
  elements: EL([39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684], [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482]),
  radiusKm: 1188.3, massKg: 1.303e22, gravity: 0.62, escape: 1.21, rotationH: -153.29, dayH: 153.3, tilt: 122.53, tempC: -225, moons: 5,
  atmosphere: 'Thin N₂ with CH₄ and CO; ~1 Pa', surface: 'pluto', colors: ['#d8c2a2', '#a27a5a', '#efe3cf'],
  majorMoons: [{ name: 'Charon', radiusKm: 606, aKm: 19591, periodDays: 6.387 }],
  blurb: 'A Kuiper Belt dwarf planet in a 3:2 resonance with Neptune. New Horizons found nitrogen-ice glaciers in Sputnik Planitia, the left lobe of its heart-shaped plain.',
};

const jd = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86400000 + 2440587.5;

export const DWARFS: Body[] = [
  {
    id: 'ceres', name: 'Ceres', kind: 'dwarf',
    perihelion: { a: 2.7675, e: 0.0785, i: 10.59, node: 80.31, argPeri: 73.6, tp: jd(2022, 12, 7) },
    radiusKm: 469.7, massKg: 9.38e20, gravity: 0.28, escape: 0.51, rotationH: 9.07, tilt: 4, tempC: -105, moons: 0,
    surface: 'rocky', colors: ['#8d8984', '#77736e', '#a9a49d'],
    blurb: 'The largest object in the asteroid belt and the only dwarf planet in the inner Solar System. Dawn found bright salt deposits in Occator crater.',
  },
  {
    id: 'haumea', name: 'Haumea', kind: 'dwarf',
    perihelion: { a: 43.12, e: 0.1958, i: 28.21, node: 121.8, argPeri: 240.9, tp: jd(2133, 6, 1) },
    radiusKm: 816, massKg: 4.006e21, rotationH: 3.92, moons: 2,
    surface: 'pluto', colors: ['#e2e0dc', '#c8c4be', '#f2f0ec'],
    blurb: 'Spins once every four hours, fast enough to stretch it into an ellipsoid twice as long as it is wide. It has a ring and two moons.',
  },
  {
    id: 'makemake', name: 'Makemake', kind: 'dwarf',
    perihelion: { a: 45.43, e: 0.161, i: 28.98, node: 79.62, argPeri: 294.8, tp: jd(2185, 1, 1) },
    radiusKm: 715, massKg: 3.1e21, rotationH: 22.83, moons: 1,
    surface: 'pluto', colors: ['#c79c7c', '#a8785a', '#e0c0a6'],
    blurb: 'A reddish Kuiper Belt world coated in methane ice, currently near the far point of its 306-year orbit.',
  },
  {
    id: 'eris', name: 'Eris', kind: 'dwarf',
    perihelion: { a: 67.86, e: 0.4361, i: 44.04, node: 35.95, argPeri: 151.64, tp: jd(2257, 1, 1) },
    radiusKm: 1163, massKg: 1.6466e22, gravity: 0.82, escape: 1.38, rotationH: 378.9, moons: 1, tempC: -243,
    surface: 'ice', colors: ['#ededeb', '#d8d8d4', '#ffffff'],
    blurb: 'Slightly more massive than Pluto. Its discovery in 2005 led the IAU to define “planet” in 2006. It is near aphelion, about 96 AU from the Sun.',
  },
];

export const HALLEY: PerihelionElements = { a: 17.834, e: 0.96714, i: 162.26, node: 58.42, argPeri: 111.33, tp: 2446470.5 };

export const COMETS: Body[] = [
  {
    id: 'halley', name: '1P/Halley', kind: 'comet', perihelion: HALLEY,
    radiusKm: 5.5, massKg: 2.2e14, rotationH: 52.8, surface: 'rocky', colors: ['#8a8580', '#6c6864', '#a19c96'],
    blurb: 'The first comet recognised as periodic, by Edmond Halley in 1705. It returns every 75–79 years on a retrograde orbit; the next perihelion is on 28 July 2061.',
  },
];

export const ALL_BODIES: Body[] = [SUN, ...PLANETS, PLUTO, ...DWARFS, ...COMETS];
