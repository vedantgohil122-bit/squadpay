// ============================================================
// SOUND ENGINE — Web Audio API synth sounds, zero external files
// Generates clean, satisfying UI sounds on the fly (no .mp3 loading)
// ============================================================

let audioCtx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

// Resume context on first user interaction (browsers block autoplay)
let resumed = false;
export function initSound() {
  if (resumed) return;
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  resumed = true;
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
  localStorage.setItem('squadpay_sound', v ? '1' : '0');
}
export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem('squadpay_sound');
  return stored === null ? true : stored === '1';
}
enabled = isSoundEnabled();

// ── TONE GENERATOR ──────────────────────────────────────────
function tone(freq: number, duration: number, type: OscillatorType = 'sine', startGain = 0.15, delay = 0) {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = ctx.currentTime + delay;
  gain.gain.setValueAtTime(startGain, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function sweep(startFreq: number, endFreq: number, duration: number, type: OscillatorType = 'sine', gain = 0.12, delay = 0) {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  const now = ctx.currentTime + delay;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

// ── SOUND LIBRARY ───────────────────────────────────────────
export const sfx = {
  // Light tap — buttons, tab switches
  tap: () => tone(600, 0.06, 'sine', 0.08),

  // Slightly heavier click — primary actions
  click: () => tone(750, 0.08, 'sine', 0.1),

  // Modal/sheet opening
  open: () => sweep(400, 700, 0.15, 'sine', 0.08),

  // Modal/sheet closing
  close: () => sweep(700, 400, 0.12, 'sine', 0.06),

  // Success ding — settlement confirmed, contribution added
  success: () => {
    tone(523.25, 0.12, 'sine', 0.12);       // C5
    tone(659.25, 0.15, 'sine', 0.12, 0.08); // E5
    tone(783.99, 0.2, 'sine', 0.1, 0.16);   // G5
  },

  // Coin/money sound — expense added, payment made
  coin: () => {
    tone(988, 0.08, 'square', 0.06);
    tone(1318, 0.12, 'square', 0.05, 0.05);
  },

  // Error/deny — settlement denied, validation error
  error: () => {
    tone(300, 0.15, 'sawtooth', 0.08);
    tone(220, 0.2, 'sawtooth', 0.06, 0.08);
  },

  // XP gain — achievement, level up
  xpGain: () => {
    tone(440, 0.1, 'triangle', 0.1);
    tone(554, 0.1, 'triangle', 0.1, 0.06);
    tone(659, 0.15, 'triangle', 0.12, 0.12);
  },

  // Level up — bigger fanfare
  levelUp: () => {
    [523, 659, 783, 1046].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, i * 0.08));
  },

  // Notification pop
  notify: () => tone(880, 0.1, 'sine', 0.1),

  // Bakra wheel spin (descending whoosh during spin start)
  wheelSpin: () => sweep(200, 800, 0.4, 'sawtooth', 0.05),

  // Bakra wheel land/stop
  wheelLand: () => {
    tone(200, 0.08, 'square', 0.1);
    tone(150, 0.15, 'square', 0.08, 0.05);
  },

  // Toast/celebration confetti pop
  confetti: () => {
    [600, 800, 1000, 1200].forEach((f, i) => tone(f, 0.08, 'sine', 0.06, i * 0.03));
  },

  // Swipe/navigate (wrapped slides)
  swipe: () => tone(500, 0.05, 'sine', 0.05),

  // Toggle/switch (reaction tap)
  toggle: () => tone(700, 0.05, 'sine', 0.07),

  // Delete/remove
  delete: () => sweep(500, 200, 0.15, 'sine', 0.08),

  // Refresh/reload
  refresh: () => sweep(400, 600, 0.1, 'sine', 0.06),
};

export type SfxName = keyof typeof sfx;

// Convenience wrapper — call as play('success')
export function play(name: SfxName) {
  try { sfx[name](); } catch { /* silently fail — sound is non-critical */ }
}
