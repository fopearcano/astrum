import './styles/main.css';
import { h } from './lib/dom';
import { icons } from './lib/ui';
import { currentChoice, initTheme, setTheme, ThemeChoice } from './lib/theme';
import { PLATES, plateById } from './plates/registry';
import { navigate, startRouter, currentRoute } from './router';
import { openSearch } from './search';
import { renderHome } from './home';

initTheme();

const themeBtn = h('button', { type: 'button', class: 'btn btn--icon btn--ghost', id: 'theme-toggle' });
const THEME_ORDER: ThemeChoice[] = ['system', 'dark', 'light'];
const THEME_LABEL: Record<ThemeChoice, string> = {
  system: 'Theme: follows your system. Switch to dark',
  dark: 'Theme: dark (night ink). Switch to light',
  light: 'Theme: light (printed atlas). Follow system',
};
const paintThemeBtn = () => {
  const c = currentChoice();
  themeBtn.innerHTML = c === 'system' ? icons.auto : c === 'dark' ? icons.moon : icons.sun;
  themeBtn.setAttribute('aria-label', THEME_LABEL[c]);
  themeBtn.title = THEME_LABEL[c];
};
themeBtn.addEventListener('click', () => {
  const c = currentChoice();
  setTheme(THEME_ORDER[(THEME_ORDER.indexOf(c) + 1) % THEME_ORDER.length]);
  paintThemeBtn();
});
paintThemeBtn();

const searchBtn = h('button', { type: 'button', class: 'btn search-btn', id: 'search-open', 'aria-label': 'Search the atlas', onclick: () => openSearch(), html: `${icons.search}<span>Search stars, planets…</span><kbd>/</kbd>` });

let drawer: HTMLElement | null = null;
const closeDrawer = () => {
  drawer?.remove();
  drawer = null;
  platesBtn.setAttribute('aria-expanded', 'false');
};
const openDrawer = () => {
  if (drawer) return closeDrawer();
  const cur = currentRoute();
  const panel = h(
    'nav',
    { class: 'drawer__panel', 'aria-label': 'Plates' },
    h(
      'div',
      { class: 'drawer__head' },
      h('p', { class: 'eyebrow' }, 'Plates'),
      h('button', { type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Close plates list', onclick: closeDrawer, html: icons.close }),
    ),
    h(
      'ol',
      { class: 'toc' },
      h('li', null, h('a', { href: '#', 'aria-current': cur === '' ? 'page' : null, onclick: closeDrawer }, h('span', { class: 'toc__num' }, '—'), h('span', { class: 'toc__title' }, 'Contents'))),
      PLATES.map((p) =>
        h(
          'li',
          null,
          h(
            'a',
            { href: `#${p.id}`, 'aria-current': cur === p.id ? 'page' : null, onclick: closeDrawer },
            h('span', { class: 'toc__num' }, p.num),
            h('span', { class: 'toc__title' }, p.title),
            h('span', { class: 'toc__sum' }, p.summary),
          ),
        ),
      ),
    ),
  );
  drawer = h('div', { class: 'drawer', onmousedown: (e: MouseEvent) => e.target === drawer && closeDrawer() }, panel);
  document.body.append(drawer);
  platesBtn.setAttribute('aria-expanded', 'true');
  (panel.querySelector('a[aria-current="page"]') as HTMLElement | null)?.focus();
};
const platesBtn = h('button', { type: 'button', class: 'btn', id: 'plates-open', 'aria-expanded': 'false', onclick: openDrawer, html: `${icons.menu}<span>Plates</span>` });

const topbar = h(
  'header',
  { class: 'topbar' },
  h(
    'div',
    { class: 'topbar__inner' },
    h('a', { class: 'wordmark', href: '#', 'aria-label': 'Astrum, contents' }, h('span', { class: 'wordmark__name' }, 'ASTRUM'), h('span', { class: 'wordmark__sub' }, 'An interactive atlas of astrophysics')),
    searchBtn,
    platesBtn,
    themeBtn,
  ),
);

const view = h('main', { id: 'view', tabindex: '-1' });
const footer = h(
  'footer',
  { class: 'footer' },
  h(
    'div',
    { class: 'footer__inner' },
    h('span', null, 'Astrum · stars from HYG v4.1 · constellations and Messier objects from d3-celestial · exoplanets from the Open Exoplanet Catalogue'),
    h('a', { href: '#reference' }, 'Sources and licences'),
  ),
);

document.getElementById('app')!.append(topbar, view, footer);

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
    e.preventDefault();
    openSearch();
  } else if (e.key === 'Escape' && drawer) closeDrawer();
});

document.addEventListener('astrum:route', ((e: CustomEvent<string>) => {
  const p = plateById(e.detail);
  document.title = p ? `${p.title} · Astrum` : 'Astrum';
}) as EventListener);

startRouter(view, async (target, id, params) => {
  if (!id) return renderHome(target);
  const def = plateById(id)!;
  const mod = await def.load();
  target.replaceChildren();
  const holder = h('div', { class: 'page' });
  target.append(holder);
  return mod.mount(holder, { params });
});

// Expose navigation for plates that link to each other.
(window as unknown as { astrum: unknown }).astrum = { navigate };
