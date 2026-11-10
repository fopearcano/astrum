// Objects for the scale-of-the-cosmos plate. `size` is the largest dimension in metres
// (a diameter for spheres and regions, a length for distances).

export type ScaleKind =
  | 'person' | 'station' | 'crater' | 'comet' | 'mountain' | 'neutron' | 'rock' | 'planet' | 'gas' | 'ringed'
  | 'star' | 'dwarf' | 'blackhole' | 'orbit' | 'shell' | 'distance' | 'nebula' | 'cluster' | 'galaxy' | 'irregular'
  | 'group' | 'web' | 'universe';

export interface ScaleObject {
  name: string;
  size: number;
  kind: ScaleKind;
  colors: string[];
  note: string;
}

const LY = 9.4607e15;
const AU = 1.495978707e11;
const RSUN = 6.957e8;

export const SCALE_OBJECTS: ScaleObject[] = [
  { name: 'A person', size: 1.7, kind: 'person', colors: ['#c9b7a0'], note: 'About 10²⁸ atoms. Everything on this plate is measured against this.' },
  { name: 'International Space Station', size: 109, kind: 'station', colors: ['#c8ccd2', '#c49a3a'], note: 'Its solar arrays span 109 m. It orbits 400 km up, once every 92 minutes.' },
  { name: 'Meteor Crater, Arizona', size: 1200, kind: 'crater', colors: ['#b98a5e', '#7e5a3b'], note: 'Blasted 50,000 years ago by an iron meteorite about 50 m across.' },
  { name: 'Comet 67P', size: 4100, kind: 'comet', colors: ['#6e6a66', '#4a4744'], note: 'Churyumov–Gerasimenko, the two-lobed nucleus visited by Rosetta and Philae in 2014.' },
  { name: 'Mount Everest', size: 8849, kind: 'mountain', colors: ['#7d7f88', '#eef1f5'], note: '8,849 m above sea level: the height an airliner cruises at.' },
  { name: 'A neutron star', size: 24000, kind: 'neutron', colors: ['#cfe0ff'], note: 'About 1.4 solar masses in a ball the size of a city. A teaspoon would weigh a billion tonnes.' },
  { name: 'Ceres', size: 939400, kind: 'rock', colors: ['#8d8984', '#6f6c69'], note: 'The largest body in the asteroid belt and the closest dwarf planet.' },
  { name: 'Pluto', size: 2376600, kind: 'rock', colors: ['#d8c2a2', '#a27a5a'], note: 'A dwarf planet smaller than our Moon, with nitrogen glaciers and a thin haze.' },
  { name: 'The Moon', size: 3474800, kind: 'rock', colors: ['#bdb8ae', '#8a867f'], note: 'Probably made from debris when a Mars-sized body hit the young Earth.' },
  { name: 'Mercury', size: 4879400, kind: 'rock', colors: ['#9c9893', '#6f6c69'], note: 'The smallest planet, only 38 % wider than the Moon.' },
  { name: 'Mars', size: 6779000, kind: 'planet', colors: ['#c1440e', '#8a3b1e'], note: 'Half the width of Earth and one-tenth its mass.' },
  { name: 'Sirius B', size: 11700000, kind: 'dwarf', colors: ['#e6eeff'], note: 'A white dwarf with the Sun’s mass squeezed into Earth’s size, orbiting Sirius every 50 years.' },
  { name: 'Earth', size: 12742000, kind: 'planet', colors: ['#2f6db5', '#2f7a4a'], note: 'Home: 12,742 km across, with an atmosphere thinner, relative to its size, than an apple’s skin.' },
  { name: 'Neptune', size: 49244000, kind: 'gas', colors: ['#3f63c8', '#2f4fa8'], note: 'The outermost planet, 4 times Earth’s diameter.' },
  { name: 'Jupiter', size: 139820000, kind: 'gas', colors: ['#d9c7a0', '#b07f53'], note: 'Eleven Earths would fit across its equator.' },
  { name: 'Proxima Centauri', size: 0.154 * 2 * RSUN, kind: 'star', colors: ['#ff9d5c'], note: 'The nearest star to the Sun, a red dwarf only 1.5 times wider than Jupiter.' },
  { name: 'The Moon’s orbit', size: 2 * 384400000, kind: 'orbit', colors: ['#bdb8ae'], note: 'The Moon circles Earth at an average 384,400 km, about 30 Earth-diameters away.' },
  { name: 'The Sun', size: 2 * RSUN, kind: 'star', colors: ['#ffd27a'], note: '109 Earths across; it could hold 1.3 million Earths.' },
  { name: 'Sirius A', size: 1.711 * 2 * RSUN, kind: 'star', colors: ['#cad8ff'], note: 'The brightest star in the night sky: hotter and 1.7 times wider than the Sun.' },
  { name: 'Sagittarius A*', size: 2.54e10, kind: 'blackhole', colors: ['#ffb36b'], note: 'The 4.3-million-solar-mass black hole at the centre of the Milky Way. Its horizon would fit inside Mercury’s orbit.' },
  { name: 'Arcturus', size: 25.4 * 2 * RSUN, kind: 'star', colors: ['#ffbe7a'], note: 'An orange giant 25 times wider than the Sun, the brightest star in the northern sky.' },
  { name: 'Earth’s orbit', size: 2 * AU, kind: 'orbit', colors: ['#2f6db5'], note: 'Two astronomical units across: light takes 16.6 minutes to cross it.' },
  { name: 'Betelgeuse', size: 764 * 2 * RSUN, kind: 'star', colors: ['#ff8a4a'], note: 'A red supergiant in Orion. Placed at the Sun, it would swallow the orbits of Mars and the asteroid belt.' },
  { name: 'Orbits of the planets', size: 2 * 30.07 * AU, kind: 'orbit', colors: ['#b79a62'], note: 'Neptune’s orbit is 60 AU across. Light takes 8.3 hours to cross it.' },
  { name: 'M87*', size: 3.84e13, kind: 'blackhole', colors: ['#ffb36b'], note: 'The 6.5-billion-solar-mass black hole imaged by the Event Horizon Telescope in 2019. Its horizon would enclose the Solar System’s planets.' },
  { name: 'The heliosphere', size: 2 * 120 * AU, kind: 'shell', colors: ['#7aa6d9'], note: 'The bubble blown by the solar wind. Voyager 1 crossed its edge, the heliopause, in 2012 at 121 AU.' },
  { name: 'The Oort cloud', size: 2 * 100000 * AU, kind: 'shell', colors: ['#8fb7d9'], note: 'A hypothesised shell of trillions of icy bodies reaching perhaps 100,000 AU, a third of the way to the nearest star.' },
  { name: 'Sun to Proxima Centauri', size: 4.2465 * LY, kind: 'distance', colors: ['#ff9d5c'], note: '4.25 light-years. At Voyager 1’s speed the trip would take 73,000 years.' },
  { name: 'Orion Nebula', size: 24 * LY, kind: 'nebula', colors: ['#d9707f', '#6fa8dc'], note: 'The nearest large stellar nursery, 1,344 light-years away, visible to the naked eye below Orion’s belt.' },
  { name: 'Omega Centauri', size: 150 * LY, kind: 'cluster', colors: ['#ffe2b0'], note: 'The Milky Way’s largest globular cluster: about 10 million stars, perhaps the core of a swallowed dwarf galaxy.' },
  { name: 'Large Magellanic Cloud', size: 14000 * LY, kind: 'irregular', colors: ['#cfd9ff', '#e9c9d9'], note: 'A satellite galaxy 160,000 light-years away, host of supernova SN 1987A.' },
  { name: 'The Milky Way', size: 100000 * LY, kind: 'galaxy', colors: ['#ffe9c4', '#9fb7ff'], note: 'Our galaxy: a barred spiral of 100–400 billion stars. The Sun lies 26,000 light-years from the centre.' },
  { name: 'Andromeda Galaxy', size: 152000 * LY, kind: 'galaxy', colors: ['#ffe2c0', '#a9bcff'], note: 'The nearest large galaxy, 2.5 million light-years away and approaching at 110 km/s. It will merge with the Milky Way in about 4.5 billion years.' },
  { name: 'Milky Way to Andromeda', size: 2.5e6 * LY, kind: 'distance', colors: ['#a9bcff'], note: '2.5 million light-years: the light reaching us tonight left when Homo habilis walked in Africa.' },
  { name: 'The Local Group', size: 10e6 * LY, kind: 'group', colors: ['#cfd9ff'], note: 'More than 80 galaxies bound together, dominated by the Milky Way and Andromeda.' },
  { name: 'Virgo Supercluster', size: 110e6 * LY, kind: 'web', colors: ['#9fb7ff'], note: 'Our local supercluster, centred on the Virgo Cluster of about 1,300 galaxies.' },
  { name: 'Laniakea Supercluster', size: 520e6 * LY, kind: 'web', colors: ['#c9a8ff'], note: 'Defined in 2014 by galaxy motions: about 100,000 galaxies flowing toward the Great Attractor. Laniakea is Hawaiian for “immense heaven”.' },
  { name: 'The observable universe', size: 93e9 * LY, kind: 'universe', colors: ['#d98a5a', '#5a7fd9'], note: '93 billion light-years across. Light has had 13.8 billion years to reach us, but space has expanded meanwhile, so the most distant sources are now 46.5 billion light-years away.' },
];
