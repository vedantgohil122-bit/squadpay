// SquadPay Offline Engine — IndexedDB + queue + caching
// Makes expenses, squads, settlements usable offline

const DB_NAME = 'squadpay_offline_v2';
const DB_VERSION = 3;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('squads')) db.createObjectStore('squads', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('expenses')) {
        const s = db.createObjectStore('expenses', { keyPath: 'id' });
        s.createIndex('squad_id', 'squad_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(store: string, value: any) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function idbGetAll(store: string): Promise<any[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function idbGet(store: string, key: string) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// ---- Offline Queue for mutations ----
export interface QueuedAction {
  id?: number;
  url: string;
  method: string;
  body?: string;
  timestamp: number;
  retries: number;
}

export async function enqueueAction(action: Omit<QueuedAction, 'id' | 'timestamp' | 'retries'>) {
  const q: QueuedAction = {
    ...action,
    timestamp: Date.now(),
    retries: 0,
  };
  await idbPut('queue', q);
  // Try background sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      // @ts-ignore
      await reg.sync.register('squadpay-sync');
    } catch {}
  }
}

export async function getQueue(): Promise<QueuedAction[]> {
  return idbGetAll('queue');
}

export async function clearQueueItem(id: number) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// Try to flush queue when online
export async function flushQueue(apiFn: (path: string, opts: any) => Promise<any>): Promise<{ flushed: number; failed: number }> {
  if (!navigator.onLine) return { flushed: 0, failed: 0 };
  const q = await getQueue();
  let flushed = 0, failed = 0;
  for (const item of q) {
    try {
      await apiFn(item.url, { method: item.method, body: item.body });
      if (item.id) await clearQueueItem(item.id);
      flushed++;
    } catch (e) {
      failed++;
      // increment retries, keep for next attempt
      if (item.id) {
        const updated = { ...item, retries: item.retries + 1 };
        await idbPut('queue', updated);
      }
    }
  }
  return { flushed, failed };
}

// ---- Cache helpers for GET responses ----
export async function cacheResponse(key: string, data: any) {
  await idbPut('cache', { key, data, timestamp: Date.now() });
}

export async function getCachedResponse(key: string, maxAgeMs = 5 * 60 * 1000) {
  const entry: any = await idbGet('cache', key);
  if (!entry) return null;
  if (Date.now() - (entry.timestamp || 0) > maxAgeMs) return null;
  return entry.data;
}

// ---- Simple wrapper around api() that is offline-aware ----
export function isOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}
