// Theme state: "system" (no attribute), or an explicit light/dark choice on <html>.
// Canvas plates read the CSS tokens through `palette()` and redraw on change.

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'astrum.theme';
const listeners = new Set<() => void>();

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

export function initTheme(): void {
  apply(stored());
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', notify);
  // The host page (or another script) may set data-theme itself.
  new MutationObserver(notify).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

export function currentChoice(): ThemeChoice {
  const v = document.documentElement.getAttribute('data-theme');
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function isLight(): boolean {
  const v = document.documentElement.getAttribute('data-theme');
  if (v === 'light') return true;
  if (v === 'dark') return false;
  return matchMedia('(prefers-color-scheme: light)').matches;
}

function apply(choice: ThemeChoice): void {
  if (choice === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
}

export function setTheme(choice: ThemeChoice): void {
  apply(choice);
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable */
  }
  notify();
}

let pending = false;
function notify(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    cache = null;
    listeners.forEach((fn) => fn());
  });
}

export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface Palette {
  light: boolean;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  lineStrong: string;
  fg: string;
  fg2: string;
  muted: string;
  accent: string;
  mark: string;
  grid: string;
  axis: string;
  space: string;
  onSpace: string;
  onSpace2: string;
  series: [string, string, string];
  seriesOther: string;
  fontBody: string;
  fontMono: string;
  fontDisplay: string;
}

let cache: Palette | null = null;
export function palette(): Palette {
  if (cache) return cache;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  cache = {
    light: isLight(),
    bg: v('--bg'),
    surface: v('--surface'),
    surface2: v('--surface-2'),
    line: v('--line'),
    lineStrong: v('--line-strong'),
    fg: v('--fg'),
    fg2: v('--fg-2'),
    muted: v('--muted'),
    accent: v('--accent'),
    mark: v('--mark'),
    grid: v('--grid'),
    axis: v('--axis'),
    space: v('--space'),
    onSpace: v('--on-space'),
    onSpace2: v('--on-space-2'),
    series: [v('--series-1'), v('--series-2'), v('--series-3')],
    seriesOther: v('--series-other'),
    fontBody: v('--font-body'),
    fontMono: v('--font-mono'),
    fontDisplay: v('--font-display'),
  };
  return cache;
}
