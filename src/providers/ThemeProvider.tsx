import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tps.theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  /**
   * LIGHT IS THE CANONICAL PRESENTATION (stakeholder-directed, 2026-07-22, alongside the warm
   * editorial retheme). This used to follow `prefers-color-scheme`, so anyone with a dark OS met
   * the product in dark first — but the warm ivory light theme IS the product's voice; dark is a
   * working preference, not a second identity. An explicitly chosen theme (the toggle stores one)
   * is still honoured above this default, so nobody's choice is overridden.
   */
  return 'light';
}

/** Applies the theme to <html data-theme> so token overrides in tokens.css take effect. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'light' ? 'dark' : 'light')),
    [],
  );

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Deliberately co-located with its provider (the context object is module-private, so the
 * hook cannot live elsewhere without exporting it). The cost is that this file exports a
 * hook as well as a component, which only degrades Fast Refresh granularity in dev.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
