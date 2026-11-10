// The shared layout of an atlas plate: heading, framed stage with its key, commentary.

import { h, html } from '../lib/dom';
import { PLATES, PlateDef } from './registry';

export interface PlatePage {
  root: HTMLElement;
  stage: HTMLElement;
  key: HTMLElement;
  caption: HTMLElement;
  notes: HTMLElement;
}

export interface PageOpts {
  dek: string;
  caption: string;
  /** Use the chart surface (follows the theme) instead of the night-sky stage. */
  chart?: boolean;
  short?: boolean;
  /** Plates with several figures supply extra sections after the first. */
  stageLabel: string;
}

export function platePage(def: PlateDef, o: PageOpts): PlatePage {
  const stage = h('div', {
    class: `stage${o.chart ? ' stage--chart' : ''}${o.short ? ' stage--short' : ''}`,
    role: 'img',
    'aria-label': o.stageLabel,
  });
  const key = h('aside', { class: 'key', 'aria-label': 'Plate key and controls' });
  const caption = h('p', { class: 'figcaption' });
  caption.append(html(o.caption));
  const notes = h('div', { class: 'notes' });
  const root = h(
    'article',
    { class: 'plate' },
    h(
      'header',
      { class: 'plate-head' },
      h('div', { class: 'plate-head__row' }, h('p', { class: 'plate-no' }, `Plate ${def.num}`), h('p', { class: 'eyebrow' }, def.medium)),
      h('h1', null, def.title),
      h('p', { class: 'dek' }, o.dek),
    ),
    h('div', { class: 'plate-layout' }, h('figure', { class: 'figure' }, stage, caption), key),
    notes,
    plateNav(def),
  );
  return { root, stage, key, caption, notes };
}

export function plateNav(def: PlateDef): HTMLElement {
  const i = PLATES.indexOf(def);
  const prev = PLATES[i - 1];
  const next = PLATES[i + 1];
  return h(
    'nav',
    { class: 'plate-nav', 'aria-label': 'Previous and next plates' },
    prev
      ? h('a', { href: `#${prev.id}` }, h('small', null, `← Plate ${prev.num}`), h('span', null, prev.title))
      : h('a', { href: '#' }, h('small', null, '← Contents'), h('span', null, 'Astrum')),
    next
      ? h('a', { href: `#${next.id}` }, h('small', null, `Plate ${next.num} →`), h('span', null, next.title))
      : h('a', { href: '#' }, h('small', null, 'Contents →'), h('span', null, 'Astrum')),
  );
}

/** A commentary block. `body` is trusted static markup authored in this repo. */
export function note(title: string, body: string, wide = false): HTMLElement {
  const el = h('section', { class: wide ? 'note note--wide' : 'note' }, h('h2', null, title));
  el.append(html(body));
  return el;
}

/** A secondary figure later in the plate (e.g. a second chart). */
export function figure(title: string, stage: HTMLElement, caption: string, key?: HTMLElement): HTMLElement {
  const cap = h('p', { class: 'figcaption' });
  cap.append(html(caption));
  return h(
    'section',
    { class: 'note note--wide plate-figure' },
    h('h2', null, title),
    h('div', { class: 'plate-layout' }, h('figure', { class: 'figure' }, stage, cap), key ?? h('div')),
  );
}
