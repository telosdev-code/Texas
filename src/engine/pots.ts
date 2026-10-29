import type { Pot } from './types';

/**
 * Split total contributions into a main pot and side pots.
 * Each pot is contested only by non-folded players who contributed at least the pot's level.
 * Folded players' chips stay in the pots they contributed to.
 */
export function buildPots(totalBets: readonly number[], folded: readonly boolean[]): Pot[] {
  const levels = [...new Set(totalBets.filter((b, i) => b > 0 && !folded[i]))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const b of totalBets) amount += Math.min(b, level) - Math.min(b, prev);
    const eligible = totalBets.map((b, i) => (!folded[i] && b >= level ? i : -1)).filter((i) => i >= 0);
    const last = pots[pots.length - 1];
    if (last && last.eligible.length === eligible.length && last.eligible.every((e, k) => e === eligible[k])) {
      last.amount += amount;
    } else if (amount > 0) {
      pots.push({ amount, eligible });
    }
    prev = level;
  }
  // Chips from folded players above the highest live level (rare; e.g. after a fold to an all-in) go to the last pot.
  const total = totalBets.reduce((a, b) => a + b, 0);
  const assigned = pots.reduce((a, p) => a + p.amount, 0);
  if (total > assigned && pots.length) pots[pots.length - 1].amount += total - assigned;
  return pots;
}

/**
 * Split `amount` among `winners`; odd chips go one at a time to winners in `order`
 * (clockwise from the button), following the standard odd-chip rule.
 */
export function splitPot(amount: number, winners: number[], order: number[]): number[] {
  const base = Math.floor(amount / winners.length);
  let rem = amount - base * winners.length;
  const shares = winners.map(() => base);
  const ordered = order.filter((p) => winners.includes(p));
  for (const p of ordered) {
    if (rem <= 0) break;
    shares[winners.indexOf(p)]++;
    rem--;
  }
  return shares;
}
