/** Exact combinatorics used throughout the lessons and trainer. */

/** Binomial coefficient C(n, k), exact for the small values used in poker. */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** Total starting-hand combinations: C(52, 2) = 1326. */
export const TOTAL_COMBOS = 1326;

/**
 * Probability of hitting at least one of `outs` among `cardsToCome` cards drawn
 * from `unseen` unseen cards. Exact (hypergeometric).
 */
export function probHitAtLeastOne(outs: number, unseen: number, cardsToCome: number): number {
  if (outs <= 0) return 0;
  return 1 - choose(unseen - outs, cardsToCome) / choose(unseen, cardsToCome);
}

/** The "rule of 2 and 4" approximation (percent → fraction). A heuristic, not exact. */
export function ruleOf2And4(outs: number, cardsToCome: 1 | 2): number {
  return Math.min(1, (outs * (cardsToCome === 2 ? 4 : 2)) / 100);
}

/**
 * Combos of an unpaired starting hand (e.g. AK, suited + offsuit) given how many cards of each
 * rank are already visible to you. For pocket pairs use pairCombos.
 */
export function unpairedCombos(aSeen: number, bSeen: number): number {
  return (4 - aSeen) * (4 - bSeen);
}

/** Combos of a pocket pair when `seen` cards of that rank are visible. */
export function pairCombos(seen: number): number {
  return choose(4 - seen, 2);
}

/** Probability of being dealt a specific class preflop. */
export const PREFLOP = {
  pocketPair: 78 / 1326,
  specificPair: 6 / 1326,
  suited: 312 / 1326,
  offsuit: 936 / 1326,
  specificSuitedHand: 4 / 1326,
  specificOffsuitHand: 12 / 1326,
};
