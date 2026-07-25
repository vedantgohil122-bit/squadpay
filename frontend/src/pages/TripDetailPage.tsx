import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MoreVertical, CheckCircle2, Archive, Trash2, Trophy, Tag, X, Check, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { toRupees, timeAgo } from '../lib/money';
import { Avatar, FunLoader, MarqueeTape } from '../components/ui';
import { play, initSound } from '../lib/sound';
import AddExpenseModal from '../components/AddExpenseModal';
import { useAuth } from '../store/auth';

interface TripDetail {
  trip: { id:string; name:string; emoji:string; status:string; budget?:string; totalSpend:number; budgetUsedPct:number|null; created_at:string };
  expenses: { id:string; title:string; amount:string; category:string; paid_by_name:string; expense_date:string }[];
  photos: { id:string; url:string; caption:string; uploader_name:string; uploader_avatar?:string }[];
  balances: { userId:string; name:string; avatarUrl?:string; totalPaid:number; totalShare:number; net:number }[];
  leaderboard: {
    biggestSpender: { userId:string; name:string; avatarUrl?:string; amount:number } | null;
    mostActive: { userId:string; name:string; avatarUrl?:string; count:number } | null;
    topPhotographer: { userId:string; name:string; avatarUrl?:string; count:number } | null;
  };
}

interface UnassignedExpense { id:string; title:string; amount:string; category:string; expense_date:string; paid_by_name:string }
interface SquadMember { id:string; name:string; avatar_url?:string }

const CE: Record<string,string> = { food:'🍕',travel:'🚕',movies:'🎬',fuel:'⛽',events:'🎉',shopping:'🛍️',stay:'🏨',other:'📦' };

export default function TripDetailPage() {
  const { id, tripId } = useParams(); const nav = useNavigate();
  const [data, setData] = useState<TripDetail | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [unassigned, setUnassigned] = useState<UnassignedExpense[] | null>(null);
  const [tagging, setTagging] = useState<string | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [squadMembers, setSquadMembers] = useState<SquadMember[]>([]);
  const { user } = useAuth();

  const load = () => api<TripDetail>(`/trips/${tripId}`).then(setData);
  useEffect(() => { load(); }, [tripId]);
  useEffect(() => {
    api<{ members: SquadMember[] }>(`/squads/${id}`).then((d) => setSquadMembers(d.members));
  }, [id]);

  const setStatus = async (status: string) => {
    initSound(); play('click');
    await api(`/trips/${tripId}/status`, { method:'PATCH', body: JSON.stringify({ status }) });
    play('success'); setShowMenu(false); load();
  };

  const openTagModal = async () => {
    initSound(); play('open'); setShowTagModal(true); setUnassigned(null);
    const d = await api<{ expenses: UnassignedExpense[] }>(`/trips/squad/${id}/unassigned`);
    setUnassigned(d.expenses);
  };

  const tagExpense = async (expenseId: string) => {
    setTagging(expenseId);
    try {
      await api(`/trips/expense/${expenseId}/assign`, { method:'PATCH', body: JSON.stringify({ tripId }) });
      play('coin');
      setUnassigned((prev) => prev?.filter((e) => e.id !== expenseId) || null);
      load();
    } finally { setTagging(null); }
  };

  const remove = async () => {
    if (!confirm('Trip delete karein? Expenses squad mein wapis chale jayenge.')) return;
    initSound(); play('delete');
    await api(`/trips/${tripId}`, { method:'DELETE' });
    nav(`/app/squad/${id}/trips`);
  };

  if (!data) return (
    <main className="flex min-h-screen flex-col" style={{ background:'#0e0c0a' }}>
      <MarqueeTape /><div className="flex flex-1 items-center justify-center"><FunLoader /></div>
    </main>
  );

  const { trip, expenses, photos, balances, leaderboard } = data;
  const budgetColor = trip.budgetUsedPct === null ? '#00d4c8' : trip.budgetUsedPct > 100 ? '#ff3d6e' : trip.budgetUsedPct > 80 ? '#f5a623' : '#b8f02a';

  return (
    <main className="min-h-screen pb-28" style={{ background:'#0e0c0a' }}>
      <MarqueeTape />
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 relative">
        <button onClick={() => nav(`/app/squad/${id}/trips`)} className="flex items-center gap-2 text-sm font-bold" style={{ color:'rgba(245,240,232,0.6)' }}>
          <ArrowLeft className="h-4 w-4" /> Trips
        </button>
        <button onClick={() => setShowMenu(!showMenu)} className="rounded-lg p-2" style={{ color:'rgba(245,240,232,0.5)' }}>
          <MoreVertical className="h-5 w-5" />
        </button>
        <AnimatePresence>
          {showMenu && (
            <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="absolute right-5 top-14 z-30 w-48 rounded-2xl p-2" style={{ background:'#1a1612', border:'2px solid rgba(245,240,232,0.15)' }}>
              <button onClick={() => { setShowMenu(false); openTagModal(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition hover:bg-white/5" style={{ color:'#00d4c8' }}>
                <Tag className="h-4 w-4" /> Tag Old Expenses
              </button>
              <button onClick={() => setStatus('completed')} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition hover:bg-white/5" style={{ color:'#b8f02a' }}>
                <CheckCircle2 className="h-4 w-4" /> Mark Completed
              </button>
              <button onClick={() => setStatus('archived')} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition hover:bg-white/5" style={{ color:'#f5a623' }}>
                <Archive className="h-4 w-4" /> Archive
              </button>
              <button onClick={remove} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition hover:bg-white/5" style={{ color:'#ff3d6e' }}>
                <Trash2 className="h-4 w-4" /> Delete Trip
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <header className="mx-auto max-w-5xl px-5">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{trip.emoji}</span>
          <div>
            <h1 className="font-display text-2xl font-extrabold sm:text-3xl" style={{ color:'#f5f0e8' }}>{trip.name}</h1>
            {trip.status !== 'active' && <span className="sticker mt-1 inline-block">{trip.status.toUpperCase()}</span>}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="bcard bcard-yellow p-4" style={{ background:'rgba(245,166,35,0.08)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'rgba(245,240,232,0.6)' }}>Total Spend</p>
            <p className="font-display text-xl font-extrabold mt-0.5" style={{ color:'#f5a623' }}>{toRupees(trip.totalSpend)}</p>
          </div>
          <div className="bcard bcard-aqua p-4" style={{ background:'rgba(0,212,200,0.08)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'rgba(245,240,232,0.6)' }}>Budget</p>
            {trip.budget ? (
              <>
                <p className="font-display text-xl font-extrabold mt-0.5" style={{ color:budgetColor }}>{trip.budgetUsedPct}%</p>
                <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background:'rgba(245,240,232,0.1)' }}>
                  <motion.div initial={{ width:0 }} animate={{ width:`${Math.min(100,trip.budgetUsedPct||0)}%` }} transition={{ duration:0.8 }}
                    className="h-full rounded-full" style={{ background:budgetColor }} />
                </div>
              </>
            ) : <p className="font-display text-sm font-bold mt-0.5" style={{ color:'rgba(245,240,232,0.4)' }}>Not set</p>}
          </div>
        </div>

        {/* Balances */}
        {balances.some(b => b.net !== 0) && (
          <div className="bcard mt-4 p-4">
            <p className="font-display text-sm font-extrabold mb-3" style={{ color:'#f5f0e8' }}>Trip Balances</p>
            <div className="space-y-2">
              {balances.map((b) => (
                <div key={b.userId} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm"><Avatar url={b.avatarUrl} name={b.name} size="h-6 w-6" />{b.name.split(' ')[0]}</span>
                  <span className="font-display text-sm font-bold" style={{ color: b.net>=0?'#b8f02a':'#ff3d6e' }}>{b.net>=0?'+':'−'}{toRupees(Math.abs(b.net))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* MINI LEADERBOARD */}
      {(leaderboard?.biggestSpender || leaderboard?.mostActive || leaderboard?.topPhotographer) && (
        <section className="mx-auto max-w-5xl px-5 mt-6">
          <p className="sticker sticker-aqua mb-3 flex items-center gap-1.5 w-fit"><Trophy className="h-3 w-3" /> Trip Leaderboard</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {leaderboard.biggestSpender && (
              <div className="bcard bcard-yellow p-4" style={{ background:'rgba(245,166,35,0.08)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color:'rgba(245,240,232,0.5)' }}>👑 Biggest Spender</p>
                <div className="flex items-center gap-2">
                  <Avatar url={leaderboard.biggestSpender.avatarUrl} name={leaderboard.biggestSpender.name} size="h-8 w-8" />
                  <div>
                    <p className="font-display text-sm font-extrabold" style={{ color:'#f5f0e8' }}>{leaderboard.biggestSpender.name.split(' ')[0]}</p>
                    <p className="text-xs font-bold" style={{ color:'#f5a623' }}>{toRupees(leaderboard.biggestSpender.amount)}</p>
                  </div>
                </div>
              </div>
            )}
            {leaderboard.mostActive && (
              <div className="bcard bcard-lime p-4" style={{ background:'rgba(184,240,42,0.08)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color:'rgba(245,240,232,0.5)' }}>⚡ Most Active</p>
                <div className="flex items-center gap-2">
                  <Avatar url={leaderboard.mostActive.avatarUrl} name={leaderboard.mostActive.name} size="h-8 w-8" />
                  <div>
                    <p className="font-display text-sm font-extrabold" style={{ color:'#f5f0e8' }}>{leaderboard.mostActive.name.split(' ')[0]}</p>
                    <p className="text-xs font-bold" style={{ color:'#b8f02a' }}>{leaderboard.mostActive.count} expenses</p>
                  </div>
                </div>
              </div>
            )}
            {leaderboard.topPhotographer && (
              <div className="bcard bcard-pink p-4" style={{ background:'rgba(255,61,110,0.08)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color:'rgba(245,240,232,0.5)' }}>📸 Top Photographer</p>
                <div className="flex items-center gap-2">
                  <Avatar url={leaderboard.topPhotographer.avatarUrl} name={leaderboard.topPhotographer.name} size="h-8 w-8" />
                  <div>
                    <p className="font-display text-sm font-extrabold" style={{ color:'#f5f0e8' }}>{leaderboard.topPhotographer.name.split(' ')[0]}</p>
                    <p className="text-xs font-bold" style={{ color:'#ff3d6e' }}>{leaderboard.topPhotographer.count} photos</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-5 mt-6">
        {expenses.length === 0 ? (
          <div className="bcard p-8 text-center">
            <p className="text-3xl mb-2">🧾</p>
            <p style={{ color:'rgba(245,240,232,0.4)' }}>Abhi tak koi kharcha is trip mein nahi. Squad page se expense add karte waqt trip select karo.</p>
            <button onClick={openTagModal} className="bbtn bbtn-aqua mt-4 gap-2">
              <Tag className="h-4 w-4" /> Purane kharche tag karo
            </button>
          </div>
        ) : (
          <>
            <p className="sticker sticker-lime mb-3">Trip Expenses</p>
            <div className="space-y-2">
              {expenses.map((e) => (
                <div key={e.id} className="bcard flex items-center gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background:'rgba(245,240,232,0.1)' }}>{CE[e.category]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold text-sm" style={{ color:'#f5f0e8' }}>{e.title}</p>
                    <p className="text-xs" style={{ color:'rgba(245,240,232,0.5)' }}>{e.paid_by_name.split(' ')[0]} ne diya</p>
                  </div>
                  <p className="font-display font-bold" style={{ color:'#f5a623' }}>{toRupees(Number(e.amount))}</p>
                </div>
              ))}
            </div>
            <button onClick={openTagModal} className="mt-3 flex items-center gap-1.5 text-xs font-bold" style={{ color:'#00d4c8' }}>
              <Tag className="h-3.5 w-3.5" /> Aur purane kharche tag karo
            </button>
          </>
        )}

        {photos.length > 0 && (
          <div className="mt-6">
            <p className="sticker sticker-pink mb-3">Trip Memories</p>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <img key={p.id} src={p.url} alt={p.caption||'memory'} className="aspect-square w-full rounded-xl object-cover" style={{ border:'2px solid rgba(245,240,232,0.1)' }} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* TAG OLD EXPENSES MODAL */}
      <AnimatePresence>
        {showTagModal && (
          <>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              className="fixed inset-0 z-40" style={{ background:'rgba(0,0,0,0.75)' }}
              onClick={() => setShowTagModal(false)} />
            <motion.div initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
              transition={{ type:'spring', damping:30, stiffness:340 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl"
              style={{ background:'#1a1612', border:'2px solid rgba(245,240,232,0.15)', borderBottom:'none', maxHeight:'80vh', overflowY:'auto' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full" style={{ background:'rgba(245,240,232,0.2)' }} />
              </div>
              <div className="flex items-center justify-between px-5 pt-2 pb-4">
                <div>
                  <h2 className="font-display text-lg font-extrabold" style={{ color:'#f5f0e8' }}>Purane kharche tag karo</h2>
                  <p className="text-xs" style={{ color:'rgba(245,240,232,0.5)' }}>Squad ke saare untagged expenses yahan hain</p>
                </div>
                <button onClick={() => setShowTagModal(false)} className="rounded-full p-2" style={{ background:'rgba(245,240,232,0.08)', color:'rgba(245,240,232,0.5)' }}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 pb-8 space-y-2">
                {!unassigned ? (
                  <div className="py-10"><FunLoader /></div>
                ) : unassigned.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-3xl mb-2">✅</p>
                    <p className="text-sm" style={{ color:'rgba(245,240,232,0.4)' }}>Sab kharche already kisi trip mein tagged hain!</p>
                  </div>
                ) : unassigned.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-2xl p-3" style={{ background:'rgba(245,240,232,0.05)', border:'2px solid rgba(245,240,232,0.1)' }}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background:'rgba(245,240,232,0.1)' }}>{CE[e.category]||'📦'}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-bold text-sm" style={{ color:'#f5f0e8' }}>{e.title}</p>
                      <p className="text-[11px]" style={{ color:'rgba(245,240,232,0.5)' }}>{e.paid_by_name.split(' ')[0]} · {new Date(e.expense_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</p>
                    </div>
                    <p className="font-display font-bold text-sm shrink-0" style={{ color:'#f5a623' }}>{toRupees(Number(e.amount))}</p>
                    <button onClick={() => tagExpense(e.id)} disabled={tagging===e.id}
                      className="shrink-0 rounded-xl p-2 transition active:scale-90 disabled:opacity-50"
                      style={{ background:'rgba(0,212,200,0.15)', border:'2px solid rgba(0,212,200,0.4)', color:'#00d4c8' }}>
                      {tagging===e.id ? <span className="h-4 w-4 block animate-pulse">...</span> : <Check className="h-4 w-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* TRIP KHARCHA LIKHO FAB — pre-locked to this trip */}
      <button onClick={() => { initSound(); play('open'); setShowAddExpense(true); }}
        className="bbtn bbtn-pink fixed bottom-6 right-4 z-20 gap-2 px-5 py-3.5 text-sm shadow-2xl sm:right-6">
        <Plus className="h-5 w-5" /> Trip Kharcha Likho
      </button>

      <AddExpenseModal
        open={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        squadId={id!}
        members={squadMembers}
        meId={user?.id}
        presetTripId={tripId}
        presetTripLabel={`${trip.emoji} ${trip.name}`}
        onCreated={() => { setShowAddExpense(false); play('coin'); load(); }}
      />
    </main>
  );
}
