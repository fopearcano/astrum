// The atlas's table of contents. Each plate is lazy-loaded so heavy 3D code
// only downloads when it is opened.

export interface PlateContext {
  /** Optional focus request from search, e.g. { focus: 'Betelgeuse' }. */
  params: Record<string, string>;
}

export interface PlateModule {
  mount(root: HTMLElement, ctx: PlateContext): () => void;
}

export interface PlateDef {
  id: string;
  num: string;
  title: string;
  summary: string;
  medium: string;
  load: () => Promise<PlateModule>;
}

export const PLATES: PlateDef[] = [
  {
    id: 'scale',
    num: 'I',
    title: 'The Scale of the Cosmos',
    summary: 'Zoom across 27 orders of magnitude, from a person to the observable universe.',
    medium: 'Zoomable plate',
    load: () => import('./scale'),
  },
  {
    id: 'solar-system',
    num: 'II',
    title: 'The Solar System',
    summary: 'A live orrery with real orbital elements: the planets, dwarf planets and Halley’s comet on any date from 1800 to 2050.',
    medium: '3D · real time',
    load: () => import('./solar-system'),
  },
  {
    id: 'sky',
    num: 'III',
    title: 'The Night Sky',
    summary: 'A star atlas of 8,921 naked-eye stars, the 88 constellations and the Messier catalogue, or tonight’s sky from your city.',
    medium: 'Star chart',
    load: () => import('./sky'),
  },
  {
    id: 'neighbourhood',
    num: 'IV',
    title: 'The Solar Neighbourhood',
    summary: 'Every catalogued star within 20 parsecs in three dimensions, with the ones known to host planets.',
    medium: '3D · catalogue',
    load: () => import('./neighbourhood'),
  },
  {
    id: 'light',
    num: 'V',
    title: 'Light and Spectra',
    summary: 'Planck’s law, the colours of stars, the hydrogen atom and the Doppler shift that measures the expanding Universe.',
    medium: 'Interactive charts',
    load: () => import('./light'),
  },
  {
    id: 'hr-diagram',
    num: 'VI',
    title: 'The Hertzsprung–Russell Diagram',
    summary: '28,879 real stars by colour and luminosity: the main sequence, giants, supergiants and white dwarfs.',
    medium: 'Catalogue chart',
    load: () => import('./hr-diagram'),
  },
  {
    id: 'stellar-evolution',
    num: 'VII',
    title: 'The Lives of Stars',
    summary: 'Choose a mass and follow a star from collapse to white dwarf, neutron star or black hole.',
    medium: 'Simulation',
    load: () => import('./stellar-evolution'),
  },
  {
    id: 'exoplanets',
    num: 'VIII',
    title: 'Exoplanets',
    summary: '5,288 confirmed worlds, the transit method, and where the habitable zone lies around other stars.',
    medium: 'Catalogue charts',
    load: () => import('./exoplanets'),
  },
  {
    id: 'black-holes',
    num: 'IX',
    title: 'Black Holes and Gravitational Waves',
    summary: 'A ray-traced Schwarzschild black hole, its vital statistics, and the sound of two black holes merging.',
    medium: 'GPU ray tracing',
    load: () => import('./black-holes'),
  },
  {
    id: 'galaxies',
    num: 'X',
    title: 'The Milky Way and Other Galaxies',
    summary: 'Our barred spiral in 3D, the rotation curve that revealed dark matter, and Hubble’s classification.',
    medium: '3D · charts',
    load: () => import('./galaxies'),
  },
  {
    id: 'cosmology',
    num: 'XI',
    title: 'The Expanding Universe',
    summary: 'Cosmic history from the first second to today, and a calculator for distances, ages and the fate of the Universe.',
    medium: 'Model · timeline',
    load: () => import('./cosmology'),
  },
  {
    id: 'reference',
    num: 'XII',
    title: 'Reference',
    summary: 'Physical constants, a unit converter, a glossary and the catalogues behind this atlas.',
    medium: 'Tables',
    load: () => import('./reference'),
  },
];

export const plateById = (id: string): PlateDef | undefined => PLATES.find((p) => p.id === id);
