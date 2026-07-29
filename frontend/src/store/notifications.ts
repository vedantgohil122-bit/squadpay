import { create } from 'zustand';
import { api } from '../lib/api';
import { notifySquadEvent } from '../lib/push';

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
  fetch: (squadId?: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: (squadId?: string) => Promise<void>;
  pollInterval: number | null;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useNotifications = create<NotifState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  pollInterval: null,

  fetch: async (squadId) => {
    set({ loading: true });
    try {
      const params = squadId ? `?squadId=${squadId}` : '';
      const data = await api<{ notifications: AppNotification[]; unreadCount: number }>(`/notifications${params}`);
      const prevIds = new Set(get().notifications.map((n) => n.id));
      const newOnes = data.notifications.filter((n) => !prevIds.has(n.id) && !n.is_read);
      // Local push for each new unread notification
      newOnes.forEach((n) => {
        notifySquadEvent(n.type, n.message);
      });
      set({ notifications: data.notifications, unreadCount: data.unreadCount });
    } catch {} finally { set({ loading: false }); }
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

  startPolling: () => {
    const existing = get().pollInterval;
    if (existing) return;
    get().fetch();
    const id = window.setInterval(() => get().fetch(), 30000) as unknown as number;
    set({ pollInterval: id });
  },

  stopPolling: () => {
    const id = get().pollInterval;
    if (id) clearInterval(id);
    set({ pollInterval: null });
  },
}));
