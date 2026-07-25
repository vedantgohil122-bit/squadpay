import { create } from 'zustand';
import { api } from '../lib/api';

export interface User { id: string; name: string; email: string; avatarUrl?: string; bio?: string; upiId?: string }

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Step 1: verifies password, server sends OTP. Throws on bad credentials. */
  loginStart: (email: string, password: string) => Promise<void>;
  /** Step 2: submits the OTP code, completes login and sets the user. */
  loginVerify: (email: string, code: string) => Promise<void>;
  /** Step 1: validates fields, server sends OTP. Returns a pendingToken to carry to step 2. */
  registerStart: (name: string, email: string, password: string) => Promise<{ pendingToken: string }>;
  /** Step 2: submits the OTP code, actually creates the account and sets the user. */
  registerVerify: (pendingToken: string, code: string) => Promise<void>;
  resendOtp: (email: string, purpose: 'login' | 'register') => Promise<void>;
  hydrate: () => Promise<void>;
  logout: () => void;
  setUser: (u: User) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,

  async loginStart(email, password) {
    // Server responds { requiresOtp: true } — no token yet, nothing to store.
    await api<{ requiresOtp: boolean; email: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
  },

  async loginVerify(email, code) {
    const d = await api<{ token: string; user: User }>('/auth/login/verify', {
      method: 'POST', body: JSON.stringify({ email, code }),
    });
    localStorage.setItem('squadpay_token', d.token);
    set({ user: d.user });
  },

  async registerStart(name, email, password) {
    const d = await api<{ requiresOtp: boolean; pendingToken: string; email: string }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ name, email, password }),
    });
    return { pendingToken: d.pendingToken };
  },

  async registerVerify(pendingToken, code) {
    const d = await api<{ token: string; user: User }>('/auth/register/verify', {
      method: 'POST', body: JSON.stringify({ pendingToken, code }),
    });
    localStorage.setItem('squadpay_token', d.token);
    set({ user: d.user });
  },

  async resendOtp(email, purpose) {
    await api('/auth/otp/resend', { method: 'POST', body: JSON.stringify({ email, purpose }) });
  },

  async hydrate() {
    try {
      if (!localStorage.getItem('squadpay_token')) return set({ loading: false });
      const d = await api<{ user: User }>('/auth/me');
      set({ user: d.user, loading: false });
    } catch {
      localStorage.removeItem('squadpay_token');
      set({ user: null, loading: false });
    }
  },

  logout() {
    localStorage.removeItem('squadpay_token');
    set({ user: null });
  },

  setUser(u) { set({ user: u }); },
}));
