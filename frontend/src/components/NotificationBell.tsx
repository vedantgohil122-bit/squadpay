import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../store/notifications';
import { timeAgo } from '../lib/money';
import { play, initSound } from '../lib/sound';

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
  const { notifications, unreadCount, fetchNotifications, markRead, markAllRead, startPolling, stopPolling } = useNotifications();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, []);

  useEffect(() => {
    if (open) fetchNotifications(squadId);
  }, [open, squadId]);

  const filtered = squadId ? notifications.filter((n) => !n.squad_id || n.squad_id === squadId) : notifications;

  return (
    <div className="relative">
      <button
        onClick={() => { initSound(); play('tap'); setOpen(!open); }}
        className="relative rounded-xl p-2.5 border-2 transition active:scale-90"
        style={{
          background: 'var(--color-ink-900)',
          borderColor: unreadCount > 0 ? 'var(--color-marigold)' : 'rgba(245,240,232,0.2)',
          color: 'var(--color-bone)',
        }}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold"
            style={{ background: 'var(--color-hot-pink)', color: 'white', border: '2px solid var(--color-ink-950)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: 'var(--color-ink-900)', border: '2px solid var(--color-bone)', maxHeight: '70vh' }}
            >
              <div className="flex items-center justify-between p-4" style={{ borderBottom: '2px solid rgba(245,240,232,0.12)' }}>
                <div>
                  <h3 className="font-display font-extrabold text-sm" style={{ color: 'var(--color-bone)' }}>
                    Notifications {unreadCount > 0 && `• ${unreadCount} new`}
                  </h3>
                  <p className="text-[11px]" style={{ color: 'rgba(245,240,232,0.45)' }}>Squad ki latest khabar</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => { play('click'); markAllRead(squadId); }}
                      className="rounded-lg p-2 transition hover:opacity-80"
                      style={{ background: 'rgba(245,240,232,0.08)', color: 'rgba(245,240,232,0.7)' }}
                      title="Mark all read"
                    >
                      <CheckCheck className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="rounded-lg p-1.5" style={{ color: 'rgba(245,240,232,0.45)' }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: '50vh' }}>
                {filtered.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-3xl mb-2">🔕</p>
                    <p className="font-display font-bold text-sm" style={{ color: 'var(--color-bone)' }}>All caught up!</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(245,240,232,0.45)' }}>No notifications abhi</p>
                  </div>
                ) : (
                  filtered.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => { markRead(n.id); setOpen(false); if (n.squad_id) nav(`/app/squad/${n.squad_id}`); }}
                      className="flex gap-3 p-4 cursor-pointer transition hover:opacity-90"
                      style={{
                        background: n.is_read ? 'transparent' : 'rgba(245,240,232,0.04)',
                        borderLeft: n.is_read ? '3px solid transparent' : '3px solid var(--color-marigold)',
                        borderBottom: '1px solid rgba(245,240,232,0.08)',
                      }}
                    >
                      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm" style={{ background: 'var(--color-ink-800)' }}>
                        {TYPE_ICON[n.type] || TYPE_ICON.default}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug" style={{ color: 'var(--color-bone)', fontWeight: n.is_read ? 400 : 700 }}>
                          {n.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {n.squad_name && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(245,240,232,0.08)', color: 'rgba(245,240,232,0.5)' }}>
                              {n.squad_emoji} {n.squad_name}
                            </span>
                          )}
                          <span className="text-[11px]" style={{ color: 'rgba(245,240,232,0.4)' }}>{timeAgo(n.created_at)}</span>
                        </div>
                      </div>
                      {!n.is_read && <div className="h-2 w-2 rounded-full shrink-0 mt-2" style={{ background: 'var(--color-marigold)' }} />}
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

// Small banner that asks for browser notification permission — the actual
// step that makes push work even with the app closed. Shown once (dismiss
// or allow), never nags again either way.
export function NotificationPermissionPrompt() {
  const [show, setShow] = useState(false);
  const { subscribeToPush } = useNotifications();

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
          <p className="font-display font-bold text-sm" style={{ color: 'var(--color-bone)' }}>Notifications on karo?</p>
          <p className="text-xs" style={{ color: 'rgba(245,240,232,0.6)' }}>
            Squad ke kharche aur settlements ka pata chalega — even jab app band ho
          </p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => { localStorage.setItem('squadpay_notif_prompt_seen', '1'); setShow(false); }}
          className="bbtn bbtn-ghost px-3 py-1.5 text-xs"
        >
          Baad mein
        </button>
        <button
          onClick={async () => {
            localStorage.setItem('squadpay_notif_prompt_seen', '1');
            setShow(false);
            const ok = await subscribeToPush();
            if (ok) play('success');
          }}
          className="bbtn px-3 py-1.5 text-xs"
        >
          Allow
        </button>
      </div>
    </div>
  );
}
