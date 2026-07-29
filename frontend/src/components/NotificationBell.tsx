import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useNotifications } from '../store/notifications';
import { timeAgo } from '../lib/money';
import { play, initSound } from '../lib/sound';
import { useNavigate } from 'react-router-dom';

const TYPE_ICON: Record<string, string> = {
  expense_added: '🧾',
  settlement_pending: '💸',
  settlement_completed: '✅',
  member_joined: '👋',
  treasury_contribution: '🏦',
  achievement: '🏆',
  default: '🔔',
};

export function NotificationBell({ squadId }: { squadId?: string }) {
  const { notifications, unreadCount, fetch, markRead, markAllRead, startPolling, stopPolling } = useNotifications();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, []);

  useEffect(() => {
    if (open) fetch(squadId);
  }, [open, squadId]);

  const filtered = squadId ? notifications.filter((n) => !n.squad_id || n.squad_id === squadId) : notifications;

  return (
    <div className="relative">
      <button
        onClick={() => {
          initSound();
          play('tap');
          setOpen(!open);
        }}
        className="relative rounded-xl p-2.5 border-2 transition active:scale-90"
        style={{
          background: 'var(--card)',
          borderColor: unreadCount > 0 ? 'var(--marigold)' : 'var(--border)',
          color: 'var(--text)',
        }}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold"
            style={{ background: '#ff3d6e', color: 'white', border: '2px solid var(--bg)' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: 'var(--card)', border: '2px solid var(--border-strong)', maxHeight: '70vh' }}
            >
              <div className="flex items-center justify-between p-4" style={{ borderBottom: '2px solid var(--border-ghost)' }}>
                <div>
                  <h3 className="font-display font-extrabold text-sm" style={{ color: 'var(--text)' }}>
                    Notifications {unreadCount > 0 && `• ${unreadCount} new`}
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    Squad ki latest khabar
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => {
                        play('click');
                        markAllRead(squadId);
                      }}
                      className="rounded-lg p-2 transition hover:opacity-80"
                      style={{ background: 'var(--border-ghost)', color: 'var(--text-dim)' }}
                      title="Mark all read"
                    >
                      <CheckCheck className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="rounded-lg p-1.5" style={{ color: 'var(--text-faint)' }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: '50vh' }}>
                {filtered.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-3xl mb-2">🔕</p>
                    <p className="font-display font-bold text-sm" style={{ color: 'var(--text)' }}>All caught up!</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>No notifications abhi</p>
                  </div>
                ) : (
                  filtered.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        markRead(n.id);
                        if (n.squad_id) nav(`/app/squad/${n.squad_id}`);
                      }}
                      className="flex gap-3 p-4 cursor-pointer transition hover:opacity-90"
                      style={{
                        background: n.is_read ? 'transparent' : 'rgba(var(--bone-rgb) / 0.04)',
                        borderLeft: n.is_read ? '3px solid transparent' : '3px solid var(--marigold)',
                        borderBottom: '1px solid var(--border-ghost)',
                      }}
                    >
                      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm" style={{ background: 'var(--card-soft)' }}>
                        {TYPE_ICON[n.type] || TYPE_ICON.default}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug" style={{ color: 'var(--text)', fontWeight: n.is_read ? 400 : 700 }}>
                          {n.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {n.squad_name && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'var(--border-ghost)', color: 'var(--text-faint)' }}>
                              {n.squad_emoji} {n.squad_name}
                            </span>
                          )}
                          <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{timeAgo(n.created_at)}</span>
                        </div>
                      </div>
                      {!n.is_read && <div className="h-2 w-2 rounded-full bg-marigold shrink-0 mt-2" style={{ background: 'var(--marigold)' }} />}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Mini hook wrapper for permission prompt
export function NotificationPermissionPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      const seen = localStorage.getItem('squadpay_notif_prompt_seen');
      if (!seen) setShow(true);
    }
  }, []);
  if (!show) return null;
  return (
    <div className="bcard bcard-yellow p-4 flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        <span className="text-xl">🔔</span>
        <div>
          <p className="font-display font-bold text-sm" style={{ color: 'var(--text)' }}>Notifications on karo?</p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Squad ke kharche aur settlements ka instant pata chalega</p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => {
            localStorage.setItem('squadpay_notif_prompt_seen', '1');
            setShow(false);
          }}
          className="bbtn bbtn-ghost px-3 py-1.5 text-xs"
        >
          Baad mein
        </button>
        <button
          onClick={async () => {
            const perm = await Notification.requestPermission();
            localStorage.setItem('squadpay_notif_prompt_seen', '1');
            setShow(false);
            if (perm === 'granted') play('success');
          }}
          className="bbtn px-3 py-1.5 text-xs"
        >
          Allow
        </button>
      </div>
    </div>
  );
}
