// Small control widgets shared by the plates. Each control gets a stable id.

import { h } from './dom';

export interface SliderOpts {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  /** Log-scale sliders map the thumb linearly onto log10(value). */
  log?: boolean;
  format?: (v: number) => string;
  onInput: (v: number) => void;
}

export interface Slider {
  el: HTMLElement;
  input: HTMLInputElement;
  set: (v: number, fire?: boolean) => void;
  get: () => number;
}

export function slider(o: SliderOpts): Slider {
  const fmt = o.format ?? ((v: number) => String(v));
  const toPos = (v: number) => (o.log ? Math.log10(v) : v);
  const fromPos = (p: number) => (o.log ? 10 ** p : p);
  const input = h('input', {
    type: 'range',
    id: o.id,
    min: String(toPos(o.min)),
    max: String(toPos(o.max)),
    step: String(o.log ? 0.001 : (o.step ?? (o.max - o.min) / 200)),
    value: String(toPos(o.value)),
  });
  const out = h('output', { for: o.id }, fmt(o.value));
  let value = o.value;
  input.addEventListener('input', () => {
    value = fromPos(Number(input.value));
    out.textContent = fmt(value);
    o.onInput(value);
  });
  const el = h('div', { class: 'field' }, h('div', { class: 'field__top' }, h('label', { for: o.id }, o.label), out), input);
  return {
    el,
    input,
    get: () => value,
    set(v, fire = false) {
      value = v;
      input.value = String(toPos(v));
      out.textContent = fmt(v);
      if (fire) o.onInput(v);
    },
  };
}

export interface SegOpts<T extends string> {
  label?: string;
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}

export function segmented<T extends string>(o: SegOpts<T>): { el: HTMLElement; set: (v: T) => void } {
  const buttons = o.options.map((opt) =>
    h(
      'button',
      {
        type: 'button',
        class: 'btn',
        title: opt.title ?? null,
        'aria-pressed': String(opt.value === o.value),
        onclick: () => {
          set(opt.value);
          o.onChange(opt.value);
        },
      },
      opt.label,
    ),
  );
  const set = (v: T) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(o.options[i].value === v)));
  const group = h('div', { class: 'seg', role: 'group', 'aria-label': o.label ?? null }, buttons);
  const el = o.label ? h('div', { class: 'field' }, h('span', { class: 'field__label' }, o.label), group) : group;
  return { el, set };
}

export function toggle(id: string, label: string, checked: boolean, onChange: (v: boolean) => void, swatch?: string): HTMLLabelElement {
  const input = h('input', { type: 'checkbox', id, checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'chip', for: id }, input, swatch ? h('i', { class: 'swatch', style: { background: swatch } }) : null, label);
}

export function select<T extends string>(
  id: string,
  label: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): { el: HTMLElement; input: HTMLSelectElement } {
  const input = h(
    'select',
    { id },
    options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)),
  );
  input.addEventListener('change', () => onChange(input.value as T));
  return { el: h('div', { class: 'field' }, h('label', { for: id }, label), input), input };
}

export function panel(title: string, ...children: (Node | null | false)[]): HTMLElement {
  return h('section', { class: 'panel' }, h('h2', null, title), ...children);
}

/** A definition list of label/value rows that can be updated in place. */
export function readout(rows: [string, string][], wide = false): { el: HTMLDListElement; update: (rows: [string, string][]) => void } {
  const el = h('dl', { class: wide ? 'readout readout--wide' : 'readout' });
  const update = (r: [string, string][]) => {
    el.replaceChildren(...r.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  };
  update(rows);
  return { el, update };
}

export function button(label: string, onClick: () => void, opts: { id?: string; title?: string; primary?: boolean } = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: opts.primary ? 'btn btn--primary' : 'btn', id: opts.id ?? null, title: opts.title ?? null, onclick: onClick }, label);
}

export const icons = {
  play: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>',
  search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5 14 14" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke-linecap="round"/></svg>',
  sun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z" stroke-linejoin="round"/></svg>',
  auto: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>',
  reset: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.6h2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sound: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z" stroke-linejoin="round"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.7a6 6 0 0 1 0 8.6" stroke-linecap="round"/></svg>',
};

export function iconButton(icon: string, label: string, onClick: () => void, id?: string): HTMLButtonElement {
  return h('button', { type: 'button', class: 'btn btn--icon', 'aria-label': label, title: label, id: id ?? null, onclick: onClick, html: icon });
}
