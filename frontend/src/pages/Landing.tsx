import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IndianRupee, Zap, Users, Trophy, ArrowRight } from 'lucide-react';
import { MarqueeTape } from '../components/ui';
import { LINES } from '../lib/hinglish';

const HERO = [
  'Track the bills.\nKeep the vibes.',
  '"Bhai baad mein\nbhejta hu" needs proof.',
  'Built for squads.\nFeared by debtors.',
  'Kharchon ka hisaab.\nDosti ka nahi.',
  'Squad ka official\nfinance department.',
];

const FEATURES = [
  { icon: IndianRupee, title: 'Paisa Split Karo', desc: 'Equal, % ya custom — down to the last paisa.', color: 'bcard-yellow' },
  { icon: Zap,         title: 'Auto Settle',      desc: '10 IOUs → 2 transfers. Maths humara problem.', color: 'bcard-lime' },
  { icon: Users,       title: 'Squad First',       desc: 'Invite codes, profiles, feed. Group chat ke liye.', color: 'bcard-pink' },
  { icon: Trophy,      title: 'XP & Roasts',       desc: 'Leaderboards, badges, and savage meme roasts. 🔥', color: 'bcard-aqua' },
];

const TESTIMONIALS = [
  { text: '"Splitwise se zyada fun hai bhai 💀"', name: 'Rahul M., Mumbai', sticker: 'bro verified' },
  { text: '"Roast Center ne mujhe personally attack kiya."', name: 'Priya K., Delhi', sticker: 'paisa clear' },
  { text: '"Memories wall pe pizza pic upload ki aur 6 log react kiye 🍕"', name: 'Arjun S., Pune', sticker: 'squad approved' },
];

export default function Landing() {
  const [hi, setHi] = useState(0);
  useEffect(() => { const t = setInterval(() => setHi((n) => (n + 1) % HERO.length), 3200); return () => clearInterval(t); }, []);

  return (
    <main className="min-h-screen" style={{ background: '#0e0c0a' }}>
      {/* NAV */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="font-display text-xl font-extrabold" style={{ color: '#f5f0e8' }}>
          Squad<span style={{ color: '#f5a623' }}>Pay</span>
          <span className="sticker ml-2" style={{ fontSize: '0.55rem' }}>BETA</span>
        </span>
        <div className="flex gap-2">
          <Link to="/login" className="bbtn bbtn-ghost px-4 py-2 text-sm">Login</Link>
          <Link to="/register" className="bbtn px-4 py-2 text-sm">Squad Banao →</Link>
        </div>
      </nav>

      {/* MARQUEE */}
      <MarqueeTape />

      {/* HERO */}
      <section className="mx-auto max-w-5xl px-5 pt-10 pb-12 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-bone/20 bg-ink-900 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-marigold">
              🇮🇳 Made for Bhailog
            </div>
            <div className="min-h-[8rem] sm:min-h-[10rem] overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.h1 key={hi} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="font-display text-4xl font-extrabold leading-[1.1] sm:text-5xl lg:text-6xl" style={{ color: '#f5f0e8' }}>
                  {HERO[hi].split('\n').map((line, i) => (
                    <span key={i}>{i === 1 ? <span style={{ color: '#f5a623' }}>{line}</span> : line}<br /></span>
                  ))}
                </motion.h1>
              </AnimatePresence>
            </div>
            <p className="mt-4 max-w-md text-base" style={{ color: 'rgba(245,240,232,0.6)' }}>
              The fun way to split bills, trips, food runs, and squad chaos. Hinglish personality included.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="bbtn group gap-2 px-6 py-3 text-base">
                Squad Banao <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link to="/register" className="bbtn bbtn-ghost px-6 py-3 text-base">Squad Join Karo</Link>
            </div>
            {/* Rotating tagline */}
            <p className="mt-5 text-sm italic" style={{ color: '#f5a623' }}>
              "{LINES.heroLines[hi % LINES.heroLines.length]}"
            </p>
          </div>

          {/* Preview card */}
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="bcard bcard-yellow p-6 lg:ml-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display font-extrabold">🔥 Mumbai Boys</span>
              <span className="sticker">4 members</span>
            </div>
            <div className="mb-3 rounded-xl bg-ink-800 p-4">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(245,240,232,0.5)' }}>Squad spend</p>
              <p className="font-display text-3xl font-extrabold" style={{ color: '#f5a623' }}>₹12,400</p>
            </div>
            {[
              { name: 'Vedant', net: '+₹3,200', green: true },
              { name: 'Rahul', net: '-₹1,800', green: false },
              { name: 'Arjun', net: '-₹1,400', green: false },
            ].map((m) => (
              <div key={m.name} className="flex justify-between py-2 text-sm" style={{ borderBottom: '1px solid rgba(245,240,232,0.1)' }}>
                <span style={{ color: '#f5f0e8' }}>{m.name}</span>
                <b style={{ color: m.green ? '#34d399' : '#fb7185' }}>{m.net}</b>
              </div>
            ))}
            <button className="bbtn bbtn-lime mt-4 w-full justify-center py-2.5 text-sm">Settle karo 💸</button>
          </motion.div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="mb-8 flex items-center gap-4">
          <h2 className="font-display text-2xl font-extrabold" style={{ color: '#f5f0e8' }}>Kya kya milega?</h2>
          <div style={{ flex: 1, height: 2, background: 'rgba(245,240,232,0.1)' }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
              <div className={`bcard ${f.color} h-full p-5`}>
                <f.icon className="h-7 w-7 mb-3" style={{ color: '#f5a623' }} />
                <h3 className="font-display text-sm font-extrabold mb-1" style={{ color: '#f5f0e8' }}>{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(245,240,232,0.6)' }}>{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ borderTop: '2px solid rgba(245,240,232,0.1)' }} className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="mb-6 font-display text-2xl font-extrabold text-center" style={{ color: '#f5f0e8' }}>Squad ki reviews 😂</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <div className={`bcard ${['bcard-yellow','bcard-pink','bcard-lime'][i]} p-5 h-full`}>
                <p className="text-sm leading-relaxed mb-3" style={{ color: '#f5f0e8' }}>{t.text}</p>
                <p className="text-xs" style={{ color: 'rgba(245,240,232,0.5)' }}>— {t.name}</p>
                <span className="sticker mt-2 inline-block">{t.sticker}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FOOTER CTA */}
      <MarqueeTape />
      <footer className="py-10 text-center" style={{ borderTop: '2px solid rgba(245,240,232,0.1)' }}>
        <p className="font-display text-sm font-bold" style={{ color: 'rgba(245,240,232,0.4)' }}>
          SquadPay — Squad ka official finance headquarters 💚
        </p>
      </footer>
    </main>
  );
}
