// One fetch wrapper for the whole app. Attaches the JWT,
// unwraps { success, ... }, throws readable errors.
// Now with offline queue + cache fallback for GETs.

const isProd = window.location.hostname !== 'localhost';
const BASE = isProd ? 'https://squadpay-backend-z2er.onrender.com/api' : '/api';

export class ApiException extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// Offline queue — lazily imported to avoid circular
async function tryEnqueue(path: string, options: RequestInit) {
  if (typeof window === 'undefined' || navigator.onLine) return false;
  const method = (options.method || 'GET').toUpperCase();
  // Only queue mutations, not GETs
  if (method === 'GET') return false;
  try {
    const { enqueueAction } = await import('./offline');
    const body = typeof options.body === 'string' ? options.body : options.body ? JSON.stringify(options.body) : undefined;
    await enqueueAction({ url: path, method, body });
    return true;
  } catch {
    return false;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  // Try cache first for GET when offline
  if (!navigator.onLine && (!options.method || options.method.toUpperCase() === 'GET')) {
    try {
      const { getCachedResponse } = await import('./offline');
      const cached = await getCachedResponse(`${BASE}${path}`);
      if (cached) return cached as T;
    } catch {}
  }

  const token = localStorage.getItem('squadpay_token');

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiException(res.status, data.error || 'Something went wrong');

    // Cache successful GETs
    if (!options.method || options.method.toUpperCase() === 'GET') {
      try {
        const { cacheResponse } = await import('./offline');
        cacheResponse(`${BASE}${path}`, data);
      } catch {}
    }

    return data as T;
  } catch (err: any) {
    // If offline and mutation, queue it
    if (!navigator.onLine) {
      const queued = await tryEnqueue(path, options);
      if (queued) {
        throw new ApiException(0, 'Offline — action queued, will sync when online 📡');
      }
    }
    // If it's already ApiException re-throw
    if (err instanceof ApiException) throw err;
    // Network error
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      const cached = null;
      try {
        const { getCachedResponse } = await import('./offline');
        const maybe = await getCachedResponse(`${BASE}${path}`);
        if (maybe) return maybe as T;
      } catch {}
      throw new ApiException(0, 'Offline ho — internet check karo 📡');
    }
    throw err;
  }
}
