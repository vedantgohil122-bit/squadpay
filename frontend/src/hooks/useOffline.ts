import { useEffect, useState } from 'react';
import { flushQueue, getQueue } from '../lib/offline';
import { api } from '../lib/api';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const checkQueue = async () => {
      const q = await getQueue();
      setQueueCount(q.length);
    };
    checkQueue();
    const id = setInterval(checkQueue, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isOnline && queueCount > 0) {
      setIsSyncing(true);
      flushQueue(api).finally(() => {
        setIsSyncing(false);
        getQueue().then((q) => setQueueCount(q.length));
      });
    }
  }, [isOnline, queueCount]);

  return { isOnline, isOffline: !isOnline, queueCount, isSyncing };
}
