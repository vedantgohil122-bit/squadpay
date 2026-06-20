// ============================================================
// AUTH CONTROLLER
// Register and Login now both require a 2-step email-OTP flow:
//   1. POST /register or /login with credentials -> server verifies
//      password (login) or that the email is new (register), then
//      issues an OTP and responds { requiresOtp: true } WITHOUT a token.
//   2. POST /register/verify or /login/verify with { email, code } ->
//      server verifies the OTP, creates the account / issues the JWT.
// A pending registration is held in a short-lived signed token rather
// than the DB, so no half-created user rows pile up if someone never
// verifies.
// ============================================================
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { issueOtp, verifyOtp } from '../services/otp.service.js';
import { sendLoginNotification } from '../services/email.service.js';
import { describeDevice, getClientIp } from '../utils/device.js';

const registerSchema = z.object({
  name: z.string().min(2, 'Name too short').max(50),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const sign = (user) =>
  jwt.sign({ sub: user.id, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// Short-lived token that carries the not-yet-created registration payload
// between step 1 (request OTP) and step 2 (verify + actually create user).
const PENDING_SECRET = process.env.JWT_SECRET;
const signPendingRegistration = (payload) =>
  jwt.sign({ pending: 'register', ...payload }, PENDING_SECRET, { expiresIn: '15m' });
const verifyPendingRegistration = (token) => {
  try {
    const decoded = jwt.verify(token, PENDING_SECRET);
    if (decoded.pending !== 'register') throw new Error('wrong token type');
    return decoded;
  } catch {
    throw new ApiError(400, 'Registration session expired — phir se shuru karo');
  }
};

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatar_url, bio: u.bio, upiId: u.upi_id });

// ── STEP 1: REGISTER (issues OTP, does NOT create the user yet) ──
export async function register(req, res, next) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
    const { name, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existing = await query(`SELECT id FROM users WHERE email = $1`, [normalizedEmail]);
    if (existing.rows.length) throw new ApiError(409, 'An account with this email already exists');

    const hash = await bcrypt.hash(password, 10);
    await issueOtp(normalizedEmail, 'register');

    const pendingToken = signPendingRegistration({ name, email: normalizedEmail, passwordHash: hash });

    res.json({ success: true, requiresOtp: true, pendingToken, email: normalizedEmail });
  } catch (err) { next(err); }
}

// ── STEP 2: VERIFY REGISTRATION OTP (actually creates the user) ──
export async function verifyRegisterOtp(req, res, next) {
  try {
    const { pendingToken, code } = req.body || {};
    if (!pendingToken || !code) throw new ApiError(400, 'pendingToken and code required');

    const { name, email, passwordHash } = verifyPendingRegistration(pendingToken);
    await verifyOtp(email, 'register', code);

    const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existing.rows.length) throw new ApiError(409, 'An account with this email already exists');

    const avatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name)}`;
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, avatar_url) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, email, passwordHash, avatar]
    );

    res.status(201).json({ success: true, token: sign(rows[0]), user: publicUser(rows[0]) });
  } catch (err) { next(err); }
}

// ── STEP 1: LOGIN (verifies password, then issues OTP — no token yet) ──
export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw new ApiError(400, 'Email and password required');
    const normalizedEmail = String(email).toLowerCase();

    const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [normalizedEmail]);
    const user = rows[0];
    if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash)))
      throw new ApiError(401, 'Invalid email or password');

    await issueOtp(normalizedEmail, 'login');
    res.json({ success: true, requiresOtp: true, email: normalizedEmail });
  } catch (err) { next(err); }
}

// ── STEP 2: VERIFY LOGIN OTP (issues the actual JWT) ──
export async function verifyLoginOtp(req, res, next) {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) throw new ApiError(400, 'email and code required');
    const normalizedEmail = String(email).toLowerCase();

    await verifyOtp(normalizedEmail, 'login', code);

    const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [normalizedEmail]);
    const user = rows[0];
    if (!user) throw new ApiError(404, 'User not found');

    // Fire the login notification AFTER responding, not awaited — a slow or
    // failing notification email must never delay or break a real login.
    res.json({ success: true, token: sign(user), user: publicUser(user) });

    sendLoginNotification(normalizedEmail, {
      time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }),
      ip: getClientIp(req),
      device: describeDevice(req.headers['user-agent']),
    }).catch((err) => console.error('Login notification failed (non-fatal):', err.message));
  } catch (err) { next(err); }
}

// ── RESEND OTP (works for login/register, same cooldown logic) ──
export async function resendOtp(req, res, next) {
  try {
    const { email, purpose } = req.body || {};
    if (!email || !['login', 'register'].includes(purpose)) throw new ApiError(400, 'email and valid purpose required');
    await issueOtp(String(email).toLowerCase(), purpose);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ── FORGOT PASSWORD: STEP 1 — request a reset code ──
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email) throw new ApiError(400, 'Email required');
    const normalizedEmail = String(email).toLowerCase();

    const existing = await query(`SELECT id FROM users WHERE email = $1`, [normalizedEmail]);
    if (existing.rows.length) {
      await issueOtp(normalizedEmail, 'reset_password');
    }
    res.json({ success: true, message: 'Agar account exist karta hai, code email pe bhej diya gaya hai' });
  } catch (err) { next(err); }
}

// ── FORGOT PASSWORD: STEP 2 — verify code + set new password ──
const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function resetPassword(req, res, next) {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
    const { email, code, newPassword } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    // Fetch the CURRENT hash before doing anything else — we need it to check
    // the new password isn't just the old one again. This must happen before
    // verifyOtp() below, since the OTP is consumed (one-shot) by that call;
    // if the reuse-check failed and we re-asked the user to retry, we'd need
    // the OTP to still be valid for the actual update afterward — by checking
    // reuse first, we fail fast without burning the OTP unnecessarily.
    const existing = await query(`SELECT password_hash FROM users WHERE email=$1`, [normalizedEmail]);
    if (!existing.rows[0]) throw new ApiError(404, 'Account not found');

    if (existing.rows[0].password_hash) {
      const isSameAsOld = await bcrypt.compare(newPassword, existing.rows[0].password_hash);
      if (isSameAsOld) {
        throw new ApiError(400, 'Naya password purane se alag hona chahiye — koi naya password choose karo');
      }
    }

    await verifyOtp(normalizedEmail, 'reset_password', code);

    const hash = await bcrypt.hash(newPassword, 10);
    const { rows } = await query(`UPDATE users SET password_hash=$1 WHERE email=$2 RETURNING *`, [hash, normalizedEmail]);
    if (!rows[0]) throw new ApiError(404, 'Account not found');

    res.json({ success: true, token: sign(rows[0]), user: publicUser(rows[0]) });
  } catch (err) { next(err); }
}

// ── EXISTING (unchanged) ──
export async function me(req, res, next) {
  try {
    const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    if (!rows[0]) throw new ApiError(404, 'User not found');
    res.json({ success: true, user: publicUser(rows[0]) });
  } catch (err) { next(err); }
}

export async function updateProfile(req, res, next) {
  try {
    const { name, bio, avatarUrl, upiId } = req.body || {};
    const fields = [];
    const values = [];
    let i = 1;
    if (name !== undefined) { fields.push(`name=$${i++}`); values.push(name); }
    if (bio !== undefined) { fields.push(`bio=$${i++}`); values.push(bio); }
    if (avatarUrl !== undefined) { fields.push(`avatar_url=$${i++}`); values.push(avatarUrl); }
    if (upiId !== undefined) { fields.push(`upi_id=$${i++}`); values.push(upiId || null); }
    if (!fields.length) throw new ApiError(400, 'Nothing to update');
    values.push(req.user.id);
    const { rows } = await query(`UPDATE users SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values);
    res.json({ success: true, user: publicUser(rows[0]) });
  } catch (err) { next(err); }
}

const avatarStorage = multer.diskStorage({
  destination: 'uploads/avatars/',
  filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
});
export const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Sirf image files chalegi (jpg/png/webp)'));
  },
});

export async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) throw new ApiError(400, 'Photo toh bhejo bhai 📸');
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const { rows } = await query(`UPDATE users SET avatar_url=$1 WHERE id=$2 RETURNING *`, [avatarUrl, req.user.id]);
    res.json({ success: true, avatarUrl, user: publicUser(rows[0]) });
  } catch (err) { next(err); }
}
