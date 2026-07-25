import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, MapPin, Camera, Receipt } from 'lucide-react';
import { api } from '../lib/api';
import { toRupees } from '../lib/money';
import { Button, Input, Modal, ErrorText, FunLoader, MarqueeTape } from '../components/ui';
import { play, initSound } from '../lib/sound';

interface Trip {
  id: string; name: string; emoji: string; status: string;
  start_date?: string; end_date?: string; budget?: string;
  total_spend: string; expense_count: number; photo_count: number; created_at: string;
}

const EMOJIS = ['🧳','🏖️','🏔️','🎉','🚗','✈️','🏕️','🎬'];
const BORDER = ['bcard-yellow','bcard-pink','bcard-lime','bcard-aqua'];

export default function TripsPage() {
  const { id } = useParams(); const nav = useNavigate();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState(''); const [emoji, setEmoji] = useState('🧳');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  const load = () => api<{ trips: Trip[] }>(`/trips/squad/${id}`).then((d) => setTrips(d.trips));
  useEffect(() => { load(); }, [id]);

  const create = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      initSound();
      const d = await api<{ trip: Trip }>('/trips', {
        method: 'POST',
        body: JSON.stringify({ squadId: id, name, emoji, budget: budget ? Math.round(Number(budget)*100) : null }),
      });
      play('success');
      setShowCreate(false); setName(''); setBudget('');
      nav(`/app/squad/${id}/trip/${d.trip.id}`);
    } catch (err: any) { play('error'); setError(err.message); }
    finally { setBusy(false); }
  };

  if (!trips) return (
    <main className="flex min-h-screen flex-col" style={{ background:'#0e0c0a' }}>
      <MarqueeTape /><div className="flex flex-1 items-center justify-center"><FunLoader /></div>
    </main>
  );

  const active = trips.filter(t => t.status === 'active');
  const completed = trips.filter(t => t.status !== 'active');

  return (
    <main className="min-h-screen pb-24" style={{ background:'#0e0c0a' }}>
      <MarqueeTape />
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <button onClick={() => nav(`/app/squad/${id}`)} className="flex items-center gap-2 text-sm font-bold" style={{ color:'rgba(245,240,232,0.6)' }}>
          <ArrowLeft className="h-4 w-4" /> Back to Squad
        </button>
        <h1 className="font-display font-extrabold" style={{ color:'#f5f0e8' }}>🧳 Trips</h1>
      </nav>

      <section className="mx-auto max-w-5xl px-5">
        {trips.length === 0 ? (
          <div className="bcard bcard-yellow p-12 text-center">
            <motion.p animate={{ y:[0,-10,0] }} transition={{ repeat:Infinity, duration:2.2 }} className="text-5xl">🧳</motion.p>
            <h2 className="mt-4 font-display text-lg font-extrabold" style={{ color:'#f5f0e8' }}>Koi trip nahi abhi tak!</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm" style={{ color:'rgba(245,240,232,0.5)' }}>Goa, Manali, ya simple weekend outing — sab trip mein group karo.</p>
            <button onClick={() => { initSound(); play('open'); setShowCreate(true); }} className="bbtn mt-5">🧳 Pehla Trip Banao</button>
          </div>
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <section>
                <p className="sticker sticker-lime mb-3">Active Trips</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {active.map((t,i) => <TripCard key={t.id} trip={t} idx={i} squadId={id!} />)}
                </div>
              </section>
            )}
            {completed.length > 0 && (
              <section>
                <p className="sticker mb-3" style={{ opacity:0.6 }}>Completed</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {completed.map((t,i) => <TripCard key={t.id} trip={t} idx={i} squadId={id!} faded />)}
                </div>
              </section>
            )}
          </div>
        )}
      </section>

      <button onClick={() => { initSound(); play('open'); setShowCreate(true); }}
        className="bbtn bbtn-aqua fixed bottom-6 right-4 z-20 gap-2 px-5 py-3.5 text-sm shadow-2xl sm:right-6">
        <Plus className="h-5 w-5" /> Naya Trip
      </button>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="🧳 Naya trip banao">
        <form onSubmit={create} className="space-y-4">
          <Input label="Trip ka naam" placeholder="Goa Trip 2026" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider" style={{ color:'rgba(245,240,232,0.5)' }}>Vibe</span>
            <div className="flex gap-2 flex-wrap">{EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)}
                className={`rounded-xl p-2.5 text-xl transition active:scale-90 border-2 ${emoji===e?'border-aqua bg-aqua/20':'border-bone/20 bg-ink-800'}`}>{e}</button>
            ))}</div>
          </label>
          <Input label="Budget (₹, optional)" type="number" placeholder="10000" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <ErrorText msg={error} />
          <Button type="submit" disabled={busy} className="w-full justify-center">{busy?'Banate hain...':'Trip Banao 🚀'}</Button>
        </form>
      </Modal>
    </main>
  );
}

function TripCard({ trip, idx, squadId, faded }: { trip: Trip; idx: number; squadId: string; faded?: boolean }) {
  const nav = useNavigate();
  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity: faded?0.6:1, y:0 }} transition={{ delay: idx*0.06 }}
      onClick={() => { initSound(); play('open'); nav(`/app/squad/${squadId}/trip/${trip.id}`); }}
      className={`bcard ${BORDER[idx%4]} p-5 cursor-pointer transition hover:translate-x-[-2px] hover:translate-y-[-2px]`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-3xl">{trip.emoji}</span>
        {trip.status !== 'active' && <span className="sticker" style={{ opacity:0.7 }}>{trip.status.toUpperCase()}</span>}
      </div>
      <h3 className="font-display font-extrabold" style={{ color:'#f5f0e8' }}>{trip.name}</h3>
      <p className="font-display text-xl font-extrabold mt-1" style={{ color:'#f5a623' }}>{toRupees(Number(trip.total_spend))}</p>
      <div className="mt-3 flex items-center gap-4 text-xs" style={{ color:'rgba(245,240,232,0.5)' }}>
        <span className="flex items-center gap-1"><Receipt className="h-3 w-3" /> {trip.expense_count}</span>
        <span className="flex items-center gap-1"><Camera className="h-3 w-3" /> {trip.photo_count}</span>
      </div>
    </motion.div>
  );
}
