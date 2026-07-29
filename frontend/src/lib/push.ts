// Push + Browser Notification helpers

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

export function showLocalNotification(title: string, options?: NotificationOptions) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    // If service worker is ready, use it for better mobile support
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        icon: '/icon-192.png',
        badge: '/favicon.png',
        ...options,
      } as any);
    }).catch(() => {
      new Notification(title, {
        icon: '/icon-192.png',
        ...options,
      });
    });
  } catch {}
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;

    // For demo, we use a dummy VAPID key — in production you'd use real VAPID from backend env
    // This will fail without VAPID but we gracefully fallback to local notifications
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return null;

    // Try to subscribe with a generated VAPID (if backend provides key, use it)
    // For now we just return existing subscription or null, local notifications will work without push server
    return existing;
  } catch {
    return null;
  }
}

export async function savePushSubscriptionToBackend(endpoint: string, keys: { p256dh: string; auth: string }) {
  try {
    const token = localStorage.getItem('squadpay_token');
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint, keys }),
    });
  } catch {}
}

// Utility to trigger a nice notification for squad events
export function notifySquadEvent(type: string, message: string) {
  const icons: Record<string, string> = {
    expense_added: '🧾',
    settlement_pending: '💸',
    settlement_completed: '✅',
    member_joined: '👋',
    treasury_contribution: '🏦',
    achievement: '🏆',
  };
  const icon = icons[type] || '🔔';
  showLocalNotification(`${icon} SquadPay`, {
    body: message,
    tag: type,
  } as any);
}
