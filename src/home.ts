// The atlas's opening spread: a live sky as frontispiece, then the table of plates.

import { Disposer, h, prefersReducedMotion } from './lib/dom';
import { animate, createSurface } from './lib/canvas';
import { loadConstellations, loadMilkyWay, loadStars } from './lib/data';
import { palette } from './lib/theme';
import { SkyRenderer, SkyView } from './sky/renderer';
import { PLATES } from './plates/registry';
import { gmst, julianDate } from './physics/time';
import { ra as fmtRA } from './lib/format';
import { skyBodies } from './physics/ephemeris';
import { navigate } from './router';

export async function renderHome(view: HTMLElement): Promise<() => void> {
  const d = new Disposer();
  const now = new Date();
  const jd = julianDate(now);
  const hero = h('section', { class: 'hero', 'aria-label': 'The sky tonight, turning slowly' });
  const meta = h('div', { class: 'hero__meta', 'aria-hidden': 'true' });
  const text = h(
    'div',
    { class: 'hero__text' },
    h('p', { class: 'eyebrow' }, 'An interactive atlas of astrophysics'),
    h('h1', { class: 'hero__title', html: 'Astrum' }),
    h(
      'p',
      { class: 'hero__lede' },
      'Twelve plates on how the Universe works, from the orbits of the planets to the expansion of space. Every star is from a real catalogue and every curve is computed from the physics.',
    ),
    h(
      'div',
      { class: 'btn-row' },
      h('a', { class: 'btn btn--primary', href: '#scale' }, 'Begin at Plate I'),
      h('button', { class: 'btn', type: 'button', onclick: () => navigate('sky', { mode: 'tonight' }) }, 'Tonight’s sky'),
      h('a', { class: 'btn', href: '#solar-system' }, 'Open the orrery'),
    ),
  );
  hero.append(meta, text);

  const contents = h(
    'ol',
    { class: 'contents' },
    PLATES.map((p) =>
      h(
        'li',
        null,
        h(
          'a',
          { href: `#${p.id}` },
          h('span', { class: 'contents__num' }, p.num),
          h('span', { class: 'contents__title' }, p.title),
          h('span', { class: 'contents__tag' }, p.medium),
          h('span', { class: 'contents__sum' }, p.summary),
        ),
      ),
    ),
  );

  const intro = h(
    'div',
    { class: 'home-intro' },
    h('p', { class: 'eyebrow' }, 'Contents'),
    h('h2', null, 'How to read this atlas'),
    h(
      'p',
      null,
      'Each plate pairs one large figure with its key. Drag to turn the sky or the 3D models, scroll or pinch to zoom, and select any star, planet or point for its data. The commentary under each figure sets out the physics in a few paragraphs and equations.',
    ),
    h('p', null, 'Search everything with ', h('kbd', null, '/'), ' or ', h('kbd', null, 'Ctrl'), ' ', h('kbd', null, 'K'), ': 8,921 stars, 88 constellations, 110 Messier objects, 5,288 exoplanets and the glossary.'),
    h(
      'div',
      { class: 'figures' },
      ...[
        ['8,921', 'naked-eye stars'],
        ['28,879', 'stars on the HR diagram'],
        ['1,900', 'stars within 20 pc'],
        ['5,288', 'confirmed exoplanets'],
      ].map(([n, l]) => h('div', null, h('b', null, n), h('span', null, l))),
    ),
  );

  view.replaceChildren(h('div', { class: 'page' }, hero, h('div', { class: 'home-grid' }, intro, contents)));

  // Frontispiece: the real sky, drifting with sidereal time.
  const [stars, cons, mw] = await Promise.all([loadStars(), loadConstellations(), loadMilkyWay().catch(() => undefined)]);
  const sky = new SkyRenderer({ stars, cons, mw });
  sky.setBodies(skyBodies(jd).filter((b) => b.id !== 'sun'));
  const reduced = prefersReducedMotion();
  const viewState: SkyView = { frame: 'equatorial', projection: 'stereographic', lon: gmst(jd), lat: 18, fov: 120, jd, latitude: 0, longitude: 0 };
  const layers = { lines: true, borders: false, conNames: true, starNames: false, grid: false, ecliptic: true, milkyway: true, messier: false, planets: true };
  let surf: ReturnType<typeof createSurface> | null = null;
  const draw = () => {
    if (!surf) return;
    const pal = palette();
    sky.draw(surf.ctx, surf.width, surf.height, { ...viewState, fov: surf.width < 600 ? 95 : 120 }, layers, pal, { print: false, hero: true });
  };
  const updateMeta = () => {
    meta.innerHTML = `${now.toISOString().slice(0, 10)} · ${now.toISOString().slice(11, 16)} UTC<br>Sidereal time, Greenwich ${fmtRA(gmst(julianDate(new Date()))).slice(0, 7)}<br>Stereographic · J2000.0 · stars to mag 5.6`;
  };
  surf = createSurface(hero, d, () => draw());
  updateMeta();
  draw();
  if (!reduced) {
    animate(hero, d, (_t, dt) => {
      viewState.lon = (viewState.lon + dt * 1.2) % 360;
      draw();
    });
  }
  const tick = window.setInterval(updateMeta, 30000);
  d.add(() => clearInterval(tick));
  return () => d.dispose();
}
