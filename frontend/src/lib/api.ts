// One fetch wrapper for the whole app. Attaches the JWT,
// unwraps { success, ... }, throws readable errors.
const isProd = window.location.hostname !== 'localhost';
const BASE = isProd ? 'https://squadpay-backend-z2er.onrender.com/api' : '/api';

export class ApiException extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('squadpay_token');
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
  return data as T;
}
