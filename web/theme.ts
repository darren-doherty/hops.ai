// Light / dark / system theme. The choice is stored per browser; the resolved
// theme is applied as data-theme on <html>, which the CSS tokens key off.
// index.html runs the same resolution inline before first paint, so there's no
// flash of the wrong theme.

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'hops-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage can be unavailable (private mode, blocked site data): fall back to system.
  }
  return 'system';
}

function apply(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // Not persisted, but still applied for this page.
  }
  apply(preference);
}

/** Keeps the page in sync with OS changes (when on "system") and with other tabs. */
export function watchTheme(onChange: (preference: ThemePreference) => void): () => void {
  const sync = () => {
    const preference = getThemePreference();
    apply(preference);
    onChange(preference);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) sync();
  };
  media.addEventListener('change', sync);
  window.addEventListener('storage', onStorage);
  return () => {
    media.removeEventListener('change', sync);
    window.removeEventListener('storage', onStorage);
  };
}
