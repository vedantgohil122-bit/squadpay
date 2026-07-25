import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, TrendingUp, History, Users, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { toRupees, toPaise, timeAgo } from '../lib/money';
// import { useAuth } from '../store/auth';
import { Button, Input, Modal, ErrorText, Avatar, FunLoader, MarqueeTape, Toast } from '../components/ui';
import { play, initSound } from '../lib/sound';


interface TreasuryData {
  balance: number; totalDeposited: number; totalUsed: number; updatedAt: string;
}
interface Wallet { id: string; name: string; avatar_url?: string; contributed: string }
interface TxLog { id: string; type: string; amount: string; description: string; created_at: string; user_name?: string }
interface Analytics {
  currentBalance: number; topContributor: { name: string; amount: number } | null;
  totalSpentFromTreasury: number;
  memberBreakdown: { name: string; contributed: string }[];
}

const TYPE_STYLE: Record<string, { emoji: string; color: string }> = {
  deposit:  { emoji: '💰', color: '#b8f02a' },
  expense:  { emoji: '🏦', color: '#ff3d6e' },
  reversal: { emoji: '↩️', color: '#f5a623' },
};

export default function TreasuryPage() {
  const { id } = useParams(); const nav = useNavigate(); 
  const [treasury, setTreasury] = useState<TreasuryData | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [history, setHistory] = useState<TxLog[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tab, setTab] = useState<'overview'|'members'|'history'|'analytics'>('overview');
  const [showContribute, setShowContribute] = useState(false);
  const [amount, setAmount] = useState(''); const [note, setNote] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string|null>(null);

  const load = async () => {
    const [t, a] = await Promise.all([
      api<{ treasury: TreasuryData; wallets: Wallet[]; history: TxLog[] }>(`/treasury/${id}`),
      api<{ analytics: Analytics }>(`/treasury/${id}/analytics`),
    ]);
    setTreasury(t.treasury); setWallets(t.wallets); setHistory(t.history); setAnalytics(a.analytics);
  };
  useEffect(() => { load(); }, [id]);

  const contribute = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
try {
      initSound();
      await api('/treasury/contribute', { method:'POST', body: JSON.stringify({ squadId: id, amount: toPaise(amount), note }) });
      play('success');
      setShowContribute(false); setAmount(''); setNote('');
      setToast('Squad treasury mein paisa aa gaya 💰'); setTimeout(() => setToast(null), 3500);
      load();
    } catch(err: any) { play('error'); setError(err.message); }
    finally { setBusy(false); }
  };

  const usagePct = treasury && treasury.totalDeposited > 0
    ? Math.round((treasury.totalUsed / treasury.totalDeposited) * 100) : 0;

  if (!treasury) return (
    <main className="flex min-h-screen flex-col" style={{ background:'#0e0c0a' }}>
      <MarqueeTape /><div className="flex flex-1 items-center justify-center"><FunLoader /></div>
    </main>
  );

  const TABS = [
    ['overview','Overview', TrendingUp],['members','Members',Users],
    ['history','History',History],['analytics','Analytics',Wallet],
  ] as const;

  return (
    <main className="min-h-screen pb-24" style={{ background:'#0e0c0a' }}>
      <Toast msg={toast} />
      <MarqueeTape />

      {/* NAV */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <button onClick={() => nav(`/app/squad/${id}`)} className="flex items-center gap-2 text-sm font-bold" style={{ color:'rgba(245,240,232,0.6)' }}>
          <ArrowLeft className="h-4 w-4" /> Back to Squad
        </button>
        <h1 className="font-display font-extrabold" style={{ color:'#f5f0e8' }}>🏦 Squad Treasury</h1>
      </nav>

      <section className="mx-auto max-w-5xl px-5">
        {/* HERO BALANCE CARD */}
        <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          className="bcard bcard-yellow p-6 mb-4"
          style={{ background:'rgba(245,166,35,0.12)' }}>
          <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color:'rgba(245,166,35,0.7)' }}>💰 Treasury Balance</p>
          <p className="font-display text-5xl font-extrabold mt-1" style={{ color:'#f5a623' }}>{toRupees(treasury.balance)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background:'rgba(245,240,232,0.06)', border:'2px solid rgba(245,240,232,0.1)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'rgba(245,240,232,0.5)' }}>Total Contributed</p>
              <p className="font-display text-lg font-extrabold mt-0.5" style={{ color:'#b8f02a' }}>{toRupees(treasury.totalDeposited)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background:'rgba(245,240,232,0.06)', border:'2px solid rgba(245,240,232,0.1)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'rgba(245,240,232,0.5)' }}>Total Used</p>
              <p className="font-display text-lg font-extrabold mt-0.5" style={{ color:'#ff3d6e' }}>{toRupees(treasury.totalUsed)}</p>
            </div>
          </div>
          {/* Usage bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] mb-1" style={{ color:'rgba(245,240,232,0.5)' }}>
              <span>Used {usagePct}%</span><span>Remaining {100-usagePct}%</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background:'rgba(245,240,232,0.1)' }}>
              <motion.div initial={{ width:0 }} animate={{ width:`${usagePct}%` }} transition={{ duration:1, ease:'easeOut' }}
                className="h-full rounded-full" style={{ background:'linear-gradient(90deg,#b8f02a,#f5a623)' }} />
            </div>
          </div>
        </motion.div>

        {/* TABS */}
        <div className="flex gap-1 rounded-2xl p-1 mb-5" style={{ background:'rgba(245,240,232,0.05)', border:'2px solid rgba(245,240,232,0.1)' }}>
          {TABS.map(([t,label,Icon]) => (
            <button key={t} onClick={() => setTab(t as any)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition"
              style={{ background: tab===t?'#f5a623':'transparent', color: tab===t?'#0e0c0a':'rgba(245,240,232,0.55)' }}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={{ duration:0.15 }}>

            {tab === 'overview' && (
              <div className="space-y-4">
                {treasury.balance === 0 && treasury.totalDeposited === 0 && (
                  <div className="bcard bcard-pink p-10 text-center">
                    <motion.p animate={{ y:[0,-8,0] }} transition={{ repeat:Infinity, duration:2 }} className="text-5xl">🏦</motion.p>
                    <p className="mt-4 font-display font-extrabold" style={{ color:'#f5f0e8' }}>Treasury abhi khaali hai!</p>
                    <p className="mt-1 text-sm" style={{ color:'rgba(245,240,232,0.5)' }}>Pehla contribution add karo — squad fund shuru karte hain.</p>
                    <button onClick={() => setShowContribute(true)} className="bbtn mt-5">💰 Contribute Karo</button>
                  </div>
                )}
                {/* Recent transactions preview */}
                {history.slice(0,5).map((h) => (
                  <div key={h.id} className="bcard flex items-center gap-3 p-4">
                    <span className="text-2xl">{TYPE_STYLE[h.type]?.emoji || '💰'}</span>
                    <p className="flex-1 text-sm" style={{ color:'rgba(245,240,232,0.9)' }}>{h.description}</p>
                    <div className="text-right">
                      <p className="font-display font-bold" style={{ color: h.type==='deposit'?'#b8f02a':'#ff3d6e' }}>
                        {h.type==='deposit'?'+':'-'}{toRupees(Number(h.amount))}
                      </p>
                      <p className="text-[10px]" style={{ color:'rgba(245,240,232,0.4)' }}>{timeAgo(h.created_at)}</p>
                    </div>
                  </div>
                ))}
                {history.length === 0 && treasury.totalDeposited > 0 && (
                  <div className="bcard p-8 text-center text-sm" style={{ color:'rgba(245,240,232,0.4)' }}>No transactions yet</div>
                )}
              </div>
            )}

            {tab === 'members' && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color:'rgba(245,240,232,0.5)' }}>
                  Squad ke kaunse bhai ne kitna diya 💸
                </p>
                {wallets.map((w,i) => {
                  const contributed = Number(w.contributed);
                  const pct = treasury.totalDeposited > 0 ? Math.round((contributed/treasury.totalDeposited)*100) : 0;
                  return (
                    <div key={w.id} className={`bcard ${['bcard-yellow','bcard-lime','bcard-pink','bcard-aqua'][i%4]} p-4`}>
                      <div className="flex items-center gap-3 mb-3">
                        <Avatar url={w.avatar_url} name={w.name} size="h-10 w-10" />
                        <div className="flex-1">
                          <p className="font-display font-bold" style={{ color:'#f5f0e8' }}>{w.name}</p>
                          <p className="text-xs" style={{ color:'rgba(245,240,232,0.5)' }}>
                            {contributed > 0 ? `${pct}% of total treasury` : 'Abhi kuch nahi diya 😅'}
                          </p>
                        </div>
                        <p className="font-display font-extrabold" style={{ color: contributed>0?'#b8f02a':'rgba(245,240,232,0.3)' }}>
                          {toRupees(contributed)}
                        </p>
                      </div>
                      {contributed > 0 && (
                        <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(245,240,232,0.1)' }}>
                          <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.8, delay:i*0.1 }}
                            className="h-full rounded-full" style={{ background:'#f5a623' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'history' && (
              <div className="space-y-2">
                {history.length === 0 ? (
                  <div className="bcard p-10 text-center">
                    <p className="text-4xl">📋</p>
                    <p className="mt-3 font-display font-bold" style={{ color:'#f5f0e8' }}>Koi history nahi abhi</p>
                    <p className="mt-1 text-sm" style={{ color:'rgba(245,240,232,0.4)' }}>Contribution add karo to history yahan dikhegi</p>
                  </div>
                ) : history.map((h, i) => (
                  <motion.div key={h.id} initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.04 }}>
                    <div className="bcard flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xl shrink-0"
                        style={{ background:'rgba(245,240,232,0.06)', border:'2px solid rgba(245,240,232,0.1)' }}>
                        {TYPE_STYLE[h.type]?.emoji || '💰'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color:'rgba(245,240,232,0.9)' }}>{h.description}</p>
                        <p className="text-[10px] mt-0.5" style={{ color:'rgba(245,240,232,0.4)' }}>{timeAgo(h.created_at)}</p>
                      </div>
                      <p className="font-display font-extrabold shrink-0" style={{ color: TYPE_STYLE[h.type]?.color || '#f5f0e8' }}>
                        {h.type==='deposit'?'+':'-'}{toRupees(Number(h.amount))}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {tab === 'analytics' && analytics && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label:'Current Balance', value: toRupees(analytics.currentBalance), color:'#f5a623', bg:'rgba(245,166,35,0.12)' },
                    { label:'Spent from Treasury', value: toRupees(analytics.totalSpentFromTreasury), color:'#ff3d6e', bg:'rgba(255,61,110,0.1)' },
                  ].map((s) => (
                    <div key={s.label} className="bcard p-4" style={{ background:s.bg }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'rgba(245,240,232,0.5)' }}>{s.label}</p>
                      <p className="font-display text-xl font-extrabold mt-1" style={{ color:s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {analytics.topContributor && (
                  <div className="bcard bcard-lime p-5 text-center">
                    <p className="text-4xl mb-2">👑</p>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color:'rgba(245,240,232,0.5)' }}>Most Generous</p>
                    <p className="font-display text-xl font-extrabold mt-1" style={{ color:'#b8f02a' }}>{analytics.topContributor.name}</p>
                    <p className="text-sm" style={{ color:'rgba(245,240,232,0.6)' }}>{toRupees(analytics.topContributor.amount)} contributed</p>
                  </div>
                )}
                <div className="bcard p-5">
                  <p className="font-display text-sm font-extrabold mb-4" style={{ color:'#f5f0e8' }}>Member Contributions</p>
                  {analytics.memberBreakdown.map((m, i) => {
                    const total = analytics.memberBreakdown.reduce((s,mb) => s + Number(mb.contributed), 0);
                    const pct = total > 0 ? Math.round((Number(m.contributed)/total)*100) : 0;
                    return (
                      <div key={m.name} className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span style={{ color:'rgba(245,240,232,0.9)' }}>{m.name}</span>
                          <span className="font-bold" style={{ color:'#f5a623' }}>{toRupees(Number(m.contributed))}</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(245,240,232,0.1)' }}>
                          <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.8, delay:i*0.1 }}
                            className="h-full rounded-full" style={{ background:`hsl(${i*60},80%,60%)` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* FAB */}
      <button onClick={() => { initSound(); play('open'); setShowContribute(true); }}
        className="bbtn bbtn-lime fixed bottom-6 right-4 z-20 gap-2 px-5 py-3.5 text-sm shadow-2xl sm:right-6">
        <Plus className="h-5 w-5" /> Contribute Karo
      </button>

      {/* CONTRIBUTE MODAL */}
      <Modal open={showContribute} onClose={() => setShowContribute(false)} title="💰 Treasury mein add karo">
        <form onSubmit={contribute} className="space-y-4">
          <div className="bcard p-4 text-center" style={{ background:'rgba(245,166,35,0.1)', borderColor:'rgba(245,166,35,0.4)' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color:'rgba(245,240,232,0.5)' }}>Current Balance</p>
            <p className="font-display text-2xl font-extrabold" style={{ color:'#f5a623' }}>{toRupees(treasury.balance)}</p>
          </div>
          <Input label="Amount (₹)" type="number" step="0.01" min="1" placeholder="500"
            value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Input label="Note (optional)" placeholder="Goa trip ke liye 🏖️"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorText msg={error} />
          <Button type="submit" disabled={busy} className="w-full justify-center py-3">
            {busy ? 'Adding...' : '💰 Contribute Karo'}
          </Button>
        </form>
      </Modal>
    </main>
  );
}
