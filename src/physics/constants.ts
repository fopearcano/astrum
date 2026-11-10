// Physical and astronomical constants (SI). CODATA 2018 and IAU 2015 nominal values.

export const c = 299_792_458; // speed of light, m/s (exact)
export const G = 6.6743e-11; // gravitational constant, m³ kg⁻¹ s⁻²
export const h = 6.62607015e-34; // Planck constant, J s (exact)
export const hbar = h / (2 * Math.PI);
export const kB = 1.380649e-23; // Boltzmann constant, J/K (exact)
export const sigma = 5.670374419e-8; // Stefan–Boltzmann, W m⁻² K⁻⁴
export const b_wien = 2.897771955e-3; // Wien displacement constant, m K
export const me = 9.1093837015e-31; // electron mass, kg
export const mp = 1.67262192369e-27; // proton mass, kg
export const e_charge = 1.602176634e-19; // C (exact)
export const R_inf = 10_973_731.568160; // Rydberg constant, m⁻¹
export const eV = 1.602176634e-19; // J

export const AU = 1.495978707e11; // m (exact, IAU 2012)
export const LY = 9.4607304725808e15; // m
export const PC = 3.0856775814913673e16; // m
export const KPC = 1e3 * PC;
export const MPC = 1e6 * PC;

export const M_SUN = 1.98892e30; // kg (GM☉/G)
export const R_SUN = 6.957e8; // m (IAU nominal)
export const L_SUN = 3.828e26; // W (IAU nominal)
export const T_SUN = 5772; // K (IAU nominal effective temperature)
export const M_EARTH = 5.9722e24; // kg
export const R_EARTH = 6.3781e6; // m (equatorial)
export const M_JUP = 1.89813e27; // kg
export const R_JUP = 7.1492e7; // m (equatorial)

export const YEAR = 365.25 * 86400; // Julian year, s
export const DAY = 86400;
export const GYR = 1e9 * YEAR;

export const H0_PLANCK = 67.66; // km/s/Mpc (Planck 2018 TT,TE,EE+lowE+lensing+BAO)
export const T_CMB = 2.7255; // K

export interface ConstantRow {
  symbol: string;
  name: string;
  value: string;
  unit: string;
  note?: string;
}

export const CONSTANT_TABLE: ConstantRow[] = [
  { symbol: 'c', name: 'Speed of light in vacuum', value: '299 792 458', unit: 'm s⁻¹', note: 'exact' },
  { symbol: 'G', name: 'Newtonian gravitational constant', value: '6.674 30 × 10⁻¹¹', unit: 'm³ kg⁻¹ s⁻²' },
  { symbol: 'h', name: 'Planck constant', value: '6.626 070 15 × 10⁻³⁴', unit: 'J s', note: 'exact' },
  { symbol: 'ħ', name: 'Reduced Planck constant', value: '1.054 571 817 × 10⁻³⁴', unit: 'J s' },
  { symbol: 'k_B', name: 'Boltzmann constant', value: '1.380 649 × 10⁻²³', unit: 'J K⁻¹', note: 'exact' },
  { symbol: 'σ', name: 'Stefan–Boltzmann constant', value: '5.670 374 419 × 10⁻⁸', unit: 'W m⁻² K⁻⁴' },
  { symbol: 'b', name: 'Wien displacement constant', value: '2.897 771 955 × 10⁻³', unit: 'm K' },
  { symbol: 'mₑ', name: 'Electron mass', value: '9.109 383 7015 × 10⁻³¹', unit: 'kg' },
  { symbol: 'mₚ', name: 'Proton mass', value: '1.672 621 923 69 × 10⁻²⁷', unit: 'kg' },
  { symbol: 'R∞', name: 'Rydberg constant', value: '10 973 731.568 160', unit: 'm⁻¹' },
  { symbol: 'au', name: 'Astronomical unit', value: '149 597 870 700', unit: 'm', note: 'exact (IAU 2012)' },
  { symbol: 'ly', name: 'Light-year (Julian)', value: '9.460 730 472 5808 × 10¹⁵', unit: 'm' },
  { symbol: 'pc', name: 'Parsec', value: '3.085 677 581 × 10¹⁶', unit: 'm', note: '= 3.2616 ly' },
  { symbol: 'M☉', name: 'Solar mass', value: '1.988 92 × 10³⁰', unit: 'kg' },
  { symbol: 'R☉', name: 'Solar radius (nominal)', value: '6.957 × 10⁸', unit: 'm', note: 'IAU 2015' },
  { symbol: 'L☉', name: 'Solar luminosity (nominal)', value: '3.828 × 10²⁶', unit: 'W', note: 'IAU 2015' },
  { symbol: 'T☉', name: 'Solar effective temperature', value: '5 772', unit: 'K', note: 'IAU 2015' },
  { symbol: 'M⊕', name: 'Earth mass', value: '5.9722 × 10²⁴', unit: 'kg' },
  { symbol: 'R⊕', name: 'Earth equatorial radius', value: '6 378.1', unit: 'km', note: 'IAU 2015' },
  { symbol: 'M_J', name: 'Jupiter mass', value: '1.898 13 × 10²⁷', unit: 'kg' },
  { symbol: 'R_J', name: 'Jupiter equatorial radius', value: '71 492', unit: 'km', note: 'IAU 2015' },
  { symbol: 'H₀', name: 'Hubble constant (Planck 2018)', value: '67.66 ± 0.42', unit: 'km s⁻¹ Mpc⁻¹', note: 'distance ladder gives ≈ 73' },
  { symbol: 'T_CMB', name: 'CMB temperature today', value: '2.7255', unit: 'K' },
  { symbol: 't₀', name: 'Age of the Universe (Planck 2018)', value: '13.787 ± 0.020', unit: 'Gyr' },
];
