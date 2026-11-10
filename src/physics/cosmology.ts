// Friedmann–Lemaître–Robertson–Walker cosmology: expansion history and distances.

const KM_S_MPC_TO_PER_GYR = 1.0227121650537077e-3; // (km/s/Mpc) → 1/Gyr
const C_KM_S = 299792.458;

export interface Cosmology {
  H0: number; // km/s/Mpc
  Om: number; // matter
  OL: number; // dark energy (cosmological constant)
  Or: number; // radiation (photons + neutrinos)
}

// Flat ΛCDM with Planck 2018 parameters; Ω_Λ closes the budget exactly.
export const PLANCK18: Cosmology = { H0: 67.66, Om: 0.3111, OL: 1 - 0.3111 - 9.1e-5, Or: 9.1e-5 };

export const Ok = (cm: Cosmology): number => 1 - cm.Om - cm.OL - cm.Or;

/** Dimensionless Hubble rate E(a) = H(a)/H0. Returns NaN where the model cannot reach a. */
export function E(cm: Cosmology, a: number): number {
  const v = cm.Or / a ** 4 + cm.Om / a ** 3 + Ok(cm) / a ** 2 + cm.OL;
  return v > 0 ? Math.sqrt(v) : NaN;
}

/** Hubble time 1/H0 in Gyr. */
export const hubbleTime = (cm: Cosmology): number => 1 / (cm.H0 * KM_S_MPC_TO_PER_GYR);
/** Hubble distance c/H0 in Mpc. */
export const hubbleDistance = (cm: Cosmology): number => C_KM_S / cm.H0;

/** Composite Simpson integration with n (even) intervals. */
export function simpson(f: (x: number) => number, a: number, b: number, n = 400): number {
  if (n % 2) n++;
  const hh = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * hh) * (i % 2 ? 4 : 2);
  return (s * hh) / 3;
}

/** Cosmic time at scale factor a, in Gyr: t = ∫₀ᵃ da′ / (a′ H(a′)).
 *  Substituting a′ = u² removes the integrable endpoint behaviour. */
export function ageAt(cm: Cosmology, a: number): number {
  const f = (u: number) => {
    if (u === 0) return 0;
    const ap = u * u;
    return (2 * u) / (ap * E(cm, ap));
  };
  return simpson(f, 0, Math.sqrt(a), 2000) * hubbleTime(cm);
}

export const ageAtRedshift = (cm: Cosmology, z: number): number => ageAt(cm, 1 / (1 + z));
export const age = (cm: Cosmology): number => ageAt(cm, 1);
export const lookbackTime = (cm: Cosmology, z: number): number => age(cm) - ageAtRedshift(cm, z);

/** Line-of-sight comoving distance (Mpc). */
export function comovingDistance(cm: Cosmology, z: number): number {
  if (z <= 0) return 0;
  return simpson((zz) => 1 / E(cm, 1 / (1 + zz)), 0, z, 1000) * hubbleDistance(cm);
}

/** Transverse comoving distance, accounting for spatial curvature (Mpc). */
export function transverseComovingDistance(cm: Cosmology, z: number): number {
  const Dc = comovingDistance(cm, z);
  const ok = Ok(cm);
  const DH = hubbleDistance(cm);
  if (Math.abs(ok) < 1e-6) return Dc;
  const s = Math.sqrt(Math.abs(ok));
  return ok > 0 ? (DH / s) * Math.sinh((s * Dc) / DH) : (DH / s) * Math.sin((s * Dc) / DH);
}

export const luminosityDistance = (cm: Cosmology, z: number): number => transverseComovingDistance(cm, z) * (1 + z);
export const angularDiameterDistance = (cm: Cosmology, z: number): number => transverseComovingDistance(cm, z) / (1 + z);

/** Comoving radius of the observable universe (particle horizon), Mpc. */
export function particleHorizon(cm: Cosmology): number {
  // ∫₀¹ da / (a² E(a)) with a = u² substitution.
  const f = (u: number) => {
    if (u === 0) return 2 / Math.sqrt(cm.Or || 1e-12);
    const a = u * u;
    return (2 * u) / (a * a * E(cm, a));
  };
  return simpson(f, 0, 1, 4000) * hubbleDistance(cm);
}

export interface ScalePoint {
  t: number; // Gyr relative to today (negative = past)
  a: number;
}

/** Scale-factor history a(t) through today (a = 1 at t = 0), integrating
 *  da/dt = ± H0 a E(a) backward to the Big Bang and forward to tMax or a recollapse. */
export function expansionHistory(cm: Cosmology, tMin = -20, tMax = 30, dt = 0.02): { past: ScalePoint[]; future: ScalePoint[]; bigBang: number | null; crunch: number | null } {
  const H = 1 / hubbleTime(cm);
  const rate = (a: number) => {
    const e = E(cm, a);
    return Number.isFinite(e) ? H * a * e : 0;
  };
  // Past: integrate backward until a ≈ 0.
  const past: ScalePoint[] = [{ t: 0, a: 1 }];
  let a = 1;
  let t = 0;
  let bigBang: number | null = null;
  while (t > tMin) {
    const step = Math.min(dt, Math.max(1e-4, a * 0.02 / Math.max(rate(a), 1e-9)));
    const k1 = rate(a);
    const k2 = rate(Math.max(1e-9, a - (step / 2) * k1));
    const k3 = rate(Math.max(1e-9, a - (step / 2) * k2));
    const k4 = rate(Math.max(1e-9, a - step * k3));
    const na = a - (step / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    t -= step;
    if (na <= 1e-3 || !Number.isFinite(na)) {
      bigBang = t;
      past.push({ t, a: 0 });
      break;
    }
    if (k1 === 0) break; // bounce (no Big Bang in this model)
    a = na;
    past.push({ t, a });
  }
  if (bigBang !== null) bigBang = -ageAt(cm, 1) || bigBang;
  // Future: expand until E² < 0 (turnaround), then contract.
  const future: ScalePoint[] = [{ t: 0, a: 1 }];
  a = 1;
  t = 0;
  let sign = 1;
  let crunch: number | null = null;
  while (t < tMax) {
    const r = rate(a);
    if (r === 0 && sign > 0) sign = -1;
    const step = dt;
    const da = sign * (r || H * a * 1e-3) * step;
    a += da;
    t += step;
    if (a <= 1e-3) {
      crunch = t;
      future.push({ t, a: 0 });
      break;
    }
    future.push({ t, a });
  }
  return { past: past.reverse(), future, bigBang, crunch };
}

/** Temperature of the CMB at redshift z. */
export const cmbTemperature = (z: number, T0 = 2.7255): number => T0 * (1 + z);

/** Redshift at which matter and radiation densities were equal. */
export const matterRadiationEquality = (cm: Cosmology): number => cm.Om / cm.Or - 1;
/** Redshift at which matter and dark energy densities were equal. */
export const matterLambdaEquality = (cm: Cosmology): number => (cm.OL / cm.Om) ** (1 / 3) - 1;
