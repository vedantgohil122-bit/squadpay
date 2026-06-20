import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Volume2, VolumeX } from 'lucide-react';
import { play, initSound, isSoundEnabled, setSoundEnabled } from '../lib/sound';
import { ReactNode, useEffect, useState } from 'react';
import { LINES as HINGLISH_LINES } from '../lib/hinglish';

/* ── LAYOUT ── */
export const Orbs = () => null; // neo-brutalist doesn't need orbs

export const Glass = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`bcard ${className}`}>{children}</div>
);

/* ── BUTTON ── */
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'lime' | 'pink' | 'aqua';
export const Button = ({ children, onClick, type = 'button', variant = 'primary', disabled = false, className = '' }: {
  children: ReactNode; onClick?: () => void; type?: 'button' | 'submit';
  variant?: BtnVariant; disabled?: boolean; className?: string;
}) => {
  const v: Record<BtnVariant, string> = {
    primary: 'bbtn', ghost: 'bbtn bbtn-ghost', danger: 'bbtn bbtn-pink',
    lime: 'bbtn bbtn-lime', pink: 'bbtn bbtn-pink', aqua: 'bbtn bbtn-aqua',
  };
  const handleClick = () => {
    initSound();
    play(variant === 'danger' ? 'delete' : 'click');
    onClick?.();
  };
  return <button type={type} onClick={handleClick} disabled={disabled} className={`${v[variant]} ${className}`}>{children}</button>;
};

/* ── INPUT ── */
export const Input = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-bone/60">{label}</span>
    <input {...props} className="binput" />
  </label>
);

/* ── MODAL ── */
export const Modal = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bcard bcard-yellow w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-bone/50 hover:bg-white/10 hover:text-bone"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
};

/* ── AVATAR ── */
export const Avatar = ({ url, name, size = 'h-9 w-9' }: { url?: string | null; name: string; size?: string }) =>
  url ? <img src={url} alt={name} className={`${size} rounded-full border-2 border-bone/20 bg-ink-800`} />
      : <div className={`${size} flex items-center justify-center rounded-full border-2 border-marigold bg-ink-800 font-display font-extrabold text-marigold`} style={{ fontSize: '0.75rem' }}>{name[0]}</div>;

/* ── SPINNER / FUN LOADER ── */
export const Spinner = () => <Loader2 className="h-5 w-5 animate-spin text-marigold" />;

export const FunLoader = () => {
  const [i, setI] = useState(() => Math.floor(Math.random() * HINGLISH_LINES.loading.length));
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % HINGLISH_LINES.loading.length), 1600); return () => clearInterval(t); }, []);
  return (
    <div className="flex flex-col items-center gap-3 py-14">
      <Loader2 className="h-7 w-7 animate-spin text-marigold" />
      <p className="font-display text-sm font-bold text-bone/60">{HINGLISH_LINES.loading[i]}</p>
    </div>
  );
};

/* ── ERROR ── */
export const ErrorText = ({ msg }: { msg: string }) =>
  msg ? <p className="rounded-xl border-2 border-hot-pink/40 bg-hot-pink/10 px-3 py-2 text-xs font-semibold text-rose">{msg}</p> : null;

/* ── TOAST ── */
export const Toast = ({ msg }: { msg: string | null }) => (
  <AnimatePresence>
    {msg && (
      <motion.div initial={{ opacity: 0, y: -24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }}
        className="fixed inset-x-0 top-14 z-[70] flex justify-center px-4">
        <div className="max-w-sm px-5 py-3.5 text-center font-display text-sm font-bold rounded-2xl shadow-2xl"
          style={{ background:'#f5a623', color:'#0e0c0a', border:'3px solid rgba(0,0,0,0.2)', boxShadow:'0 8px 32px rgba(245,166,35,0.4)' }}>
          {msg}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

/* ── CONFETTI ── */
export const ConfettiBurst = ({ show }: { show: boolean }) => {
  if (!show) return null;
  const bits = ['🎉', '💸', '✨', '🤝', '🪙', '🎊', '💚', '⚡', '🔥', '🍕'];
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.span key={i}
          initial={{ x: '50vw', y: '55vh', opacity: 1, scale: 0.6 }}
          animate={{ x: `${50 + (Math.random() * 90 - 45)}vw`, y: `${Math.random() * 70 - 5}vh`, opacity: 0, scale: 1.6, rotate: Math.random() * 360 }}
          transition={{ duration: 1.4 + Math.random() * 0.8, ease: 'easeOut' }}
          className="absolute text-2xl">{bits[i % bits.length]}</motion.span>
      ))}
    </div>
  );
};

/* ── MARQUEE tape ── */
const TAPE_ITEMS = ['Squad Banao 🔥', 'Kharcha Track Karo 🧾', 'Dosti Bachao 🤝', 'Roast Your Squad 😂', 'Udhaar Hatao 💸', 'Memory Banao 📸', 'Built for Bhailog 👊'];
export const MarqueeTape = () => (
  <div className="marquee-wrap py-1.5">
    <div className="marquee-inner">
      {[...TAPE_ITEMS, ...TAPE_ITEMS].map((t, i) => <span key={i}>• {t}</span>)}
    </div>
  </div>
);


// ── SOUND TOGGLE ──────────────────────────────────────────
export const SoundToggle = ({ className = '' }: { className?: string }) => {
  const [on, setOn] = useState(isSoundEnabled());
  const toggle = () => {
    const next = !on;
    setOn(next);
    setSoundEnabled(next);
    if (next) { initSound(); play('toggle'); }
  };
  return (
    <button onClick={toggle} className={`rounded-lg p-2 transition active:scale-90 ${className}`}
      style={{ color: on ? 'rgba(245,240,232,0.6)' : 'rgba(245,240,232,0.25)' }}
      title={on ? 'Sound on' : 'Sound off'}>
      {on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  );
};
