// One fetch wrapper for the whole app. Attaches the JWT,
// unwraps { success, ... }, throws readable errors.
const isProd = window.location.hostname !== 'localhost';
export const BASE = isProd ? 'https://squadpay-backend-z2er.onrender.com/api' : '/api';

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

// Converts a backend-relative asset path (e.g. "/uploads/xxx.png") into an
// absolute URL pointing at the backend. Uploaded images (memory photos,
// avatars) are static files served BY THE BACKEND, but the backend stores
// only the relative path. In production the frontend (Vercel) and backend
// (Render) are different origins — a bare relative <img src="/uploads/..">
// resolves against the frontend's own origin and 404s. Already-absolute
// URLs (http/https — e.g. DiceBear-generated avatars) pass through as-is.
export function assetUrl(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const origin = BASE.replace(/\/api\/?$/, '');
  return `${origin}${path}`;
}

// Multipart upload wrapper — same BASE-resolution + auth + error-unwrapping as
// api(), but for FormData (avatars, memory photos). v5.9 had these upload
// calls using bare relative fetch('/api/...') paths, which only worked on
// localhost — in production (Vercel frontend + Render backend on different
// origins) that silently 404'd. Route every upload through here instead.
export async function apiUpload<T = any>(path: string, formData: FormData): Promise<T> {
  const token = localStorage.getItem('squadpay_token');
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiException(res.status, data.error || 'Upload failed');
  return data as T;
}
