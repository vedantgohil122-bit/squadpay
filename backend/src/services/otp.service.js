// ============================================================
// OTP SERVICE — generate, store (hashed), verify 6-digit codes
// Used for: login 2FA, register email verification, password reset
// ============================================================
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { sendOtpEmail } from './email.service.js';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 45;

function generateCode() {
  // 6-digit numeric, cryptographically random (not Math.random)
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Creates a new OTP for the given email+purpose and emails it.
 * Enforces a resend cooldown so the email/inbox can't be spammed.
 */
export async function issueOtp(email, purpose) {
  const normalizedEmail = email.toLowerCase().trim();

  // Cooldown check: block resending too quickly
  const recent = await query(
    `SELECT created_at FROM otp_codes WHERE email=$1 AND purpose=$2 ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, purpose]
  );
  if (recent.rows[0]) {
    const secondsSince = (Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000;
    if (secondsSince < RESEND_COOLDOWN_SECONDS) {
      throw new ApiError(429, `Thoda wait karo — ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSince)}s mein dobara code bhej sakte hain`);
    }
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO otp_codes (email, code_hash, purpose, expires_at) VALUES ($1,$2,$3,$4)`,
    [normalizedEmail, codeHash, purpose, expiresAt]
  );

  await sendOtpEmail(normalizedEmail, code, purpose);
}

/**
 * Verifies a submitted code against the most recent unconsumed OTP
 * for that email+purpose. Throws on: no code found, expired, too many
 * attempts, or mismatch. Marks consumed on success (prevents replay).
 */
export async function verifyOtp(email, purpose, submittedCode) {
  const normalizedEmail = email.toLowerCase().trim();

  const { rows } = await query(
    `SELECT * FROM otp_codes
     WHERE email=$1 AND purpose=$2 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, purpose]
  );
  const otp = rows[0];

  if (!otp) throw new ApiError(400, 'Koi code nahi mila — pehle naya code bhejo');
  if (new Date(otp.expires_at) < new Date()) throw new ApiError(400, 'Code expire ho gaya — naya bhejo');
  if (otp.attempts >= MAX_ATTEMPTS) throw new ApiError(429, 'Bahut zyada galat attempts — naya code bhejo');

  const match = await bcrypt.compare(String(submittedCode), otp.code_hash);
  if (!match) {
    await query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id=$1`, [otp.id]);
    const remaining = MAX_ATTEMPTS - (otp.attempts + 1);
    throw new ApiError(400, remaining > 0 ? `Galat code — ${remaining} attempts bache hain` : 'Galat code — naya bhejo');
  }

  await query(`UPDATE otp_codes SET consumed_at = now() WHERE id=$1`, [otp.id]);
  return true;
}
