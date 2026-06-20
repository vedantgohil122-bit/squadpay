import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../store/auth';
import { MarqueeTape } from '../components/ui';
import { api } from '../lib/api';
import OtpScreen from '../components/OtpScreen';

// ── VALIDATORS ──────────────────────────────────────────────
const validators = {
  name: (v: string) => {
    if (!v.trim()) return 'Naam toh daalo bhai 😅';
    if (v.trim().length < 2) return 'Naam kam se kam 2 characters ka hona chahiye';
    if (v.trim().length > 50) return 'Naam itna lamba? 50 se kam rakho 😄';
    return '';
  },
  email: (v: string) => {
    if (!v.trim()) return 'Email toh daalo bhai 📧';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Ye email sahi nahi lag rahi — example@gmail.com jaisi honi chahiye';
    if (v.length > 100) return 'Email bahut lamba hai';
    return '';
  },
  password: (v: string) => {
    if (!v) return 'Password toh daalo bhai 🔒';
    if (v.length < 8) return `Password kam se kam 8 characters ka hona chahiye (abhi ${v.length} hai)`;
    if (!/[A-Z]/.test(v) && !/[0-9]/.test(v)) return 'Password mein ek number ya capital letter add karo';
    return '';
  },
};

function getStrength(p: string): { score: number; label: string; color: string } {
  if (!p) return { score: 0, label: '', color: '' };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (score <= 1) return { score, label: 'Bahut weak 😬', color: '#ff3d6e' };
  if (score <= 2) return { score, label: 'Thoda theek 🤔', color: '#f5a623' };
  if (score <= 3) return { score, label: 'Acha hai 👍', color: '#f5a623' };
  return { score, label: 'Strong! 💪', color: '#b8f02a' };
}

// ── FIELD COMPONENT ─────────────────────────────────────────
function Field({ label, type = 'text', value, onChange, onBlur, error, touched, placeholder, children }: {
  label: string; type?: string; value: string; placeholder?: string;
  onChange: (v: string) => void; onBlur: () => void;
  error: string; touched: boolean; children?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const hasError = touched && error;
  const isValid = touched && !error && value;

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-extrabold uppercase tracking-wider" style={{ color: 'rgba(245,240,232,0.6)' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={isPassword && show ? 'text' : type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full rounded-xl px-4 py-3 pr-10 text-sm font-medium outline-none transition"
          style={{
            background: '#1a1612',
            border: `2px solid ${hasError ? '#ff3d6e' : isValid ? '#b8f02a' : 'rgba(245,240,232,0.15)'}`,
            color: '#f5f0e8',
            boxShadow: hasError ? '0 0 0 3px rgba(255,61,110,0.1)' : isValid ? '0 0 0 3px rgba(184,240,42,0.1)' : 'none',
          }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isPassword && (
            <button type="button" onClick={() => setShow(!show)}
              style={{ color: 'rgba(245,240,232,0.4)', cursor: 'pointer', background: 'none', border: 'none', padding: '2px' }}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
          {!isPassword && isValid && <CheckCircle2 size={16} color="#b8f02a" />}
          {!isPassword && hasError && <XCircle size={16} color="#ff3d6e" />}
        </div>
      </div>
      {children}
      {hasError && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#ff3d6e' }}>
          <AlertCircle size={12} /> {error}
        </motion.p>
      )}
      {isValid && !hasError && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#b8f02a' }}>
          <CheckCircle2 size={12} /> Sahi hai ✓
        </motion.p>
      )}
    </div>
  );
}

export function Login()    { return <AuthCard mode="login" />; }
export function Register() { return <AuthCard mode="register" />; }

// Screens this card can be in. Credentials -> Otp -> (navigate away on success).
// Forgot password is a parallel mini-flow: request -> otp -> new password.
type Screen = 'credentials' | 'otp' | 'forgot-request' | 'forgot-otp' | 'forgot-newpass';

function AuthCard({ mode }: { mode: 'login' | 'register' }) {
  const nav = useNavigate();
  const { loginStart, loginVerify, registerStart, registerVerify, resendOtp } = useAuth();

  const [screen, setScreen] = useState<Screen>('credentials');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [touched, setTouch] = useState({ name: false, email: false, password: false });
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingToken, setPendingToken] = useState(''); // only used for register's 2nd step

  // ── Forgot password mini-flow state ──
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const errors = {
    name: mode === 'register' ? validators.name(form.name) : '',
    email: validators.email(form.email),
    password: mode === 'register' ? validators.password(form.password) : (form.password ? '' : 'Password daalo bhai'),
  };

  const strength = getStrength(form.password);
  const isValid = mode === 'login'
    ? !errors.email && !errors.password && form.email && form.password
    : !errors.name && !errors.email && !errors.password && form.name && form.email && form.password;

  const touch = (field: keyof typeof touched) => setTouch((t) => ({ ...t, [field]: true }));
  const touchAll = () => setTouch({ name: true, email: true, password: true });

  // ── Step 1: submit credentials, server sends OTP, move to otp screen ──
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    touchAll();
    if (!isValid) return;
    setServerError(''); setBusy(true);
    try {
      if (mode === 'login') {
        await loginStart(form.email, form.password);
      } else {
        const d = await registerStart(form.name, form.email, form.password);
        setPendingToken(d.pendingToken);
      }
      setScreen('otp');
    } catch (err: any) {
      setServerError(err.message || 'Kuch toh gadbad hai, dobara try karo');
    } finally { setBusy(false); }
  };

  // ── Step 2: submit OTP code ──
  const handleOtpSubmit = async (code: string) => {
    if (mode === 'login') await loginVerify(form.email, code);
    else await registerVerify(pendingToken, code);
    nav('/app');
  };

  const handleOtpResend = async () => {
    await resendOtp(form.email, mode);
  };

  // ── Forgot password handlers ──
  const requestReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) { setResetError('Email toh daalo bhai'); return; }
    setResetError(''); setResetBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: resetEmail }) });
      setScreen('forgot-otp');
    } catch (err: any) { setResetError(err.message); }
    finally { setResetBusy(false); }
  };

  const verifyResetOtp = async (code: string) => {
    setResetCode(code); // stash it, actually used together with newPassword in the next step
    setScreen('forgot-newpass');
  };

  const resendResetOtp = async () => {
    await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: resetEmail }) });
  };

  const submitNewPassword = async (e: FormEvent) => {
    e.preventDefault();
    const pwError = validators.password(newPassword);
    if (pwError) { setResetError(pwError); return; }
    setResetError(''); setResetBusy(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail, code: resetCode, newPassword }),
      });
      setResetDone(true);
    } catch (err: any) {
      setResetError(err.message);
      // If the code itself was wrong, bounce back to the OTP screen to retry
      if (/code|expire/i.test(err.message)) setScreen('forgot-otp');
    }
    finally { setResetBusy(false); }
  };

  const backToCredentials = () => { setScreen('credentials'); setServerError(''); };
  const openForgotPassword = () => { setResetEmail(form.email); setResetError(''); setResetDone(false); setScreen('forgot-request'); };

  return (
    <main className="flex min-h-screen flex-col" style={{ background: '#0e0c0a' }}>
      <MarqueeTape />
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">

          <Link to="/" className="mb-6 flex justify-center">
            <img src="/favicon.png" alt="SquadPay" className="h-10 w-auto" />
          </Link>

          <div className="rounded-2xl p-7" style={{ background: '#161310', border: '2px solid #f5a623', boxShadow: '4px 4px 0 rgba(245,166,35,0.3)' }}>
            <AnimatePresence mode="wait">

              {/* ── SCREEN: CREDENTIALS ── */}
              {screen === 'credentials' && (
                <motion.div key="credentials" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h1 className="font-display text-xl font-extrabold" style={{ color: '#f5f0e8' }}>
                    {mode === 'login' ? 'Wapis aao! 👋' : 'Squad mein aao! 🎉'}
                  </h1>
                  <p className="mt-1 text-xs" style={{ color: 'rgba(245,240,232,0.5)' }}>
                    {mode === 'login' ? 'Squad tumhara intezaar kar rahi hai.' : 'Email OTP se secure — 30 second mein hisaab shuru.'}
                  </p>

                  <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                    {mode === 'register' && (
                      <Field label="Naam" value={form.name} placeholder="Vedant"
                        error={errors.name} touched={touched.name}
                        onChange={(v) => setForm({ ...form, name: v })}
                        onBlur={() => touch('name')} />
                    )}

                    <Field label="Email" type="email" value={form.email} placeholder="tum@gmail.com"
                      error={errors.email} touched={touched.email}
                      onChange={(v) => setForm({ ...form, email: v })}
                      onBlur={() => touch('email')} />

                    <Field label="Password" type="password" value={form.password}
                      placeholder={mode === 'register' ? 'Min 8 characters' : 'Tumhara password'}
                      error={errors.password} touched={touched.password}
                      onChange={(v) => setForm({ ...form, password: v })}
                      onBlur={() => touch('password')}>
                      {mode === 'register' && form.password && (
                        <div className="mt-1.5">
                          <div className="flex gap-1 mb-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                                style={{ background: i <= strength.score ? strength.color : 'rgba(245,240,232,0.1)' }} />
                            ))}
                          </div>
                          <p className="text-[11px] font-semibold" style={{ color: strength.color }}>{strength.label}</p>
                        </div>
                      )}
                    </Field>

                    {mode === 'login' && (
                      <button type="button" onClick={openForgotPassword}
                        className="block text-right w-full text-[11px] font-bold" style={{ color: 'rgba(245,166,35,0.8)' }}>
                        Password bhool gaye?
                      </button>
                    )}

                    {serverError && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-2 rounded-xl px-4 py-3"
                        style={{ background: 'rgba(255,61,110,0.1)', border: '2px solid rgba(255,61,110,0.3)' }}>
                        <AlertCircle size={16} color="#ff3d6e" className="shrink-0 mt-0.5" />
                        <p className="text-xs font-semibold" style={{ color: '#ff3d6e' }}>{serverError}</p>
                      </motion.div>
                    )}

                    <button type="submit" disabled={busy}
                      className="w-full rounded-xl py-3.5 font-display font-extrabold text-sm transition active:scale-[0.98] disabled:opacity-60"
                      style={{
                        background: isValid ? '#f5a623' : 'rgba(245,166,35,0.3)',
                        color: isValid ? '#0e0c0a' : 'rgba(245,240,232,0.4)',
                        border: '2px solid rgba(0,0,0,0.2)',
                        cursor: isValid ? 'pointer' : 'not-allowed',
                      }}>
                      {busy ? 'Ek sec...' : mode === 'login' ? 'Code bhejo →' : 'Account banao →'}
                    </button>

                    {mode === 'register' && (
                      <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(245,240,232,0.04)', border: '1px solid rgba(245,240,232,0.08)' }}>
                        <p className="text-[11px] font-bold mb-1.5" style={{ color: 'rgba(245,240,232,0.5)' }}>Password mein hona chahiye:</p>
                        {[
                          { rule: form.password.length >= 8, text: 'Min 8 characters' },
                          { rule: /[A-Z]/.test(form.password) || /[0-9]/.test(form.password), text: 'Ek number ya capital letter' },
                        ].map(({ rule, text }) => (
                          <div key={text} className="flex items-center gap-1.5 text-[11px] mb-0.5">
                            {rule ? <CheckCircle2 size={11} color="#b8f02a" /> : <XCircle size={11} color="rgba(245,240,232,0.2)" />}
                            <span style={{ color: rule ? '#b8f02a' : 'rgba(245,240,232,0.3)' }}>{text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </form>

                  <p className="mt-5 text-center text-xs" style={{ color: 'rgba(245,240,232,0.4)' }}>
                    {mode === 'login'
                      ? <> Naya hu? <Link to="/register" style={{ color: '#f5a623', fontWeight: 700 }}>Account banao</Link></>
                      : <> Pehle se ho? <Link to="/login" style={{ color: '#f5a623', fontWeight: 700 }}>Login karo</Link></>}
                  </p>
                </motion.div>
              )}

              {/* ── SCREEN: OTP (login or register) ── */}
              {screen === 'otp' && (
                <OtpScreen
                  key="otp"
                  email={form.email}
                  title={mode === 'login' ? 'Login confirm karo' : 'Account confirm karo'}
                  onSubmit={handleOtpSubmit}
                  onResend={handleOtpResend}
                  onBack={backToCredentials}
                />
              )}

              {/* ── SCREEN: FORGOT PASSWORD — step 1, request code ── */}
              {screen === 'forgot-request' && (
                <motion.div key="forgot-request" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                  <button onClick={backToCredentials} className="mb-4 text-xs font-bold" style={{ color: 'rgba(245,240,232,0.5)' }}>
                    ← Back
                  </button>
                  <h2 className="font-display text-lg font-extrabold" style={{ color: '#f5f0e8' }}>Password reset karo 🔒</h2>
                  <p className="mt-1 text-xs mb-5" style={{ color: 'rgba(245,240,232,0.5)' }}>Apna email daalo, code bhej denge.</p>
                  <form onSubmit={requestReset} className="space-y-4">
                    <Field label="Email" type="email" value={resetEmail} placeholder="tum@gmail.com"
                      error={!resetEmail ? '' : validators.email(resetEmail)} touched={!!resetEmail}
                      onChange={setResetEmail} onBlur={() => {}} />
                    {resetError && <p className="text-xs font-semibold" style={{ color: '#ff3d6e' }}>{resetError}</p>}
                    <button type="submit" disabled={resetBusy}
                      className="w-full rounded-xl py-3.5 font-display font-extrabold text-sm transition active:scale-[0.98] disabled:opacity-60"
                      style={{ background: '#f5a623', color: '#0e0c0a', border: '2px solid rgba(0,0,0,0.2)' }}>
                      {resetBusy ? 'Bhej rahe hain...' : 'Reset code bhejo →'}
                    </button>
                  </form>
                </motion.div>
              )}

              {/* ── SCREEN: FORGOT PASSWORD — step 2, verify code ── */}
              {screen === 'forgot-otp' && (
                <OtpScreen
                  key="forgot-otp"
                  email={resetEmail}
                  title="Reset code daalo"
                  subtitle="Password reset code bheja gaya hai"
                  onSubmit={verifyResetOtp}
                  onResend={resendResetOtp}
                  onBack={() => setScreen('forgot-request')}
                />
              )}

              {/* ── SCREEN: FORGOT PASSWORD — step 3, set new password ── */}
              {screen === 'forgot-newpass' && (
                <motion.div key="forgot-newpass" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                  {!resetDone ? (
                    <>
                      <button onClick={() => setScreen('forgot-otp')} className="mb-4 text-xs font-bold" style={{ color: 'rgba(245,240,232,0.5)' }}>
                        ← Back
                      </button>
                      <h2 className="font-display text-lg font-extrabold" style={{ color: '#f5f0e8' }}>Naya password banao 🔑</h2>
                      <p className="mt-1 text-xs mb-5" style={{ color: 'rgba(245,240,232,0.5)' }}>Code verify ho gaya — ab naya password set karo.</p>
                      <form onSubmit={submitNewPassword} className="space-y-4">
                        <Field label="Naya Password" type="password" value={newPassword} placeholder="Min 8 characters"
                          error={!newPassword ? '' : validators.password(newPassword)} touched={!!newPassword}
                          onChange={setNewPassword} onBlur={() => {}} />
                        {resetError && <p className="text-xs font-semibold" style={{ color: '#ff3d6e' }}>{resetError}</p>}
                        <button type="submit" disabled={resetBusy}
                          className="w-full rounded-xl py-3.5 font-display font-extrabold text-sm transition active:scale-[0.98] disabled:opacity-60"
                          style={{ background: '#f5a623', color: '#0e0c0a', border: '2px solid rgba(0,0,0,0.2)' }}>
                          {resetBusy ? 'Set ho raha hai...' : 'Password set karo →'}
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-3xl mb-3">✅</p>
                      <h2 className="font-display text-lg font-extrabold mb-1" style={{ color: '#f5f0e8' }}>Password reset ho gaya!</h2>
                      <p className="text-xs mb-5" style={{ color: 'rgba(245,240,232,0.5)' }}>Naye password se login karo.</p>
                      <button onClick={backToCredentials}
                        className="w-full rounded-xl py-3.5 font-display font-extrabold text-sm transition active:scale-[0.98]"
                        style={{ background: '#f5a623', color: '#0e0c0a', border: '2px solid rgba(0,0,0,0.2)' }}>
                        Login karo →
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
