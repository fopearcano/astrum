// Command palette: search plates, bodies, stars, constellations, deep-sky objects,
// exoplanets and glossary terms, then jump to the plate that shows them.

import { h, esc } from './lib/dom';
import { PLATES } from './plates/registry';
import { ALL_BODIES } from './data/solar-system';
import { GLOSSARY } from './data/glossary';
import { loadConstellations, loadExoplanets, loadMessier, loadStars } from './lib/data';
import { navigate } from './router';

interface Entry {
  label: string;
  sub: string;
  tag: string;
  plate: string;
  params: Record<string, string>;
  key: string; // normalised search text
  rank: number; // lower = more prominent
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let index: Entry[] | null = null;
let building: Promise<Entry[]> | null = null;

function entry(label: string, sub: string, tag: string, plate: string, params: Record<string, string>, rank: number, extra = ''): Entry {
  return { label, sub, tag, plate, params, rank, key: norm(`${label} ${extra}`) };
}

async function buildIndex(): Promise<Entry[]> {
  const out: Entry[] = PLATES.map((p) => entry(p.title, `Plate ${p.num} · ${p.summary}`, 'Plate', p.id, {}, 0, p.medium));
  for (const b of ALL_BODIES)
    out.push(entry(b.name, `${b.kind === 'star' ? 'Our star' : b.kind === 'planet' ? 'Planet' : b.kind === 'dwarf' ? 'Dwarf planet' : 'Comet'} · Solar System`, 'Body', 'solar-system', { focus: b.id }, 1));
  for (const g of GLOSSARY) out.push(entry(g.term, g.def, 'Term', 'reference', { focus: g.term }, 4));
  const [stars, cons, messier, exo] = await Promise.allSettled([loadStars(), loadConstellations(), loadMessier(), loadExoplanets()]);
  if (cons.status === 'fulfilled')
    for (const c of cons.value.list) out.push(entry(c.name, `Constellation · ${c.id} · genitive ${c.gen}`, 'Constellation', 'sky', { focus: `con:${c.id}` }, 2, c.id));
  if (stars.status === 'fulfilled') {
    const s = stars.value;
    for (let i = 0; i < s.count; i++) {
      if (!s.name[i] && s.mag[i] > 3.5) continue;
      const label = s.name[i] || s.desig[i];
      out.push(entry(label, `Star · ${s.name[i] ? s.desig[i] + ' · ' : ''}mag ${s.mag[i].toFixed(2)}${s.spect[i] ? ' · ' + s.spect[i] : ''}`, 'Star', 'sky', { focus: `star:${i}` }, 2 + s.mag[i] / 10, s.desig[i]));
    }
  }
  if (messier.status === 'fulfilled')
    for (const m of messier.value)
      out.push(entry(m.name ? `${m.id} · ${m.name}` : m.id, `${m.type} · ${m.ngc} · mag ${m.mag}`, 'Deep sky', 'sky', { focus: `dso:${m.id}` }, 2.5, `${m.ngc} ${m.id.replace('M', 'M ')}`));
  if (exo.status === 'fulfilled') {
    const e = exo.value;
    for (let i = 0; i < e.count; i++)
      out.push(entry(e.name[i], `Exoplanet · ${e.methods[e.method[i]]} · ${e.year[i]}`, 'Exoplanet', 'exoplanets', { focus: e.name[i] }, 5));
  }
  return out;
}

function search(q: string, all: Entry[]): Entry[] {
  const n = norm(q.trim());
  if (!n) return all.filter((e) => e.rank < 1);
  const words = n.split(/\s+/);
  const scored: [number, Entry][] = [];
  for (const e of all) {
    if (!words.every((w) => e.key.includes(w))) continue;
    const label = norm(e.label);
    let s = e.rank;
    if (label === n) s -= 10;
    else if (label.startsWith(n)) s -= 5;
    else if (e.key.split(/[\s·\-–]+/).some((t) => t.startsWith(words[0]))) s -= 2;
    scored.push([s, e]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, 40).map(([, e]) => e);
}

let open = false;

export function openSearch(): void {
  if (open) return;
  open = true;
  const input = h('input', { class: 'palette__input', type: 'search', id: 'search-input', placeholder: 'Search stars, planets, constellations, galaxies, terms…', 'aria-label': 'Search the atlas', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'search-results' });
  const list = h('ul', { class: 'palette__list', id: 'search-results', role: 'listbox' });
  const box = h('div', { class: 'palette__box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search' }, input, list);
  const overlay = h('div', { class: 'palette' }, box);
  let results: Entry[] = [];
  let sel = 0;

  const close = () => {
    open = false;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const choose = (e: Entry | undefined) => {
    if (!e) return;
    close();
    navigate(e.plate, e.params);
  };
  const render = () => {
    list.replaceChildren();
    if (!results.length) {
      list.append(h('li', { class: 'palette__empty' }, index ? 'Nothing matches. Try a star name such as Vega, a constellation, or a Messier number.' : 'Loading catalogues…'));
      return;
    }
    results.forEach((r, i) => {
      const li = h('li', { class: 'palette__item', role: 'option', 'aria-selected': String(i === sel), id: `sr-${i}`, html: `<b>${esc(r.label)}</b><small>${esc(r.sub)}</small><span class="tag">${esc(r.tag)}</span>` });
      li.addEventListener('click', () => choose(r));
      li.addEventListener('mousemove', () => {
        if (sel !== i) {
          sel = i;
          update();
        }
      });
      list.append(li);
    });
  };
  const update = () => {
    list.querySelectorAll('.palette__item').forEach((el, i) => el.setAttribute('aria-selected', String(i === sel)));
    input.setAttribute('aria-activedescendant', `sr-${sel}`);
    list.querySelector(`#sr-${sel}`)?.scrollIntoView({ block: 'nearest' });
  };
  const run = () => {
    if (!index) return;
    results = search(input.value, index);
    sel = 0;
    render();
    update();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel = Math.min(results.length - 1, sel + 1);
      update();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, sel - 1);
      update();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[sel]);
    }
  };
  input.addEventListener('input', run);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  input.focus();
  render();
  if (index) run();
  else {
    building ??= buildIndex();
    building.then((ix) => {
      index = ix;
      if (open) run();
    });
  }
}
