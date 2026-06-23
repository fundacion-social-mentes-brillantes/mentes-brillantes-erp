'use client';

import { Moon, Sparkles } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "pink" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  mounted: boolean;
}

const STORAGE_KEY = 'mb-theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Normaliza valores guardados (incluido el antiguo "light" → "pink")
function normalize(value: string | null): Theme | null {
  if (value === 'dark') return 'dark';
  if (value === 'pink' || value === 'light') return 'pink';
  return null;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.setProperty('color-scheme', theme === 'dark' ? 'dark' : 'light');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore write errors (private mode, etc.)
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('pink');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = normalize(localStorage.getItem(STORAGE_KEY));
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const initial: Theme = stored ?? (prefersDark ? 'dark' : 'pink');
    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return; // la preferencia del usuario manda
      const next: Theme = event.matches ? 'dark' : 'pink';
      setThemeState(next);
      applyTheme(next);
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'pink' : 'dark');

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme, mounted }),
    [theme, mounted]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();
  if (!mounted) return null;

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-2 rounded-full border border-[rgba(var(--gold),0.32)] bg-[linear-gradient(135deg,rgba(var(--surface-1),0.9),rgba(var(--surface-2),0.72))] px-3 py-2 text-sm font-semibold text-[rgb(var(--text-primary))] shadow-soft hover:border-[rgba(var(--gold),0.56)] hover:bg-[rgba(var(--surface-3),0.82)] transition-all"
      aria-label={isDark ? 'Cambiar a modo rosa' : 'Cambiar a modo oscuro'}
    >
      {isDark ? (
        <Sparkles className="h-4 w-4 text-[rgb(var(--warning))]" />
      ) : (
        <Moon className="h-4 w-4 text-[rgb(var(--warning))]" />
      )}
      <span className="hidden sm:inline">{isDark ? 'Rosa' : 'Oscuro'}</span>
    </button>
  );
}
