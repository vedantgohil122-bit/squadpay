// THE ENGINE.
// net > 0  => squad owes this person money
// net < 0  => this person owes the squad
// net = (everything you paid) - (your share of everything)
//       + (settlements you sent) - (settlements you received)
import { query } from '../config/db.js';

export async function getBalances(squadId) {
  const { rows } = await query(
    `
    SELECT u.id AS user_id, u.name, u.avatar_url, sm.nickname,
      COALESCE(paid.total, 0)::bigint  AS total_paid,
      COALESCE(owed.total, 0)::bigint  AS total_share,
      COALESCE(sent.total, 0)::bigint  AS settlements_sent,
      COALESCE(recv.total, 0)::bigint  AS settlements_received
    FROM squad_members sm
    JOIN users u ON u.id = sm.user_id
    LEFT JOIN (
      SELECT paid_by, SUM(amount) AS total FROM expenses
      WHERE squad_id = $1 AND is_deleted = FALSE GROUP BY paid_by
    ) paid ON paid.paid_by = u.id
    LEFT JOIN (
      SELECT ep.user_id, SUM(ep.share_amount) AS total
      FROM expense_participants ep
      JOIN expenses e ON e.id = ep.expense_id
      WHERE e.squad_id = $1 AND e.is_deleted = FALSE GROUP BY ep.user_id
    ) owed ON owed.user_id = u.id
    LEFT JOIN (
      SELECT from_user, SUM(amount) AS total FROM settlements
      WHERE squad_id = $1 AND status = 'completed' GROUP BY from_user
    ) sent ON sent.from_user = u.id
    LEFT JOIN (
      SELECT to_user, SUM(amount) AS total FROM settlements
      WHERE squad_id = $1 AND status = 'completed' GROUP BY to_user
    ) recv ON recv.to_user = u.id
    WHERE sm.squad_id = $1 AND sm.status = 'active'
    `,
    [squadId]
  );

  return rows.map(r => ({
    userId: r.user_id,
    name: r.nickname || r.name,
    avatarUrl: r.avatar_url,
    totalPaid: Number(r.total_paid),
    totalShare: Number(r.total_share),
    net:
      Number(r.total_paid) - Number(r.total_share) +
      Number(r.settlements_sent) - Number(r.settlements_received),
  }));
}

// Greedy debt simplification: repeatedly match the biggest debtor
// with the biggest creditor. Turns N² IOUs into at most N-1 transfers.
export function simplifyDebts(balances) {
  const creditors = balances.filter(b => b.net > 0).map(b => ({ ...b })).sort((a, b) => b.net - a.net);
  const debtors   = balances.filter(b => b.net < 0).map(b => ({ ...b, net: -b.net })).sort((a, b) => b.net - a.net);

  const transfers = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].net, debtors[di].net);
    if (pay > 0) {
      transfers.push({
        from: { userId: debtors[di].userId, name: debtors[di].name },
        to:   { userId: creditors[ci].userId, name: creditors[ci].name },
        amount: pay,
      });
    }
    creditors[ci].net -= pay;
    debtors[di].net   -= pay;
    if (creditors[ci].net === 0) ci++;
    if (debtors[di].net === 0) di++;
  }
  return transfers;
}
