import { type Card, RANK_NAMES, RANK_PLURALS } from './cards.ts';

/**
 * Fast 5–7 card poker hand evaluator.
 *
 * Returns an integer score; a higher score is a stronger hand and equal scores tie.
 * Layout: category << 20 | up to five 4-bit rank nibbles (most significant first).
 *
 * Correctness is verified in tests against the known frequency of every category
 * over all 2,598,960 five-card hands and against a naive reference evaluator.
 */
export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

export const CATEGORY_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

const CAT_SHIFT = 20;

/** STRAIGHT_HIGH[mask] = (top rank of best straight) + 1, or 0 if no straight. */
const STRAIGHT_HIGH = new Uint8Array(8192);
/** TOP5[mask] = up to the five highest ranks of mask, packed into nibbles, highest first, left-aligned. */
const TOP5 = new Uint32Array(8192);

(function buildTables() {
  for (let m = 0; m < 8192; m++) {
    // straights: top rank 12 (A) down to 4 (6-high); then wheel (5-high, top rank 3)
    let sh = 0;
    for (let top = 12; top >= 4; top--) {
      const need = 0b11111 << (top - 4);
      if ((m & need) === need) {
        sh = top + 1;
        break;
      }
    }
    if (!sh && (m & 0b1000000001111) === 0b1000000001111) sh = 3 + 1;
    STRAIGHT_HIGH[m] = sh;

    let packed = 0;
    let n = 0;
    for (let r = 12; r >= 0 && n < 5; r--) {
      if (m & (1 << r)) {
        packed |= r << (4 * (4 - n));
        n++;
      }
    }
    TOP5[m] = packed;
  }
})();

const counts = new Uint8Array(13);

/** Evaluate 5, 6 or 7 cards. `n` defaults to cards.length. */
export function evaluate(cards: ArrayLike<Card>, n: number = cards.length): number {
  let m0 = 0, m1 = 0, m2 = 0, m3 = 0;
  let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
  counts.fill(0);
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = c >> 2;
    const bit = 1 << r;
    counts[r]++;
    switch (c & 3) {
      case 0: m0 |= bit; c0++; break;
      case 1: m1 |= bit; c1++; break;
      case 2: m2 |= bit; c2++; break;
      default: m3 |= bit; c3++;
    }
  }

  // With at most 7 cards a flush excludes quads and full houses, so it can return early.
  const fm = c0 >= 5 ? m0 : c1 >= 5 ? m1 : c2 >= 5 ? m2 : c3 >= 5 ? m3 : 0;
  if (fm) {
    const sf = STRAIGHT_HIGH[fm];
    if (sf) return (HandCategory.StraightFlush << CAT_SHIFT) | ((sf - 1) << 16);
    return (HandCategory.Flush << CAT_SHIFT) | TOP5[fm];
  }

  const rankMask = m0 | m1 | m2 | m3;
  let quad = -1, trip = -1, trip2 = -1, pair1 = -1, pair2 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = counts[r];
    if (k === 4) quad = r;
    else if (k === 3) {
      if (trip < 0) trip = r;
      else if (trip2 < 0) trip2 = r;
    } else if (k === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
    }
  }

  if (quad >= 0) {
    const kick = TOP5[rankMask & ~(1 << quad)] >> 16;
    return (HandCategory.Quads << CAT_SHIFT) | (quad << 16) | (kick << 12);
  }
  if (trip >= 0 && (pair1 >= 0 || trip2 >= 0)) {
    const p = Math.max(pair1, trip2);
    return (HandCategory.FullHouse << CAT_SHIFT) | (trip << 16) | (p << 12);
  }
  const st = STRAIGHT_HIGH[rankMask];
  if (st) return (HandCategory.Straight << CAT_SHIFT) | ((st - 1) << 16);
  if (trip >= 0) {
    const kick = TOP5[rankMask & ~(1 << trip)] >> 12; // top 2 kickers
    return (HandCategory.Trips << CAT_SHIFT) | (trip << 16) | (kick << 4);
  }
  if (pair2 >= 0) {
    const kick = TOP5[rankMask & ~(1 << pair1) & ~(1 << pair2)] >> 16;
    return (HandCategory.TwoPair << CAT_SHIFT) | (pair1 << 16) | (pair2 << 12) | (kick << 8);
  }
  if (pair1 >= 0) {
    const kick = TOP5[rankMask & ~(1 << pair1)] >> 8; // top 3 kickers
    return (HandCategory.Pair << CAT_SHIFT) | (pair1 << 16) | (kick << 4);
  }
  return TOP5[rankMask];
}

export const categoryOf = (score: number): HandCategory => (score >> CAT_SHIFT) as HandCategory;

const nib = (score: number, i: number) => (score >> (16 - 4 * i)) & 15;

/** Human-readable description, e.g. "Two Pair, Kings and Sevens". */
export function describeScore(score: number): string {
  const cat = categoryOf(score);
  const a = nib(score, 0);
  const b = nib(score, 1);
  switch (cat) {
    case HandCategory.StraightFlush:
      return a === 12 ? 'Royal Flush' : `Straight Flush, ${RANK_NAMES[a]}-high`;
    case HandCategory.Quads:
      return `Four of a Kind, ${RANK_PLURALS[a]}`;
    case HandCategory.FullHouse:
      return `Full House, ${RANK_PLURALS[a]} full of ${RANK_PLURALS[b]}`;
    case HandCategory.Flush:
      return `Flush, ${RANK_NAMES[a]}-high`;
    case HandCategory.Straight:
      return `Straight, ${RANK_NAMES[a]}-high`;
    case HandCategory.Trips:
      return `Three of a Kind, ${RANK_PLURALS[a]}`;
    case HandCategory.TwoPair:
      return `Two Pair, ${RANK_PLURALS[a]} and ${RANK_PLURALS[b]}`;
    case HandCategory.Pair:
      return `Pair of ${RANK_PLURALS[a]}`;
    default:
      return `${RANK_NAMES[a]}-high`;
  }
}

/** The five cards that make the best hand (for highlighting). Brute force over 5-subsets; UI use only. */
export function bestFive(cards: readonly Card[]): Card[] {
  if (cards.length <= 5) return [...cards];
  const target = evaluate(cards);
  const n = cards.length;
  const pick = [0, 0, 0, 0, 0];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            pick[0] = cards[a]; pick[1] = cards[b]; pick[2] = cards[c]; pick[3] = cards[d]; pick[4] = cards[e];
            if (evaluate(pick, 5) === target) return [...pick];
          }
  return cards.slice(0, 5);
}
