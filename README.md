# Astrum

An interactive visual atlas of astrophysics. Twelve plates take you from the
scale of the cosmos through the Solar System, the night sky, the lives of stars,
exoplanets, black holes and galaxies to the expansion of the Universe. Every
star comes from a real catalogue and every curve is computed from the physics
in the browser.

## The plates

| Plate | What you can do |
| --- | --- |
| I · The Scale of the Cosmos | Zoom through 27 orders of magnitude, from a person to the observable universe, with a live ruler and light-crossing time. |
| II · The Solar System | A 3D orrery driven by JPL Keplerian elements: planets, Ceres, Pluto, Haumea, Makemake, Eris and Halley's comet on any date, with moons, rings, asteroid and Kuiper belts and the real star field behind. |
| III · The Night Sky | A planetarium of 8,921 naked-eye stars, the 88 constellations with boundaries, the Milky Way and the Messier catalogue. Switch to *tonight's sky* for any city and time, with the Sun, Moon (with phase) and planets, twilight and a time-lapse. In the light theme it prints like a classic star atlas. |
| IV · The Solar Neighbourhood | All 1,900 catalogued stars within 20 parsecs in 3D galactic coordinates, with drop lines, planet hosts and a census by spectral class. |
| V · Light and Spectra | Planck curves with the true colour of a blackbody (CIE 1931), stellar and emission spectra with a relativistic Doppler slider, and the hydrogen atom's energy levels. |
| VI · The Hertzsprung–Russell Diagram | 28,879 stars by colour and luminosity, with lines of equal radius, evolutionary tracks and star identification on hover. |
| VII · The Lives of Stars | Pick a mass from 0.1 to 60 M☉ and scrub through its life, with the burning shells inside, and see its fate. |
| VIII · Exoplanets | 5,288 confirmed planets on configurable axes, discoveries by year, a transit light-curve simulator and the habitable zone (Kopparapu et al. 2013). |
| IX · Black Holes and Gravitational Waves | A Schwarzschild black hole ray-traced on the GPU with lensing and Doppler beaming, a calculator from asteroid to TON 618 mass, and a merger chirp you can hear. |
| X · The Milky Way and Other Galaxies | A 3D particle model of our barred spiral, the rotation curve with an adjustable dark-matter halo, and Hubble's tuning fork. |
| XI · The Expanding Universe | A logarithmic timeline from the Planck time to today, a Friedmann-equation model you can change, and a cosmology calculator for distances, ages and look-back times. |
| XII · Reference | Constants (CODATA 2018, IAU 2015), a distance converter, a glossary and the data sources. |

Search everything (stars, constellations, Messier objects, planets, exoplanets
and glossary terms) with <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd>. The
interface follows your system's light or dark setting, with a toggle in the
top bar.

## Running it

Requires Node 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open the printed local address. Other scripts:

| Command | Does |
| --- | --- |
| `npm run build` | Type-checks and builds a static site into `dist/` |
| `npm run preview` | Serves the built site |
| `npm test` | Runs the physics tests (Vitest) |
| `npm run data` | Downloads the source catalogues and regenerates `public/data/` |

The build uses relative paths, so `dist/` works from any static host or
sub-path. `.github/workflows/deploy.yml` publishes it to GitHub Pages on every
push to `main`; enable it under **Settings → Pages → Build and deployment →
GitHub Actions**.

## How it is built

- **Vite + TypeScript**, no UI framework. Each plate is a lazily loaded module
  in `src/plates/`, so Three.js only downloads for the 3D plates.
- **Canvas 2D** for the star chart, charts and the scale plate; **Three.js**
  for the orrery, neighbourhood and galaxy; a **GLSL fragment shader** for the
  black hole.
- **Physics** in `src/physics/`, covered by `tests/physics.test.ts`:
  - Kepler's equation and orbital elements (`kepler.ts`)
  - coordinate transforms, sidereal time and the Moon (Meeus) (`coords.ts`, `time.ts`)
  - Planck's law and blackbody colour through the CIE 1931 observer (`blackbody.ts`)
  - main-sequence scalings and stellar fates (`stellar.ts`)
  - Friedmann cosmology and distance measures (`cosmology.ts`)
  - black-hole properties and the gravitational-wave chirp (`relativity.ts`)

The tests check results against reference values: Earth's J2000 position, Halley's
1986 perihelion, Meeus's lunar example 47.a, the Planck 2018 age (13.79 Gyr) and
particle horizon (≈ 46 Gly), and the GW150914 chirp mass.

## Accuracy

Astrum is built for understanding, not navigation. Planet positions are good
to arcminutes between 1800 and 2050; the Moon to about 0.3°. Stellar
evolution uses textbook scaling laws, good to a factor of about two. The
galaxy model and spiral-arm geometry are schematic. Each figure caption says
what is measured and what is modelled.

## Data

The catalogues in `public/data/` are generated by `scripts/build-data.mjs`.
See [`public/data/SOURCES.md`](public/data/SOURCES.md) for sources and
licences. In short: stars from the HYG Database v4.1 (CC BY-SA 4.0),
constellations and Messier objects from d3-celestial (BSD 3-Clause), and
exoplanets from the Open Exoplanet Catalogue (MIT). The exoplanet table
currently ends with 2023 discoveries.
