import { useEffect, useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, LogOut, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { toRupees } from '../lib/money';
import { useAuth } from '../store/auth';
import { Button, Input, Modal, ErrorText, Avatar, FunLoader, MarqueeTape, SoundToggle } from '../components/ui';
import { play, initSound } from '../lib/sound';
import ProfileModal from '../components/ProfileModal';

interface Squad { id: string; name: string; emoji: string; invite_code: string; member_count: string; total_spend: string }

export default function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [squads, setSquads] = useState<Squad[] | null>(null);
  const [modal, setModal] = useState<'create' | 'join' | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [name, setName] = useState(''); const [emoji, setEmoji] = useState('🔥');
  const [code, setCode] = useState(''); const [error, setError] = useState('');

  const load = () => api<{ squads: Squad[] }>('/squads').then((d) => setSquads(d.squads));
  useEffect(() => { load(); }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try { initSound(); const d = await api<{ squad: { id: string } }>('/squads', { method: 'POST', body: JSON.stringify({ name, emoji }) }); play('success'); nav(`/app/squad/${d.squad.id}`); }
    catch (err: any) { play('error'); setError(err.message); }
  };
  const join = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try { initSound(); const d = await api<{ squad: { id: string } }>('/squads/join', { method: 'POST', body: JSON.stringify({ code }) }); play('success'); nav(`/app/squad/${d.squad.id}`); }
    catch (err: any) { play('error'); setError(err.message); }
  };

  return (
    <main className="min-h-screen" style={{ background: '#0e0c0a' }}>
      <MarqueeTape />
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <img src="/favicon.png" alt="SquadPay" className="h-8 w-auto" />
        <div className="flex items-center gap-3">
          <SoundToggle />
          <button onClick={() => setShowProfile(true)} className="rounded-full transition hover:ring-2 hover:ring-marigold/60 active:scale-90" title="Profile edit karo">
            <Avatar url={user?.avatarUrl} name={user?.name || '?'} />
          </button>
          <button onClick={() => { logout(); nav('/'); }} className="rounded-lg p-2 text-bone/40 hover:text-bone hover:bg-white/10" title="Logout">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl font-extrabold sm:text-3xl" style={{ color: '#f5f0e8' }}>
              Kya haal, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'rgba(245,240,232,0.5)' }}>
              Tumhare squads, tumhara chaos — hisaab humara. 🧮
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setModal('join'); setError(''); }}>
              <KeyRound className="h-4 w-4" /> Join Karo
            </Button>
            <Button onClick={() => { setModal('create'); setError(''); }}>
              <Plus className="h-4 w-4" /> Squad Banao
            </Button>
          </div>
        </div>

        {!squads ? <FunLoader /> : squads.length === 0 ? (
          <div className="bcard bcard-yellow p-12 text-center">
            <motion.p animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 2.2 }} className="text-5xl">🛋️</motion.p>
            <h2 className="mt-4 font-display text-lg font-extrabold" style={{ color: '#f5f0e8' }}>Koi squad nahi? Akele kharcha karoge? 😭</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm" style={{ color: 'rgba(245,240,232,0.5)' }}>Squad banao ya kisi dost ka invite code maango — chaos shuru karte hain.</p>
            <div className="mt-5 flex justify-center gap-3">
              <Button onClick={() => { setModal('create'); setError(''); }}>🎉 Squad Banao</Button>
              <Button variant="ghost" onClick={() => { setModal('join'); setError(''); }}>🔑 Join Karo</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {squads.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Link to={`/app/squad/${s.id}`}>
                  <div className={`bcard ${['bcard-yellow','bcard-pink','bcard-lime','bcard-aqua'][i % 4]} h-full p-5 transition hover:translate-x-[-2px] hover:translate-y-[-2px]`}>
                    <div className="text-3xl mb-3">{s.emoji}</div>
                    <h3 className="font-display font-extrabold" style={{ color: '#f5f0e8' }}>{s.name}</h3>
                    <div className="mt-3 flex items-center justify-between text-xs" style={{ color: 'rgba(245,240,232,0.5)' }}>
                      <span>{s.member_count} member{Number(s.member_count) !== 1 && 's'}</span>
                      <span className="font-display font-bold" style={{ color: '#f5a623' }}>{toRupees(Number(s.total_spend))}</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <ProfileModal open={showProfile} onClose={() => { setShowProfile(false); load(); }} />

      <Modal open={modal === 'create'} onClose={() => setModal(null)} title="Squad banao 🎉">
        <form onSubmit={create} className="space-y-4">
          <Input label="Squad ka naam" placeholder="Mumbai Boys" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(245,240,232,0.5)' }}>Vibe</span>
            <div className="flex gap-2">{['🔥','🍕','🧳','🎬','⚡','🌊'].map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)}
                className={`rounded-xl p-2.5 text-xl transition active:scale-90 border-2 ${emoji === e ? 'border-marigold bg-marigold/20' : 'border-bone/20 bg-ink-800'}`}>{e}</button>
            ))}</div>
          </label>
          <ErrorText msg={error} />
          <Button type="submit" className="w-full justify-center">Banao 🚀</Button>
        </form>
      </Modal>

      <Modal open={modal === 'join'} onClose={() => setModal(null)} title="Squad join karo 🔑">
        <form onSubmit={join} className="space-y-4">
          <Input label="Invite code" placeholder="e.g. 9F3A1C2B" value={code} onChange={(e) => setCode(e.target.value)} required />
          <ErrorText msg={error} />
          <Button type="submit" className="w-full justify-center">Join karo →</Button>
        </form>
      </Modal>
    </main>
  );
}
