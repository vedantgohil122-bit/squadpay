import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { awardXp } from '../services/xp.service.js';

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
});
export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, 'Sirf images chalegi bhai (jpg/png/webp/gif)'));
  },
});

async function assertMember(squadId, userId) {
  const m = await query(`SELECT 1 FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`, [squadId, userId]);
  if (!m.rows.length) throw new ApiError(403, 'Not a member of this squad');
}

export async function createMemory(req, res, next) {
  try {
    const { squadId, caption } = req.body || {};
    if (!squadId) throw new ApiError(400, 'squadId required');
    if (!req.file) throw new ApiError(400, 'Photo toh bhejo bhai 📸');
    await assertMember(squadId, req.user.id);
    const { rows } = await query(
      `INSERT INTO photos (squad_id, uploaded_by, url, caption) VALUES ($1,$2,$3,$4) RETURNING *`,
      [squadId, req.user.id, `/uploads/${req.file.filename}`, (caption || '').slice(0, 200)]
    );
    await awardXp(squadId, req.user.id, 'memory.uploaded', 15, { caption: caption || '' });
    res.status(201).json({ success: true, memory: rows[0] });
  } catch (err) { next(err); }
}

export async function listMemories(req, res, next) {
  try {
    const { squadId } = req.params;
    await assertMember(squadId, req.user.id);
    const { rows } = await query(
      `SELECT p.id, p.url, p.caption, p.created_at, p.uploaded_by,
              u.name AS uploader_name, u.avatar_url AS uploader_avatar,
        (SELECT json_agg(json_build_object('emoji', r.emoji, 'userId', r.user_id))
         FROM reactions r WHERE r.photo_id = p.id) AS reactions,
        (SELECT json_agg(json_build_object('id', c.id, 'name', cu.name, 'content', c.content, 'createdAt', c.created_at) ORDER BY c.created_at)
         FROM comments c JOIN users cu ON cu.id = c.user_id WHERE c.photo_id = p.id) AS comments
       FROM photos p JOIN users u ON u.id = p.uploaded_by
       WHERE p.squad_id = $1
       ORDER BY p.created_at DESC`,
      [squadId]
    );
    res.json({ success: true, memories: rows });
  } catch (err) { next(err); }
}

export async function toggleReaction(req, res, next) {
  try {
    const { emoji } = req.body || {};
    const VALID = ['😂','🔥','💀','❤️','🍕','☕'];
    if (!VALID.includes(emoji)) throw new ApiError(400, 'Invalid emoji bhai');
    const photo = (await query(`SELECT squad_id FROM photos WHERE id=$1`, [req.params.id])).rows[0];
    if (!photo) throw new ApiError(404, 'Memory not found');
    await assertMember(photo.squad_id, req.user.id);

    // Instagram rule: one reaction per user per photo
    const existing = (await query(
      `SELECT emoji FROM reactions WHERE user_id=$1 AND photo_id=$2`,
      [req.user.id, req.params.id])).rows[0];

    if (existing?.emoji === emoji) {
      // same emoji → unlike (remove)
      await query(`DELETE FROM reactions WHERE user_id=$1 AND photo_id=$2`, [req.user.id, req.params.id]);
      res.json({ success: true, reacted: false, emoji: null });
    } else {
      // different or none → upsert (switch or add)
      await query(
        `INSERT INTO reactions (user_id, photo_id, emoji) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, photo_id, emoji) DO UPDATE SET emoji=$3
         -- the UNIQUE is on (user_id, photo_id, emoji) so we need a different approach:`,
        [req.user.id, req.params.id, emoji]).catch(async () => {
          // fallback: delete existing then insert new
          await query(`DELETE FROM reactions WHERE user_id=$1 AND photo_id=$2`, [req.user.id, req.params.id]);
          await query(`INSERT INTO reactions (user_id, photo_id, emoji) VALUES ($1,$2,$3)`, [req.user.id, req.params.id, emoji]);
        });
      // clean approach: delete + insert
      await query(`DELETE FROM reactions WHERE user_id=$1 AND photo_id=$2`, [req.user.id, req.params.id]);
      await query(`INSERT INTO reactions (user_id, photo_id, emoji) VALUES ($1,$2,$3)`, [req.user.id, req.params.id, emoji]);
      res.json({ success: true, reacted: true, emoji });
    }
  } catch (err) { next(err); }
}

export async function addComment(req, res, next) {
  try {
    const { content } = req.body || {};
    if (!content?.trim()) throw new ApiError(400, 'Khali comment? 😶');
    const photo = (await query(`SELECT squad_id FROM photos WHERE id=$1`, [req.params.id])).rows[0];
    if (!photo) throw new ApiError(404, 'Memory not found');
    await assertMember(photo.squad_id, req.user.id);
    const { rows } = await query(
      `INSERT INTO comments (user_id, photo_id, content) VALUES ($1,$2,$3) RETURNING id, content, created_at`,
      [req.user.id, req.params.id, content.trim().slice(0, 300)]);
    res.status(201).json({ success: true, comment: { ...rows[0], name: req.user.name } });
  } catch (err) { next(err); }
}

export async function deleteMemory(req, res, next) {
  try {
    const photo = (await query(`SELECT * FROM photos WHERE id=$1`, [req.params.id])).rows[0];
    if (!photo) throw new ApiError(404, 'Memory not found');
    const me = (await query(`SELECT role FROM squad_members WHERE squad_id=$1 AND user_id=$2`, [photo.squad_id, req.user.id])).rows[0];
    if (!me) throw new ApiError(403, 'Not a member');
    if (me.role !== 'admin' && photo.uploaded_by !== req.user.id) throw new ApiError(403, 'Sirf uploader ya admin delete kar sakta hai');
    await query(`DELETE FROM photos WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}
