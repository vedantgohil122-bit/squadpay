import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('squadpay_theme') as Theme | null;
  if (stored === 'dark' || stored === 'light') return stored;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#fdf8ec' : '#0e0c0a');
  localStorage.setItem('squadpay_theme', t);
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: 'dark',
  setTheme: (t) => { applyTheme(t); set({ theme: t }); },
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },
}));

// Applied on import so there's no flash of the wrong theme before React mounts.
if (typeof window !== 'undefined') {
  const hadStoredPreference = !!localStorage.getItem('squadpay_theme');
  const init = getInitialTheme();
  applyTheme(init);
  setTimeout(() => useTheme.setState({ theme: init }), 0);

  window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', (e) => {
    // Only auto-follow the system for users who've never explicitly toggled here.
    if (!hadStoredPreference) {
      const sys: Theme = e.matches ? 'light' : 'dark';
      applyTheme(sys);
      useTheme.setState({ theme: sys });
    }
  });
}
