// Stellar structure scalings for main-sequence stars and their fates.
// These are textbook power-law approximations, accurate to tens of percent.

import { G, L_SUN, M_SUN, R_SUN, sigma, T_SUN, c } from './constants';

/** Main-sequence luminosity (L☉) from mass (M☉), piecewise mass–luminosity relation. */
export function massLuminosity(M: number): number {
  if (M < 0.43) return 0.23 * M ** 2.3;
  if (M < 2) return M ** 4;
  if (M < 55) return 1.4 * M ** 3.5;
  return 32000 * M;
}

/** Main-sequence radius (R☉) from mass (M☉). */
export const massRadius = (M: number): number => (M < 1 ? M ** 0.8 : M ** 0.57);

/** Effective temperature (K) from luminosity (L☉) and radius (R☉). */
export const effectiveTemperature = (L: number, R: number): number => T_SUN * (L / (R * R)) ** 0.25;

/** Radius (R☉) from luminosity (L☉) and temperature (K): L = 4πR²σT⁴. */
export const radiusFromLT = (L: number, T: number): number => Math.sqrt(L) * (T_SUN / T) ** 2;

/** Luminosity (L☉) for radius (R☉) and temperature (K). */
export const luminosityFromRT = (R: number, T: number): number => R * R * (T / T_SUN) ** 4;

/** Main-sequence lifetime in years. Fuel ∝ M, burn rate ∝ L; fully convective
 *  red dwarfs (M < 0.35 M☉) mix and burn nearly all their hydrogen, the Sun ~10 %. */
export function mainSequenceLifetime(M: number): number {
  const base = 1e10 * (M / massLuminosity(M));
  // Burnable fraction relative to the Sun: fully mixed red dwarfs use almost all
  // their hydrogen; massive stars have large convective cores.
  const s = Math.min(1, Math.max(0, (M - 5) / 7));
  const mixing = M < 0.35 ? 10 : M < 0.5 ? 10 - (9 * (M - 0.35)) / 0.15 : 1 + 0.6 * s * s * (3 - 2 * s);
  return Math.max(3e6, base * mixing);
}

/** Absolute visual magnitude → luminosity in L☉ (ignores bolometric correction). */
export const absMagToLuminosity = (Mv: number): number => 10 ** ((4.83 - Mv) / 2.5);
export const luminosityToAbsMag = (L: number): number => 4.83 - 2.5 * Math.log10(L);

/** Distance modulus: apparent magnitude of a star of absolute magnitude M at d parsecs. */
export const apparentMagnitude = (M: number, dPc: number): number => M + 5 * Math.log10(dPc / 10);

export type Fate = 'brown-dwarf' | 'he-white-dwarf' | 'white-dwarf' | 'neutron-star' | 'black-hole' | 'pair-instability';

export interface FateInfo {
  fate: Fate;
  remnant: string;
  remnantMass: number; // M☉ (0 if none)
  death: string;
}

/** Initial-to-final mass relation and core-collapse outcomes (solar metallicity, single star). */
export function stellarFate(M: number): FateInfo {
  if (M < 0.08) return { fate: 'brown-dwarf', remnant: 'Brown dwarf (never ignites hydrogen)', remnantMass: M, death: 'Slowly cools; there is no stellar death.' };
  if (M < 0.5)
    return {
      fate: 'he-white-dwarf',
      remnant: 'Helium white dwarf',
      remnantMass: Math.min(0.45, 0.85 * M),
      death: 'Burns for longer than the age of the Universe, then contracts into a helium white dwarf. None has formed this way yet.',
    };
  if (M < 8)
    return {
      fate: 'white-dwarf',
      remnant: M < 6.5 ? 'Carbon–oxygen white dwarf' : 'Oxygen–neon white dwarf',
      remnantMass: Math.min(1.38, 0.109 * M + 0.394),
      death: 'Sheds its envelope as a planetary nebula; the exposed core cools as a white dwarf.',
    };
  if (M < 20)
    return {
      fate: 'neutron-star',
      remnant: 'Neutron star',
      remnantMass: 1.2 + 0.04 * (M - 8),
      death: 'Iron core collapses in under a second; a Type II core-collapse supernova follows.',
    };
  if (M < 130)
    return {
      fate: 'black-hole',
      remnant: 'Stellar-mass black hole',
      remnantMass: M < 40 ? 5 + 0.3 * (M - 20) : Math.min(45, 11 + 0.15 * (M - 40)),
      death:
        M < 40
          ? 'Core collapse with fallback onto the proto-neutron star produces a black hole, usually after a supernova.'
          : 'Strong winds strip the envelope (Wolf–Rayet phase); the core may collapse directly with a faint or failed supernova.',
    };
  return {
    fate: 'pair-instability',
    remnant: 'No remnant',
    remnantMass: 0,
    death: 'At low metallicity, electron–positron pair production softens the core; explosive oxygen burning destroys the whole star. At solar metallicity winds shed so much mass that a black hole forms instead.',
  };
}

export interface Phase {
  name: string;
  years: number;
  T: number; // K
  R: number; // R☉
  L: number; // L☉
  note: string;
}

/** A schematic life track for a star of initial mass M (M☉). */
export function lifeTrack(M: number): Phase[] {
  const Lms = massLuminosity(M);
  const Rms = massRadius(M);
  const Tms = effectiveTemperature(Lms, Rms);
  const tms = mainSequenceLifetime(M);
  const fate = stellarFate(M);
  const pre = Math.max(1e5, 3e7 * M ** -2.5);
  const phases: Phase[] = [
    { name: 'Protostar', years: pre, T: Math.max(2500, Math.min(Tms * 0.7, 4500)), R: Rms * 2.5, L: Lms * 1.5 + 0.2, note: 'A collapsing cloud core radiates gravitational energy; deuterium burns briefly.' },
    { name: 'Main sequence', years: tms, T: Tms, R: Rms, L: Lms, note: 'Hydrogen fuses to helium in the core. The star spends about 90 % of its life here.' },
  ];
  if (M < 0.5) {
    phases.push({ name: 'Blue dwarf', years: tms * 0.05, T: Math.min(Tms * 1.8, 8000), R: Rms * 0.9, L: Lms * 4, note: 'Predicted: as hydrogen runs low the star heats and brightens without swelling into a giant.' });
    phases.push({ name: 'Helium white dwarf', years: 1e12, T: 6000, R: 0.02, L: 1e-4, note: fate.death });
    return phases;
  }
  if (M < 8) {
    phases.push(
      { name: 'Subgiant', years: tms * 0.07, T: Tms * 0.85, R: Rms * 2, L: Lms * 1.6, note: 'Core hydrogen is exhausted; a hydrogen-burning shell drives the envelope outward.' },
      { name: 'Red giant', years: tms * 0.08, T: 4000, R: 100 * M ** 0.7, L: 1000 * M ** 1.2, note: 'The envelope swells to tens or hundreds of solar radii around a contracting helium core.' },
      { name: M < 2 ? 'Horizontal branch' : 'Core helium burning', years: tms * 0.012, T: M < 2 ? 5200 : Tms * 0.6, R: 10 * M ** 0.6, L: 50 * M ** 1.5, note: M < 2 ? 'A helium flash ignites the degenerate core; helium fuses to carbon and oxygen.' : 'Helium ignites quietly in the non-degenerate core.' },
      { name: 'Asymptotic giant branch', years: tms * 0.002, T: 3200, R: 220 * M ** 0.6, L: 4000 * M ** 1.1, note: 'Double-shell burning, thermal pulses and dredge-up enrich the envelope with carbon and s-process elements.' },
      { name: 'Planetary nebula', years: 2e4, T: 100000, R: 0.05, L: 3000 * M ** 0.5, note: 'The ejected envelope glows, ionised by the hot exposed core.' },
      { name: fate.remnant, years: 1e10, T: 20000, R: 0.012, L: 0.01, note: 'A carbon–oxygen ember about the size of Earth, supported by electron degeneracy pressure. It cools for billions of years.' },
    );
    return phases;
  }
  // Massive stars.
  const sg = M < 30 ? { T: 3500, R: 600 * (M / 15) ** 0.5, name: 'Red supergiant' } : { T: 30000, R: 25, name: 'Wolf–Rayet / blue supergiant' };
  phases.push(
    { name: 'Blue supergiant', years: tms * 0.04, T: Tms * 0.7, R: Rms * 3, L: Lms * 1.3, note: 'Core hydrogen is exhausted; helium ignites at the centre.' },
    { name: sg.name, years: tms * 0.1, T: sg.T, R: sg.R, L: Lms * 1.6, note: M < 30 ? 'A bloated envelope hundreds of times the Sun’s radius around an onion of burning shells: helium, carbon, neon, oxygen, silicon.' : 'Fierce winds strip the hydrogen envelope, exposing hot helium-rich layers.' },
    { name: 'Silicon burning', years: 0.03, T: sg.T, R: sg.R, L: Lms * 1.7, note: 'The final stage takes about a day and builds an iron core that cannot release energy by fusion.' },
    { name: fate.fate === 'pair-instability' ? 'Pair-instability supernova' : 'Core-collapse supernova', years: 0.003, T: 15000, R: 20000, L: 1e9, note: fate.death },
    {
      name: fate.remnant,
      years: 1e10,
      T: fate.fate === 'neutron-star' ? 600000 : 0,
      R: fate.fate === 'neutron-star' ? 1.7e-5 : schwarzschildRadiusSolar(fate.remnantMass),
      L: fate.fate === 'neutron-star' ? 0.1 : 0,
      note:
        fate.fate === 'neutron-star'
          ? 'About 1.4 solar masses packed into a sphere some 20 km across, often seen as a pulsar.'
          : fate.fate === 'black-hole'
            ? 'Collapse continues past any pressure support: an event horizon forms.'
            : 'Nothing is left but an expanding cloud enriched in heavy elements.',
    },
  );
  return phases;
}

/** Schwarzschild radius in units of R☉ for a mass in M☉. */
export const schwarzschildRadiusSolar = (M: number): number => (2 * G * M * M_SUN) / (c * c) / R_SUN;

/** Checks the Stefan–Boltzmann relation in SI: L = 4π R² σ T⁴ */
export const luminositySI = (Rm: number, T: number): number => 4 * Math.PI * Rm * Rm * sigma * T ** 4;
export const SOLAR = { L: L_SUN, R: R_SUN, M: M_SUN, T: T_SUN };
