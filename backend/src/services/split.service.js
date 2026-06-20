// Converts a split definition into exact paise per participant.
// INVARIANT: returned shares ALWAYS sum to exactly `amount`.
// Remainder paise go to participants with the largest fractional parts.
import { ApiError } from '../middleware/errorHandler.js';

export function computeShares(amount, splitType, participants) {
  if (!participants?.length) throw new ApiError(400, 'At least one participant required');

  if (splitType === 'equal') {
    return distribute(amount, participants.map(p => ({ userId: p.userId, weight: 1 })));
  }

  if (splitType === 'percentage') {
    const total = participants.reduce((s, p) => s + Number(p.value || 0), 0);
    if (Math.abs(total - 100) > 0.01) throw new ApiError(400, 'Percentages must add up to 100');
    return distribute(amount, participants.map(p => ({ userId: p.userId, weight: Number(p.value) })));
  }

  if (splitType === 'shares') {
    const total = participants.reduce((s, p) => s + Number(p.value || 0), 0);
    if (total <= 0) throw new ApiError(400, 'Total shares must be greater than 0');
    return distribute(amount, participants.map(p => ({ userId: p.userId, weight: Number(p.value) })));
  }

  if (splitType === 'custom') {
    const shares = participants.map(p => ({ userId: p.userId, shareAmount: Math.round(Number(p.value)), shareValue: Number(p.value) }));
    const sum = shares.reduce((s, p) => s + p.shareAmount, 0);
    if (sum !== amount) throw new ApiError(400, `Custom amounts (${sum}) must add up to the total (${amount})`);
    return shares;
  }

  throw new ApiError(400, `Unknown split type: ${splitType}`);
}

// Largest-remainder method: no paise ever lost or invented.
function distribute(amount, weighted) {
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  const exact = weighted.map(w => ({ ...w, exact: (amount * w.weight) / totalWeight }));
  const floored = exact.map(e => ({ ...e, share: Math.floor(e.exact), frac: e.exact - Math.floor(e.exact) }));
  let remainder = amount - floored.reduce((s, f) => s + f.share, 0);
  floored.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remainder; i++) floored[i % floored.length].share += 1;
  return floored.map(f => ({ userId: f.userId, shareAmount: f.share, shareValue: f.weight }));
}
