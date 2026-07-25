// ============================================================
// OTP SCREEN — 6-digit code entry, used for login/register/reset
// Auto-advances between boxes, paste-friendly, resend cooldown
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, Mail } from 'lucide-react';

export default function OtpScreen({
  email, onSubmit, onResend, onBack, title, subtitle,
}: {
  email: string;
  onSubmit: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
  title: string;
  subtitle?: string;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(45);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => { inputsRef.current[0]?.focus(); }, []);

  const code = digits.join('');

  const setDigit = (i: number, val: string) => {
    const clean = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      setDigits(pasted.split(''));
      inputsRef.current[5]?.focus();
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };

  const submit = async () => {
    if (code.length !== 6) { setError('Pura 6-digit code daalo'); return; }
    setError(''); setBusy(true);
    try { await onSubmit(code); }
    catch (err: any) {
      setError(err.message || 'Galat code');
      setDigits(Array(6).fill(''));
      inputsRef.current[0]?.focus();
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setResending(true); setError('');
    try { await onResend(); setCooldown(45); setDigits(Array(6).fill('')); inputsRef.current[0]?.focus(); }
    catch (err: any) { setError(err.message); }
    finally { setResending(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-xs font-bold" style={{ color: 'rgba(245,240,232,0.5)' }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div className="flex flex-col items-center text-center mb-6">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(245,166,35,0.15)', border: '2px solid rgba(245,166,35,0.4)' }}>
          <Mail size={20} color="#f5a623" />
        </div>
        <h2 className="font-display text-lg font-extrabold" style={{ color: '#f5f0e8' }}>{title}</h2>
        <p className="mt-1 text-xs" style={{ color: 'rgba(245,240,232,0.5)' }}>
          {subtitle || 'Code bheja gaya hai'} <b style={{ color: '#f5a623' }}>{email}</b> pe
        </p>
      </div>

      <div className="flex justify-center gap-2 mb-5" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputsRef.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="h-12 w-10 rounded-xl text-center text-lg font-extrabold outline-none transition sm:h-14 sm:w-12"
            style={{
              background: '#1a1612', color: '#f5f0e8',
              border: `2px solid ${error ? '#ff3d6e' : d ? '#f5a623' : 'rgba(245,240,232,0.15)'}`,
            }}
          />
        ))}
      </div>

      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-xs font-semibold mb-4" style={{ color: '#ff3d6e' }}>
          {error}
        </motion.p>
      )}

      <button onClick={submit} disabled={busy || code.length !== 6}
        className="w-full rounded-xl py-3.5 font-display font-extrabold text-sm transition active:scale-[0.98] disabled:opacity-50"
        style={{ background: '#f5a623', color: '#0e0c0a', border: '2px solid rgba(0,0,0,0.2)' }}>
        {busy ? 'Verify ho raha hai...' : 'Verify karo →'}
      </button>

      <div className="mt-4 text-center">
        {cooldown > 0 ? (
          <p className="text-xs" style={{ color: 'rgba(245,240,232,0.4)' }}>
            Naya code <b style={{ color: 'rgba(245,240,232,0.6)' }}>{cooldown}s</b> mein bhej sakte ho
          </p>
        ) : (
          <button onClick={resend} disabled={resending} className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: '#f5a623' }}>
            <RefreshCw size={12} className={resending ? 'animate-spin' : ''} /> {resending ? 'Bhej rahe hain...' : 'Code dobara bhejo'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
