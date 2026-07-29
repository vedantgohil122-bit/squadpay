import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../store/theme';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { play, initSound } from '../lib/sound';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const [bump, setBump] = useState(0);

  return (
    <button
      onClick={() => {
        initSound();
        play('toggle');
        toggle();
        setBump((b) => b + 1);
      }}
      className={`rounded-xl p-2.5 border-2 transition active:scale-90 ${className}`}
      style={{
        background: 'var(--card)',
        borderColor: 'var(--border)',
        color: 'var(--text)',
      }}
      title={theme === 'dark' ? 'Light mode pe jao ☀️' : 'Dark mode pe jao 🌙'}
      aria-label="Toggle theme"
    >
      <motion.div
        key={bump}
        initial={{ rotate: -30, scale: 0.8 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </motion.div>
    </button>
  );
}

// Compact version for navbars that already have SoundToggle
export function ThemeToggleIcon({ size = 16 }: { size?: number }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={() => {
        initSound();
        play('toggle');
        toggle();
      }}
      className="rounded-lg p-2 transition active:scale-90"
      style={{ color: 'var(--text-dim)' }}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
}

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      className="flex gap-1 rounded-xl p-1"
      style={{ background: 'var(--card-soft)', border: '2px solid var(--border)' }}
    >
      {[
        { id: 'dark', label: 'Dark', icon: Moon },
        { id: 'light', label: 'Light', icon: Sun },
        { id: 'auto', label: 'Auto', icon: Monitor },
      ].map((opt) => {
        const isActive =
          opt.id === 'auto'
            ? !localStorage.getItem('squadpay_theme')
            : theme === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => {
              initSound();
              play('tap');
              if (opt.id === 'auto') {
                localStorage.removeItem('squadpay_theme');
                const sys = window.matchMedia('(prefers-color-scheme: light)').matches
                  ? 'light'
                  : 'dark';
                document.documentElement.setAttribute('data-theme', sys);
                useTheme.setState({ theme: sys as any });
              } else {
                setTheme(opt.id as any);
              }
            }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition"
            style={{
              background: isActive ? 'var(--marigold, #f5a623)' : 'transparent',
              color: isActive ? '#0e0c0a' : 'var(--text-dim)',
            }}
          >
            <opt.icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
