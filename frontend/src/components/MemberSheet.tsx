import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, QrCode, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { toRupees } from '../lib/money';
import { Avatar } from './ui';

const SQUAD_ROLES = [
  { title: 'Finance Minister', emoji: '📊', condition: (m: MemberDetail) => m.expenseCount >= 20 },
  { title: 'Walking ATM',      emoji: '💸', condition: (m: MemberDetail) => m.totalPaid > 1000000 },
  { title: 'Chai King',        emoji: '☕', condition: (m: MemberDetail) => m.expenseCount >= 10 },
  { title: 'Expense Warrior',  emoji: '⚔️', condition: (m: MemberDetail) => m.xp >= 500 },
  { title: 'Squad Legend',     emoji: '👑', condition: (m: MemberDetail) => m.level >= 20 },
  { title: 'Chai Sponsor',     emoji: '🧋', condition: () => true },
];

interface Achievement { name: string; emoji: string; unlocked_at: string }
interface MemberDetail {
  id: string; name: string; avatarUrl?: string; bio?: string; upiId?: string;
  role: string; level: number; levelTitle: string; xp: number; nextXp: number;
  joinedAt: string; totalPaid: number; totalShare: number; net: number;
  expenseCount: number; achievements: Achievement[];
}

const C = {
  bg: '#0f0d0a',
  card: '#1a1612',
  border: 'rgba(245,240,232,0.15)',
  bone: '#f5f0e8',
  dim: 'rgba(245,240,232,0.45)',
  faint: 'rgba(245,240,232,0.12)',
  yellow: '#f5a623',
  green: '#b8f02a',
  pink: '#ff3d6e',
  aqua: '#00d4c8',
};

function Skeleton({ w = '100%', h = '1rem', r = '0.5rem' }: { w?: string; h?: string; r?: string }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:'rgba(245,240,232,0.08)', animation:'pulse 1.5s ease-in-out infinite' }} />;
}

export default function MemberSheet({ open, onClose, squadId, userId, currentUserId }: {
  open: boolean; onClose: () => void; squadId: string; userId: string | null; currentUserId?: string;
}) {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (open && userId) {
      setMember(null); setLoading(true); setShowQr(false); setErr('');
      console.log('[MemberSheet] fetching', `/squads/${squadId}/member/${userId}`);
      api<{ member: MemberDetail }>(`/squads/${squadId}/member/${userId}`)
        .then((d) => { console.log('[MemberSheet] got', d.member?.name); setMember(d.member); })
        .catch((e) => { console.error('[MemberSheet] error:', e); setErr(e.message || 'Load nahi hua'); })
        .finally(() => setLoading(false));
    }
  }, [open, userId, squadId]);

  const squadRole = member ? SQUAD_ROLES.find((r) => r.condition(member)) ?? SQUAD_ROLES[SQUAD_ROLES.length - 1] : null;
  const xpPct = member ? Math.min(100, Math.round((member.xp / (member.nextXp || 1)) * 100)) : 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-40" style={{ background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)' }}
            onClick={onClose} />

          <motion.div initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
            transition={{ type:'spring', damping:30, stiffness:340 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg"
            style={{ background:C.card, borderTop:`2px solid ${C.border}`, borderLeft:`2px solid ${C.border}`, borderRight:`2px solid ${C.border}`, borderRadius:'1.5rem 1.5rem 0 0', maxHeight:'88vh', overflowY:'auto', color:C.bone }}>

            {/* Drag handle */}
            <div style={{ display:'flex', justifyContent:'center', paddingTop:'0.75rem', paddingBottom:'0.25rem' }}>
              <div style={{ width:'2.5rem', height:'0.25rem', borderRadius:'99px', background:C.border }} />
            </div>

            {/* Close */}
            <button onClick={onClose} style={{ position:'absolute', right:'1rem', top:'1rem', background:'rgba(245,240,232,0.08)', border:`1px solid ${C.border}`, borderRadius:'0.5rem', padding:'0.4rem', color:C.dim, cursor:'pointer' }}>
              <X size={16} />
            </button>

            <div style={{ padding:'0.5rem 1.5rem 3rem' }}>
              {err ? (
                <div style={{ textAlign:'center', padding:'3rem 1rem' }}>
                  <p style={{ fontSize:'2rem', marginBottom:'0.75rem' }}>😵</p>
                  <p style={{ color:'#ff3d6e', fontSize:'0.875rem', fontWeight:700, marginBottom:'0.5rem' }}>Load nahi hua bhai</p>
                  <p style={{ color:'rgba(245,240,232,0.4)', fontSize:'0.75rem' }}>{err}</p>
                  <button onClick={onClose} style={{ marginTop:'1rem', background:'rgba(245,166,35,0.2)', border:'2px solid rgba(245,166,35,0.4)', borderRadius:'0.75rem', padding:'0.5rem 1.25rem', color:'#f5a623', fontWeight:700, cursor:'pointer' }}>Close</button>
                </div>
              ) : loading || !member ? (
                /* SKELETON */
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem', paddingTop:'1.5rem' }}>
                  <div style={{ width:'5rem', height:'5rem', borderRadius:'50%', background:'rgba(245,240,232,0.08)', animation:'pulse 1.5s ease-in-out infinite' }} />
                  <Skeleton w="140px" h="1.5rem" r="0.75rem" />
                  <Skeleton w="200px" h="2.5rem" r="1.25rem" />
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', width:'100%', marginTop:'0.5rem' }}>
                    {[1,2,3,4].map((n) => <Skeleton key={n} h="4rem" r="0.75rem" />)}
                  </div>
                  <Skeleton w="100%" h="5rem" r="0.75rem" />
                </div>
              ) : (
                <>
                  {/* HERO */}
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', paddingTop:'0.5rem', paddingBottom:'1.5rem' }}>
                    <div style={{ position:'relative' }}>
                      <Avatar url={member.avatarUrl} name={member.name} size="h-20 w-20" />
                      {member.role === 'admin' && (
                        <span style={{ position:'absolute', bottom:'-4px', right:'-4px', background:C.yellow, color:'#0e0c0a', fontSize:'0.5rem', fontWeight:900, padding:'2px 8px', borderRadius:'99px', border:'2px solid #0e0c0a', transform:'rotate(6deg)', textTransform:'uppercase', letterSpacing:'0.05em' }}>ADMIN</span>
                      )}
                    </div>

                    <h2 style={{ marginTop:'0.75rem', fontFamily:'Sora, sans-serif', fontSize:'1.5rem', fontWeight:800, color:C.bone }}>
                      {member.name}
                    </h2>
                    {member.bio && <p style={{ marginTop:'0.25rem', fontSize:'0.875rem', color:C.dim }}>{member.bio}</p>}

                    {/* Squad Role Badge */}
                    <div style={{ marginTop:'0.75rem', display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(245,166,35,0.15)', border:`2px solid rgba(245,166,35,0.5)`, borderRadius:'999px', padding:'0.4rem 1rem' }}>
                      <span style={{ fontSize:'1.2rem' }}>{squadRole?.emoji}</span>
                      <span style={{ fontFamily:'Sora, sans-serif', fontSize:'0.875rem', fontWeight:800, color:C.yellow }}>{squadRole?.title}</span>
                    </div>
                  </div>

                  {/* STATS GRID */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', marginBottom:'0.75rem' }}>
                    {[
                      { label:'Joined', value: new Date(member.joinedAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}), color: C.bone },
                      { label:'Expenses Added', value: String(member.expenseCount), color: C.aqua },
                      { label:'Total Paid', value: toRupees(member.totalPaid), color: C.yellow },
                      { label:'Net Balance', value: `${member.net>=0?'+':'−'}${toRupees(Math.abs(member.net))}`, color: member.net>=0?C.green:C.pink },
                    ].map((stat) => (
                      <div key={stat.label} style={{ background:'rgba(245,240,232,0.06)', border:`2px solid ${C.border}`, borderRadius:'0.75rem', padding:'0.75rem' }}>
                        <p style={{ fontSize:'0.6rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.dim, marginBottom:'0.25rem' }}>{stat.label}</p>
                        <p style={{ fontFamily:'Sora, sans-serif', fontSize:'1rem', fontWeight:800, color:stat.color }}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* LEVEL + XP */}
                  <div style={{ background:'rgba(245,240,232,0.06)', border:`2px solid ${C.border}`, borderRadius:'0.75rem', padding:'1rem', marginBottom:'0.75rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                      <div>
                        <p style={{ fontSize:'0.6rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.dim }}>Squad Level</p>
                        <p style={{ fontFamily:'Sora, sans-serif', fontWeight:800, color:C.yellow }}>Lv {member.level} · {member.levelTitle}</p>
                      </div>
                      <p style={{ fontSize:'0.8rem', fontWeight:700, color:C.dim }}>{member.xp} / {member.nextXp} XP</p>
                    </div>
                    <div style={{ height:'10px', borderRadius:'99px', background:'rgba(245,240,232,0.1)', overflow:'hidden' }}>
                      <motion.div initial={{ width:0 }} animate={{ width:`${xpPct}%` }} transition={{ duration:1, ease:'easeOut' }}
                        style={{ height:'100%', borderRadius:'99px', background:'linear-gradient(90deg, #f5a623, #ff3d6e)' }} />
                    </div>
                  </div>

                  {/* ACHIEVEMENTS */}
                  {member.achievements.length > 0 && (
                    <div style={{ marginBottom:'0.75rem' }}>
                      <p style={{ fontSize:'0.6rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.dim, marginBottom:'0.5rem' }}>Achievements</p>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem' }}>
                        {member.achievements.map((a) => (
                          <div key={a.name} style={{ display:'flex', alignItems:'center', gap:'0.35rem', background:'rgba(245,166,35,0.12)', border:`2px solid rgba(245,166,35,0.35)`, borderRadius:'0.75rem', padding:'0.3rem 0.75rem', fontSize:'0.75rem', fontWeight:700, color:C.yellow }}>
                            {a.emoji} {a.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* UPI QR */}
                  {member.upiId ? (
                    <div style={{ background:'rgba(245,240,232,0.06)', border:`2px solid ${C.border}`, borderRadius:'0.75rem', padding:'1rem' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
                        <div>
                          <p style={{ fontSize:'0.6rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.dim }}>UPI Payment</p>
                          <p style={{ fontFamily:'monospace', fontSize:'0.9rem', fontWeight:700, color:C.bone, marginTop:'0.15rem' }}>📱 {member.upiId}</p>
                        </div>
                        <button onClick={() => setShowQr(!showQr)}
                          style={{ display:'flex', alignItems:'center', gap:'0.35rem', background:'rgba(245,166,35,0.15)', border:`2px solid rgba(245,166,35,0.4)`, borderRadius:'0.6rem', padding:'0.4rem 0.75rem', fontSize:'0.75rem', fontWeight:700, color:C.yellow, cursor:'pointer' }}>
                          <QrCode size={14} /> {showQr ? 'Hide QR' : 'Show QR'}
                        </button>
                      </div>
                      <AnimatePresence>
                        {showQr && (
                          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                            style={{ overflow:'hidden', textAlign:'center' }}>
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${member.upiId}&pn=${encodeURIComponent(member.name)}&cu=INR`)}&bgcolor=1a1612&color=f5a623&margin=3`}
                              alt="UPI QR"
                              style={{ width:'180px', height:'180px', borderRadius:'0.75rem', border:`3px solid rgba(245,166,35,0.4)`, margin:'0 auto 0.75rem' }}
                            />
                            <p style={{ fontSize:'0.7rem', color:C.dim, marginBottom:'0.5rem' }}>Scan with GPay · PhonePe · Paytm</p>
                            <a href={`upi://pay?pa=${member.upiId}&pn=${encodeURIComponent(member.name)}&cu=INR`}
                              style={{ display:'inline-flex', alignItems:'center', gap:'0.4rem', background:'rgba(245,166,35,0.15)', border:`2px solid rgba(245,166,35,0.4)`, borderRadius:'0.75rem', padding:'0.5rem 1rem', fontSize:'0.8rem', fontWeight:700, color:C.yellow, textDecoration:'none' }}>
                              <Smartphone size={14} /> Open Payment App
                            </a>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:'0.5rem', fontSize:'0.75rem', color:C.dim }}>
                      {currentUserId === member.id ? '💳 Profile mein UPI ID add karo to enable QR payments' : 'No UPI ID set yet'}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
