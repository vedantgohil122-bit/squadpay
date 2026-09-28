import { create } from 'zustand';
import { api } from '../lib/api';
import { subscribeToPush as doSubscribe } from '../lib/push';

export interface AppNotification {
  id: string;
  user_id: string;
  squad_id?: string;
  squad_name?: string;
  squad_emoji?: string;
  type: string;
  message: string;
  is_read: boolean;
  metadata?: any;
  created_at: string;
}

interface NotifState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: (squadId?: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: (squadId?: string) => Promise<void>;
  subscribeToPush: () => Promise<boolean>;
  pollInterval: number | null;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useNotifications = create<NotifState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  pollInterval: null,

  // In-app list — used for the bell dropdown. Real-time "app closed" delivery
  // is handled separately by the service worker's push handler, not this.
  fetchNotifications: async (squadId) => {
    set({ loading: true });
    try {
      const params = squadId ? `?squadId=${squadId}` : '';
      const data = await api<{ notifications: AppNotification[]; unreadCount: number }>(`/notifications${params}`);
      set({ notifications: data.notifications, unreadCount: data.unreadCount });
    } catch { /* non-fatal — bell just shows stale data until next poll */ }
    finally { set({ loading: false }); }
  },

  markRead: async (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
    try { await api(`/notifications/${id}/read`, { method: 'PATCH' }); } catch {}
  },

  markAllRead: async (squadId) => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
    try { await api('/notifications/read-all', { method: 'POST', body: JSON.stringify({ squadId: squadId || null }) }); } catch {}
  },

  subscribeToPush: () => doSubscribe(),

  startPolling: () => {
    const existing = get().pollInterval;
    if (existing) return;
    get().fetchNotifications();
    const id = window.setInterval(() => get().fetchNotifications(), 30000) as unknown as number;
    set({ pollInterval: id });
  },

  stopPolling: () => {
    const id = get().pollInterval;
    if (id) clearInterval(id);
    set({ pollInterval: null });
  },
}));
