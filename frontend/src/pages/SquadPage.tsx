import { useEffect, useState, FormEvent, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Copy, Check, Receipt, Handshake, Users as UsersIcon,
         Activity, Trash2, ChevronDown, Clock, BadgeCheck, XCircle,
         Trophy, RefreshCw, Play, Camera, BarChart2, Download, MoreVertical, LogOut, Pencil } from 'lucide-react';
import { api, BASE } from '../lib/api';
import { toRupees, toPaise, timeAgo } from '../lib/money';
import { useAuth } from '../store/auth';
import { Button, Input, Modal, ErrorText, Avatar, FunLoader, ConfettiBurst, Toast, MarqueeTape, SoundToggle, ThemeToggle } from '../components/ui';
import { LINES, pick } from '../lib/hinglish';
import { play, initSound } from '../lib/sound';
import Memories from '../components/Memories';
import MemberSheet from '../components/MemberSheet';
import AddExpenseModal from '../components/AddExpenseModal';
import { NotificationBell } from '../components/NotificationBell';

interface Member { id: string; name: string; avatar_url?: string; upi_id?: string; role: string; xp: number; level: number; level_title: string }
interface Balance { userId: string; name: string; avatarUrl?: string; net: number; totalPaid: number; totalShare: number }
interface Suggestion { from: { userId: string; name: string }; to: { userId: string; name: string; upiId?: string }; amount: number }
interface Pending { id: string; from_user: string; to_user: string; amount: string; method: string; created_at: string; from_name: string; to_name: string }
interface Settlement { id: string; from_name: string; to_name: string; amount: string; method: string; status: string; created_at: string }
interface Expense { id: string; title: string; amount: string; category: string; paid_by: string; paid_by_name: string; expense_date: string; created_by: string; split_type: string; treasury_amount?: string; trip_id?: string | null; participants: { userId: string; name: string; shareAmount: number; shareValue?: number | null }[] }
interface Detail { squad: { id: string; name: string; emoji: string; invite_code: string }; members: Member[]; balances: Balance[]; suggestions: Suggestion[]; pendingSettlements: Pending[]; activity: { action: string; metadata: any; created_at: string; name: string }[] }

const CATS = ['food','travel','movies','fuel','events','shopping','stay','other'] as const;
const CE: Record<string,string> = { food:'🍕',travel:'🚕',movies:'🎬',fuel:'⛽',events:'🎉',shopping:'🛍️',stay:'🏨',other:'📦' };
const PAY_METHODS = [
  { id:'upi',label:'UPI',emoji:'📱',hint:'GPay / PhonePe / Paytm' },
  { id:'cash',label:'Cash',emoji:'💵',hint:'Hand to hand' },
  { id:'card',label:'Card',emoji:'💳',hint:'Debit / credit' },
  { id:'netbanking',label:'Netbanking',emoji:'🏦',hint:'IMPS / transfer' },
] as const;
const MM: Record<string,{label:string;emoji:string}> = {
  upi:{label:'UPI',emoji:'📱'},cash:{label:'Cash',emoji:'💵'},
  card:{label:'Card',emoji:'💳'},netbanking:{label:'Netbanking',emoji:'🏦'},other:{label:'Other',emoji:'💰'}
};

const BORDER = ['bcard-yellow','bcard-pink','bcard-lime','bcard-aqua'];

export default function SquadPage() {
  const { id } = useParams(); const nav = useNavigate(); const { user } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [hasMoreExpenses, setHasMoreExpenses] = useState(false);
  const [loadingMoreExpenses, setLoadingMoreExpenses] = useState(false);
  const [history, setHistory] = useState<Settlement[]>([]);
  const [tab, setTab] = useState<'overview'|'expenses'|'settle'|'members'|'memories'|'fun'>('overview');
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [profileUserId, setProfileUserId] = useState<string|null>(null);
  const [copied, setCopied] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [toast, setToast] = useState<string|null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTypedName, setDeleteTypedName] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [expenseQuery, setExpenseQuery] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[] | null>(null);
  const [filtering, setFiltering] = useState(false);

  const load = useCallback(async () => {
    const [d, e, s] = await Promise.all([
      api<Detail>(`/squads/${id}`),
      api<{ expenses: Expense[]; pagination?: { hasMore: boolean } }>(`/expenses/squad/${id}`),
      api<{settlements:Settlement[]}>(`/settlements/squad/${id}`),
    ]);
    setDetail(d); setExpenses(e.expenses); setHistory(s.settlements);
    setHasMoreExpenses(!!e.pagination?.hasMore);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Fetches the next page of expenses and appends it — keeps the squad
  // detail/balances untouched, only grows the expense list.
  const loadMoreExpenses = async () => {
    if (loadingMoreExpenses) return;
    setLoadingMoreExpenses(true);
    try {
      const nextPage = Math.floor(expenses.length / 50) + 1;
      const e = await api<{ expenses: Expense[]; pagination?: { hasMore: boolean } }>(`/expenses/squad/${id}?page=${nextPage}`);
      setExpenses((prev) => [...prev, ...e.expenses]);
      setHasMoreExpenses(!!e.pagination?.hasMore);
    } finally { setLoadingMoreExpenses(false); }
  };

  // Search/filter — debounced so we're not firing a request per keystroke.
  // No active filters -> null, and the Expenses tab just falls back to the
  // already-loaded, paginated `expenses` list instead of a separate fetch.
  useEffect(() => {
    if (!expenseQuery && !expenseCategory) { setFilteredExpenses(null); return; }
    const t = setTimeout(async () => {
      setFiltering(true);
      try {
        const params = new URLSearchParams();
        if (expenseQuery) params.set('q', expenseQuery);
        if (expenseCategory) params.set('category', expenseCategory);
        params.set('limit', '100');
        const r = await api<{ expenses: Expense[] }>(`/expenses/squad/${id}?${params}`);
        setFilteredExpenses(r.expenses);
      } finally { setFiltering(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [expenseQuery, expenseCategory, id]);

  // Auto-refresh every 30s so payment confirmations appear without manual refresh
  useEffect(() => {
    const interval = setInterval(() => { load(); }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const popToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };
  const celebrate = () => { play('success'); setTimeout(() => play('confetti'), 200); setConfetti(true); popToast(pick(LINES.settled)); setTimeout(() => setConfetti(false), 2200); };
  const expenseToast = () => { play('coin'); popToast(pick(LINES.expenseAdded)); };
  const copyCode = () => { navigator.clipboard.writeText(detail!.squad.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const handleLeaveSquad = async () => {
    setActionLoading(true); setActionError('');
    try {
      await api(`/squads/${id}/leave`, { method: 'POST' });
      nav('/app');
    } catch (e: any) {
      setActionError(e.message || 'Leave nahi ho paya');
      setActionLoading(false);
    }
  };

  const handleDeleteSquad = async () => {
    setActionLoading(true); setActionError('');
    try {
      await api(`/squads/${id}`, { method: 'DELETE' });
      nav('/app');
    } catch (e: any) {
      setActionError(e.message || 'Delete nahi ho paya');
      setActionLoading(false);
    }
  };

  const exportStatement = async () => {
    try {
      const token = localStorage.getItem('squadpay_token');
      const res = await fetch(`${BASE}/expenses/squad/${id}/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${squad.name.replace(/[^a-z0-9]/gi, '-')}-statement.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { setToast('Export nahi ho paya 😅'); }
  };

  if (!detail) return (
    <main className="flex min-h-screen flex-col" style={{ background:'var(--color-ink-950)' }}>
      <MarqueeTape /><div className="flex flex-1 items-center justify-center"><FunLoader /></div>
    </main>
  );
  const { squad, members, balances, suggestions, pendingSettlements, activity } = detail;
  const totalSpend = balances.reduce((s,b) => s + b.totalPaid, 0);
  const myBalance = balances.find((b) => b.userId === user?.id);
  const actionNeeded = pendingSettlements.filter((p) => p.to_user === user?.id).length;
  const isAdmin = members.find((m) => m.id === user?.id)?.role === 'admin';

  const TABS = [
    ['overview','Overview',Activity,0],['expenses','Kharchey',Receipt,0],
    ['settle','Settle',Handshake,actionNeeded],['members','Members',UsersIcon,0],
    ['memories','Memories',Camera,0],['fun','Fun',Trophy,0],
  ] as const;

  // Vibe meter
  const pendingAmt = suggestions.reduce((s,sg) => s + sg.amount, 0);
  const vibe = pendingAmt === 0 ? { label:'Sab theek hai 🧘', color:'var(--color-mint)', pct:100 }
    : pendingAmt < 100000 ? { label:'Thoda hisaab baaki hai', color:'var(--color-marigold)', pct:60 }
    : { label:'Final Boss debt detected 💀', color:'var(--color-rose)', pct:20 };

  return (
    <main className="min-h-screen pb-36 sm:pb-24" style={{ background:'var(--color-ink-950)' }}>
      <ConfettiBurst show={confetti} />
      <Toast msg={toast} />
      <MarqueeTape />

      {/* NAV */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <button onClick={() => nav('/app')} className="flex items-center gap-2 text-sm font-bold" style={{ color:'rgba(var(--rt-bone-rgb),0.6)' }}>
          <ArrowLeft className="h-4 w-4" /> Squads
        </button>
        <div className="flex items-center gap-2">
          <NotificationBell squadId={id} />
          <div className="hidden sm:flex items-center gap-2">
            <ThemeToggle />
            <SoundToggle />
          </div>
          {/* Desktop-only quick buttons — on mobile these (plus Leave/Delete) live in the ⋮ menu instead, since this row overflowed narrow screens */}
          <button onClick={() => setTab('fun')}
            className="hidden sm:inline-flex bbtn bbtn-ghost gap-1.5 px-3 py-1.5 text-xs"><BarChart2 className="h-3.5 w-3.5" /> Analytics</button>
          <button onClick={copyCode}
            className="hidden sm:inline-flex bbtn bbtn-ghost gap-1.5 px-3 py-1.5 text-xs font-mono">
            {copied ? <Check className="h-3.5 w-3.5" style={{color:'var(--color-mint)'}}/> : <Copy className="h-3.5 w-3.5" />}
            {squad.invite_code}
          </button>
          <div className="relative">
            <button onClick={() => { initSound(); play('tap'); setShowMenu(!showMenu); }}
              className="rounded-xl p-2.5 border-2 transition active:scale-90"
              style={{ background:'var(--color-ink-950)', borderColor:'rgba(var(--rt-bone-rgb),0.2)', color:'var(--color-bone)' }} title="Squad options">
              <MoreVertical className="h-4 w-4" />
            </button>
            <AnimatePresence>
              {showMenu && (
                <>
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                    className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <motion.div initial={{opacity:0,y:-8,scale:0.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:0.96}}
                    transition={{type:'spring',damping:25,stiffness:300}}
                    className="absolute right-0 top-12 z-50 w-56 rounded-2xl overflow-hidden"
                    style={{ background:'var(--color-ink-900)', border:'2px solid #f5f0e8', boxShadow:'0 8px 30px rgba(0,0,0,0.4)' }}>
                    <div className="flex sm:hidden items-center justify-center gap-6 py-2.5" style={{ borderBottom:'1px solid rgba(var(--rt-bone-rgb),0.1)' }}>
                      <ThemeToggle />
                      <div style={{ width:'1px', height:'1.25rem', background:'rgba(var(--rt-bone-rgb),0.15)' }} />
                      <SoundToggle />
                    </div>
                    <button onClick={() => { setTab('fun'); setShowMenu(false); }}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-bold sm:hidden"
                      style={{ color:'var(--color-bone)', borderBottom:'1px solid rgba(var(--rt-bone-rgb),0.1)' }}>
                      <BarChart2 className="h-4 w-4" /> Analytics
                    </button>
                    <button onClick={() => { copyCode(); setShowMenu(false); }}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-bold sm:hidden"
                      style={{ color:'var(--color-bone)', borderBottom:'1px solid rgba(var(--rt-bone-rgb),0.1)' }}>
                      <Copy className="h-4 w-4" /> Copy Invite Code
                    </button>
                    <button onClick={() => { exportStatement(); setShowMenu(false); }}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-bold"
                      style={{ color:'var(--color-bone)', borderBottom:'1px solid rgba(var(--rt-bone-rgb),0.1)' }}>
                      <Download className="h-4 w-4" /> Export Statement (CSV)
                    </button>
                    <button onClick={() => { setShowMenu(false); setActionError(''); setConfirmLeave(true); }}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-bold"
                      style={{ color:'var(--color-bone)', borderBottom: isAdmin ? '1px solid rgba(var(--rt-bone-rgb),0.1)' : 'none' }}>
                      <LogOut className="h-4 w-4" /> Leave Squad
                    </button>
                    {isAdmin && (
                      <button onClick={() => { setShowMenu(false); setActionError(''); setDeleteTypedName(''); setConfirmDelete(true); }}
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-bold" style={{ color:'var(--color-hot-pink)' }}>
                        <Trash2 className="h-4 w-4" /> Delete Squad
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      {/* HEADER CARDS */}
      <header className="mx-auto max-w-5xl px-5">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl" style={{ color:'var(--color-bone)' }}>
          {squad.emoji} {squad.name}
        </h1>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label:'Squad spend', value: toRupees(totalSpend), border:'bcard-yellow', valueColor:'var(--color-marigold)', bg:'rgba(245,166,35,0.08)', goTo:'expenses' as const, hint:'Tap to see expenses' },
            { label:'Your position', value: `${(myBalance?.net??0)>=0?'+':'−'}${toRupees(Math.abs(myBalance?.net??0))}`, border:(myBalance?.net??0)>=0?'bcard-lime':'bcard-pink', valueColor:(myBalance?.net??0)>=0?'var(--color-lime)':'var(--color-hot-pink)', sub:(myBalance?.net??0)>=0?'squad owes you':'you owe squad', bg:(myBalance?.net??0)>=0?'rgba(184,240,42,0.08)':'rgba(255,61,110,0.08)', goTo:'settle' as const, hint:'Tap to settle' },
            { label:'Transfers left', value: String(suggestions.length), border:'bcard-aqua', valueColor:'var(--color-aqua)', sub: actionNeeded>0?`${actionNeeded} need your ✓`:undefined, bg:'rgba(0,212,200,0.08)', goTo:'settle' as const, hint:'Tap to settle' },
          ].map((c,i) => (
            <button key={i} onClick={() => setTab(c.goTo)}
              className={`bcard ${c.border} p-3 sm:p-4 text-left w-full transition active:scale-[0.97] hover:opacity-90`}
              style={{ background:(c as any).bg }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'rgba(var(--rt-bone-rgb),0.6)' }}>{c.label}</p>
              <p className="mt-0.5 font-display text-base font-extrabold sm:text-xl" style={{ color:c.valueColor }}>{c.value}</p>
              {c.sub && <p className="text-[9px] font-bold mt-0.5" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>{c.sub}</p>}
              <p className="text-[9px] mt-1 opacity-50" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>{c.hint} →</p>
            </button>
          ))}
        </div>

        {/* Vibe Meter */}
        <div className="mt-3 bcard p-3 flex items-center gap-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider shrink-0" style={{ color:'rgba(var(--rt-bone-rgb),0.7)' }}>🧿 Imaandari</p>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background:'rgba(var(--rt-bone-rgb),0.1)' }}>
            <motion.div initial={{ width:0 }} animate={{ width:`${vibe.pct}%` }} transition={{ duration:1, ease:'easeOut' }}
              className="h-full rounded-full" style={{ background:vibe.color }} />
          </div>
          <p className="text-xs font-bold shrink-0" style={{ color:vibe.color }}>{vibe.label}</p>
        </div>
      </header>

      {/* TABS — desktop */}
      <div className="mx-auto mt-5 hidden max-w-5xl px-5 sm:block">
        <div className="flex gap-1 rounded-2xl p-1" style={{ background:'rgba(var(--rt-bone-rgb),0.05)', border:'2px solid rgba(var(--rt-bone-rgb),0.1)' }}>
          {TABS.map(([t, label, Icon, badge]) => (
            <button key={t} onClick={() => setTab(t as any)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition`}
              style={{ background: tab===t ? 'var(--color-marigold)' : 'transparent', color: tab===t ? 'var(--color-ink-950)' : 'rgba(var(--rt-bone-rgb),0.55)' }}>
              <Icon className="h-3.5 w-3.5" />{label}
              {badge > 0 && <span className="absolute -top-1 right-1 sticker sticker-pink" style={{ fontSize:'0.5rem' }}>{badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* TABS — mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 sm:hidden" style={{ background:'rgba(14,12,10,0.98)', borderTop:'2px solid rgba(var(--rt-bone-rgb),0.12)', paddingBottom:'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-md">
          {TABS.map(([t, label, Icon, badge]) => (
            <button key={t} onClick={() => { initSound(); play('tap'); setTab(t as any); }}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-3 text-[9px] font-bold uppercase"
              style={{ color: tab===t ? 'var(--color-marigold)' : 'rgba(var(--rt-bone-rgb),0.4)' }}>
              <Icon className="h-5 w-5" />{label}
              {badge>0 && <span className="absolute right-1/4 top-1 sticker sticker-pink" style={{ fontSize:'0.45rem' }}>{badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="mx-auto mt-5 max-w-5xl px-5">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.15}}>
            {tab==='overview'  && (
              <div>
                <Overview activity={activity} balances={balances} expenses={expenses} onMemberClick={setProfileUserId} squadId={squad.id} />
                <RecurringSection squadId={squad.id} members={members} />
              </div>
            )}
            {tab==='expenses'  && (
              <div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <input value={expenseQuery} onChange={(e) => setExpenseQuery(e.target.value)}
                    placeholder="🔍 Kharcha dhundo..." className="binput flex-1 min-w-[160px] text-sm" />
                  <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="binput text-sm" style={{ width:'auto' }}>
                    <option value="">Sab categories</option>
                    {Object.entries(CE).map(([cat, emoji]) => <option key={cat} value={cat}>{emoji} {cat}</option>)}
                  </select>
                </div>
                <ExpenseList expenses={filteredExpenses ?? expenses} meId={user?.id} onChanged={load}
                  onAdd={() => setShowAdd(true)} onEdit={setEditingExpense}
                  hasMore={filteredExpenses ? false : hasMoreExpenses}
                  loadingMore={filtering || loadingMoreExpenses}
                  onLoadMore={filteredExpenses ? undefined : loadMoreExpenses} />
              </div>
            )}
            {tab==='settle'    && (
              <div>
                <div className="flex justify-end mb-3">
                  <button onClick={load} className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold" style={{ background:'rgba(var(--rt-bone-rgb),0.08)', color:'rgba(var(--rt-bone-rgb),0.6)', border:'2px solid rgba(var(--rt-bone-rgb),0.12)' }}>
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                  </button>
                </div>
                <Settle suggestions={suggestions} pending={pendingSettlements} history={history} squadId={squad.id} members={members} meId={user?.id} onAction={load} onConfirmed={celebrate} />
              </div>
            )}
            {tab==='members'   && <MemberList members={members} balances={balances} onMemberClick={setProfileUserId} />}
            {tab==='memories'  && <Memories squadId={squad.id} isAdmin={isAdmin} />}
            {tab==='fun'       && <FunTab squadId={squad.id} expenses={expenses} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* FAB */}
      <button onClick={() => { initSound(); play('open'); setShowAdd(true); }}
        className="bbtn bbtn-pink fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 gap-2 px-5 py-3.5 text-sm shadow-2xl sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:right-6">
        <Plus className="h-5 w-5" /> Kharcha Likho
      </button>

      <MemberSheet open={!!profileUserId} onClose={() => setProfileUserId(null)}
        squadId={squad.id} userId={profileUserId} currentUserId={user?.id} />
      <AddExpenseModal open={showAdd || !!editingExpense} onClose={() => { setShowAdd(false); setEditingExpense(null); }}
        squadId={squad.id} members={members} meId={user?.id}
        editingExpense={editingExpense ? {
          ...editingExpense,
          amount: Number(editingExpense.amount),
          treasury_amount: editingExpense.treasury_amount ? Number(editingExpense.treasury_amount) : 0,
          split_type: editingExpense.split_type as 'equal'|'percentage'|'custom'|'shares',
        } : null}
        onCreated={() => { setShowAdd(false); setEditingExpense(null); expenseToast(); load(); }} />

      <Modal open={confirmLeave} onClose={() => { if (!actionLoading) { setConfirmLeave(false); setActionError(''); } }} title="Squad chhodna hai?">
        <p className="text-sm mb-4" style={{ color:'rgba(var(--rt-bone-rgb),0.7)' }}>
          Tum <strong style={{ color:'var(--color-bone)' }}>{squad.emoji} {squad.name}</strong> chhodne wale ho. Dobara join karne ke liye
          tumhe naya invite code chahiye hoga.
        </p>
        <ErrorText msg={actionError} />
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" className="flex-1" onClick={() => { setConfirmLeave(false); setActionError(''); }} disabled={actionLoading}>Cancel</Button>
          <Button variant="danger" className="flex-1" onClick={handleLeaveSquad} disabled={actionLoading}>
            {actionLoading ? 'Leaving...' : 'Haan, Leave Karo'}
          </Button>
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => { if (!actionLoading) { setConfirmDelete(false); setActionError(''); } }} title="Squad delete karna hai?">
        <p className="text-sm mb-3" style={{ color:'rgba(var(--rt-bone-rgb),0.7)' }}>
          Ye <strong style={{ color:'var(--color-hot-pink)' }}>permanent</strong> hai — saare expenses, memories, treasury, aur history
          hamesha ke liye delete ho jayenge. Ye undo nahi ho sakta.
        </p>
        <label className="block mb-1">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>
            Confirm karne ke liye "<strong>{squad.name}</strong>" type karo
          </span>
          <input value={deleteTypedName} onChange={(e) => setDeleteTypedName(e.target.value)}
            placeholder={squad.name} className="binput" />
        </label>
        <ErrorText msg={actionError} />
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" className="flex-1" onClick={() => { setConfirmDelete(false); setActionError(''); }} disabled={actionLoading}>Cancel</Button>
          <Button variant="danger" className="flex-1" onClick={handleDeleteSquad} disabled={actionLoading || deleteTypedName !== squad.name}>
            {actionLoading ? 'Deleting...' : 'Delete Forever'}
          </Button>
        </div>
      </Modal>
    </main>
  );
}

/* ─── OVERVIEW ─── */
function Overview({ activity, balances, expenses, onMemberClick, squadId }: { activity: Detail['activity']; balances: Balance[]; expenses: Expense[]; onMemberClick:(id:string)=>void; squadId:string }) {
  const totalSpend = balances.reduce((s,b) => s + b.totalPaid, 0);
  const byCat: Record<string,number> = {};
  expenses.forEach((e) => { byCat[e.category] = (byCat[e.category]||0) + Number(e.amount); });
  const topCat = Object.entries(byCat).sort((a,b) => b[1]-a[1])[0];
  const fact = useMemo(() => {
    const facts = [
      topCat && totalSpend > 0 ? `${Math.round((topCat[1]/totalSpend)*100)}% paisa ${topCat[0]} mein gaya ${CE[topCat[0]]}` : null,
      `${expenses.length} kharche track huye. Dosti safe hai. 🧘`,
      'Most dangerous phrase: "Main pay kar deta hu." 💀',
      'Savings account tumse milna chahta hai.',
      ...LINES.funStats,
    ].filter(Boolean) as string[];
    return facts[Math.floor(Date.now() / 60000) % facts.length];
  }, [expenses, totalSpend]);
  const verbs: Record<string,string> = {
    'expense.created':'ne kharcha add kiya','settlement.completed':'ne settle kiya 🤝',
    'squad.created':'ne squad banaya 🎉','member.joined':'squad mein aaya 👋',
  };
  return (
    <div className="space-y-4">
      {/* Treasury quick-access */}
      <div onClick={() => { window.location.href=`/app/squad/${squadId}/treasury`; }} className="bcard bcard-aqua flex items-center justify-between gap-3 p-4 transition hover:opacity-90 active:scale-[0.98] cursor-pointer" style={{ background:'rgba(0,212,200,0.08)' }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏦</span>
          <div>
            <p className="font-display text-sm font-extrabold" style={{ color:'var(--color-bone)' }}>Squad Treasury</p>
            <p className="text-[11px]" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Contributions, spending, analytics</p>
          </div>
        </div>
        <span className="font-display font-extrabold" style={{ color:'var(--color-aqua)' }}>View →</span>
      </div>

      <div onClick={() => { window.location.href=`/app/squad/${squadId}/trips`; }} className="bcard bcard-pink flex items-center justify-between gap-3 p-4 transition hover:opacity-90 active:scale-[0.98] cursor-pointer" style={{ background:'rgba(255,61,110,0.08)' }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧳</span>
          <div>
            <p className="font-display text-sm font-extrabold" style={{ color:'var(--color-bone)' }}>Trips</p>
            <p className="text-[11px]" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Goa trip, movie night — sab alag alag</p>
          </div>
        </div>
        <span className="font-display font-extrabold" style={{ color:'var(--color-hot-pink)' }}>View →</span>
      </div>

      {/* Fun fact ticker */}
      <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background:'rgba(245,166,35,0.18)', border:'2px solid #f5a623', boxShadow:'4px 4px 0 rgba(245,166,35,0.3)' }}>
        <span className="text-xl shrink-0">💡</span>
        <p className="text-sm font-bold" style={{ color:'var(--color-bone)' }}>{fact}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bcard p-5">
          <h3 className="font-display text-sm font-extrabold mb-4" style={{ color:'var(--color-bone)' }}>Recent Activity</h3>
          <ul className="space-y-3">
            {activity.length===0 && <p className="text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>Abhi kuch nahi hua — pehla kharcha add karo!</p>}
            {activity.map((a,i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span style={{ color:'rgba(var(--rt-bone-rgb),0.9)' }}>
                  <b>{a.name.split(' ')[0]}</b> {verbs[a.action]||a.action}
                  {a.metadata?.title && <span style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}> · {a.metadata.title}</span>}
                  {a.metadata?.amount && <b style={{ color:'var(--color-marigold)' }}> {toRupees(a.metadata.amount)}</b>}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bcard p-5">
          <h3 className="font-display text-sm font-extrabold mb-4" style={{ color:'var(--color-bone)' }}>Balances</h3>
          <ul className="space-y-3">
            {balances.map((b) => (
              <li key={b.userId} className="flex items-center justify-between">
                <button className="flex items-center gap-2.5 text-sm" onClick={() => { play('open'); onMemberClick(b.userId); }}>
                  <Avatar url={b.avatarUrl} name={b.name} size="h-7 w-7" />{b.name}
                </button>
                <span className="font-display text-sm font-extrabold" style={{ color: b.net>=0?'var(--color-lime)':'var(--color-hot-pink)' }}>
                  {b.net>=0?'+':'−'}{toRupees(Math.abs(b.net))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ─── EXPENSES ─── */
function ExpenseList({ expenses, meId, onChanged, onAdd, onEdit, hasMore, loadingMore, onLoadMore }: { expenses:Expense[]; meId?:string; onChanged:()=>void; onAdd:()=>void; onEdit:(e:Expense)=>void; hasMore?:boolean; loadingMore?:boolean; onLoadMore?:()=>void }) {
  const [openId, setOpenId] = useState<string|null>(null);
  const del = async (id:string) => { if (!confirm('Ye expense delete karein?')) return; await api(`/expenses/${id}`,{method:'DELETE'}); onChanged(); };
  if (expenses.length===0) return (
    <div className="bcard bcard-yellow p-10 text-center">
      <motion.p animate={{ y:[0,-10,0] }} transition={{ repeat:Infinity, duration:2.4 }} className="text-5xl">🧾</motion.p>
      <p className="mt-4 font-display font-extrabold" style={{ color:'var(--color-bone)' }}>Abhi tak koi kharcha nahi hua 😮</p>
      <p className="mt-1.5 mx-auto max-w-xs text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Ya toh squad responsible hai ya outing hui hi nahi.</p>
      <button onClick={onAdd} className="bbtn mt-5">➕ Pehla Kharcha Likho</button>
    </div>
  );
  return (
    <div className="space-y-3">
      {expenses.map((e,i) => (
        <div key={e.id} className={`bcard ${BORDER[i%4]} overflow-hidden`}>
          <button onClick={() => setOpenId(openId===e.id?null:e.id)} className="flex w-full items-center gap-3 p-4 text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background:'rgba(var(--rt-bone-rgb),0.1)' }}>{CE[e.category]}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-bold" style={{ color:'var(--color-bone)' }}>{e.title}</p>
              <p className="text-xs" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>{e.paid_by_name.split(' ')[0]} ne diya · {e.split_type} split</p>
            </div>
            <p className="font-display font-extrabold" style={{ color:'var(--color-marigold)' }}>{toRupees(Number(e.amount))}</p>
            <ChevronDown className={`h-4 w-4 shrink-0 transition ${openId===e.id?'rotate-180':''}`} style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }} />
          </button>
          <AnimatePresence>
            {openId===e.id && (
              <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden">
                <div className="px-4 py-3" style={{ borderTop:'2px solid rgba(var(--rt-bone-rgb),0.1)' }}>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>Kisne kitna uthaya</p>
                  <ul className="space-y-1.5">
                    {(e.participants||[]).map((p) => (
                      <li key={p.userId} className="flex justify-between text-sm">
                        <span style={{ color:'rgba(var(--rt-bone-rgb),0.9)' }}>{p.name.split(' ')[0]}{p.userId===e.paid_by&&<span className="sticker ml-2">PAID</span>}</span>
                        <span className="font-bold" style={{ color:'var(--color-bone)' }}>{toRupees(p.shareAmount)}</span>
                      </li>
                    ))}
                  </ul>
                  {e.created_by===meId && (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => onEdit(e)} className="bbtn bbtn-ghost gap-1.5 px-3 py-1.5 text-xs">
                        <Pencil className="h-3.5 w-3.5" /> Edit karo
                      </button>
                      <button onClick={() => del(e.id)} className="bbtn bbtn-pink gap-1.5 px-3 py-1.5 text-xs">
                        <Trash2 className="h-3.5 w-3.5" /> Delete karo
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
      {hasMore && (
        <button onClick={onLoadMore} disabled={loadingMore}
          className="bbtn bbtn-ghost w-full justify-center gap-2 py-3 text-sm disabled:opacity-50">
          {loadingMore ? 'Load ho raha hai...' : '⬇️ Aur purane kharche dekho'}
        </button>
      )}
    </div>
  );
}

/* ─── RECURRING EXPENSES ─── */
interface RecurringItem {
  id: string; title: string; amount: number; category: string;
  paid_by: string; paid_by_name: string; day_of_month: number; active: boolean; next_run_date: string;
}
function RecurringSection({ squadId, members }: { squadId: string; members: Member[] }) {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', category: 'other', paidBy: '', dayOfMonth: '1' });
  const [err, setErr] = useState('');

  const load = () => api<{ recurring: RecurringItem[] }>(`/recurring/squad/${squadId}`).then((d) => setItems(d.recurring)).catch(() => {});
  useEffect(() => { load(); }, [squadId]);

  const submit = async () => {
    setErr('');
    const amt = Math.round(parseFloat(form.amount) * 100);
    if (!form.title.trim() || !amt || amt <= 0 || !form.paidBy) { setErr('Sab fields bharo'); return; }
    setLoading(true);
    try {
      await api('/recurring', { method: 'POST', body: JSON.stringify({ squadId, title: form.title, amount: amt, category: form.category, paidBy: form.paidBy, dayOfMonth: parseInt(form.dayOfMonth, 10) }) });
      setShowAdd(false); setForm({ title: '', amount: '', category: 'other', paidBy: '', dayOfMonth: '1' });
      load();
    } catch (e: any) { setErr(e.message || 'Add nahi hua'); }
    finally { setLoading(false); }
  };

  const toggle = async (id: string) => { await api(`/recurring/${id}/toggle`, { method: 'PATCH' }); load(); };
  const remove = async (id: string) => { if (!confirm('Ye recurring expense hatana hai?')) return; await api(`/recurring/${id}`, { method: 'DELETE' }); load(); };

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="sticker">🔁 Recurring Kharche</p>
        <button onClick={() => setShowAdd(true)} className="bbtn bbtn-ghost gap-1.5 px-3 py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Add</button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: 'rgba(var(--rt-bone-rgb),0.4)' }}>Rent, WiFi, subscriptions — jo har mahine aata hai, wo yaha daal do. Auto-add ho jayega.</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="bcard flex items-center gap-3 p-3" style={r.active ? undefined : { opacity: 0.5 }}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: 'rgba(var(--rt-bone-rgb),0.1)' }}>{CE[r.category]}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold" style={{ color: 'var(--color-bone)' }}>{r.title}</p>
                <p className="text-[11px]" style={{ color: 'rgba(var(--rt-bone-rgb),0.5)' }}>Har mahine {r.day_of_month} tareek ko · {r.paid_by_name.split(' ')[0]} pays</p>
              </div>
              <p className="font-display font-bold text-sm" style={{ color: 'var(--color-marigold)' }}>{toRupees(Number(r.amount))}</p>
              <button onClick={() => toggle(r.id)} title={r.active ? 'Pause' : 'Resume'} className="rounded-lg p-1.5" style={{ color: 'rgba(var(--rt-bone-rgb),0.5)' }}>
                {r.active ? '⏸️' : '▶️'}
              </button>
              <button onClick={() => remove(r.id)} className="rounded-lg p-1.5" style={{ color: 'var(--color-hot-pink)' }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setErr(''); }} title="Recurring kharcha add karo 🔁">
        <div className="space-y-3">
          <Input label="Title" placeholder="e.g. Rent, WiFi" value={form.title} onChange={(e:any) => setForm({ ...form, title: e.target.value })} />
          <Input label="Amount (₹)" placeholder="1500" type="number" value={form.amount} onChange={(e:any) => setForm({ ...form, amount: e.target.value })} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="binput">
            {Object.entries(CE).map(([cat, emoji]) => <option key={cat} value={cat}>{emoji} {cat}</option>)}
          </select>
          <select value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })} className="binput">
            <option value="">Kaun pay karta hai?</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} className="binput">
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Har mahine {d} tareek</option>)}
          </select>
          <ErrorText msg={err} />
          <Button onClick={submit} disabled={loading} className="w-full justify-center">{loading ? 'Adding...' : 'Add Karo'}</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ─── SETTLE ─── */
function Settle({ suggestions, pending, history, squadId, members, meId, onAction, onConfirmed }: {
  suggestions:Suggestion[]; pending:Pending[]; history:Settlement[]; squadId:string; members:Member[]; meId?:string; onAction:()=>void; onConfirmed:()=>void;
}) {
  const [busy, setBusy] = useState<string|null>(null);
  const [choosing, setChoosing] = useState<Suggestion|null>(null);
  const [reminded, setReminded] = useState<Record<string, number>>({});
  const nagLine = useMemo(() => pick(LINES.pending), [suggestions.length]);
  const incoming = pending.filter((p) => p.to_user===meId);
  const outgoing = pending.filter((p) => p.from_user===meId);
  const hasPending = (s:Suggestion) => pending.some((p) => p.from_user===s.from.userId && p.to_user===s.to.userId);

  const remind = async (s: Suggestion) => {
    const key = `${s.from.userId}-${s.to.userId}`;
    setReminded((r) => ({ ...r, [key]: Date.now() }));
    try {
      await api('/settlements/remind', { method: 'POST', body: JSON.stringify({ squadId, toUser: s.from.userId, amount: s.amount }) });
      play('tap');
    } catch { /* button already shows "sent" state client-side either way */ }
  };
  const REMIND_COOLDOWN_MS = 5 * 60 * 1000; // avoid accidental double-nudges in the same sitting

  const claim = async (s:Suggestion, method:string) => {
    setBusy(`c-${s.to.userId}`);
    try { await api('/settlements',{method:'POST',body:JSON.stringify({squadId,toUser:s.to.userId,amount:s.amount,method})}); setChoosing(null); onAction(); }
    finally { setBusy(null); }
  };
  const respond = async (id:string, action:'confirm'|'deny') => {
    setBusy(id);
    try {
      await api(`/settlements/${id}/${action}`,{method:'PATCH'});
      if (action==='confirm') onConfirmed(); else play('error');
      onAction();
    } finally { setBusy(null); }
  };

  const toMember = (userId:string) => members.find((m) => m.id===userId);

  return (
    <div className="space-y-5">
      {incoming.length>0 && (
        <section>
          <p className="sticker sticker-pink mb-2">⚠️ Tumhe confirm karna hai</p>
          <div className="space-y-2">
            {incoming.map((p) => {
              const payer = toMember(p.from_user);
              return (
                <div key={p.id} className="bcard bcard-pink p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar url={payer?.avatar_url} name={p.from_name} size="h-9 w-9" />
                    <div>
                      <p className="text-sm font-bold" style={{ color:'var(--color-bone)' }}><b>{p.from_name.split(' ')[0]}</b> ne {toRupees(Number(p.amount))} diya via {MM[p.method]?.emoji} {MM[p.method]?.label}</p>
                      <p className="text-[11px]" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>{p.method==='cash'?'Pocket check karo bhai':'UPI / bank check karo bhai'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => respond(p.id,'confirm')} disabled={busy===p.id} variant="lime" className="flex-1 justify-center">✓ Mil gaya!</Button>
                    <Button onClick={() => respond(p.id,'deny')} disabled={busy===p.id} variant="danger" className="flex-1 justify-center">✗ Nahi mila</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {outgoing.length>0 && (
        <section>
          <p className="sticker mb-2">⏳ Unka wait hai</p>
          <div className="space-y-2">
            {outgoing.map((p) => (
              <div key={p.id} className="bcard flex items-center justify-between p-4">
                <p className="text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.9)' }}>Tum → <b>{p.to_name.split(' ')[0]}</b> · {toRupees(Number(p.amount))}</p>
                <span className="text-[11px]" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>⏳ {timeAgo(p.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center gap-3 mb-2">
          <p className="sticker sticker-lime">Smartest settlement</p>
          {suggestions.length>0 && <p className="text-xs italic" style={{ color:'var(--color-marigold)' }}>"{nagLine}"</p>}
        </div>
        {suggestions.length===0 ? (
          <div className="bcard bcard-lime p-10 text-center">
            <p className="text-4xl">🧘</p>
            <p className="mt-2 font-display font-bold" style={{ color:'var(--color-bone)' }}>Sab settled. Squad at peace.</p>
            <p className="mt-1 text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Karz mukt jeevan mubarak ho.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s,i) => {
              const receiverMember = members.find((m) => m.id===s.to.userId);
              return (
                <div key={i} className={`bcard ${BORDER[i%4]} flex flex-wrap items-center gap-3 p-4`}>
                  <p className="min-w-0 flex-1 text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.9)' }}>
                    <b>{s.from.name.split(' ')[0]}</b> pays <b>{s.to.name.split(' ')[0]}</b>
                  </p>
                  <p className="font-display font-extrabold" style={{ color:'var(--color-aqua)' }}>{toRupees(s.amount)}</p>
                  {s.from.userId===meId && (hasPending(s)
                    ? <span className="text-xs" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>⏳ Waiting...</span>
                    : <div className="flex gap-2">
                        {receiverMember?.upi_id && (
                          <a href={`upi://pay?pa=${receiverMember.upi_id}&am=${(s.amount/100).toFixed(2)}&tn=SquadPay`}
                            className="bbtn bbtn-lime gap-1.5 px-3 py-2 text-xs" onClick={() => setTimeout(() => setChoosing(s), 1200)}>
                            📱 Pay via UPI
                          </a>
                        )}
                        <Button onClick={() => setChoosing(s)} disabled={busy===`c-${s.to.userId}`}>I've paid 💸</Button>
                      </div>
                  )}
                  {s.to.userId===meId && s.from.userId!==meId && !hasPending(s) && (() => {
                    const key = `${s.from.userId}-${s.to.userId}`;
                    const justReminded = !!reminded[key] && Date.now() - reminded[key] < REMIND_COOLDOWN_MS;
                    return (
                      <button onClick={() => remind(s)} disabled={justReminded}
                        className="bbtn bbtn-ghost gap-1.5 px-3 py-2 text-xs" style={justReminded ? { opacity: 0.5 } : undefined}>
                        {justReminded ? '✓ Reminder bheja' : '🔔 Yaad dilao'}
                      </button>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {history.length>0 && (
        <section>
          <p className="sticker sticker-aqua mb-2">History</p>
          <div className="bcard divide-y" >
            {history.slice(0,8).map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span style={{ color:'rgba(var(--rt-bone-rgb),0.9)' }}>{h.from_name.split(' ')[0]} → {h.to_name.split(' ')[0]} <span style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>{MM[h.method]?.emoji}</span></span>
                <span className="flex items-center gap-2">
                  <b style={{ color:'var(--color-bone)' }}>{toRupees(Number(h.amount))}</b>
                  {h.status==='completed'&&<BadgeCheck className="h-4 w-4" style={{color:'var(--color-mint)'}}/>}
                  {h.status==='pending'&&<Clock className="h-4 w-4" style={{color:'var(--color-marigold)'}}/>}
                  {h.status==='cancelled'&&<XCircle className="h-4 w-4" style={{color:'var(--color-rose)'}}/>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal open={!!choosing} onClose={() => setChoosing(null)} title="Kaise pay kiya? 💳">
        {choosing && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.8)' }}>Tum → <b>{choosing.to.name.split(' ')[0]}</b> · <b style={{ color:'var(--color-marigold)' }}>{toRupees(choosing.amount)}</b></p>
            <div className="grid grid-cols-2 gap-2">
              {PAY_METHODS.map((m) => (
                <button key={m.id} onClick={() => claim(choosing,m.id)} disabled={busy!==null}
                  className="bcard p-4 text-left transition active:scale-95 hover:bcard-yellow disabled:opacity-50">
                  <span className="text-2xl">{m.emoji}</span>
                  <p className="mt-1.5 text-sm font-display font-extrabold" style={{ color:'var(--color-bone)' }}>{m.label}</p>
                  <p style={{ fontSize:'0.65rem', color:'rgba(var(--rt-bone-rgb),0.4)' }}>{m.hint}</p>
                </button>
              ))}
            </div>
            <p className="text-center text-[11px]" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>{choosing.to.name.split(' ')[0]} ko confirm karna hoga</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ─── MEMBERS ─── */
function MemberList({ members, balances, onMemberClick }: { members:Member[]; balances:Balance[]; onMemberClick:(id:string)=>void }) {
  const next = [0,500,1500,4000,15000];
  return (
    <div className="space-y-3">
      {members.length===1 && (
        <div className="bcard bcard-pink p-8 text-center">
          <motion.p animate={{ rotate:[0,6,-6,0] }} transition={{ repeat:Infinity, duration:3 }} className="text-5xl">🪑</motion.p>
          <p className="mt-4 font-display font-extrabold" style={{ color:'var(--color-bone)' }}>Squad kaafi silent lag rahi hai.</p>
          <p className="mt-1 text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>Apne dosto ko bulao — invite code upar right mein hai 👆</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m,i) => {
          const bal = balances.find((b) => b.userId===m.id);
          const nx = next.find((n) => n > m.xp) ?? m.xp;
          const pct = Math.min(100, Math.round((m.xp/(nx||1))*100));
          return (
            <button key={m.id} onClick={() => onMemberClick(m.id)} className={`bcard ${BORDER[i%4]} w-full p-5 text-left transition active:scale-[0.98]`}>
              <div className="flex items-center gap-3">
                <Avatar url={m.avatar_url} name={m.name} size="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-extrabold" style={{ color:'var(--color-bone)' }}>
                    {m.name}{m.role==='admin'&&<span className="sticker ml-2">ADMIN</span>}
                  </p>
                  <p className="text-xs font-bold" style={{ color:'var(--color-marigold)' }}>Lv {m.level} · {m.level_title}</p>
                  {m.upi_id && <p className="text-[10px]" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>📱 {m.upi_id}</p>}
                </div>
                <p className="font-display font-extrabold" style={{ color:(bal?.net??0)>=0?'var(--color-lime)':'var(--color-hot-pink)' }}>
                  {(bal?.net??0)>=0?'+':'−'}{toRupees(Math.abs(bal?.net??0))}
                </p>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-[10px] mb-1" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}><span>{m.xp} XP</span><span>next: {nx}</span></div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background:'rgba(var(--rt-bone-rgb),0.1)' }}>
                  <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.8,ease:'easeOut'}}
                    className="h-full rounded-full" style={{ background:'var(--color-marigold)' }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── FUN TAB ─── */
interface Board { title:string; emoji:string; subtitle?:string; entries:{name:string;value:string}[] }
interface Meme { emoji:string; top:string; bottom:string }

function FunTab({ squadId, expenses }: { squadId:string; expenses: any[] }) {
  const nav = useNavigate();
  const [period, setPeriod] = useState<'week'|'all'>('week');
  const [boards, setBoards] = useState<Board[]|null>(null);
  const [exporting, setExporting] = useState(false);
  const medals = ['🥇','🥈','🥉','4.','5.'];
  useEffect(() => { setBoards(null); api<{boards:Board[]}>(`/stats/${squadId}/leaderboards?period=${period}`).then((d) => setBoards(d.boards)); }, [squadId, period]);

  // ── ANALYTICS: compute category breakdown from expenses ──
  const CE: Record<string,string> = { food:'🍕',travel:'🚕',movies:'🎬',fuel:'⛽',events:'🎉',shopping:'🛍️',stay:'🏨',other:'📦' };
  const catTotals = expenses.reduce((acc: Record<string,number>, e) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
    return acc;
  }, {});
  const catSorted = Object.entries(catTotals).sort((a,b) => b[1]-a[1]);
  const totalSpend = catSorted.reduce((s,[,v]) => s+v, 0);

  // ── EXPORT: generate CSV download ──
  const exportCSV = () => {
    setExporting(true);
    try {
      const rows = [
        ['Title','Amount (₹)','Category','Paid By','Date'],
        ...expenses.map(e => [
          e.title,
          (Number(e.amount)/100).toFixed(2),
          e.category,
          e.paid_by_name,
          new Date(e.expense_date).toLocaleDateString('en-IN'),
        ])
      ];
      const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `squadpay-expenses.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bcard bcard-yellow flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="font-display font-extrabold" style={{ color:'var(--color-bone)' }}>📊 Squad Wrapped</h3>
          <p className="text-xs" style={{ color:'rgba(14,12,10,0.7)' }}>Pura financial damage report, Spotify style.</p>
        </div>
        <button onClick={() => nav(`/app/squad/${squadId}/wrapped`)} className="bbtn gap-2"><Play className="h-4 w-4"/>Play Wrapped</button>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="sticker sticker-lime">🏆 Leaderboards</p>
          <div className="flex gap-1 rounded-xl p-1" style={{ background:'rgba(var(--rt-bone-rgb),0.05)', border:'2px solid rgba(var(--rt-bone-rgb),0.1)' }}>
            {(['week','all'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition ${period===p?'bg-marigold text-ink-950':''}`}
                style={{ color: period===p?'var(--color-ink-950)':'rgba(var(--rt-bone-rgb),0.6)' }}>
                {p==='week'?'This week':'All time'}
              </button>
            ))}
          </div>
        </div>
        {!boards ? <FunLoader /> : boards.length===0 ? (
          <div className="bcard p-8 text-center text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>No data {period==='week'?'this week yet 😄':'yet'}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {boards.map((b,bi) => (
              <div key={b.title} className={`bcard ${BORDER[bi%4]} p-4`}>
                <p className="font-display text-sm font-extrabold" style={{ color:'var(--color-bone)' }}>{b.emoji} {b.title}</p>
                {b.subtitle && <p style={{ fontSize:'0.65rem', color:'rgba(var(--rt-bone-rgb),0.4)' }}>{b.subtitle}</p>}
                <ul className="mt-3 space-y-1.5">
                  {b.entries.map((e,i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span style={{ color: i===0?'var(--color-marigold)':'rgba(var(--rt-bone-rgb),0.9)', fontWeight: i===0?800:400 }}>{medals[i]} {e.name}</span>
                      <span className="font-bold" style={{ color: i===0?'var(--color-marigold)':'rgba(var(--rt-bone-rgb),0.7)' }}>{e.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── ANALYTICS DASHBOARD ── */}
      <section>
        <p className="sticker sticker-aqua mb-3">📊 Expense Analytics</p>
        {catSorted.length === 0 ? (
          <div className="bcard p-8 text-center text-sm" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>Koi expense nahi abhi tak 😅</div>
        ) : (
          <div className="bcard p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>Category Breakdown</p>
            {catSorted.map(([cat, amt]) => {
              const pct = Math.round((amt / totalSpend) * 100);
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold" style={{ color:'var(--color-bone)' }}>{CE[cat]||'📦'} {cat}</span>
                    <span className="text-xs font-bold" style={{ color:'var(--color-marigold)' }}>₹{(amt/100).toFixed(0)} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(var(--rt-bone-rgb),0.08)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width:`${pct}%`, background:'var(--color-marigold)' }} />
                  </div>
                </div>
              );
            })}
            <p className="text-xs pt-2 border-t" style={{ color:'rgba(var(--rt-bone-rgb),0.3)', borderColor:'rgba(var(--rt-bone-rgb),0.1)' }}>
              Total: <span style={{ color:'var(--color-marigold)', fontWeight:700 }}>₹{(totalSpend/100).toFixed(0)}</span> across {expenses.length} expenses
            </p>
          </div>
        )}
      </section>

      {/* ── EXPENSE EXPORT ── */}
      <section>
        <p className="sticker sticker-pink mb-3">📥 Expense Export</p>
        <div className="bcard bcard-pink p-5 flex flex-wrap items-center justify-between gap-4" style={{ background:'rgba(255,61,110,0.08)' }}>
          <div>
            <p className="font-display font-extrabold text-sm" style={{ color:'var(--color-bone)' }}>Download Squad Expenses</p>
            <p className="text-xs mt-0.5" style={{ color:'rgba(var(--rt-bone-rgb),0.5)' }}>CSV format — open in Excel, Google Sheets, ya kuch bhi 📊</p>
            <p className="text-xs mt-0.5" style={{ color:'rgba(var(--rt-bone-rgb),0.4)' }}>{expenses.length} expenses ready to export</p>
          </div>
          <button onClick={exportCSV} disabled={exporting || expenses.length === 0}
            className="bbtn bbtn-pink gap-2 disabled:opacity-50">
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Download CSV'}
          </button>
        </div>
      </section>
    </div>
  );
}
