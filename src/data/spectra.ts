// Spectral lines (air wavelengths, nm) for emission spectra and stellar absorption.

export interface Line {
  nm: number;
  label?: string;
  strength: number; // 0–1 relative
}

export const EMISSION: Record<string, { name: string; note: string; lines: Line[] }> = {
  H: {
    name: 'Hydrogen',
    note: 'The Balmer series: electrons dropping to the second energy level. Hα gives emission nebulae their red glow.',
    lines: [
      { nm: 656.28, label: 'Hα', strength: 1 },
      { nm: 486.13, label: 'Hβ', strength: 0.6 },
      { nm: 434.05, label: 'Hγ', strength: 0.4 },
      { nm: 410.17, label: 'Hδ', strength: 0.3 },
      { nm: 397.01, label: 'Hε', strength: 0.2 },
    ],
  },
  He: {
    name: 'Helium',
    note: 'Found in the Sun’s spectrum during the 1868 eclipse, 27 years before it was isolated on Earth; named after Helios.',
    lines: [
      { nm: 447.15, strength: 0.5 },
      { nm: 471.31, strength: 0.3 },
      { nm: 492.19, strength: 0.3 },
      { nm: 501.57, strength: 0.5 },
      { nm: 587.56, label: 'D₃', strength: 1 },
      { nm: 667.82, strength: 0.6 },
      { nm: 706.52, strength: 0.5 },
    ],
  },
  Na: {
    name: 'Sodium',
    note: 'The yellow D doublet, 0.6 nm apart: streetlamps, candle flames, and a deep absorption pair in the Sun.',
    lines: [
      { nm: 588.995, label: 'D₂', strength: 1 },
      { nm: 589.592, label: 'D₁', strength: 0.9 },
      { nm: 568.8, strength: 0.15 },
      { nm: 615.4, strength: 0.15 },
    ],
  },
  Ne: {
    name: 'Neon',
    note: 'A forest of red and orange lines: the colour of neon signs.',
    lines: [585.25, 588.19, 594.48, 607.43, 609.62, 614.31, 616.36, 621.73, 626.65, 633.44, 638.3, 640.22, 650.65, 659.9, 692.95, 703.24].map((nm, i) => ({ nm, strength: 0.4 + 0.6 * ((i * 7) % 5) / 4 })),
  },
  Hg: {
    name: 'Mercury',
    note: 'Blue, green and yellow lines; used in fluorescent lamps and to calibrate spectrographs.',
    lines: [
      { nm: 404.66, strength: 0.6 },
      { nm: 435.83, strength: 0.9 },
      { nm: 546.07, strength: 1 },
      { nm: 576.96, strength: 0.6 },
      { nm: 579.07, strength: 0.6 },
    ],
  },
  O3: {
    name: 'Doubly ionised oxygen [O III]',
    note: 'A “forbidden” transition that only shines in near-vacuum: the green-teal of planetary nebulae like the Ring Nebula.',
    lines: [
      { nm: 500.68, label: '[O III]', strength: 1 },
      { nm: 495.89, strength: 0.35 },
      { nm: 436.32, strength: 0.08 },
    ],
  },
};

export interface StellarSpectrum {
  cls: string;
  T: number;
  example: string;
  lines: Line[];
  bands?: { from: number; to: number; depth: number }[];
}

const balmer = (s: number): Line[] => [
  { nm: 656.28, label: 'Hα', strength: s },
  { nm: 486.13, label: 'Hβ', strength: s },
  { nm: 434.05, label: 'Hγ', strength: s * 0.95 },
  { nm: 410.17, label: 'Hδ', strength: s * 0.9 },
  { nm: 397.01, strength: s * 0.8 },
];

export const STELLAR: StellarSpectrum[] = [
  { cls: 'O', T: 35000, example: 'ζ Ophiuchi', lines: [...balmer(0.25), { nm: 468.6, label: 'He II', strength: 0.4 }, { nm: 454.1, strength: 0.3 }, { nm: 541.1, strength: 0.3 }, { nm: 447.15, label: 'He I', strength: 0.2 }] },
  { cls: 'B', T: 18000, example: 'Rigel', lines: [...balmer(0.55), { nm: 447.15, label: 'He I', strength: 0.45 }, { nm: 402.6, strength: 0.35 }, { nm: 587.56, strength: 0.3 }, { nm: 492.19, strength: 0.25 }] },
  { cls: 'A', T: 9500, example: 'Vega', lines: [...balmer(1), { nm: 393.37, label: 'Ca II K', strength: 0.15 }] },
  { cls: 'F', T: 6800, example: 'Procyon', lines: [...balmer(0.6), { nm: 393.37, label: 'Ca II K', strength: 0.6 }, { nm: 396.85, label: 'H', strength: 0.55 }, { nm: 430.8, label: 'G', strength: 0.25 }, { nm: 517.3, strength: 0.2 }, { nm: 589.3, strength: 0.25 }] },
  {
    cls: 'G',
    T: 5772,
    example: 'The Sun',
    lines: [
      ...balmer(0.4),
      { nm: 393.37, label: 'K', strength: 0.95 },
      { nm: 396.85, label: 'H', strength: 0.9 },
      { nm: 430.8, label: 'G', strength: 0.5 },
      { nm: 438.35, strength: 0.35 },
      { nm: 516.73, label: 'Mg b', strength: 0.45 },
      { nm: 517.27, strength: 0.45 },
      { nm: 518.36, strength: 0.5 },
      { nm: 527.0, label: 'Fe', strength: 0.35 },
      { nm: 588.995, label: 'Na D', strength: 0.7 },
      { nm: 589.592, strength: 0.65 },
      { nm: 686.7, label: 'O₂ (B)', strength: 0.3 },
    ],
  },
  { cls: 'K', T: 4400, example: 'Arcturus', lines: [...balmer(0.2), { nm: 393.37, label: 'K', strength: 1 }, { nm: 396.85, label: 'H', strength: 1 }, { nm: 422.67, label: 'Ca I', strength: 0.6 }, { nm: 430.8, label: 'G', strength: 0.6 }, { nm: 517.3, label: 'Mg b', strength: 0.6 }, { nm: 588.995, label: 'Na D', strength: 0.85 }, { nm: 589.592, strength: 0.8 }] },
  {
    cls: 'M',
    T: 3300,
    example: 'Betelgeuse',
    lines: [{ nm: 422.67, label: 'Ca I', strength: 0.9 }, { nm: 588.995, label: 'Na D', strength: 0.9 }, { nm: 589.592, strength: 0.9 }, { nm: 656.28, strength: 0.08 }],
    bands: [
      { from: 476.1, to: 490, depth: 0.35 },
      { from: 495.4, to: 510, depth: 0.4 },
      { from: 516.7, to: 530, depth: 0.45 },
      { from: 544.8, to: 556, depth: 0.45 },
      { from: 558.9, to: 575, depth: 0.45 },
      { from: 615.9, to: 630, depth: 0.55 },
      { from: 705.4, to: 725, depth: 0.6 },
    ],
  },
];

/** Hydrogen energy levels and transitions (vacuum wavelengths from the Rydberg formula). */
export const HYDROGEN_SERIES: Record<number, string> = { 1: 'Lyman (ultraviolet)', 2: 'Balmer (visible)', 3: 'Paschen (infrared)', 4: 'Brackett (infrared)', 5: 'Pfund (infrared)', 6: 'Humphreys (infrared)' };
