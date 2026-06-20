import { FormEvent, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Shuffle, Sparkles, Upload, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, User } from '../store/auth';
import { Modal, Input, ErrorText } from './ui';
import { play, initSound } from '../lib/sound';

// ── AVATAR STYLES ─────────────────────────────────────────
const STYLES = [
  { id: 'adventurer',       label: 'Adventurer',    emoji: '🧑' },
  { id: 'bottts',           label: 'Robots',        emoji: '🤖' },
  { id: 'fun-emoji',        label: 'Emoji',         emoji: '😎' },
  { id: 'lorelei',          label: 'Illustrated',   emoji: '🎨' },
  { id: 'avataaars',        label: 'Cartoon',       emoji: '👤' },
  { id: 'big-smile',        label: 'Smile',         emoji: '😄' },
  { id: 'pixel-art',        label: 'Pixel Art',     emoji: '👾' },
  { id: 'thumbs',           label: 'Thumbs',        emoji: '👍' },
  { id: 'croodles',         label: 'Doodle',        emoji: '✏️' },
  { id: 'notionists-neutral', label: 'Minimal',     emoji: '⚡' },
  { id: 'micah',            label: 'Anime',         emoji: '🌸' },
  { id: 'open-peeps',       label: 'Peeps',         emoji: '🙋' },
];

const dicebear = (style: string, seed: string) =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

type Tab = 'styles' | 'upload' | 'ai';

export default function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState<Tab>('styles');
  const [name, setName]       = useState(user?.name || '');
  const [bio, setBio]         = useState(user?.bio || '');
  const [upiId, setUpiId]     = useState((user as any)?.upiId || '');
  const [avatar, setAvatar]   = useState(user?.avatarUrl || '');
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0].id);
  const [salt, setSalt]       = useState(0);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [saved, setSaved]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Generate 8 avatars for selected style
  const avatarOptions = useMemo(() => {
    const base = (user?.name || 'squad') + salt;
    return Array.from({ length: 8 }, (_, i) =>
      dicebear(selectedStyle, base + i)
    );
  }, [selectedStyle, salt, user?.name]);

  const handleFileChange = (f: File | null) => {
    setUploadFile(f);
    if (f) {
      const r = new FileReader();
      r.onload = (e) => {
        setUploadPreview(e.target?.result as string);
        setAvatar(e.target?.result as string); // preview
      };
      r.readAsDataURL(f);
    }
  };

  const generateAiAvatar = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      // Use DiceBear with AI-style seed based on prompt
      const seed = aiPrompt + Math.random().toString(36).slice(2);
      const styles = ['adventurer', 'lorelei', 'micah', 'open-peeps', 'avataaars'];
      const randomStyle = styles[Math.floor(Math.random() * styles.length)];
      const url = dicebear(randomStyle, seed);
      setAvatar(url);
    } finally {
      setAiLoading(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault(); initSound(); setBusy(true); setError('');
    try {
      let finalAvatar = avatar;

      // If there's a file to upload, upload it first
      if (uploadFile && tab === 'upload') {
        const token = localStorage.getItem('squadpay_token');
        const fd = new FormData();
        fd.append('avatar', uploadFile);
        const res = await fetch('/api/auth/avatar', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Upload failed');
        finalAvatar = d.avatarUrl;
      }

      const d = await api<{ user: User }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          bio,
          upiId,
          avatarUrl: tab === 'upload' && uploadFile ? finalAvatar : (tab === 'styles' || tab === 'ai') ? finalAvatar : undefined,
        }),
      });
      play('success');
      setUser(d.user);
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1000);
    } catch (err: any) { play('error'); setError(err.message); }
    finally { setBusy(false); }
  };

  const TABS: { id: Tab; label: string; icon: typeof Camera }[] = [
    { id: 'styles', label: 'Pick Style', icon: Shuffle },
    { id: 'upload', label: 'Upload Photo', icon: Upload },
    { id: 'ai',     label: 'AI Generate', icon: Sparkles },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Apna look set karo ✨">
      <form onSubmit={save} className="max-h-[75vh] overflow-y-auto pr-1 space-y-4">

        {/* CURRENT AVATAR PREVIEW */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            {avatar ? (
              <img src={avatar} alt="avatar" className="h-20 w-20 rounded-full border-4"
                style={{ borderColor: '#f5a623', background: '#1a1612' }} />
            ) : (
              <div className="h-20 w-20 rounded-full border-4 flex items-center justify-center font-display font-extrabold text-2xl"
                style={{ borderColor: '#f5a623', background: '#1a1612', color: '#f5a623' }}>
                {name[0] || '?'}
              </div>
            )}
            <button type="button" onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 rounded-full p-1.5"
              style={{ background: '#f5a623', border: '2px solid #0e0c0a' }}>
              <Camera size={12} color="#0e0c0a" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { handleFileChange(e.target.files?.[0] || null); setTab('upload'); }} />
          </div>
          <p style={{ fontSize: '0.7rem', color: 'rgba(245,240,232,0.4)' }}>Tap camera to upload photo</p>
        </div>

        {/* TAB SWITCHER */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(245,240,232,0.05)', border: '2px solid rgba(245,240,232,0.1)' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold transition"
              style={{ background: tab === id ? '#f5a623' : 'transparent', color: tab === id ? '#0e0c0a' : 'rgba(245,240,232,0.5)' }}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* STYLES TAB */}
        {tab === 'styles' && (
          <div>
            {/* Style picker */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {STYLES.map((s) => (
                <button key={s.id} type="button" onClick={() => setSelectedStyle(s.id)}
                  className="rounded-xl px-2.5 py-1.5 text-[11px] font-bold border-2 transition active:scale-95"
                  style={{
                    background: selectedStyle === s.id ? 'rgba(245,166,35,0.2)' : 'rgba(245,240,232,0.05)',
                    borderColor: selectedStyle === s.id ? '#f5a623' : 'rgba(245,240,232,0.15)',
                    color: selectedStyle === s.id ? '#f5a623' : 'rgba(245,240,232,0.6)',
                  }}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>

            {/* Avatar grid */}
            <div className="grid grid-cols-4 gap-2">
              {avatarOptions.map((url) => (
                <button key={url} type="button" onClick={() => setAvatar(url)}
                  className="rounded-2xl p-1 border-2 transition active:scale-90"
                  style={{
                    background: '#1a1612',
                    borderColor: avatar === url ? '#f5a623' : 'rgba(245,240,232,0.1)',
                    boxShadow: avatar === url ? '0 0 0 2px rgba(245,166,35,0.3)' : 'none',
                  }}>
                  <img src={url} alt="avatar option" className="aspect-square w-full rounded-xl" loading="lazy" />
                </button>
              ))}
            </div>

            <button type="button" onClick={() => setSalt((s) => s + 1)}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold border-2 transition active:scale-95"
              style={{ background: 'rgba(245,240,232,0.05)', borderColor: 'rgba(245,240,232,0.15)', color: 'rgba(245,240,232,0.6)' }}>
              <Shuffle size={14} /> Naye options
            </button>
          </div>
        )}

        {/* UPLOAD TAB */}
        {tab === 'upload' && (
          <div>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed p-8 text-center transition hover:opacity-80"
              style={{ borderColor: uploadPreview ? '#f5a623' : 'rgba(245,240,232,0.2)', background: 'rgba(245,240,232,0.03)' }}>
              {uploadPreview ? (
                <div className="flex flex-col items-center gap-2">
                  <img src={uploadPreview} alt="preview" className="h-24 w-24 rounded-full object-cover border-4"
                    style={{ borderColor: '#f5a623' }} />
                  <p style={{ fontSize: '0.75rem', color: '#f5a623', fontWeight: 700 }}>Photo ready! ✅</p>
                  <p style={{ fontSize: '0.65rem', color: 'rgba(245,240,232,0.4)' }}>Tap to change</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload size={32} color="rgba(245,240,232,0.3)" />
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'rgba(245,240,232,0.6)' }}>Apni photo upload karo</p>
                  <p style={{ fontSize: '0.7rem', color: 'rgba(245,240,232,0.3)' }}>JPG, PNG, WebP · max 2MB</p>
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)} />
          </div>
        )}

        {/* AI GENERATE TAB */}
        {tab === 'ai' && (
          <div className="space-y-3">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(245,166,35,0.08)', border: '2px solid rgba(245,166,35,0.3)' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f5a623', marginBottom: '0.5rem' }}>✨ Describe your vibe</p>
              <p style={{ fontSize: '0.65rem', color: 'rgba(245,240,232,0.5)', marginBottom: '0.75rem' }}>
                e.g. "cool desi guy who pays for everyone", "finance minister vibes", "pizza lover"
              </p>
              <div className="flex gap-2">
                <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Apna vibe batao..." className="binput flex-1 text-sm" />
                <button type="button" onClick={generateAiAvatar} disabled={aiLoading || !aiPrompt.trim()}
                  className="rounded-xl px-4 font-bold text-sm transition active:scale-95 disabled:opacity-50"
                  style={{ background: '#f5a623', color: '#0e0c0a' }}>
                  {aiLoading ? '...' : '✨'}
                </button>
              </div>
            </div>

            {avatar && tab === 'ai' && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-2 py-4">
                <img src={avatar} alt="ai avatar" className="h-28 w-28 rounded-full border-4 object-cover"
                  style={{ borderColor: '#f5a623', background: '#1a1612' }} />
                <p style={{ fontSize: '0.75rem', color: '#f5a623', fontWeight: 700 }}>Generated! ✨</p>
                <button type="button" onClick={generateAiAvatar} className="text-xs underline"
                  style={{ color: 'rgba(245,240,232,0.4)' }}>Generate another</button>
              </motion.div>
            )}

            {!avatar && !aiLoading && (
              <div className="py-8 text-center">
                <p className="text-4xl mb-2">🎨</p>
                <p style={{ fontSize: '0.875rem', color: 'rgba(245,240,232,0.4)' }}>Describe karo, generate ho jayega</p>
              </div>
            )}
          </div>
        )}

        {/* PROFILE FIELDS */}
        <div style={{ borderTop: '2px solid rgba(245,240,232,0.08)', paddingTop: '1rem' }} className="space-y-3">
          <Input label="Naam" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Bio" value={bio} placeholder="Squad ka finance minister 📊" maxLength={160}
            onChange={(e) => setBio(e.target.value)} />
          <Input label="UPI ID" value={upiId} placeholder="vedant@oksbi"
            onChange={(e) => setUpiId(e.target.value)} />
        </div>

        <ErrorText msg={error} />
        <button type="submit" disabled={busy}
          className="w-full rounded-2xl py-3.5 font-display font-extrabold text-sm transition active:scale-[0.98] disabled:opacity-50"
          style={{ background: saved ? '#b8f02a' : '#f5a623', color: '#0e0c0a', border: '2px solid rgba(0,0,0,0.2)' }}>
          {saved ? <span className="flex items-center justify-center gap-2"><Check size={16} /> Saved!</span>
            : busy ? 'Saving...' : 'Save karo ✅'}
        </button>
      </form>
    </Modal>
  );
}
