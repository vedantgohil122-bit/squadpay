import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, TrendingUp, History, Users, Wallet, CreditCard, Target, Undo2, Search } from 'lucide-react';
import { api } from '../lib/api';
import { toRupees, toPaise, timeAgo } from '../lib/money';
import { useAuth } from '../store/auth';
import { getSocket } from '../lib/socket';
import { openRazorpayCheckout } from '../lib/razorpay';
import { Button, Input, Modal, ErrorText, Avatar, FunLoader, MarqueeTape, Toast } from '../components/ui';
import { play, initSound } from '../lib/sound';


interface TreasuryData {
  balance: number; totalDeposited: number; totalUsed: number; updatedAt: string;
}
interface Wallet { id: string; name: string; avatar_url?: string; contributed: string }
interface TxLog { id: string; type: string; amount: string; description: string; created_at: string; user_name?: string; payment_order_id?: string | null }
interface Analytics {
  currentBalance: number; topContributor: { name: string; amount: number } | null;
  totalSpentFromTreasury: number;
  memberBreakdown: { name: string; contributed: string }[];
}
interface ContributionMember {
  id: string; name: string; avatar_url?: string; paid: number; required: number; remaining: number;
  status: 'paid' | 'pending' | 'not_paid' | 'no_target';
}

const TYPE_STYLE: Record<string, { emoji: string; color: string }> = {
  deposit:  { emoji: '💰', color: 'var(--color-lime)' },
  expense:  { emoji: '🏦', color: 'var(--color-hot-pink)' },
  reversal: { emoji: '↩️', color: 'var(--color-marigold)' },
  refund:   { emoji: '↩️', color: 'var(--color-rose)' },
};
const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  paid:     { label: 'PAID',     color: 'var(--color-lime)',     bg: 'rgba(184,240,42,0.12)' },
  pending:  { label: 'PENDING',  color: 'var(--color-marigold)', bg: 'rgba(245,166,35,0.12)' },
  not_paid: { label: 'NOT PAID', color: 'var(--color-hot-pink)', bg: 'rgba(255,61,110,0.1)' },
  no_target:{ label: 'NO TARGET SET', color: 'rgba(var(--rt-bone-rgb),0.4)', bg: 'rgba(var(--rt-bone-rgb),0.04)' },
};

export default function TreasuryPage() {
  const { id } = useParams(); const nav = useNavigate();
  const { user } = useAuth();
  const [treasury, setTreasury] = useState<TreasuryData | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [history, setHistory] = useState<TxLog[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tab, setTab] = useState<'overview'|'members'|'contributions'|'history'|'analytics'>('overview');
  const [showContribute, setShowContribute] = useState(false);
  const [amount, setAmount] = useState(''); const [note, setNote] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string|null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Live online payment flow
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payStatus, setPayStatus] = useState<'idle'|'checkout'|'verifying'|'error'>('idle');
  const [payError, setPayError] = useState('');

  // Contribution tracking
  const [contributions, setContributions] = useState<{ target: number|null; members: ContributionMember[] } | null>(null);
  const [showTarget, setShowTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');

  // History search/filter
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<string>('');

  const load = async () => {
    const [t, a, sq] = await Promise.all([
      api<{ treasury: TreasuryData; wallets: Wallet[]; history: TxLog[] }>(`/treasury/${id}`),
      api<{ analytics: Analytics }>(`/treasury/${id}/analytics`),
      api<{ squad: any; members: any[] }>(`/squads/${id}`),
    ]);
    setTreasury(t.treasury); setWallets(t.wallets); setHistory(t.history); setAnalytics(a.analytics);
    setIsAdmin(sq.members?.find((m: any) => m.id === user?.id)?.role === 'admin');
  };
  const loadContributions = () => api<{ target: number|null; members: ContributionMember[] }>(`/payments/treasury/${id}/contributions`).then(setContributions).catch(() => {});

  useEffect(() => { load(); loadContributions(); }, [id]);

  // Live updates: join this squad's room, and when the backend confirms a
  // verified payment (via the webhook, never the frontend), merge it
  // straight into state — balance and the transaction list update
  // instantly for everyone currently viewing this page, no refresh needed.
  useEffect(() => {
    if (!id) return;
    const socket = getSocket();
    socket.emit('join-squad', id);

    const onUpdate = (payload: { transaction: TxLog; newBalance: number; userName?: string }) => {
      setTreasury((t) => t ? { ...t, balance: payload.newBalance, totalDeposited: t.totalDeposited + Number(payload.transaction.amount) } : t);
      setHistory((h) => [payload.transaction, ...h]);
      setToast(`💳 ${payload.userName || 'Someone'} paid ${toRupees(Number(payload.transaction.amount))}`);
      setTimeout(() => setToast(null), 4000);
      loadContributions();
    };
    const onRefund = () => load();

    socket.on('treasury:update', onUpdate);
    socket.on('treasury:refund', onRefund);
    return () => {
      socket.emit('leave-squad', id);
      socket.off('treasury:update', onUpdate);
      socket.off('treasury:refund', onRefund);
    };
  }, [id]);

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

  // The online-payment counterpart to `contribute` above. Crucially, this
  // function never credits anything itself — even after Razorpay's
  // checkout reports success client-side, all this does is show
  // "Verifying..." and wait. The treasury balance only actually moves once
  // the backend webhook fires and the socket broadcast (see the useEffect
  // above) confirms it — that's what finally closes this modal.
  const payOnline = async () => {
    setPayError(''); setPayStatus('checkout');
    try {
      const amt = toPaise(payAmount);
      if (!amt || amt < 100) throw new Error('Minimum ₹1 hai');
      const { order } = await api<{ order: { id: string; providerOrderId: string; amount: number; keyId: string } }>(
        '/payments/treasury/create-order', { method: 'POST', body: JSON.stringify({ squadId: id, amount: amt }) }
      );
      if (!order.keyId) throw new Error('Online payments abhi configure nahi hain');

      await openRazorpayCheckout({
        keyId: order.keyId, amount: order.amount, orderId: order.providerOrderId,
        description: 'Squad Treasury contribution', prefillName: user?.name,
      });

      // Checkout reported success — but per the flow's own rules, that's
      // just a hint, not proof. Poll the order's real status (backend
      // truth) as a fallback in case the socket event is missed, while the
      // socket listener above is the primary path that closes this out.
      setPayStatus('verifying');
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const s = await api<{ status: string }>(`/payments/treasury/order/${order.id}/status`);
          if (s.status === 'paid') {
            clearInterval(poll);
            play('success'); setShowPay(false); setPayAmount(''); setPayStatus('idle');
            load(); loadContributions();
          } else if (s.status === 'failed' || attempts > 20) {
            clearInterval(poll);
            setPayStatus('error'); setPayError(s.status === 'failed' ? 'Payment fail ho gaya' : 'Verification mein time lag raha hai — thodi der mein check karo');
          }
        } catch { /* keep polling, transient network errors shouldn't abort verification */ }
      }, 2500);
    } catch (err: any) {
      if (err.message === 'cancelled') { setPayStatus('idle'); return; }
      setPayStatus('error'); setPayError(err.message || 'Kuch gadbad ho gayi');
    }
  };

  const setTarget = async () => {
    try {
      await api(`/payments/treasury/${id}/contribution-target`, { method: 'POST', body: JSON.stringify({ amount: targetInput ? toPaise(targetInput) : null }) });
      setShowTarget(false); loadContributions();
    } catch (err: any) { setError(err.message); }
  };

  const refund = async (txnId: string) => {
    if (!confirm('Ye payment refund karna hai? Ye undo nahi ho sakta.')) return;
    try {
      await api(`/payments/treasury/refund/${txnId}`, { method: 'POST' });
      setToast('Refund process ho gaya ↩️'); setTimeout(() => setToast(null), 3000);
      load();
    } catch (err: any) { setToast(err.message); setTimeout(() => setToast(null), 3000); }
  };

  const usagePct = treasury && treasury.totalDeposited > 0
    ? Math.round((treasury.totalUsed / treasury.totalDeposited) * 100) : 0;

  if (!treasury) return (
    <main className="flex min-h-screen flex-col" style={{ background:'var(--color-ink-950)' }}>
      <MarqueeTape /><div className="flex flex-1 items-center justify-center"><FunLoader /></div>
    </main>
  );

  const TABS = [
    ['overview','Overview', TrendingUp],['members','Members',Users],
    ['contributions','Targets',Target],
    ['history','History',History],['analytics','Analytics',Wallet],
  ] as const;

  return (
    <main className="min-h-screen pb-24" style={{ background:'var(--color-ink-950)' }}>
      <Toast msg={toast} />
      <MarqueeTape />

      {/* NAV */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <button onClick={() => nav(`/app/squad/${id}`)} className="flex items-center gap-2 text-sm font-bold" style={{ color:'rgba(var(--rt-bone-rgb),0.6)' }}>
          <ArrowLeft className="h-4 w-4" /> Back to Squad
        </button>
        <h1 className="font-display font-extrabold" style={{ color:'var(--color-bone)' }}>🏦 Squad Treasury</h1>
      </nav>

      <section className="mx-auto max-w-5xl px-5">
        {/* HERO BALANCE CARD */}
        <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          className="bcard bcard-yellow p-6 mb-4"
          style={{ background:'rgba(245,166,35,0.12)' }}>
          <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color:'rgba(245,166,35,0.7)' }}>💰 Treasury Balance</p>
          <p className="font-display text-5xl font-extrabold mt-1" style={{ color:'var(--color-marigold)' }}>{toRupees(treasury.balance)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background:'rgba(var(--rt-bone-rgb),0.06)', border:'2px solid rgba(var(--rt-bone-rgb),0.1)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Total Contributed</p>
              <p className="font-display text-lg font-extrabold mt-0.5" style={{ color:'var(--color-lime)' }}>{toRupees(treasury.totalDeposited)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background:'rgba(var(--rt-bone-rgb),0.06)', border:'2px solid rgba(var(--rt-bone-rgb),0.1)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Total Used</p>
              <p className="font-display text-lg font-extrabold mt-0.5" style={{ color:'var(--color-hot-pink)' }}>{toRupees(treasury.totalUsed)}</p>
            </div>
          </div>
          {/* Usage bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] mb-1" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>
              <span>Used {usagePct}%</span><span>Remaining {100-usagePct}%</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background:'rgba(var(--rt-bone-rgb),0.1)' }}>
              <motion.div initial={{ width:0 }} animate={{ width:`${usagePct}%` }} transition={{ duration:1, ease:'easeOut' }}
                className="h-full rounded-full" style={{ background:'linear-gradient(90deg,#b8f02a,#f5a623)' }} />
            </div>
          </div>
        </motion.div>

        {/* TABS */}
        <div className="flex gap-1 rounded-2xl p-1 mb-5" style={{ background:'rgba(var(--rt-bone-rgb),0.05)', border:'2px solid rgba(var(--rt-bone-rgb),0.1)' }}>
          {TABS.map(([t,label,Icon]) => (
            <button key={t} onClick={() => setTab(t as any)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition"
              style={{ background: tab===t?'var(--color-marigold)':'transparent', color: tab===t?'var(--color-ink-950)':'rgba(var(--rt-bone-rgb),0.55)' }}>
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
                    <p className="mt-4 font-display font-extrabold" style={{ color:'var(--color-bone)' }}>Treasury abhi khaali hai!</p>
                    <p className="mt-1 text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Pehla contribution add karo — squad fund shuru karte hain.</p>
                    <button onClick={() => setShowContribute(true)} className="bbtn mt-5">💰 Contribute Karo</button>
                  </div>
                )}
                {/* Recent transactions preview */}
                {history.slice(0,5).map((h) => (
                  <div key={h.id} className="bcard flex items-center gap-3 p-4">
                    <span className="text-2xl">{TYPE_STYLE[h.type]?.emoji || '💰'}</span>
                    <p className="flex-1 text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.9)' }}>{h.description}</p>
                    <div className="text-right">
                      <p className="font-display font-bold" style={{ color: h.type==='deposit'?'var(--color-lime)':'var(--color-hot-pink)' }}>
                        {h.type==='deposit'?'+':'-'}{toRupees(Number(h.amount))}
                      </p>
                      <p className="text-[10px]" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>{timeAgo(h.created_at)}</p>
                    </div>
                  </div>
                ))}
                {history.length === 0 && treasury.totalDeposited > 0 && (
                  <div className="bcard p-8 text-center text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>No transactions yet</div>
                )}
              </div>
            )}

            {tab === 'members' && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>
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
                          <p className="font-display font-bold" style={{ color:'var(--color-bone)' }}>{w.name}</p>
                          <p className="text-xs" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>
                            {contributed > 0 ? `${pct}% of total treasury` : 'Abhi kuch nahi diya 😅'}
                          </p>
                        </div>
                        <p className="font-display font-extrabold" style={{ color: contributed>0?'var(--color-lime)':'rgba(var(--rt-bone-rgb),0.3)' }}>
                          {toRupees(contributed)}
                        </p>
                      </div>
                      {contributed > 0 && (
                        <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(var(--rt-bone-rgb),0.1)' }}>
                          <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.8, delay:i*0.1 }}
                            className="h-full rounded-full" style={{ background:'var(--color-marigold)' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'contributions' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>
                    {contributions?.target ? `Target: ${toRupees(contributions.target)} per member` : 'Koi target set nahi hai'}
                  </p>
                  {isAdmin && (
                    <button onClick={() => { setTargetInput(contributions?.target ? (contributions.target/100).toString() : ''); setShowTarget(true); }}
                      className="bbtn bbtn-ghost gap-1.5 px-3 py-1.5 text-xs"><Target className="h-3.5 w-3.5" /> Set Target</button>
                  )}
                </div>
                {!contributions ? <FunLoader /> : contributions.members.map((m) => {
                  const st = STATUS_STYLE[m.status];
                  const pct = m.required > 0 ? Math.min(100, Math.round((m.paid / m.required) * 100)) : 0;
                  return (
                    <div key={m.id} className="bcard p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <Avatar url={m.avatar_url} name={m.name} size="h-9 w-9" />
                        <div className="flex-1 min-w-0">
                          <p className="font-display font-bold text-sm truncate" style={{ color:'var(--color-bone)' }}>{m.name}</p>
                          {m.required > 0 && (
                            <p className="text-xs" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>{toRupees(m.paid)} / {toRupees(m.required)}</p>
                          )}
                        </div>
                        <span className="sticker" style={{ background: st.color, color: 'var(--color-ink-950)', transform: 'none' }}>{st.label}</span>
                      </div>
                      {m.required > 0 && (
                        <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(var(--rt-bone-rgb),0.1)' }}>
                          <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.6 }}
                            className="h-full rounded-full" style={{ background: st.color }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'history' && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 mb-1">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }} />
                    <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search transactions..." className="binput pl-9 text-sm" />
                  </div>
                  <select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)} className="binput text-sm" style={{ width:'auto' }}>
                    <option value="">Sab types</option>
                    <option value="deposit">Deposits</option>
                    <option value="expense">Spent</option>
                    <option value="refund">Refunds</option>
                    <option value="reversal">Reversals</option>
                  </select>
                </div>
                {(() => {
                  const filtered = history.filter((h) =>
                    (!historyStatus || h.type === historyStatus) &&
                    (!historySearch || h.description.toLowerCase().includes(historySearch.toLowerCase()) || h.user_name?.toLowerCase().includes(historySearch.toLowerCase()))
                  );
                  if (filtered.length === 0) return (
                    <div className="bcard p-10 text-center">
                      <p className="text-4xl">📋</p>
                      <p className="mt-3 font-display font-bold" style={{ color:'var(--color-bone)' }}>Koi history nahi mili</p>
                      <p className="mt-1 text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>
                        {history.length === 0 ? 'Contribution add karo to history yahan dikhegi' : 'Filters try karo'}
                      </p>
                    </div>
                  );
                  return filtered.map((h, i) => (
                    <motion.div key={h.id} initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.03 }}>
                      <div className="bcard flex items-center gap-3 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xl shrink-0"
                          style={{ background:'rgba(var(--rt-bone-rgb),0.06)', border:'2px solid rgba(var(--rt-bone-rgb),0.1)' }}>
                          {TYPE_STYLE[h.type]?.emoji || '💰'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color:'rgba(var(--rt-bone-rgb),0.9)' }}>{h.description}</p>
                          <p className="text-[10px] mt-0.5" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>{timeAgo(h.created_at)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-display font-extrabold" style={{ color: TYPE_STYLE[h.type]?.color || 'var(--color-bone)' }}>
                            {h.type==='deposit'?'+':'-'}{toRupees(Number(h.amount))}
                          </p>
                          {isAdmin && h.type === 'deposit' && h.payment_order_id && (
                            <button onClick={() => refund(h.id)} className="mt-1 flex items-center gap-1 text-[10px] font-bold ml-auto" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>
                              <Undo2 className="h-2.5 w-2.5" /> Refund
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ));
                })()}
              </div>
            )}


            {tab === 'analytics' && analytics && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label:'Current Balance', value: toRupees(analytics.currentBalance), color:'var(--color-marigold)', bg:'rgba(245,166,35,0.12)' },
                    { label:'Spent from Treasury', value: toRupees(analytics.totalSpentFromTreasury), color:'var(--color-hot-pink)', bg:'rgba(255,61,110,0.1)' },
                  ].map((s) => (
                    <div key={s.label} className="bcard p-4" style={{ background:s.bg }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>{s.label}</p>
                      <p className="font-display text-xl font-extrabold mt-1" style={{ color:s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {analytics.topContributor && (
                  <div className="bcard bcard-lime p-5 text-center">
                    <p className="text-4xl mb-2">👑</p>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Most Generous</p>
                    <p className="font-display text-xl font-extrabold mt-1" style={{ color:'var(--color-lime)' }}>{analytics.topContributor.name}</p>
                    <p className="text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.6)' }}>{toRupees(analytics.topContributor.amount)} contributed</p>
                  </div>
                )}
                <div className="bcard p-5">
                  <p className="font-display text-sm font-extrabold mb-4" style={{ color:'var(--color-bone)' }}>Member Contributions</p>
                  {analytics.memberBreakdown.map((m, i) => {
                    const total = analytics.memberBreakdown.reduce((s,mb) => s + Number(mb.contributed), 0);
                    const pct = total > 0 ? Math.round((Number(m.contributed)/total)*100) : 0;
                    return (
                      <div key={m.name} className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span style={{ color:'rgba(var(--rt-bone-rgb),0.9)' }}>{m.name}</span>
                          <span className="font-bold" style={{ color:'var(--color-marigold)' }}>{toRupees(Number(m.contributed))}</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(var(--rt-bone-rgb),0.1)' }}>
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

      {/* FAB — online payment is the primary path now, manual/cash logging stays as a secondary option */}
      <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex flex-col items-end gap-2 sm:right-6">
        <button onClick={() => { initSound(); play('open'); setShowPay(true); setPayStatus('idle'); setPayError(''); }}
          className="bbtn bbtn-lime gap-2 px-5 py-3.5 text-sm shadow-2xl">
          <CreditCard className="h-5 w-5" /> Pay Online
        </button>
        <button onClick={() => { initSound(); play('open'); setShowContribute(true); }}
          className="bbtn bbtn-ghost gap-2 px-4 py-2.5 text-xs shadow-xl" style={{ background:'var(--color-ink-900)' }}>
          <Plus className="h-4 w-4" /> Log Cash Contribution
        </button>
      </div>

      {/* CONTRIBUTE MODAL — manual/cash entry, unverified, logged as-is */}
      <Modal open={showContribute} onClose={() => setShowContribute(false)} title="💰 Cash contribution log karo">
        <form onSubmit={contribute} className="space-y-4">
          <div className="bcard p-4 text-center" style={{ background:'rgba(245,166,35,0.1)', borderColor:'rgba(245,166,35,0.4)' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Current Balance</p>
            <p className="font-display text-2xl font-extrabold" style={{ color:'var(--color-marigold)' }}>{toRupees(treasury.balance)}</p>
          </div>
          <p className="text-xs" style={{ color:'rgba(var(--rt-bone-rgb),0.45)' }}>
            Ye cash ya UPI se bahar hue kisi payment ko manually log karne ke liye hai — verified nahi hota, seedha treasury mein add ho jata hai. Card/UPI se abhi pay karna hai to "Pay Online" use karo.
          </p>
          <Input label="Amount (₹)" type="number" step="0.01" min="1" placeholder="500"
            value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Input label="Note (optional)" placeholder="Goa trip ke liye 🏖️"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorText msg={error} />
          <Button type="submit" disabled={busy} className="w-full justify-center py-3">
            {busy ? 'Adding...' : '💰 Log Karo'}
          </Button>
        </form>
      </Modal>

      {/* PAY ONLINE MODAL — real payment via Razorpay, verified server-side by webhook */}
      <Modal open={showPay} onClose={() => { if (payStatus !== 'checkout' && payStatus !== 'verifying') { setShowPay(false); setPayStatus('idle'); } }} title="💳 Treasury ko pay karo">
        {payStatus === 'verifying' ? (
          <div className="py-6 text-center">
            <FunLoader />
            <p className="mt-4 font-display font-bold" style={{ color:'var(--color-bone)' }}>Payment verify ho raha hai...</p>
            <p className="mt-1 text-xs" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Bank confirm karte hi treasury update ho jayegi — thoda wait karo, band mat karo ye screen.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bcard p-4 text-center" style={{ background:'rgba(184,240,42,0.1)', borderColor:'rgba(184,240,42,0.4)' }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Current Balance</p>
              <p className="font-display text-2xl font-extrabold" style={{ color:'var(--color-lime)' }}>{toRupees(treasury.balance)}</p>
            </div>
            <Input label="Amount (₹)" type="number" step="1" min="1" placeholder="500"
              value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            <p className="text-[11px]" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>
              UPI, card ya netbanking se pay karo — Razorpay ka secure checkout khulega. Payment verify hone ke baad hi treasury update hogi.
            </p>
            <ErrorText msg={payError} />
            <Button onClick={payOnline} disabled={!payAmount || payStatus === 'checkout'} className="w-full justify-center py-3">
              {payStatus === 'checkout' ? 'Opening checkout...' : `Pay ${payAmount ? toRupees(toPaise(payAmount)) : '₹0'}`}
            </Button>
          </div>
        )}
      </Modal>

      {/* SET CONTRIBUTION TARGET (admin) */}
      <Modal open={showTarget} onClose={() => setShowTarget(false)} title="🎯 Contribution target set karo">
        <div className="space-y-4">
          <p className="text-xs" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Har member se kitna expect karte ho? Khali chhodo target hatane ke liye.</p>
          <Input label="Amount per member (₹)" type="number" placeholder="500" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} />
          <Button onClick={setTarget} className="w-full justify-center py-3">Save Karo</Button>
        </div>
      </Modal>
    </main>
  );
}
