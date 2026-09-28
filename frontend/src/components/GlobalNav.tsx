import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, Users, Plus, Landmark, Compass, Menu, X, PlusCircle, KeyRound, Wallet, Moon, Sun, Volume2, VolumeX, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useTheme } from '../store/theme';
import { isSoundEnabled, setSoundEnabled, play, initSound } from '../lib/sound';

interface SquadLite { id: string; name: string; emoji: string }

// The squad you most recently opened — set by SquadPage on mount (one line
// added there). Lets Vault/Trips jump straight in from anywhere instead of
// forcing a "pick a squad" step every single time.
const LAST_SQUAD_KEY = 'squadpay_last_squad';
export function rememberLastSquad(id: string) { localStorage.setItem(LAST_SQUAD_KEY, id); }
function getLastSquad(): string | null { return localStorage.getItem(LAST_SQUAD_KEY); }

export default function GlobalNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const { logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [sheet, setSheet] = useState<'squads' | 'more' | 'add' | null>(null);
  const [squads, setSquads] = useState<SquadLite[] | null>(null);

  useEffect(() => {
    if (sheet === 'squads' && !squads) {
      api<{ squads: SquadLite[] }>('/squads').then((d) => setSquads(d.squads)).catch(() => setSquads([]));
    }
  }, [sheet]);

  const go = (path: string) => { setSheet(null); nav(path); };

  const goVault = () => {
    const last = getLastSquad();
    if (last) return go(`/app/squad/${last}/treasury`);
    setSheet('squads'); // no recent squad yet — let them pick one first
  };
  const goTrips = () => {
    const last = getLastSquad();
    if (last) return go(`/app/squad/${last}/trips`);
    setSheet('squads');
  };

  const NAV_ITEMS = [
    { key: 'home', label: 'Home', icon: LayoutGrid, isFab: false, onClick: () => go('/app') },
    { key: 'squads', label: 'Squads', icon: Users, isFab: false, onClick: () => setSheet('squads') },
    { key: 'add', label: '', icon: Plus, isFab: true, onClick: () => setSheet('add') },
    { key: 'vault', label: 'Vault', icon: Landmark, isFab: false, onClick: goVault },
    { key: 'trips', label: 'Trips', icon: Compass, isFab: false, onClick: goTrips },
    { key: 'more', label: 'More', icon: Menu, isFab: false, onClick: () => setSheet('more') },
  ] as const;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-3 mb-3 flex items-center justify-between rounded-2xl px-2 py-2"
          style={{
            background: 'linear-gradient(180deg, rgba(22,19,16,0.97), rgba(14,12,10,0.99))',
            border: '1px solid rgba(var(--rt-bone-rgb),0.1)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            if (item.isFab) {
              return (
                <button key={item.key} onClick={() => { initSound(); play('tap'); item.onClick(); }}
                  className="relative -mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl active:scale-90 transition"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-marigold), var(--color-hot-pink))',
                    boxShadow: '0 6px 20px rgba(255,61,110,0.4)',
                  }}>
                  <Icon className="h-6 w-6" style={{ color: '#0e0c0a' }} strokeWidth={2.5} />
                </button>
              );
            }
            const isActive = item.key === 'home' && loc.pathname === '/app';
            return (
              <button key={item.key} onClick={() => { initSound(); play('tap'); item.onClick(); }}
                className="flex flex-1 flex-col items-center gap-0.5 py-1.5 transition active:scale-95">
                <Icon className="h-5 w-5" style={{ color: isActive ? 'var(--color-marigold)' : 'rgba(var(--rt-bone-rgb),0.55)' }} />
                <span className="text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: isActive ? 'var(--color-marigold)' : 'rgba(var(--rt-bone-rgb),0.45)' }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* SQUADS quick-switcher */}
      <BottomSheet open={sheet === 'squads'} onClose={() => setSheet(null)} title="Tumhare Squads">
        {!squads ? (
          <p className="py-6 text-center text-sm" style={{ color: 'rgba(var(--rt-bone-rgb),0.5)' }}>Loading...</p>
        ) : squads.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'rgba(var(--rt-bone-rgb),0.5)' }}>Koi squad nahi hai abhi — pehle ek banao ya join karo.</p>
        ) : (
          <div className="space-y-2">
            {squads.map((s) => (
              <button key={s.id} onClick={() => { rememberLastSquad(s.id); go(`/app/squad/${s.id}`); }}
                className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition active:scale-[0.98]"
                style={{ background: 'rgba(var(--rt-bone-rgb),0.05)' }}>
                <span className="text-2xl">{s.emoji}</span>
                <span className="font-display font-bold text-sm" style={{ color: 'var(--color-bone)' }}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* ADD quick actions */}
      <BottomSheet open={sheet === 'add'} onClose={() => setSheet(null)} title="Kya karna hai?">
        <div className="space-y-2">
          <button onClick={() => go('/app?action=create')} className="flex w-full items-center gap-3 rounded-xl p-3.5 text-left" style={{ background: 'rgba(var(--rt-bone-rgb),0.05)' }}>
            <PlusCircle className="h-5 w-5" style={{ color: 'var(--color-marigold)' }} />
            <span className="font-display font-bold text-sm" style={{ color: 'var(--color-bone)' }}>Naya Squad Banao</span>
          </button>
          <button onClick={() => go('/app?action=join')} className="flex w-full items-center gap-3 rounded-xl p-3.5 text-left" style={{ background: 'rgba(var(--rt-bone-rgb),0.05)' }}>
            <KeyRound className="h-5 w-5" style={{ color: 'var(--color-aqua)' }} />
            <span className="font-display font-bold text-sm" style={{ color: 'var(--color-bone)' }}>Invite Code se Join Karo</span>
          </button>
          {getLastSquad() && (
            <button onClick={() => go(`/app/squad/${getLastSquad()}?action=add-expense`)} className="flex w-full items-center gap-3 rounded-xl p-3.5 text-left" style={{ background: 'rgba(var(--rt-bone-rgb),0.05)' }}>
              <Wallet className="h-5 w-5" style={{ color: 'var(--color-lime)' }} />
              <span className="font-display font-bold text-sm" style={{ color: 'var(--color-bone)' }}>Kharcha Add Karo</span>
            </button>
          )}
        </div>
      </BottomSheet>

      {/* MORE menu */}
      <BottomSheet open={sheet === 'more'} onClose={() => setSheet(null)} title="More">
        <div className="space-y-2">
          <button onClick={() => go('/app')} className="flex w-full items-center gap-3 rounded-xl p-3.5 text-left" style={{ background: 'rgba(var(--rt-bone-rgb),0.05)' }}>
            <Wallet className="h-5 w-5" style={{ color: 'var(--color-lime)' }} />
            <span className="font-display font-bold text-sm" style={{ color: 'var(--color-bone)' }}>Personal Finance</span>
          </button>
          <button onClick={() => { toggleTheme(); }} className="flex w-full items-center justify-between rounded-xl p-3.5" style={{ background: 'rgba(var(--rt-bone-rgb),0.05)' }}>
            <span className="flex items-center gap-3 font-display font-bold text-sm" style={{ color: 'var(--color-bone)' }}>
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />} Theme
            </span>
            <span className="text-xs font-bold" style={{ color: 'rgba(var(--rt-bone-rgb),0.5)' }}>{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
          <button onClick={() => { const v = !soundOn; setSoundOn(v); setSoundEnabled(v); if (v) { initSound(); play('toggle'); } }}
            className="flex w-full items-center justify-between rounded-xl p-3.5" style={{ background: 'rgba(var(--rt-bone-rgb),0.05)' }}>
            <span className="flex items-center gap-3 font-display font-bold text-sm" style={{ color: 'var(--color-bone)' }}>
              {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />} Sound
            </span>
            <span className="text-xs font-bold" style={{ color: 'rgba(var(--rt-bone-rgb),0.5)' }}>{soundOn ? 'On' : 'Off'}</span>
          </button>
          <button onClick={() => { logout(); nav('/'); }} className="flex w-full items-center gap-3 rounded-xl p-3.5 text-left" style={{ background: 'rgba(255,61,110,0.08)' }}>
            <LogOut className="h-5 w-5" style={{ color: 'var(--color-hot-pink)' }} />
            <span className="font-display font-bold text-sm" style={{ color: 'var(--color-hot-pink)' }}>Logout</span>
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.8)' }} onClick={onClose} />
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl p-5"
            style={{
              background: 'var(--color-ink-900)', border: '2px solid rgba(var(--rt-bone-rgb),0.15)', borderBottom: 'none',
              maxHeight: '75vh', overflowY: 'auto', paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
            }}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-extrabold" style={{ color: 'var(--color-bone)' }}>{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1.5" style={{ color: 'rgba(var(--rt-bone-rgb),0.5)' }}><X className="h-4 w-4" /></button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
