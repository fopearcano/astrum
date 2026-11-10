// Hash routing: `#solar-system` opens a plate, an empty hash shows the contents.
// Only plain names go in the hash; focus requests travel in memory.

import { h, clear } from './lib/dom';
import { plateById } from './plates/registry';

type Renderer = (view: HTMLElement, id: string, params: Record<string, string>) => Promise<() => void>;

let pendingParams: Record<string, string> = {};
let render: Renderer;
let view: HTMLElement;
let cleanup: (() => void) | null = null;
let seq = 0;

export function startRouter(target: HTMLElement, renderer: Renderer): void {
  view = target;
  render = renderer;
  window.addEventListener('hashchange', route);
  route();
}

export function currentRoute(): string {
  const id = decodeURIComponent(location.hash.replace(/^#/, ''));
  return plateById(id) ? id : '';
}

export function navigate(id: string, params: Record<string, string> = {}): void {
  pendingParams = params;
  if (currentRoute() === id) route();
  else location.hash = id;
}

async function route(): Promise<void> {
  const id = currentRoute();
  const params = pendingParams;
  pendingParams = {};
  const my = ++seq;
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  clear(view);
  view.append(h('div', { class: 'loading' }, 'Preparing plate…'));
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  try {
    const dispose = await render(view, id, params);
    if (my !== seq) {
      dispose();
      return;
    }
    cleanup = dispose;
  } catch (err) {
    console.error(err);
    if (my !== seq) return;
    clear(view);
    view.append(
      h(
        'div',
        { class: 'error-box' },
        h('p', null, 'This plate could not be drawn. '),
        h('p', { class: 'mono' }, String((err as Error)?.message ?? err)),
        h('p', null, 'Reload the page to try again. If it persists, your browser may lack WebGL.'),
      ),
    );
  }
  document.dispatchEvent(new CustomEvent('astrum:route', { detail: id }));
}
