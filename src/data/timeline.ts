// Cosmic history. Times in seconds after the Big Bang (Planck 2018 ΛCDM).

const YR = 3.15576e7;

export interface Epoch {
  name: string;
  start: number;
  end?: number;
  z?: string;
  note: string;
}

export const EPOCHS: Epoch[] = [
  { name: 'Planck epoch', start: 1e-44, end: 5.4e-44, note: 'Before one Planck time, 5.4 × 10⁻⁴⁴ s, quantum gravity rules and known physics has nothing to say.' },
  { name: 'Grand unification', start: 5.4e-44, end: 1e-36, note: 'Gravity has separated; the strong, weak and electromagnetic forces may still act as one.' },
  { name: 'Inflation', start: 1e-36, end: 1e-32, note: 'A proposed burst of exponential expansion by a factor of at least 10²⁶, which would flatten space and seed today’s structure with quantum fluctuations.' },
  { name: 'Electroweak epoch', start: 1e-32, end: 1e-12, note: 'A hot soup of particles. At about 10⁻¹² s the Higgs field switches on, giving W and Z bosons and fermions their mass.' },
  { name: 'Quark epoch', start: 1e-12, end: 1e-6, note: 'Quarks, gluons and leptons fill a quark–gluon plasma too hot for protons to hold together.' },
  { name: 'Hadron epoch', start: 1e-6, end: 1, note: 'Quarks bind into protons and neutrons. Matter slightly outnumbers antimatter, by about one part in a billion, for reasons still unknown.' },
  { name: 'Neutrinos decouple', start: 1, note: 'Neutrinos stop interacting and stream freely; they survive today as a 1.95 K background.' },
  { name: 'Nucleosynthesis', start: 10, end: 1200, note: 'Protons and neutrons fuse into helium-4 (about 25 % by mass), deuterium, helium-3 and lithium-7 in the first twenty minutes.' },
  { name: 'Matter–radiation equality', start: 51000 * YR, z: '≈ 3,400', note: 'Matter’s density overtakes radiation’s. Dark matter clumps begin to grow, seeding galaxies.' },
  { name: 'Recombination: the CMB', start: 380000 * YR, z: '≈ 1,090', note: 'At about 3,000 K electrons join nuclei, the Universe becomes transparent, and the light we see as the cosmic microwave background is released.' },
  { name: 'Dark Ages', start: 380000 * YR, end: 1.5e8 * YR, note: 'No stars yet. Neutral hydrogen fills space, slowly collapsing under dark matter’s pull.' },
  { name: 'First stars', start: 1.5e8 * YR, z: '≈ 20', note: 'Cosmic dawn: massive stars of pure hydrogen and helium (Population III) ignite in small dark matter halos.' },
  { name: 'Reionization', start: 1.5e8 * YR, end: 1e9 * YR, note: 'Ultraviolet light from the first galaxies strips electrons from hydrogen between redshifts about 20 and 6.' },
  { name: 'Earliest galaxies seen by JWST', start: 2.9e8 * YR, z: '≈ 14', note: 'JWST has confirmed galaxies, such as JADES-GS-z14-0, shining less than 300 million years after the Big Bang.' },
  { name: 'Cosmic noon', start: 3.3e9 * YR, z: '≈ 2', note: 'The peak of star formation and quasar activity; most stars in the Universe today formed within a few billion years of this time.' },
  { name: 'Dark energy takes over', start: 1.02e10 * YR, z: '≈ 0.3', note: 'Matter thins out below the dark energy density and the expansion starts to accelerate.' },
  { name: 'Sun and Earth form', start: 9.2e9 * YR, z: '≈ 0.45', note: '4.6 billion years ago a collapsing cloud in the Milky Way forms the Sun and its planets.' },
  { name: 'Today', start: 13.787e9 * YR, z: '0', note: '13.787 ± 0.020 billion years after the Big Bang (Planck 2018). The CMB has cooled to 2.7255 K.' },
];
