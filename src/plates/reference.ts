// Plate XII — Reference: constants, units, glossary and sources.

import { Disposer, h } from '../lib/dom';
import { fixed, sci, sig } from '../lib/format';
import { CONSTANT_TABLE } from '../physics/constants';
import { GLOSSARY } from '../data/glossary';
import { PLATES, PlateContext, plateById } from './registry';
import { plateNav } from './page';

const UNITS: { id: string; name: string; m: number }[] = [
  { id: 'km', name: 'kilometres', m: 1e3 },
  { id: 'Rearth', name: 'Earth radii', m: 6.3781e6 },
  { id: 'ls', name: 'light-seconds', m: 299792458 },
  { id: 'Rsun', name: 'solar radii', m: 6.957e8 },
  { id: 'lmin', name: 'light-minutes', m: 299792458 * 60 },
  { id: 'AU', name: 'astronomical units', m: 1.495978707e11 },
  { id: 'ly', name: 'light-years', m: 9.4607304725808e15 },
  { id: 'pc', name: 'parsecs', m: 3.0856775814913673e16 },
  { id: 'kpc', name: 'kiloparsecs', m: 3.0856775814913673e19 },
  { id: 'Mpc', name: 'megaparsecs', m: 3.0856775814913673e22 },
];

const SOURCES = [
  ['HYG Database v4.1', 'David Nash (astronexus)', 'Stars: positions, magnitudes, colours, distances, spectral types. Combines Hipparcos, Yale Bright Star and Gliese catalogues.', 'CC BY-SA 4.0', 'https://codeberg.org/astronexus/hyg'],
  ['d3-celestial data', 'Olaf Frohn', 'Constellation figures, names and boundaries; Milky Way outline; Messier catalogue.', 'BSD 3-Clause', 'https://github.com/ofrohn/d3-celestial'],
  ['Open Exoplanet Catalogue', 'Hanno Rein and contributors', 'Confirmed exoplanets and host-star properties (entries through 2023).', 'MIT', 'https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue'],
  ['Keplerian elements for approximate positions of the major planets', 'E. M. Standish, JPL', 'Planet orbits, 1800–2050.', 'Public domain (NASA/JPL)', 'https://ssd.jpl.nasa.gov/planets/approx_pos.html'],
  ['Planetary fact sheets', 'NASA Goddard (D. R. Williams)', 'Physical data for the planets.', 'Public domain (NASA)', 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/'],
  ['Planck 2018 results VI', 'Planck Collaboration', 'Cosmological parameters.', 'A&A 641, A6 (2020)', 'https://arxiv.org/abs/1807.06209'],
  ['Habitable zones around main-sequence stars', 'Kopparapu et al.', 'Habitable-zone boundaries.', 'ApJ 765, 131 (2013)', 'https://arxiv.org/abs/1301.6674'],
  ['The circular velocity curve of the Milky Way', 'Eilers et al.', 'Rotation curve trend, 5–25 kpc.', 'ApJ 871, 120 (2019)', 'https://arxiv.org/abs/1810.09466'],
];

export function mount(root: HTMLElement, ctx: PlateContext): () => void {
  const d = new Disposer();
  const def = plateById('reference')!;

  // constants
  const constants = h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      null,
      h('thead', null, h('tr', null, h('th', null, 'Symbol'), h('th', null, 'Quantity'), h('th', { class: 'num' }, 'Value'), h('th', null, 'Unit'), h('th', null, 'Note'))),
      h('tbody', null, CONSTANT_TABLE.map((c) => h('tr', null, h('td', { class: 'mono' }, c.symbol), h('td', null, c.name), h('td', { class: 'num' }, c.value), h('td', { class: 'mono' }, c.unit), h('td', null, c.note ?? '')))),
    ),
  );

  // converter
  const valIn = h('input', { type: 'number', id: 'ref-value', value: '1', step: 'any', 'aria-label': 'Value to convert' }) as HTMLInputElement;
  const unitIn = h('select', { id: 'ref-unit', 'aria-label': 'Unit to convert from' }, UNITS.map((u) => h('option', { value: u.id, selected: u.id === 'ly' }, u.name))) as HTMLSelectElement;
  const results = h('dl', { class: 'readout' });
  const convert = () => {
    const v = Number(valIn.value);
    const from = UNITS.find((u) => u.id === unitIn.value)!;
    const m = v * from.m;
    results.replaceChildren(
      h('dt', null, 'metres'),
      h('dd', null, Number.isFinite(m) ? sci(m, 5) : '—'),
      ...UNITS.flatMap((u) => [h('dt', null, u.name), h('dd', null, Number.isFinite(m) ? (Math.abs(m / u.m) >= 1e6 || Math.abs(m / u.m) < 1e-3 ? sci(m / u.m, 5) : sig(m / u.m, 6)) : '—')]),
    );
  };
  valIn.addEventListener('input', convert);
  unitIn.addEventListener('change', convert);
  convert();

  // glossary
  const filter = h('input', { type: 'search', id: 'ref-filter', placeholder: 'Filter 70 terms…', 'aria-label': 'Filter the glossary' }) as HTMLInputElement;
  const list = h('dl', { class: 'glossary' });
  const renderGlossary = () => {
    const q = filter.value.trim().toLowerCase();
    list.replaceChildren(
      ...GLOSSARY.filter((g) => !q || g.term.toLowerCase().includes(q) || g.def.toLowerCase().includes(q)).flatMap((g) => {
        const p = g.plate ? plateById(g.plate) : undefined;
        const dt = h('dt', { id: `term-${slug(g.term)}` }, g.term);
        const dd = h('dd', null, g.def, p && p.id !== 'reference' ? h('a', { href: `#${p.id}`, class: 'glossary__link' }, ` See Plate ${p.num}`) : null);
        return [dt, dd];
      }),
    );
  };
  filter.addEventListener('input', renderGlossary);
  renderGlossary();

  const sources = h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      null,
      h('thead', null, h('tr', null, h('th', null, 'Source'), h('th', null, 'Author'), h('th', null, 'Used for'), h('th', null, 'Licence or citation'))),
      h('tbody', null, SOURCES.map(([name, by, use, lic, url]) => h('tr', null, h('td', null, h('a', { href: url, target: '_blank', rel: 'noopener' }, name)), h('td', null, by), h('td', null, use), h('td', null, lic)))),
    ),
  );

  root.append(
    h(
      'article',
      { class: 'plate' },
      h(
        'header',
        { class: 'plate-head' },
        h('div', { class: 'plate-head__row' }, h('p', { class: 'plate-no' }, `Plate ${def.num}`), h('p', { class: 'eyebrow' }, def.medium)),
        h('h1', null, def.title),
        h('p', { class: 'dek' }, 'The numbers behind every plate: physical and astronomical constants, a converter for astronomical distances, a glossary of terms, and the catalogues this atlas is drawn from.'),
      ),
      h(
        'div',
        { class: 'ref-grid' },
        h('section', { class: 'note' }, h('h2', null, 'Constants'), h('p', null, 'CODATA 2018 recommended values and IAU 2015 nominal solar and planetary values.'), constants),
        h(
          'section',
          { class: 'note' },
          h('h2', null, 'Distance converter'),
          h('div', { class: 'panel' }, h('div', { class: 'controls' }, h('div', { class: 'field' }, h('label', { for: 'ref-value' }, 'Value'), valIn), h('div', { class: 'field' }, h('label', { for: 'ref-unit' }, 'Unit'), unitIn), results)),
          h('p', { class: 'info-sub' }, `For scale: Proxima Centauri is ${fixed(4.2465, 2)} light-years away; the Andromeda Galaxy 765 kiloparsecs.`),
        ),
      ),
      h('section', { class: 'note', style: { marginTop: '44px' } }, h('h2', null, 'Glossary'), filter, list),
      h(
        'section',
        { class: 'note', style: { marginTop: '44px' } },
        h('h2', null, 'Sources and licences'),
        h('p', null, 'Derived catalogue files in data/ inherit their source licences: the star files are CC BY-SA 4.0 (HYG). Regenerate them with npm run data.'),
        sources,
      ),
      h('section', { class: 'note', style: { marginTop: '44px' } }, h('h2', null, 'All plates'), h('ol', { class: 'contents' }, PLATES.map((p) => h('li', null, h('a', { href: `#${p.id}` }, h('span', { class: 'contents__num' }, p.num), h('span', { class: 'contents__title' }, p.title), h('span', { class: 'contents__tag' }, p.medium), h('span', { class: 'contents__sum' }, p.summary)))))),
      plateNav(def),
    ),
  );

  if (ctx.params.focus) {
    const el = root.querySelector(`#term-${slug(ctx.params.focus)}`);
    if (el) {
      el.classList.add('is-highlight');
      requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
    }
  }
  return () => d.dispose();
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
