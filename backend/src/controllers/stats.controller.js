// ============================================================
// STATS BRAIN — leaderboards, roasts, wrapped.
// All read-only: computes from expenses + settlements + xp.
// ============================================================
import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';

async function assertMember(squadId, userId) {
  const m = await query(`SELECT 1 FROM squad_members WHERE squad_id=$1 AND user_id=$2 AND status='active'`, [squadId, userId]);
  if (!m.rows.length) throw new ApiError(403, 'Not a member of this squad');
}

const firstName = (n) => (n || '').split(' ')[0];

// Core stats for a period ('week' = since Monday, 'all' = forever)
async function computeStats(squadId, period) {
  const since = period === 'week' ? `AND e.created_at >= date_trunc('week', now())` : '';
  const sinceS = period === 'week' ? `AND s.created_at >= date_trunc('week', now())` : '';

  const spenders = (await query(
    `SELECT u.id, u.name, SUM(e.amount)::bigint AS paid, COUNT(*)::int AS cnt
     FROM expenses e JOIN users u ON u.id = e.paid_by
     WHERE e.squad_id=$1 AND e.is_deleted=FALSE ${since}
     GROUP BY u.id, u.name ORDER BY paid DESC`, [squadId])).rows;

  const byCat = (await query(
    `SELECT e.category, SUM(e.amount)::bigint AS total
     FROM expenses e WHERE e.squad_id=$1 AND e.is_deleted=FALSE ${since}
     GROUP BY e.category ORDER BY total DESC`, [squadId])).rows;

  const catKings = (await query(
    `SELECT u.name, e.category, SUM(e.amount)::bigint AS total
     FROM expenses e JOIN users u ON u.id = e.paid_by
     WHERE e.squad_id=$1 AND e.is_deleted=FALSE ${since}
     GROUP BY u.name, e.category ORDER BY total DESC`, [squadId])).rows;

  const biggest = (await query(
    `SELECT e.title, e.amount::bigint AS amount, u.name
     FROM expenses e JOIN users u ON u.id = e.paid_by
     WHERE e.squad_id=$1 AND e.is_deleted=FALSE ${since}
     ORDER BY e.amount DESC LIMIT 1`, [squadId])).rows[0] || null;

  const confirmSpeed = (await query(
    `SELECT u.name, AVG(EXTRACT(EPOCH FROM (s.settled_at - s.created_at)))::float AS avg_secs, COUNT(*)::int AS cnt
     FROM settlements s JOIN users u ON u.id = s.from_user
     WHERE s.squad_id=$1 AND s.status='completed' AND s.settled_at IS NOT NULL ${sinceS}
     GROUP BY u.name ORDER BY avg_secs ASC`, [squadId])).rows;

  const receivers = (await query(
    `SELECT u.name, SUM(s.amount)::bigint AS got, COUNT(*)::int AS cnt
     FROM settlements s JOIN users u ON u.id = s.to_user
     WHERE s.squad_id=$1 AND s.status='completed' ${sinceS}
     GROUP BY u.name ORDER BY got DESC`, [squadId])).rows;

  const pendingAges = (await query(
    `SELECT u.name, MAX(EXTRACT(EPOCH FROM (now() - s.created_at))/86400)::float AS days
     FROM settlements s JOIN users u ON u.id = s.from_user
     WHERE s.squad_id=$1 AND s.status='pending'
     GROUP BY u.name ORDER BY days DESC`, [squadId])).rows;

  const xp = (await query(
    `SELECT u.name, sm.xp FROM squad_members sm JOIN users u ON u.id = sm.user_id
     WHERE sm.squad_id=$1 AND sm.status='active' ORDER BY sm.xp DESC`, [squadId])).rows;

  const totals = (await query(
    `SELECT COALESCE(SUM(e.amount),0)::bigint AS total, COUNT(*)::int AS cnt
     FROM expenses e WHERE e.squad_id=$1 AND e.is_deleted=FALSE ${since}`, [squadId])).rows[0];

  return { spenders, byCat, catKings, biggest, confirmSpeed, receivers, pendingAges, xp,
           totalSpend: Number(totals.total), expenseCount: totals.cnt };
}

const CAT_EMOJI = { food:'🍕', travel:'🚕', movies:'🎬', fuel:'⛽', events:'🎉', shopping:'🛍️', stay:'🏨', other:'📦' };
const fmt = (p) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });

// ---------------- LEADERBOARDS ----------------
export async function leaderboards(req, res, next) {
  try {
    const { id } = req.params;
    const period = req.query.period === 'all' ? 'all' : 'week';
    await assertMember(id, req.user.id);
    const s = await computeStats(id, period);

    const foodKing = s.catKings.find((c) => c.category === 'food');
    const chai = s.catKings.find((c) => ['food'].includes(c.category)); // chai lives in food
    const boards = [
      { title: 'Walking ATM', emoji: '💸', subtitle: 'biggest spender',
        entries: s.spenders.slice(0, 5).map((x) => ({ name: firstName(x.name), value: fmt(Number(x.paid)) })) },
      { title: 'Chai Ka Don', emoji: '☕', subtitle: 'food & chai spend',
        entries: s.catKings.filter((c) => c.category === 'food').slice(0, 5).map((x) => ({ name: firstName(x.name), value: fmt(Number(x.total)) })) },
      { title: 'The Generous One', emoji: '🤝', subtitle: 'fastest to pay debts',
        entries: s.confirmSpeed.slice(0, 5).map((x) => ({ name: firstName(x.name), value: x.avg_secs < 3600 ? `${Math.max(1, Math.round(x.avg_secs / 60))} min` : x.avg_secs < 86400 ? `${Math.round(x.avg_secs / 3600)} hr` : `${Math.round(x.avg_secs / 86400)} days` })) },
      { title: 'Money Magnet', emoji: '🧲', subtitle: 'most money received',
        entries: s.receivers.slice(0, 5).map((x) => ({ name: firstName(x.name), value: fmt(Number(x.got)) })) },
      { title: 'Slowest Payer', emoji: '🐢', subtitle: 'we say this with love',
        entries: [...s.confirmSpeed].reverse().slice(0, 3).map((x) => ({ name: firstName(x.name), value: x.avg_secs < 3600 ? `${Math.max(1, Math.round(x.avg_secs / 60))} min` : x.avg_secs < 86400 ? `${Math.round(x.avg_secs / 3600)} hr` : `${Math.round(x.avg_secs / 86400)} days` })) },
      { title: 'Expense Warrior', emoji: '⚔️', subtitle: 'XP leaderboard',
        entries: s.xp.slice(0, 5).map((x) => ({ name: firstName(x.name), value: `${x.xp} XP` })) },
    ].filter((b) => b.entries.length > 0);

    res.json({ success: true, period, boards });
  } catch (err) { next(err); }
}

// ---------------- ROAST ENGINE (meme format) ----------------
// If ANTHROPIC_API_KEY is ever added to .env, this is where a real
// LLM call would slot in. Until then: data-driven savagery.
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export async function roast(req, res, next) {
  try {
    const { id } = req.params;
    await assertMember(id, req.user.id);
    const s = await computeStats(id, 'all');
    const memes = [];

    if (s.byCat.length && s.totalSpend > 0) {
      const top = s.byCat[0];
      const pct = Math.round((Number(top.total) / s.totalSpend) * 100);
      memes.push(pick([
        { emoji: CAT_EMOJI[top.category], top: `${pct}% OF SQUAD FUNDS`, bottom: `WENT STRAIGHT INTO ${top.category.toUpperCase()}. INVESTORS ARE CONCERNED.` },
        { emoji: CAT_EMOJI[top.category], top: `BREAKING: SQUAD DISCOVERS`, bottom: `${top.category.toUpperCase()} IS NOT AN ASSET CLASS (${pct}% PORTFOLIO ALLOCATION)` },
      ]));
    }
    if (s.spenders.length) {
      const k = s.spenders[0];
      memes.push(pick([
        { emoji: '🚨', top: `SQUAD KA EMERGENCY FUND:`, bottom: `${firstName(k.name).toUpperCase()} 💀` },
        { emoji: '🏦', top: `${firstName(k.name).toUpperCase()} HAS FUNDED ${fmt(Number(k.paid))}`, bottom: `UNOFFICIAL FINANCE MINISTER OF THE SQUAD` },
        { emoji: '💳', top: `${firstName(k.name).toUpperCase()}'S CARD:`, bottom: `"I'M TIRED, BOSS." (${fmt(Number(k.paid))} DAMAGE)` },
      ]));
    }
    if (s.pendingAges.length) {
      const p = s.pendingAges[0];
      const days = Math.max(1, Math.round(p.days));
      memes.push(pick([
        { emoji: '🐌', top: `${firstName(p.name).toUpperCase()}'S PAYMENT CONFIRMATION:`, bottom: `DAY ${days}. THE RECEIVER HAS SEEN THINGS.` },
        { emoji: '📵', top: `${firstName(p.name).toUpperCase()} SAID "PAID HAI BRO"`, bottom: `${days} DAY${days > 1 ? 'S' : ''} AGO. STILL UNCONFIRMED.` },
      ]));
    }
    if (s.confirmSpeed.length > 1) {
      const slow = s.confirmSpeed[s.confirmSpeed.length - 1];
      const hrs = Math.round(slow.avg_secs / 3600);
      if (hrs >= 1) memes.push({ emoji: '⏳', top: `${firstName(slow.name).toUpperCase()} SETTLES DEBTS`, bottom: `AT AN AVERAGE SPEED OF ${hrs} HOURS. GEOLOGICAL ERAS MOVE FASTER.` });
    }
    if (s.biggest) {
      memes.push({ emoji: '💥', top: `"${s.biggest.title.toUpperCase()}" — ${fmt(Number(s.biggest.amount))}`, bottom: `${firstName(s.biggest.name).toUpperCase()} PAID. THE WALLET NEVER RECOVERED.` });
    }
    if (s.expenseCount > 0) {
      memes.push(pick([
        { emoji: '🧾', top: `${s.expenseCount} EXPENSES. ${fmt(s.totalSpend)} GONE.`, bottom: `FINANCIAL ADVISORS HATE THIS SQUAD.` },
        { emoji: '📉', top: `SQUAD SAVINGS PLAN:`, bottom: `${fmt(s.totalSpend)} SPENT. PLAN NOT FOUND (404).` },
      ]));
    }
    // Vedant's Hinglish roast bank — sprinkle 2 in every batch
    const HINGLISH = [
      { emoji: '🍕', top: 'TUM LOG INVESTMENT SE ZYADA', bottom: 'PIZZA PE BHAROSA KARTE HO' },
      { emoji: '💀', top: 'YE SQUAD KHANE PE KHARCH KARTI HAI', bottom: 'FUTURE PE NAHI' },
      { emoji: '🚫', top: 'BUDGET NAAM KI CHEEZ', bottom: 'YAHAN BANNED LAGTI HAI' },
      { emoji: '🏦', top: 'AAJ BHI SABSE BADA INVESTOR', bottom: 'RESTAURANT HI HAI' },
      { emoji: '✈️', top: 'HAR TRIP KE BAAD', bottom: 'PAISE GAAYAB HO JAATE HAIN' },
      { emoji: '🇮🇳', top: 'SQUAD KA NATIONAL FOOD:', bottom: 'PIZZA.' },
      { emoji: '😢', top: 'SAVINGS ACCOUNT', bottom: 'TUMSE MILNA CHAHTA HAI' },
      { emoji: '🧮', top: 'KHARCH DEKH KE', bottom: 'CA BHI CONFUSE HO JAYE' },
      { emoji: '❓', top: 'FINANCIAL PLANNING?', bottom: 'KABHI NAAM SUNA HAI? 😭' },
      { emoji: '🏋️', top: 'TUMHARA WALLET AUR GYM MEMBERSHIP', bottom: 'DONO UNUSED LAGTE HAIN' },
      { emoji: '💔', top: 'FINANCIAL PLANNING KO ISS SQUAD NE', bottom: 'PERSONALLY HURT KIYA HAI' },
      { emoji: '📈', top: 'PIZZA REMAINS', bottom: 'YOUR STRONGEST INVESTMENT' },
      { emoji: '📋', top: 'BUDGET IS A SUGGESTION', bottom: 'FOR THIS SQUAD' },
      { emoji: '🥺', top: 'SAVINGS ACCOUNT', bottom: 'WANTS TO MEET YOU' },
    ];
    const shuffled = HINGLISH.sort(() => Math.random() - 0.5).slice(0, 2);
    memes.push(...shuffled);

    if (memes.length === 2 && s.expenseCount === 0) memes.unshift({ emoji: '🦗', top: 'NO EXPENSES YET.', bottom: 'THE MOST FINANCIALLY RESPONSIBLE SQUAD IN INDIA. SUSPICIOUS.' });

    res.json({ success: true, memes });
  } catch (err) { next(err); }
}

// ---------------- SQUAD WRAPPED ----------------
export async function wrapped(req, res, next) {
  try {
    const { id } = req.params;
    await assertMember(id, req.user.id);
    const squad = (await query(`SELECT name, emoji, created_at FROM squads WHERE id=$1`, [id])).rows[0];
    const s = await computeStats(id, 'all');
    const settleCount = (await query(
      `SELECT COUNT(*)::int AS n FROM settlements WHERE squad_id=$1 AND status='completed'`, [id])).rows[0].n;

    // Include squad photos for the memory slides
    const photos = (await query(
      `SELECT p.id, p.url, p.caption, p.created_at, u.name AS uploader_name
       FROM photos p JOIN users u ON u.id = p.uploaded_by
       WHERE p.squad_id=$1 ORDER BY p.created_at ASC LIMIT 50`, [id])).rows;

    res.json({
      success: true,
      wrapped: {
        squadName: squad.name, squadEmoji: squad.emoji,
        totalSpend: s.totalSpend, expenseCount: s.expenseCount, settlementCount: settleCount,
        topCategory: s.byCat[0] ? { name: s.byCat[0].category, emoji: CAT_EMOJI[s.byCat[0].category], pct: Math.round((Number(s.byCat[0].total) / (s.totalSpend || 1)) * 100) } : null,
        biggestExpense: s.biggest ? { title: s.biggest.title, amount: Number(s.biggest.amount), payer: firstName(s.biggest.name) } : null,
        biggestSpender: s.spenders[0] ? { name: firstName(s.spenders[0].name), amount: Number(s.spenders[0].paid) } : null,
        fastestPayer: s.confirmSpeed[0] ? { name: firstName(s.confirmSpeed[0].name) } : null,
        slowestPayer: s.confirmSpeed.length > 1 ? { name: firstName(s.confirmSpeed[s.confirmSpeed.length - 1].name) } : null,
        xpChampion: s.xp[0] ? { name: firstName(s.xp[0].name), xp: s.xp[0].xp } : null,
        photos: photos.map(p => ({ id: p.id, url: p.url, caption: p.caption, uploaderName: firstName(p.uploader_name) })),
      },
    });
  } catch (err) { next(err); }
}
