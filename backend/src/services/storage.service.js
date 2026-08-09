// ============================================================
// STORAGE SERVICE — v6.5: uploads go to Supabase Storage, not local
// disk. Render's filesystem is ephemeral: every redeploy or restart
// (which happens automatically on the free tier after inactivity)
// wiped every avatar and memory photo that had been uploaded since
// the last deploy. Supabase Storage is persistent and — since this
// project already runs its database on Supabase — needs no new
// account, just two more values from the same dashboard.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'squadpay-uploads';

let client = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
  console.warn('⚠️  SUPABASE_URL / SUPABASE_SERVICE_KEY not set — file uploads will fail until configured');
}

export function isStorageConfigured() { return !!client; }

// Uploads a buffer (from multer's memoryStorage — see auth.controller.js
// and memory.controller.js) and returns its public URL. folder is just a
// path prefix inside the bucket ('avatars', 'memories') to keep things
// organized, not a separate bucket.
export async function uploadToStorage(buffer, folder, originalName, contentType) {
  if (!client) {
    throw new Error('Storage not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY');
  }
  const ext = (originalName.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase() || '.jpg';
  const filename = `${folder}/${crypto.randomBytes(12).toString('hex')}${ext}`;

  const { error } = await client.storage.from(BUCKET).upload(filename, buffer, {
    contentType, upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = client.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}
