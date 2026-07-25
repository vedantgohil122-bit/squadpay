import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Modal } from './ui';
import { play, initSound } from '../lib/sound';

interface Member { id: string; name: string; avatar_url?: string }

const COLORS = ['#f5a623','#ff3d6e','#b8f02a','#00d4c8','#a78bfa','#fb923c','#e879f9','#34d399'];

export default function BakraWheel({ open, onClose, members }: { open: boolean; onClose: () => void; members: Member[] }) {
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Member | null>(null);
  const [rotation, setRotation] = useState(0);
  const spinRef = useRef(0);

  const spin = () => {
    if (spinning || members.length < 2) return;
    initSound();
    play('wheelSpin');
    setWinner(null); setSpinning(true);
    const winIdx = Math.floor(Math.random() * members.length);
    const sliceDeg = 360 / members.length;
    const targetAngle = 360 * 8 + (360 - (winIdx * sliceDeg + sliceDeg / 2));
    const newRot = spinRef.current + targetAngle;
    spinRef.current = newRot;
    setRotation(newRot);
    setTimeout(() => { play('wheelLand'); setWinner(members[winIdx]); setSpinning(false); }, 4200);
  };

  const r = 120;
  const sliceDeg = 360 / members.length;
  const sliceRad = (sliceDeg * Math.PI) / 180;

  const makeSlice = (idx: number) => {
    const startAngle = ((idx * sliceDeg - 90) * Math.PI) / 180;
    const endAngle = startAngle + sliceRad;
    const x1 = r * Math.cos(startAngle), y1 = r * Math.sin(startAngle);
    const x2 = r * Math.cos(endAngle), y2 = r * Math.sin(endAngle);
    const large = sliceDeg > 180 ? 1 : 0;
    return `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  };

  const labelPos = (idx: number) => {
    const angle = ((idx * sliceDeg + sliceDeg / 2 - 90) * Math.PI) / 180;
    return { x: (r * 0.62) * Math.cos(angle), y: (r * 0.62) * Math.sin(angle) };
  };

  return (
    <Modal open={open} onClose={onClose} title="🎡 Bakra Wheel — Kaun Bharega?">
      <div className="flex flex-col items-center gap-5">
        <p className="text-xs text-center" style={{ color: 'rgba(245,240,232,0.5)' }}>
          Spin karo — destiny decide karegi kaun pay karega aaj 💀
        </p>

        <div className="relative" style={{ width: 280, height: 280 }}>
          {/* pointer */}
          <div className="absolute right-[-8px] top-1/2 z-10 -translate-y-1/2" style={{ fontSize: 24 }}>▶</div>

          <motion.div animate={{ rotate: rotation }} transition={{ duration: 4, ease: [0.17, 0.67, 0.12, 0.99] }}
            className="absolute inset-0 rounded-full" style={{ border: '4px solid #f5a623', boxShadow: '0 0 0 4px #0e0c0a, 0 0 0 6px rgba(245,166,35,0.4)' }}>
            <svg viewBox="-130 -130 260 260" width="100%" height="100%">
              {members.map((m, i) => (
                <g key={m.id}>
                  <path d={makeSlice(i)} fill={COLORS[i % COLORS.length]} stroke="#0e0c0a" strokeWidth="2" />
                  <text x={labelPos(i).x} y={labelPos(i).y} textAnchor="middle" dominantBaseline="middle"
                    fill="#0e0c0a" fontSize="10" fontWeight="800" fontFamily="Sora, sans-serif"
                    transform={`rotate(${i * sliceDeg + sliceDeg / 2}, ${labelPos(i).x}, ${labelPos(i).y})`}>
                    {m.name.split(' ')[0].slice(0, 7)}
                  </text>
                </g>
              ))}
              <circle r="20" fill="#0e0c0a" stroke="#f5a623" strokeWidth="3" />
              <text textAnchor="middle" dominantBaseline="middle" fill="#f5a623" fontSize="14" fontWeight="900">💀</text>
            </svg>
          </motion.div>
        </div>

        {winner && !spinning && (
          <motion.div initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.5 }}
            className="bcard bcard-pink w-full p-4 text-center">
            <p className="font-display text-2xl font-extrabold" style={{ color: '#f5f0e8' }}>{winner.name.split(' ')[0]} 💀</p>
            <p className="mt-1 text-sm" style={{ color: 'rgba(245,240,232,0.6)' }}>Aaj ka bakra mil gaya. Screenshot le lo. 📸</p>
          </motion.div>
        )}

        <button onClick={() => { initSound(); spin(); }} disabled={spinning || members.length < 2}
          className="bbtn bbtn-pink w-full justify-center py-3 text-base">
          {spinning ? 'Ghoom raha hai...' : winner ? '🔄 Phir se spin karo' : '🎡 SPIN KARO'}
        </button>
        {members.length < 2 && <p className="text-xs text-center" style={{ color: '#fb7185' }}>Pehle squad mein koi aur add karo bhai 😅</p>}
      </div>
    </Modal>
  );
}
