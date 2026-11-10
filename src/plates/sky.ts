// Plate III — The Night Sky: a star atlas and a live planetarium for any place and time.

import { Disposer, h } from '../lib/dom';
import { createSurface, gestures, invalidator } from '../lib/canvas';
import { loadConstellations, loadMessier, loadMilkyWay, loadStars, StarCatalog, ConstellationData } from '../lib/data';
import { isLight, onThemeChange, palette } from '../lib/theme';
import { button, icons, iconButton, panel, readout, segmented, select, slider, toggle } from '../lib/ui';
import { dec as fmtDec, deg, fixed, ra as fmtRA, sig, temperature } from '../lib/format';
import { Pick, SkyLayers, SkyRenderer, SkyView, twilightName } from '../sky/renderer';
import { skyBodies, SkyBody } from '../physics/ephemeris';
import { julianDate } from '../physics/time';
import { horizontalAltAz, mul, radecToVec, equatorialToHorizontalMatrix } from '../physics/coords';
import { lst } from '../physics/time';
import { bvCss, bvToTemperature } from '../physics/blackbody';
import { absMagToLuminosity } from '../physics/stellar';
import { PLACES, Place, defaultPlace, formatLocal, tzOffsetMinutes } from '../data/places';
import { note, platePage } from './page';
import { PlateContext, plateById } from './registry';
import { navigate } from '../router';

const LY_PER_PC = 3.26156;

export function mount(root: HTMLElement, ctx: PlateContext): () => void {
  const d = new Disposer();
  const def = plateById('sky')!;
  const page = platePage(def, {
    dek: 'The celestial sphere as astronomers chart it: positions in right ascension and declination, brightness in magnitudes, and the 88 constellations agreed by the IAU in 1930. Switch to tonight’s sky to see what is above any city at any moment.',
    caption:
      '<b>Fig. III.</b> Stars to visual magnitude 6.5 from the HYG v4.1 catalogue, coloured by their B−V index. Constellation figures and boundaries, the Milky Way and Messier objects from d3-celestial. Planet and Moon positions are computed for the chosen moment. Drag to turn the sky, scroll or pinch to zoom, select an object for its data.',
    stageLabel: 'Interactive star chart',
  });
  root.append(page.root);
  const stage = page.stage;
  stage.append(h('div', { class: 'loading' }, 'Loading 8,921 stars…'));

  let stars: StarCatalog;
  let cons: ConstellationData;
  let sky: SkyRenderer;
  let place: Place = defaultPlace();
  let time = new Date();
  let selected: Pick | null = null;
  let bodies: SkyBody[] = [];

  const view: SkyView = {
    frame: 'equatorial',
    projection: 'stereographic',
    lon: 84,
    lat: 2,
    fov: 85,
    jd: julianDate(time),
    latitude: place.lat,
    longitude: place.lon,
  };
  const layers: SkyLayers = { lines: true, borders: false, conNames: true, starNames: true, grid: true, ecliptic: true, milkyway: true, messier: true, planets: true };

  // ---------------------------------------------------------------- HUD
  const hudTL = h('div', { class: 'hud hud--tl' });
  const zoomIn = iconButton('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3v10M3 8h10" stroke-linecap="round"/></svg>', 'Zoom in', () => zoomBy(1 / 1.5));
  const zoomOut = iconButton('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10" stroke-linecap="round"/></svg>', 'Zoom out', () => zoomBy(1.5));
  const hudBR = h('div', { class: 'hud hud--br', style: { display: 'flex', gap: '6px', padding: '6px' } }, zoomIn, zoomOut);
  const hint = h('div', { class: 'stage-hint' }, 'Drag to turn · scroll to zoom · select a star');

  // ---------------------------------------------------------------- key
  const modeSeg = segmented({
    label: 'Mode',
    options: [
      { value: 'equatorial', label: 'Celestial sphere' },
      { value: 'horizon', label: 'Tonight’s sky' },
    ],
    value: 'equatorial',
    onChange: (v) => setFrame(v as 'equatorial' | 'horizon'),
  });
  const projSeg = segmented({
    label: 'Projection',
    options: [
      { value: 'stereographic', label: 'Stereographic', title: 'Conformal: preserves shapes of constellations' },
      { value: 'orthographic', label: 'Orthographic', title: 'A hemisphere as seen from far away' },
    ],
    value: 'stereographic',
    onChange: (v) => {
      view.projection = v as SkyView['projection'];
      if (view.projection === 'orthographic' && view.fov > 180) view.fov = 180;
      fovSlider.set(view.fov);
      redraw();
    },
  });
  const fovSlider = slider({ id: 'sky-fov', label: 'Field of view', min: 4, max: 220, value: view.fov, log: true, format: (v) => `${Math.round(v)}°`, onInput: (v) => { view.fov = v; redraw(); } });

  const placeSelect = select(
    'sky-place',
    'Observer',
    PLACES.map((p, i) => ({ value: String(i), label: p.name })),
    String(PLACES.indexOf(place)),
    (v) => {
      place = PLACES[Number(v)];
      applyPlace();
    },
  );
  const geoBtn = button('Use my location', () => {
    if (!navigator.geolocation) return (geoMsg.textContent = 'Location is not available in this browser. Choose a city instead.');
    geoMsg.textContent = 'Asking for your location…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        place = { name: 'Your location', lat: pos.coords.latitude, lon: pos.coords.longitude, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
        geoMsg.textContent = `Using ${fixed(place.lat, 2)}°, ${fixed(place.lon, 2)}°.`;
        applyPlace();
      },
      () => (geoMsg.textContent = 'Location was not shared. Choose the nearest city instead.'),
      { timeout: 8000 },
    );
  });
  const geoMsg = h('p', { class: 'info-sub', 'aria-live': 'polite' });
  const dateInput = h('input', { type: 'date', id: 'sky-date' }) as HTMLInputElement;
  const timeSlider = slider({ id: 'sky-time', label: 'Local time', min: 0, max: 24, step: 0.05, value: 0, format: (v) => `${String(Math.floor(v) % 24).padStart(2, '0')}:${String(Math.floor((v % 1) * 60)).padStart(2, '0')}`, onInput: (v) => setLocalTime(dateInput.value, v) });
  const nowBtn = button('Now', () => {
    time = new Date();
    syncTimeControls();
    updateTime();
  });
  let playing = false;
  let playRate = 600; // seconds of sky time per real second
  const playBtn = h('button', { type: 'button', class: 'btn', id: 'sky-play', 'aria-pressed': 'false', html: `${icons.play}<span>Time-lapse</span>` });
  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.innerHTML = `${playing ? icons.pause : icons.play}<span>${playing ? 'Pause' : 'Time-lapse'}</span>`;
    if (playing) loop();
  });
  const rateSeg = segmented({
    options: [
      { value: '60', label: '1 min/s' },
      { value: '600', label: '10 min/s' },
      { value: '3600', label: '1 h/s' },
    ],
    value: '600',
    onChange: (v) => (playRate = Number(v)),
  });
  const observer = panel(
    'Observer and time',
    h('div', { class: 'controls' }, placeSelect.el, h('div', { class: 'btn-row' }, geoBtn), geoMsg, h('div', { class: 'field' }, h('label', { for: 'sky-date' }, 'Date'), dateInput), timeSlider.el, h('div', { class: 'btn-row' }, nowBtn, playBtn), rateSeg.el),
  );
  observer.hidden = true;

  const layerDefs: [keyof SkyLayers, string][] = [
    ['lines', 'Figures'],
    ['conNames', 'Constellation names'],
    ['borders', 'Boundaries'],
    ['starNames', 'Star names'],
    ['grid', 'Grid'],
    ['ecliptic', 'Ecliptic'],
    ['milkyway', 'Milky Way'],
    ['messier', 'Messier objects'],
    ['planets', 'Sun, Moon, planets'],
  ];
  const layerChips = h(
    'div',
    { class: 'chips' },
    layerDefs.map(([k, label]) => toggle(`sky-layer-${k}`, label, layers[k], (on) => { layers[k] = on; redraw(); })),
  );

  const info = h('div', { 'aria-live': 'polite' });
  const infoPanel = h('section', { class: 'panel' }, info);

  page.key.append(
    panel('View', h('div', { class: 'controls' }, modeSeg.el, projSeg.el, fovSlider.el)),
    observer,
    panel('Layers', layerChips),
    infoPanel,
  );

  // ---------------------------------------------------------------- commentary
  page.notes.append(
    note(
      'Coordinates on the sky',
      `<p>Astronomers project Earth’s equator and poles onto the sky. <strong>Declination</strong> is celestial latitude, from +90° at the north celestial pole to −90°. <strong>Right ascension</strong> is celestial longitude, counted eastward in hours from the point where the Sun crosses the equator in March. One hour of right ascension is 15°.</p>
       <p>These coordinates are fixed to the stars, so the grid turns overhead once every <strong>sidereal day</strong> of 23 h 56 m 4 s. The local sidereal time tells you which right ascension is on your meridian.</p>
       <div class="eq">hour angle = local sidereal time − α</div>`,
    ),
    note(
      'Magnitudes',
      `<p>Hipparchus ranked stars from first magnitude (brightest) to sixth (faintest visible). Pogson made it exact in 1856: five magnitudes is a factor of exactly 100 in flux, so one magnitude is a factor of 2.512.</p>
       <div class="eq">m₁ − m₂ = −2.5 log₁₀(F₁ / F₂)</div>
       <p>Sirius shines at −1.46, Venus can reach −4.9 and the full Moon −12.7. Under a dark sky the eye reaches about +6.5, which is the limit of this chart.</p>`,
    ),
    note(
      'Constellations and asterisms',
      `<p>The 88 constellations are areas, not pictures: their boundaries, drawn along lines of right ascension and declination for epoch B1875, tile the whole sky. The stick figures are a convention. Familiar patterns that are not constellations, such as the Big Dipper or the Summer Triangle, are called asterisms.</p>
       <p>Bright stars carry <strong>Bayer letters</strong>, roughly in order of brightness within their constellation: Betelgeuse is α Orionis, Rigel β Orionis.</p>`,
    ),
  );
  const brightTable = h('div', { class: 'table-wrap' });
  page.notes.append(h('section', { class: 'note note--wide' }, h('h2', null, 'The twenty brightest stars'), h('p', null, 'Select a row to centre it on the chart. Distances from Hipparcos parallaxes.'), brightTable));

  // ---------------------------------------------------------------- data
  let surf: ReturnType<typeof createSurface> | null = null;
  const redraw = invalidator(() => draw());

  Promise.all([loadStars(), loadConstellations(), loadMilkyWay(), loadMessier()])
    .then(([s, c, mw, messier]) => {
      stars = s;
      cons = c;
      sky = new SkyRenderer({ stars: s, cons: c, mw, messier });
      stage.replaceChildren(hudTL, hudBR, hint);
      surf = createSurface(stage, d, () => redraw());
      updateTime();
      syncTimeControls();
      buildBrightTable();
      handleParams(ctx.params);
      setupInteraction();
      showInfo();
      redraw();
    })
    .catch((err) => {
      stage.replaceChildren(h('div', { class: 'loading' }, `Could not load the star catalogue: ${err.message}`));
    });

  function draw(): void {
    if (!surf || !sky) return;
    const pal = palette();
    const print = isLight();
    stage.classList.toggle('stage--chart', print);
    view.jd = julianDate(time);
    sky.draw(surf.ctx, surf.width, surf.height, view, layers, pal, { print, highlight: selected });
    updateHud();
  }

  function updateHud(): void {
    if (view.frame === 'equatorial') {
      hudTL.innerHTML = `<div class="hud-label">Centre</div><div class="mono">α ${fmtRA(view.lon)}<br>δ ${fmtDec(view.lat)}</div><div class="hud-label" style="margin-top:6px">Field ${Math.round(view.fov)}°</div>`;
    } else {
      const sunAlt = sky.sunAlt;
      hudTL.innerHTML = `<div class="hud-label">${escapeHtml(place.name)}</div><div class="mono">${formatLocal(place.tz, time)}</div><div class="mono">Az ${deg(view.lon, 0)} · Alt ${deg(view.lat, 0)}</div><div class="hud-label" style="margin-top:6px">${twilightName(sunAlt)} · Sun ${deg(sunAlt, 0)}</div>`;
    }
  }

  function updateTime(): void {
    view.jd = julianDate(time);
    bodies = skyBodies(view.jd);
    sky?.setBodies(bodies);
    if (selected?.kind === 'body') selected = { kind: 'body', body: bodies.find((b) => b.id === (selected as { body: SkyBody }).body.id)! };
    showInfo();
    redraw();
  }

  function syncTimeControls(): void {
    const off = tzOffsetMinutes(place.tz, time);
    const local = new Date(time.getTime() + off * 60000);
    dateInput.value = local.toISOString().slice(0, 10);
    timeSlider.set(local.getUTCHours() + local.getUTCMinutes() / 60);
  }

  function setLocalTime(dateStr: string, hours: number): void {
    if (!dateStr) return;
    const [y, m, dd] = dateStr.split('-').map(Number);
    const guess = Date.UTC(y, m - 1, dd) + hours * 3600000;
    const off = tzOffsetMinutes(place.tz, new Date(guess));
    time = new Date(guess - off * 60000);
    updateTime();
  }
  dateInput.addEventListener('change', () => setLocalTime(dateInput.value, timeSlider.get()));

  function applyPlace(): void {
    view.latitude = place.lat;
    view.longitude = place.lon;
    syncTimeControls();
    showInfo();
    redraw();
  }

  function setFrame(f: 'equatorial' | 'horizon'): void {
    if (f === view.frame) return;
    view.frame = f;
    modeSeg.set(f);
    observer.hidden = f !== 'horizon';
    if (f === 'horizon') {
      // Face south (north in the southern hemisphere) and take in most of the sky.
      view.lon = place.lat >= 0 ? 180 : 0;
      view.lat = 35;
      view.fov = 150;
    } else {
      view.lon = 84;
      view.lat = 2;
      view.fov = 85;
    }
    fovSlider.set(view.fov);
    showInfo();
    redraw();
  }

  // ---------------------------------------------------------------- animation
  let anim: { from: { lon: number; lat: number; fov: number }; to: { lon: number; lat: number; fov: number }; t0: number } | null = null;
  let rafId = 0;
  let lastFrame = 0;
  function loop(): void {
    if (rafId) return;
    lastFrame = performance.now();
    const step = (t: number) => {
      rafId = 0;
      const dt = (t - lastFrame) / 1000;
      lastFrame = t;
      let busy = false;
      if (anim) {
        const k = Math.min(1, (t - anim.t0) / 900);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        let dl = anim.to.lon - anim.from.lon;
        if (dl > 180) dl -= 360;
        if (dl < -180) dl += 360;
        view.lon = (anim.from.lon + dl * e + 360) % 360;
        view.lat = anim.from.lat + (anim.to.lat - anim.from.lat) * e;
        view.fov = anim.from.fov * (anim.to.fov / anim.from.fov) ** e;
        fovSlider.set(view.fov);
        if (k >= 1) anim = null;
        busy = true;
      }
      if (playing) {
        time = new Date(time.getTime() + dt * playRate * 1000);
        if (Math.floor(t / 250) !== Math.floor((t - dt * 1000) / 250)) syncTimeControls();
        bodies = skyBodies(julianDate(time));
        sky.setBodies(bodies);
        busy = true;
      }
      draw();
      if (busy && !d_disposed) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }
  let d_disposed = false;
  d.add(() => {
    d_disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
  });

  function flyTo(lon: number, lat: number, fov = Math.min(view.fov, 60)): void {
    anim = { from: { lon: view.lon, lat: view.lat, fov: view.fov }, to: { lon, lat, fov }, t0: performance.now() };
    loop();
  }

  /** Centres an equatorial position, converting to alt/az in the horizon frame. */
  function centreOn(ra: number, decl: number, fov?: number): void {
    if (view.frame === 'equatorial') return flyTo(ra, decl, fov);
    const H = equatorialToHorizontalMatrix(lst(julianDate(time), place.lon), place.lat);
    const { alt, az } = horizontalAltAz(mul(H, ...radecToVec(ra, decl)));
    flyTo(az, Math.max(alt, 10), fov);
  }

  function zoomBy(f: number): void {
    view.fov = Math.max(4, Math.min(view.projection === 'orthographic' ? 180 : 220, view.fov * f));
    fovSlider.set(view.fov);
    redraw();
  }

  function setupInteraction(): void {
    gestures(stage, d, {
      onDrag: (dx, dy) => {
        if (!surf) return;
        const degPerPx = view.fov / Math.min(surf.width, surf.height);
        view.lon = (view.lon + dx * degPerPx * (view.frame === 'horizon' ? -1 : 1) / Math.max(0.2, Math.cos((view.lat * Math.PI) / 180)) + 360) % 360;
        view.lat = Math.max(-89.9, Math.min(89.9, view.lat + dy * degPerPx));
        anim = null;
        redraw();
      },
      onZoom: (f) => zoomBy(1 / f),
      onTap: (x, y) => {
        selected = sky.pick(x, y);
        showInfo();
        redraw();
      },
    });
    d.add(onThemeChange(() => redraw()));
  }

  // ---------------------------------------------------------------- info panel
  function altAzOf(ra: number, decl: number): { alt: number; az: number } {
    const H = equatorialToHorizontalMatrix(lst(julianDate(time), place.lon), place.lat);
    return horizontalAltAz(mul(H, ...radecToVec(ra, decl)));
  }

  function showInfo(): void {
    if (!stars) return;
    info.replaceChildren();
    const horizonRows = (ra: number, decl: number): [string, string][] => {
      if (view.frame !== 'horizon') return [];
      const { alt, az } = altAzOf(ra, decl);
      return [
        ['Altitude', deg(alt, 1)],
        ['Azimuth', deg(az, 1)],
      ];
    };
    if (!selected) {
      info.append(
        h('h2', null, 'Select an object'),
        h('p', { class: 'info-sub' }, 'Choose a star, planet or deep-sky symbol on the chart to read its catalogue data, or search with the / key.'),
      );
      return;
    }
    if (selected.kind === 'star') {
      const i = selected.index;
      const ci = stars.ci[i];
      const T = ci != null ? bvToTemperature(ci) : NaN;
      const dist = stars.dist[i];
      const M = stars.absmag[i];
      const conName = cons.list.find((c) => c.id === stars.con[i])?.name ?? stars.con[i];
      const rows: [string, string][] = [
        ['Right ascension', fmtRA(stars.ra[i])],
        ['Declination', fmtDec(stars.dec[i])],
        ['Apparent magnitude', fixed(stars.mag[i], 2)],
        ...(M != null ? ([['Absolute magnitude', fixed(M, 2)]] as [string, string][]) : []),
        ...(dist != null ? ([['Distance', `${sig(dist * LY_PER_PC, 3)} ly (${sig(dist, 3)} pc)`]] as [string, string][]) : []),
        ['Spectral type', stars.spect[i] || '—'],
        ...(ci != null ? ([['Colour index B−V', fixed(ci, 2)], ['Temperature (from B−V)', temperature(Math.round(T / 10) * 10)]] as [string, string][]) : []),
        ...(M != null ? ([['Luminosity (visual)', `${sig(absMagToLuminosity(M), 3)} L☉`]] as [string, string][]) : []),
        ...horizonRows(stars.ra[i], stars.dec[i]),
      ];
      info.append(
        h('div', { class: 'swatch-lg', style: { background: `radial-gradient(circle at 30% 50%, ${bvCss(ci)} 0 14px, transparent 15px), var(--space)` } }),
        h('p', { class: 'info-title', style: { marginTop: '12px' } }, stars.name[i] || stars.desig[i]),
        h('p', { class: 'info-sub' }, `${stars.name[i] ? stars.desig[i] + ' · ' : ''}${conName}${stars.hip[i] ? ` · HIP ${stars.hip[i]}` : ''}`),
        h('div', { class: 'info-body' }, readout(rows).el),
      );
      if (stars.name[i]) info.append(h('div', { class: 'btn-row', style: { marginTop: '12px' } }, button('Find on the HR diagram', () => navigate('hr-diagram', { focus: stars.name[i] }))));
    } else if (selected.kind === 'body') {
      const b = selected.body;
      const distStr = b.id === 'moon' ? `${fixed(b.distAU * 149597870.7, 0)} km` : `${fixed(b.distAU, 3)} AU`;
      const rows: [string, string][] = [
        ['Right ascension', fmtRA(b.ra)],
        ['Declination', fmtDec(b.dec)],
        ['Magnitude', fixed(b.mag, 1)],
        ['Distance from Earth', distStr],
        ...(b.id !== 'sun' ? ([['Elongation from Sun', deg(b.elongation, 1)]] as [string, string][]) : []),
        ...(b.phase != null && b.id !== 'sun' ? ([['Illuminated', `${Math.round(b.phase * 100)} %`]] as [string, string][]) : []),
        ...horizonRows(b.ra, b.dec),
      ];
      info.append(
        h('p', { class: 'info-title' }, b.name),
        h('p', { class: 'info-sub' }, `Geocentric position for ${time.toISOString().slice(0, 16).replace('T', ' ')} UTC`),
        h('div', { class: 'info-body' }, readout(rows).el),
      );
      if (b.id !== 'moon') info.append(h('div', { class: 'btn-row', style: { marginTop: '12px' } }, button('Open in the orrery', () => navigate('solar-system', { focus: b.id }))));
    } else if (selected.kind === 'dso') {
      const m = selected.obj;
      info.append(
        h('p', { class: 'info-title' }, m.name ? `${m.id} · ${m.name}` : m.id),
        h('p', { class: 'info-sub' }, `${m.type} · ${m.ngc}`),
        h(
          'div',
          { class: 'info-body' },
          readout([
            ['Right ascension', fmtRA(m.ra)],
            ['Declination', fmtDec(m.dec)],
            ['Magnitude', fixed(m.mag, 1)],
            ['Apparent size', `${m.dim}′`],
            ...horizonRows(m.ra, m.dec),
          ]).el,
        ),
      );
    } else if (selected.kind === 'con') {
      const c = cons.list.find((x) => x.id === (selected as { id: string }).id)!;
      let count = 0;
      let brightest = -1;
      for (let i = 0; i < stars.count; i++)
        if (stars.con[i] === c.id) {
          count++;
          if (brightest < 0) brightest = i;
        }
      info.append(
        h('p', { class: 'info-title' }, c.name),
        h('p', { class: 'info-sub' }, `Genitive ${c.gen} · IAU abbreviation ${c.id}`),
        h(
          'div',
          { class: 'info-body' },
          readout([
            ['Naked-eye stars', String(count)],
            ['Brightest star', brightest >= 0 ? `${stars.name[brightest] || stars.desig[brightest]} (${fixed(stars.mag[brightest], 2)})` : '—'],
            ['Centre', `${fmtRA(c.ra)} ${fmtDec(c.dec)}`],
          ]).el,
        ),
      );
    }
  }

  function buildBrightTable(): void {
    const rows: HTMLElement[] = [];
    for (let i = 0, n = 0; i < stars.count && n < 20; i++) {
      if (stars.desig[i].startsWith('Gliese')) continue; // drop resolved companions
      n++;
      const tr = h(
        'tr',
        { class: 'is-clickable', tabindex: '0' },
        h('td', { class: 'num' }, String(n)),
        h('td', null, stars.name[i] || stars.desig[i]),
        h('td', null, stars.desig[i]),
        h('td', { class: 'num' }, fixed(stars.mag[i], 2)),
        h('td', { class: 'num' }, stars.dist[i] != null ? fixed(stars.dist[i]! * LY_PER_PC, 1) : '—'),
        h('td', null, stars.spect[i]),
      );
      const go = () => {
        selected = { kind: 'star', index: i };
        showInfo();
        centreOn(stars.ra[i], stars.dec[i], 50);
        stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      rows.push(tr);
    }
    brightTable.append(
      h(
        'table',
        null,
        h('thead', null, h('tr', null, h('th', { class: 'num' }, '#'), h('th', null, 'Name'), h('th', null, 'Bayer'), h('th', { class: 'num' }, 'Mag.'), h('th', { class: 'num' }, 'Distance (ly)'), h('th', null, 'Spectrum'))),
        h('tbody', null, rows),
      ),
    );
  }

  function handleParams(p: Record<string, string>): void {
    if (p.mode === 'tonight') setFrame('horizon');
    const f = p.focus;
    if (!f) return;
    if (f.startsWith('star:')) {
      const i = Number(f.slice(5));
      selected = { kind: 'star', index: i };
      centreOn(stars.ra[i], stars.dec[i], 40);
    } else if (f.startsWith('con:')) {
      const c = cons.list.find((x) => x.id === f.slice(4));
      if (c) {
        selected = { kind: 'con', id: c.id };
        layers.lines = true;
        centreOn(c.ra, c.dec, 55);
      }
    } else if (f.startsWith('dso:')) {
      loadMessier().then((ms) => {
        const m = ms.find((x) => x.id === f.slice(4));
        if (!m) return;
        selected = { kind: 'dso', obj: m };
        showInfo();
        centreOn(m.ra, m.dec, 30);
      });
    }
    showInfo();
  }

  return () => d.dispose();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
