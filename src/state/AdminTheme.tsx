import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Moon, Sun } from '../components/icons';
import { cx } from '../components/ui';

/**
 * The diner app is always the dark table. The dashboard is a different job —
 * a shift-long tool — so it can sit on paper without changing what guests see.
 * Preference is remembered; the diner route never inherits it.
 */

export type AdminTheme = 'light' | 'dark';

const KEY = 'letsDine.admin-theme.v1';
const DINER_THEME_COLOR = '#12100e';
const ADMIN_THEME_COLOR: Record<AdminTheme, string> = {
  light: '#f6f1e7', // Same cream as the landing/get-started page's PAPER constant.
  dark: '#100d0b',
};

interface AdminThemeValue {
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
  toggle: () => void;
}

const AdminThemeContext = createContext<AdminThemeValue | null>(null);

function read(): AdminTheme {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function paint(onAdmin: boolean, theme: AdminTheme) {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!onAdmin) {
    root.removeAttribute('data-admin-theme');
    meta?.setAttribute('content', DINER_THEME_COLOR);
    return;
  }
  root.setAttribute('data-admin-theme', theme);
  meta?.setAttribute('content', ADMIN_THEME_COLOR[theme]);
}

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const onAdmin = pathname.startsWith('/admin') || pathname.startsWith('/platform');
  const [theme, setThemeState] = useState<AdminTheme>(read);

  const setTheme = useCallback((next: AdminTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [setTheme, theme]);

  useLayoutEffect(() => {
    paint(onAdmin, theme);
  }, [onAdmin, theme]);

  const value = useMemo<AdminThemeValue>(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <AdminThemeContext.Provider value={value}>{children}</AdminThemeContext.Provider>;
}

export function useAdminTheme(): AdminThemeValue {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error('useAdminTheme must be used inside AdminThemeProvider');
  return ctx;
}

/** Compact switch for the dashboard chrome. Staff who never open Settings still get it. */
export function AdminThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useAdminTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={next === 'dark' ? 'Switch to dark theme' : 'Switch to light theme'}
      aria-pressed={theme === 'dark'}
      className={cx(
        'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-ink-3',
        'ring-1 ring-hairline ring-inset transition-colors hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
      {next === 'dark' ? 'Dark' : 'Light'}
    </button>
  );
}
