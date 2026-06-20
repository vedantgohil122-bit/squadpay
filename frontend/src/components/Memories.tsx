// ============================================================
// MEMORIES — Instagram-style wall
// One reaction per post (tap same to unlike, tap different to switch)
// ============================================================
import { FormEvent, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Send, Trash2, MessageCircle, Heart } from 'lucide-react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/money';
import { useAuth } from '../store/auth';
import { Button, Avatar, FunLoader, ErrorText } from './ui';
import { play, initSound } from '../lib/sound';

const EMOJIS = ['😂', '🔥', '💀', '❤️', '🍕', '☕'] as const;

interface Memory {
  id: string; url: string; caption: string; created_at: string;
  uploaded_by: string; uploader_name: string; uploader_avatar?: string;
  reactions: { emoji: string; userId: string }[] | null;
  comments: { id: string; name: string; content: string; createdAt: string }[] | null;
}

export default function Memories({ squadId, isAdmin }: { squadId: string; isAdmin: boolean }) {
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api<{ memories: Memory[] }>(`/memories/squad/${squadId}`).then((d) => setMemories(d.memories));
  useEffect(() => { load(); }, [squadId]);

  const pickFile = (f: File | null) => {
    setFile(f);
    if (f) { const r = new FileReader(); r.onload = (e) => setPreview(e.target?.result as string); r.readAsDataURL(f); }
    else setPreview(null);
  };

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Photo toh select karo bhai 📸'); play('error'); return; }
    initSound(); setBusy(true); setError('');
    try {
      const token = localStorage.getItem('squadpay_token');
      const fd = new FormData();
      fd.append('squadId', squadId); fd.append('caption', caption); fd.append('photo', file);
      const res = await fetch('/api/memories', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Upload fail ho gaya');
      play('success');
      setCaption(''); pickFile(null); if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const react = async (id: string, emoji: string) => {
    initSound(); play('toggle');
    await api(`/memories/${id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });
    load();
  };
  const del = async (id: string) => {
    if (!confirm('Ye memory delete karein?')) return;
    await api(`/memories/${id}`, { method: 'DELETE' }); load();
  };

  if (!memories) return <FunLoader />;

  return (
    <div className="space-y-4">
      {/* UPLOAD CARD */}
      <div className="bcard bcard-yellow p-4">
        <form onSubmit={upload} className="space-y-3">
          {preview && (
            <div className="relative">
              <img src={preview} alt="preview" className="h-40 w-full rounded-xl object-cover" style={{ border: '2px solid rgba(245,166,35,0.4)' }} />
              <button type="button" onClick={() => pickFile(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white">✕</button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition active:scale-95 ${file ? 'border-marigold text-marigold' : 'border-bone/20 bg-ink-800 text-bone/60'}`}>
              <Camera className="h-4 w-4" /> {file ? file.name.slice(0, 18) + (file.name.length > 18 ? '…' : '') : 'Photo choose karo'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] || null)} />
            <input value={caption} onChange={(e) => setCaption(e.target.value)}
              placeholder='"Rahul ne bola budget outing hogi 💀"'
              className="binput min-w-0 flex-1" style={{ borderColor: 'rgba(245,166,35,0.3)' }} />
            <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : '📸 Post'}</Button>
          </div>
          <ErrorText msg={error} />
        </form>
      </div>

      {memories.length === 0 ? (
        <div className="bcard p-10 text-center">
          <motion.p animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 3 }} className="text-5xl">📸</motion.p>
          <p className="mt-4 font-display font-extrabold" style={{ color: '#f5f0e8' }}>Sirf kharche track karoge ya yaadein bhi banaoge?</p>
          <p className="mt-1.5 text-sm" style={{ color: 'rgba(245,240,232,0.5)' }}>Photos upload karo aur outing ko memory banao.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memories.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <MemoryCard m={m} meId={user?.id} isAdmin={isAdmin} onReact={react} onDelete={del} onChanged={load} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryCard({ m, meId, isAdmin, onReact, onDelete, onChanged }: {
  m: Memory; meId?: string; isAdmin: boolean;
  onReact: (id: string, e: string) => void; onDelete: (id: string) => void; onChanged: () => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [text, setText] = useState('');
  const [imgLoaded, setImgLoaded] = useState(false);

  // Instagram rules: find MY reaction (only one possible)
  const myReaction = (m.reactions || []).find((r) => r.userId === meId)?.emoji ?? null;
  // Count per emoji
  const counts: Record<string, number> = {};
  (m.reactions || []).forEach((r) => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });
  const comments = m.comments || [];
  const totalReactions = (m.reactions || []).length;

  const comment = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await api(`/memories/${m.id}/comment`, { method: 'POST', body: JSON.stringify({ content: text }) });
    setText(''); onChanged();
  };

  return (
    <div className="bcard overflow-hidden">
      {/* PHOTO */}
      <div className="relative" style={{ background: '#211d18' }}>
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-2xl animate-pulse">📸</p>
          </div>
        )}
        <img src={m.url} alt={m.caption || 'memory'} onLoad={() => setImgLoaded(true)}
          className={`aspect-square w-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`} />
        {(m.uploaded_by === meId || isAdmin) && (
          <button onClick={() => onDelete(m.id)}
            className="absolute right-2 top-2 rounded-full p-1.5 text-white transition active:scale-90"
            style={{ background: 'rgba(0,0,0,0.6)' }}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="p-4">
        {/* UPLOADER ROW */}
        <div className="flex items-center gap-2.5 mb-2">
          <Avatar url={m.uploader_avatar} name={m.uploader_name} size="h-7 w-7" />
          <p className="flex-1 truncate text-xs font-bold" style={{ color: '#f5f0e8' }}>
            {m.uploader_name.split(' ')[0]}
            <span className="ml-1.5 font-normal" style={{ color: 'rgba(245,240,232,0.4)' }}>· {timeAgo(m.created_at)}</span>
          </p>
        </div>
        {m.caption && <p className="text-sm mb-3" style={{ color: '#f5f0e8' }}>{m.caption}</p>}

        {/* REACTION BAR — Instagram style */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {EMOJIS.map((e) => {
            const isMe = myReaction === e;
            const count = counts[e] || 0;
            return (
              <button key={e} onClick={() => onReact(m.id, e)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-bold transition active:scale-90 ${isMe ? 'ring-2 ring-offset-0' : ''}`}
                style={{
                  background: isMe ? 'rgba(245,166,35,0.2)' : 'rgba(245,240,232,0.06)',
                  border: isMe ? '2px solid rgba(245,166,35,0.6)' : '2px solid rgba(245,240,232,0.1)',
                }}>
                {e}
                {count > 0 && <span style={{ fontSize: '0.7rem', color: isMe ? '#f5a623' : 'rgba(245,240,232,0.6)' }}>{count}</span>}
              </button>
            );
          })}
          {totalReactions > 0 && (
            <span className="ml-auto text-[11px]" style={{ color: 'rgba(245,240,232,0.4)' }}>
              <Heart className="inline h-3 w-3 mr-0.5" />{totalReactions}
            </span>
          )}
        </div>

        {/* COMMENTS TOGGLE */}
        <button onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 text-[11px] font-bold mb-2"
          style={{ color: 'rgba(245,240,232,0.5)' }}>
          <MessageCircle className="h-3.5 w-3.5" />
          {comments.length === 0 ? 'Pehla comment tumhara? 👀' : `${comments.length} comment${comments.length > 1 ? 's' : ''}`}
        </button>

        <AnimatePresence>
          {showComments && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="pt-2 space-y-2" style={{ borderTop: '2px solid rgba(245,240,232,0.08)' }}>
                {comments.map((c) => (
                  <p key={c.id} className="text-xs" style={{ color: 'rgba(245,240,232,0.8)' }}>
                    <b style={{ color: '#f5a623' }}>{c.name.split(' ')[0]}</b>
                    <span className="ml-1">{c.content}</span>
                  </p>
                ))}
                <form onSubmit={comment} className="flex gap-2 pt-1">
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment karo..."
                    className="binput flex-1 py-2 text-xs" />
                  <button type="submit" className="rounded-xl px-3 font-bold transition active:scale-90"
                    style={{ background: 'rgba(245,166,35,0.2)', color: '#f5a623', border: '2px solid rgba(245,166,35,0.4)' }}>
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
