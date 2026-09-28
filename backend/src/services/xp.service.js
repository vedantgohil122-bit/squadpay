import { query } from '../config/db.js';

export const XP = { EXPENSE_ADDED: 25, SETTLEMENT_DONE: 40, SQUAD_CREATED: 50, MEMBER_JOINED: 20 };

export async function awardXp(squadId, userId, action, xp, metadata = {}) {
  await query(`UPDATE squad_members SET xp = xp + $1 WHERE squad_id = $2 AND user_id = $3`, [xp, squadId, userId]);
  await query(
    `INSERT INTO activity_log (squad_id, user_id, action, xp_awarded, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [squadId, userId, action, xp, JSON.stringify(metadata)]
  );
}

export async function unlockAchievement(squadId, userId, code) {
  await query(
    `INSERT INTO user_achievements (user_id, squad_id, achievement_id)
     SELECT $1, $2, id FROM achievements WHERE code = $3
     ON CONFLICT (user_id, squad_id, achievement_id) DO NOTHING`,
    [userId, squadId, code]
  );
}
