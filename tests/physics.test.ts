import { describe, expect, it } from 'vitest';
import { solveKepler, elementsAt, position, fromPerihelion, distance } from '../src/physics/kepler';
import { PLANETS, HALLEY } from '../src/data/solar-system';
import { gmst, julianDate, J2000 } from '../src/physics/time';
import { moonPosition, eclipticToEquatorial, vecToRadec, equatorialToHorizontalMatrix, horizontalAltAz, radecToVec, mul } from '../src/physics/coords';
import { wienPeak, blackbodyRGB, bvToTemperature, temperatureToBV, planck } from '../src/physics/blackbody';
import { mainSequenceLifetime, stellarFate, massLuminosity, radiusFromLT } from '../src/physics/stellar';
import { PLANCK18, age, comovingDistance, luminosityDistance, particleHorizon, expansionHistory, lookbackTime } from '../src/physics/cosmology';
import { blackHole, chirpMass, chirpWaveform, gwFrequency, gwTimeToMerge } from '../src/physics/relativity';
import { sci, ra, dec } from '../src/lib/format';

describe('Kepler', () => {
  it('solves Kepler’s equation across eccentricities', () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.97]) {
      for (const M of [-3, -1, 0.2, 1.5, 3]) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 9);
      }
    }
  });

  it('places Earth opposite the Sun’s J2000 longitude', () => {
    const earth = PLANETS.find((p) => p.id === 'earth')!;
    const p = position(elementsAt(earth.elements!, J2000));
    const lon = (Math.atan2(p.y, p.x) * 180) / Math.PI;
    // Geocentric solar longitude at J2000 is ≈ 280.4°, so Earth is at ≈ 100.4°.
    expect(lon).toBeGreaterThan(99.5);
    expect(lon).toBeLessThan(101.5);
    expect(distance(p)).toBeCloseTo(0.983, 2);
  });

  it('puts Halley at perihelion on 1986-02-09', () => {
    const jd = julianDate(new Date(Date.UTC(1986, 1, 9)));
    expect(distance(position(fromPerihelion(HALLEY, jd)))).toBeCloseTo(0.586, 2);
  });
});

describe('time and coordinates', () => {
  it('computes GMST at J2000', () => {
    expect(gmst(J2000)).toBeCloseTo(280.46061837, 6);
  });

  it('reproduces Meeus example 47.a for the Moon within 0.3°', () => {
    const jd = 2448724.5; // 1992 April 12, 0h
    const m = moonPosition(jd);
    expect(Math.abs(m.lon - 133.162655)).toBeLessThan(0.3);
    expect(Math.abs(m.lat - -3.229126)).toBeLessThan(0.3);
    expect(Math.abs(m.distKm - 368409.7)).toBeLessThan(1500);
  });

  it('converts ecliptic to equatorial', () => {
    // Ecliptic longitude 90° maps to RA 90°, Dec +23.44°.
    const v = eclipticToEquatorial({ x: 0, y: 1, z: 0 });
    const { ra: r, dec: d } = vecToRadec(v.x, v.y, v.z);
    expect(r).toBeCloseTo(90, 6);
    expect(d).toBeCloseTo(23.4393, 3);
  });

  it('puts the celestial pole at altitude = latitude, due north', () => {
    const m = equatorialToHorizontalMatrix(123, 51.5);
    const { alt, az } = horizontalAltAz(mul(m, ...radecToVec(0, 90)));
    expect(alt).toBeCloseTo(51.5, 6);
    expect(Math.min(az, 360 - az)).toBeLessThan(1e-6);
  });

  it('puts a star rising in the east six hours before transit', () => {
    const lst = 100;
    const m = equatorialToHorizontalMatrix(lst, 0);
    const { alt, az } = horizontalAltAz(mul(m, ...radecToVec(lst + 90, 0)));
    expect(alt).toBeCloseTo(0, 6);
    expect(az).toBeCloseTo(90, 6);
  });
});

describe('radiation', () => {
  it('finds Wien’s peak for the Sun near 502 nm', () => {
    expect(wienPeak(5772) * 1e9).toBeCloseTo(502, 0);
  });

  it('peaks Planck’s law where Wien predicts', () => {
    const T = 8000;
    let best = 0;
    let bestL = 0;
    for (let l = 100; l < 2000; l += 0.5) {
      const b = planck(l * 1e-9, T);
      if (b > best) {
        best = b;
        bestL = l;
      }
    }
    expect(Math.abs(bestL - wienPeak(T) * 1e9)).toBeLessThan(1);
  });

  it('colours cool stars red and hot stars blue', () => {
    const [r1, , b1] = blackbodyRGB(3000);
    const [r2, , b2] = blackbodyRGB(20000);
    expect(r1).toBeGreaterThan(b1);
    expect(b2).toBeGreaterThan(r2);
  });

  it('maps the Sun’s B−V to its temperature', () => {
    expect(bvToTemperature(0.65)).toBeGreaterThan(5600);
    expect(bvToTemperature(0.65)).toBeLessThan(5950);
    expect(temperatureToBV(bvToTemperature(1.2))).toBeCloseTo(1.2, 3);
  });
});

describe('stars', () => {
  it('gives the Sun a ten-billion-year main sequence', () => {
    expect(mainSequenceLifetime(1)).toBeCloseTo(1e10, -6);
    expect(massLuminosity(1)).toBe(1);
    expect(radiusFromLT(1, 5772)).toBeCloseTo(1, 6);
  });

  it('assigns fates by initial mass', () => {
    expect(stellarFate(1).fate).toBe('white-dwarf');
    expect(stellarFate(12).fate).toBe('neutron-star');
    expect(stellarFate(40).fate).toBe('black-hole');
    expect(stellarFate(0.2).fate).toBe('he-white-dwarf');
  });
});

describe('cosmology (Planck 2018)', () => {
  it('has an age of about 13.8 Gyr', () => {
    expect(age(PLANCK18)).toBeCloseTo(13.79, 1);
  });

  it('matches standard distances at z = 1', () => {
    expect(comovingDistance(PLANCK18, 1)).toBeGreaterThan(3350);
    expect(comovingDistance(PLANCK18, 1)).toBeLessThan(3450);
    expect(luminosityDistance(PLANCK18, 1) / comovingDistance(PLANCK18, 1)).toBeCloseTo(2, 6);
    expect(lookbackTime(PLANCK18, 1)).toBeCloseTo(7.9, 0);
  });

  it('puts the particle horizon near 46 billion light-years', () => {
    const gly = (particleHorizon(PLANCK18) * 3.2616e6) / 1e9;
    expect(gly).toBeGreaterThan(45);
    expect(gly).toBeLessThan(47.5);
  });

  it('integrates a(t) back to a Big Bang about 13.8 Gyr ago', () => {
    const hist = expansionHistory(PLANCK18);
    expect(hist.bigBang).not.toBeNull();
    expect(-hist.bigBang!).toBeCloseTo(13.79, 1);
  });

  it('recollapses a closed matter-only universe', () => {
    const hist = expansionHistory({ H0: 70, Om: 3, OL: 0, Or: 0 }, -20, 60);
    expect(hist.crunch).not.toBeNull();
  });
});

describe('black holes and gravitational waves', () => {
  it('gives a solar-mass black hole a 2.95 km horizon', () => {
    const bh = blackHole(1);
    expect(bh.rs / 1000).toBeCloseTo(2.953, 2);
    expect(bh.hawkingT).toBeCloseTo(6.17e-8, 9);
  });

  it('computes GW150914’s chirp mass', () => {
    expect(chirpMass(36, 29)).toBeCloseTo(28.1, 0);
  });

  it('inverts frequency and time-to-merger', () => {
    const tau = gwTimeToMerge(28, 35);
    expect(gwFrequency(28, tau)).toBeCloseTo(35, 6);
  });

  it('builds a chirp that rises in frequency', () => {
    const w = chirpWaveform(36, 29, 30, 4096);
    expect(w.f[w.mergerIndex - 1]).toBeGreaterThan(w.f[0] * 3);
    expect(w.fRing).toBeGreaterThan(200);
    expect(w.fRing).toBeLessThan(320);
  });
});

describe('formatting', () => {
  it('formats scientific notation and sexagesimal angles', () => {
    expect(sci(6.674e-11, 4)).toBe('6.674 × 10⁻¹¹');
    expect(ra(88.7929)).toBe('05h 55m 10s');
    expect(dec(7.4071)).toBe('+07° 24′ 26″');
  });
});
