// Theme preference: resolution, persistence, OS changes and unavailable storage.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let osDark = false;
let mediaListener: (() => void) | undefined;
let storage: Record<string, string> = {};
let storageBlocked = false;
const html = { dataset: {} as Record<string, string> };

vi.stubGlobal('window', {
  matchMedia: () => ({
    get matches() {
      return osDark;
    },
    addEventListener: (_: string, fn: () => void) => (mediaListener = fn),
    removeEventListener: () => (mediaListener = undefined),
  }),
  addEventListener: () => {},
  removeEventListener: () => {},
});
vi.stubGlobal('document', { documentElement: html });
vi.stubGlobal('localStorage', {
  getItem: (k: string) => {
    if (storageBlocked) throw new Error('SecurityError');
    return storage[k] ?? null;
  },
  setItem: (k: string, v: string) => {
    if (storageBlocked) throw new Error('SecurityError');
    storage[k] = v;
  },
  removeItem: (k: string) => {
    if (storageBlocked) throw new Error('SecurityError');
    delete storage[k];
  },
});

const { getThemePreference, setThemePreference, watchTheme } = await import('../web/theme');

beforeEach(() => {
  osDark = false;
  storage = {};
  storageBlocked = false;
  html.dataset = {};
});

describe('theme', () => {
  it('defaults to following the OS', () => {
    expect(getThemePreference()).toBe('system');
    osDark = true;
    setThemePreference('system');
    expect(html.dataset.theme).toBe('dark');
  });

  it('an explicit choice overrides the OS and is remembered', () => {
    osDark = true;
    setThemePreference('light');
    expect(html.dataset.theme).toBe('light');
    expect(getThemePreference()).toBe('light');

    setThemePreference('system'); // back to following the OS: nothing stored
    expect(storage).toEqual({});
    expect(html.dataset.theme).toBe('dark');
  });

  it('follows OS changes live only while on "system"', () => {
    const seen: string[] = [];
    const stop = watchTheme((p) => seen.push(p));

    osDark = true;
    mediaListener!();
    expect(html.dataset.theme).toBe('dark');

    setThemePreference('light');
    osDark = false;
    mediaListener!();
    osDark = true;
    mediaListener!();
    expect(html.dataset.theme).toBe('light'); // explicit choice wins
    stop();
  });

  it('still works when storage is blocked (e.g. private mode)', () => {
    storageBlocked = true;
    expect(getThemePreference()).toBe('system');
    expect(() => setThemePreference('dark')).not.toThrow();
    expect(html.dataset.theme).toBe('dark');
  });
});
