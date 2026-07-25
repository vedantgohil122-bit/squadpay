import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { toRupees } from '../lib/money';
import { FunLoader } from '../components/ui';
import { play, initSound } from '../lib/sound';

interface Photo { id: string; url: string; caption: string; uploaderName: string }
interface W {
  squadName: string; squadEmoji: string; totalSpend: number; expenseCount: number; settlementCount: number;
  topCategory: { name: string; emoji: string; pct: number } | null;
  biggestExpense: { title: string; amount: number; payer: string } | null;
  biggestSpender: { name: string; amount: number } | null;
  fastestPayer: { name: string } | null; slowestPayer: { name: string } | null;
  xpChampion: { name: string; xp: number } | null;
  photos: Photo[];
}

type Slide =
  | { type: 'text'; kicker: string; big: string; sub?: string; emoji: string; gradient: string }
  | { type: 'photo'; photo: Photo; gradient: string };

const G = ['from-violet-700 via-fuchsia-700 to-pink-600','from-cyan-600 via-blue-700 to-violet-700',
  'from-emerald-600 via-teal-600 to-cyan-600','from-amber-600 via-orange-700 to-rose-700',
  'from-pink-600 via-rose-600 to-red-600','from-indigo-700 via-violet-700 to-purple-700'];

// AI caption generation via Anthropic API
async function generateCaption(photo: Photo, squadName: string, totalSpend: number): Promise<string> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are SquadPay's fun Hinglish AI. Generate a short, funny, meme-style caption (max 12 words) for a squad memory photo. Be savage but friendly.

Squad: ${squadName} | Total spent together: ₹${Math.round(totalSpend/100).toLocaleString('en-IN')}
Photo uploaded by: ${photo.uploaderName}
Original caption: "${photo.caption || 'no caption'}"

Rules: Hinglish (mix Hindi + English), Gen-Z humor, reference the squad spending/debt if funny, max 12 words, one emoji max.
Reply with ONLY the caption, nothing else.`,
        }],
      }),
    });
    const d = await res.json();
    return d.content?.[0]?.text?.trim() || photo.caption || 'Yaadein priceless, expenses very much priced 💀';
  } catch {
    return photo.caption || 'Yaadein priceless, expenses very much priced 💀';
  }
}

export default function Wrapped() {
  const { id } = useParams();
  const [w, setW] = useState<W | null>(null);
  const [idx, setIdx] = useState(0);
  const [aiCaptions, setAiCaptions] = useState<Record<string, string>>({});
  const [generatingCaptions, setGeneratingCaptions] = useState(true);

  useEffect(() => {
    api<{ wrapped: W }>(`/stats/${id}/wrapped`).then(async (d) => {
      setW(d.wrapped);
  // Generate AI captions for all photos (max 10 at a time to avoid rate limits)
      if (d.wrapped.photos.length > 0) {
        const caps: Record<string, string> = {};
        const photos = d.wrapped.photos;
        // Process in batches of 5
        for (let i = 0; i < photos.length; i += 5) {
          const batch = photos.slice(i, i + 5);
          await Promise.all(batch.map(async (p) => {
            caps[p.id] = await generateCaption(p, d.wrapped.squadName, d.wrapped.totalSpend);
          }));
          setAiCaptions({ ...caps }); // update progressively
        }
      }
      setGeneratingCaptions(false);
    });
  }, [id]);

  const slides: Slide[] = useMemo(() => {
    if (!w) return [];
    const textSlides: Slide[] = [
      { type:'text', kicker:`${w.squadEmoji} ${w.squadName}`, big:'SQUAD WRAPPED', sub:'the financial damage report is here', emoji:'🎬', gradient:G[0] },
      { type:'text', kicker:'Total damage done', big:toRupees(w.totalSpend), sub:`across ${w.expenseCount} expenses & ${w.settlementCount} settlements`, emoji:'💸', gradient:G[1] },
    ];
    if (w.topCategory) textSlides.push({ type:'text', kicker:'Where it all went', big:`${w.topCategory.pct}% ${w.topCategory.name.toUpperCase()}`, sub:'a balanced portfolio, financially speaking', emoji:w.topCategory.emoji, gradient:G[2] });
    if (w.biggestExpense) textSlides.push({ type:'text', kicker:'The big one that hurt', big:`"${w.biggestExpense.title}"`, sub:`${toRupees(w.biggestExpense.amount)} · paid by ${w.biggestExpense.payer}`, emoji:'💥', gradient:G[3] });

    if (w.biggestSpender) textSlides.push({ type:'text', kicker:'Most generous wallet', big:w.biggestSpender.name.toUpperCase(), sub:`${toRupees(w.biggestSpender.amount)} funded for the squad`, emoji:'👑', gradient:G[0] });
    if (w.fastestPayer) textSlides.push({ type:'text', kicker:'Fastest to settle', big:w.fastestPayer.name.toUpperCase(), sub:'pays back before you finish typing the reminder', emoji:'⚡', gradient:G[2] });
    if (w.slowestPayer) textSlides.push({ type:'text', kicker:'Slowest to settle 🐌', big:w.slowestPayer.name.toUpperCase(), sub:'we say this with love. imaandari take time hai.', emoji:'🐌', gradient:G[3] });
    if (w.xpChampion) textSlides.push({ type:'text', kicker:'XP Champion', big:`${w.xpChampion.name.toUpperCase()} · ${w.xpChampion.xp} XP`, sub:'grinding the friendship economy since day 1', emoji:'🏆', gradient:G[5] });

    // Add a "Memories" title slide if there are photos
    if (w.photos.length > 0) {
      textSlides.push({ type:'text', kicker:'Squad Memories', big:`${w.photos.length} YAADEIN`, sub:'the moments that made the squad 📸', emoji:'📸', gradient:G[4] });
    }

    // Interleave ALL photos after the stats slides
    w.photos.forEach((photo, idx) => {
      textSlides.push({ type:'photo', photo, gradient:G[idx % G.length] });
    });
    textSlides.push({ type:'text', kicker:`${w.squadEmoji} ${w.squadName}`, big:'SEE YOU NEXT OUTING', sub:`${w.settlementCount} debts settled. zero friendships lost. 🫡`, emoji:'🤝', gradient:G[0] });
    return textSlides;
  }, [w, aiCaptions]);

  if (!w || generatingCaptions) return (
    <main className="fixed inset-0 flex flex-col items-center justify-center gap-3" style={{ background:'#0e0c0a' }}>
      <FunLoader />
      {generatingCaptions && <p className="text-xs" style={{ color:'rgba(245,240,232,0.4)' }}>AI captions generate ho rahe hain...</p>}
    </main>
  );

  const slide = slides[idx];
  const isLast = idx === slides.length - 1;

  return (
    <main className="fixed inset-0 select-none overflow-hidden" onClick={() => { if (!isLast) { initSound(); play('swipe'); setIdx((i) => i + 1); } }}>
      <AnimatePresence mode="wait">
        <motion.section key={idx} initial={{ opacity:0, scale:1.04 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
          transition={{ duration: 0.45 }}
          className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${slide.gradient} px-8 text-center text-white`}>

          {slide.type === 'text' ? (
            <>
              <motion.div initial={{ scale:0, rotate:-20 }} animate={{ scale:1, rotate:0 }} transition={{ delay:0.15, type:'spring' }} className="text-7xl sm:text-8xl">
                {slide.emoji}
              </motion.div>
              <motion.p initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.35 }}
                className="mt-8 text-sm font-extrabold uppercase tracking-[0.3em] text-white/75">
                {slide.kicker}
              </motion.p>
              <motion.h1 initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.5 }}
                className="mt-3 font-display text-4xl font-extrabold leading-tight sm:text-6xl" style={{ textShadow:'0 4px 24px rgba(0,0,0,0.3)' }}>
                {slide.big}
              </motion.h1>
              {slide.sub && (
                <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.75 }}
                  className="mt-4 max-w-sm text-base text-white/80 leading-relaxed">
                  {slide.sub}
                </motion.p>
              )}
            </>
          ) : (
            /* PHOTO SLIDE */
            <div className="w-full max-w-sm">
              <motion.div initial={{ opacity:0, y:20, rotate:-2 }} animate={{ opacity:1, y:0, rotate:0 }} transition={{ delay:0.2, type:'spring' }}
                className="overflow-hidden rounded-3xl shadow-2xl" style={{ border:'4px solid rgba(255,255,255,0.3)' }}>
                <img src={slide.photo.url} alt="memory" className="aspect-square w-full object-cover" />
              </motion.div>
              <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.5 }} className="mt-5 space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-white/60">📸 {slide.photo.uploaderName} ki memory</p>
                <p className="font-display text-lg font-extrabold leading-snug">
                  {aiCaptions[slide.photo.id] || slide.photo.caption || 'Yaadein priceless 💀'}
                </p>
                <p className="text-[10px] text-white/40 mt-1">✨ AI-generated caption</p>
              </motion.div>
            </div>
          )}

          {isLast ? (
            <Link to={`/app/squad/${id}`} onClick={(e) => e.stopPropagation()}
              className="mt-10 rounded-2xl px-8 py-3.5 font-display font-extrabold shadow-2xl transition active:scale-95"
              style={{ background:'white', color:'#0e0c0a' }}>
              Back to Squad
            </Link>
          ) : (
            <motion.p initial={{ opacity:0 }} animate={{ opacity:0.6 }} transition={{ delay:1.3 }}
              className="absolute bottom-10 text-xs text-white/60">tap to continue</motion.p>
          )}
        </motion.section>
      </AnimatePresence>

      {/* PROGRESS BARS */}
      <div className="absolute inset-x-0 top-0 z-10 flex gap-1 p-3">
        {slides.map((_, n) => (
          <div key={n} className="h-1 flex-1 overflow-hidden rounded-full" style={{ background:'rgba(255,255,255,0.25)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ background:'white', width: n <= idx ? '100%' : '0%' }} />
          </div>
        ))}
      </div>
      <Link to={`/app/squad/${id}`} onClick={(e) => e.stopPropagation()}
        className="absolute right-4 top-6 z-10 rounded-full p-2 text-white" style={{ background:'rgba(0,0,0,0.3)' }}>
        <X className="h-5 w-5" />
      </Link>
    </main>
  );
}
