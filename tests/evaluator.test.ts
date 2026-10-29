import { describe, expect, it } from 'vitest';
import { parseCards, type Card } from '../src/core/cards';
import { bestFive, categoryOf, CATEGORY_NAMES, describeScore, evaluate, HandCategory } from '../src/core/evaluator';

const ev = (s: string) => evaluate(parseCards(s));

/** Naive reference evaluator: independent implementation, best of all 5-card subsets. */
function naive5(cs: Card[]): number[] {
  const ranks = cs.map((c) => c >> 2).sort((a, b) => b - a);
  const flush = cs.every((c) => (c & 3) === (cs[0] & 3));
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5 && uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
  if (uniq.join() === '12,3,2,1,0') straightHigh = 3;
  const groups = uniq
    .map((r) => [ranks.filter((x) => x === r).length, r])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const shape = groups.map((g) => g[0]).join('');
  const kick = groups.map((g) => g[1]);
  if (straightHigh >= 0 && flush) return [8, straightHigh];
  if (shape === '41') return [7, ...kick];
  if (shape === '32') return [6, ...kick];
  if (flush) return [5, ...kick];
  if (straightHigh >= 0) return [4, straightHigh];
  if (shape === '311') return [3, ...kick];
  if (shape === '221') return [2, ...kick];
  if (shape === '2111') return [1, ...kick];
  return [0, ...kick];
}
const cmpVec = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? -1) !== (b[i] ?? -1)) return (a[i] ?? -1) - (b[i] ?? -1);
  return 0;
};
function naive7(cs: Card[]): number[] {
  let best: number[] = [-1];
  for (let a = 0; a < cs.length; a++)
    for (let b = a + 1; b < cs.length; b++)
      for (let c = b + 1; c < cs.length; c++)
        for (let d = c + 1; d < cs.length; d++)
          for (let e = d + 1; e < cs.length; e++) {
            const v = naive5([cs[a], cs[b], cs[c], cs[d], cs[e]]);
            if (cmpVec(v, best) > 0) best = v;
          }
  return best;
}

describe('hand evaluator', () => {
  it('ranks categories in the correct order', () => {
    const hands = [
      '2c 4d 6h 8s Tc 3d 9h', // high card
      'Ac Ad 6h 8s Tc 3d 9h', // pair
      'Ac Ad 6h 6s Tc 3d 9h', // two pair
      'Ac Ad Ah 6s Tc 3d 9h', // trips
      '5c 6d 7h 8s 9c Kd Kh', // straight
      '2h 5h 9h Jh Kh Ac Ad', // flush
      'Ac Ad Ah 6s 6c 3d 9h', // full house
      'Ac Ad Ah As 6c 3d 9h', // quads
      '5h 6h 7h 8h 9h Ac Ad', // straight flush
    ];
    const cats = hands.map((h) => categoryOf(ev(h)));
    expect(cats).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (let i = 1; i < hands.length; i++) expect(ev(hands[i])).toBeGreaterThan(ev(hands[i - 1]));
  });

  it('handles the wheel (A-2-3-4-5) as a 5-high straight', () => {
    const wheel = ev('Ac 2d 3h 4s 5c Kd 9h');
    expect(categoryOf(wheel)).toBe(HandCategory.Straight);
    expect(describeScore(wheel)).toBe('Straight, Five-high');
    expect(ev('2c 3d 4h 5s 6c Kd 9h')).toBeGreaterThan(wheel);
    expect(describeScore(ev('Ah 2h 3h 4h 5h Kd 9c'))).toBe('Straight Flush, Five-high');
  });

  it('uses kickers correctly and detects exact ties', () => {
    expect(ev('Ac Kd 7h 7s 2c 3d 9h')).toBeGreaterThan(ev('Qc Jd 7h 7s 2c 3d 9h'));
    // board plays: both players have the same best five
    expect(ev('2c 3d As Ks Qs Js 9h')).toBe(ev('2h 4d As Ks Qs Js 9h'));
    // two pair: third pair cannot be used, best kicker counts
    expect(ev('Ac Ad Kc Kd 2c 2d Qh')).toBeGreaterThan(ev('Ac Ad Kc Kd 3c 3d Jh'));
    // full house picks the higher of two trips
    expect(describeScore(ev('Ac Ad Ah Kc Kd Kh 2c'))).toBe('Full House, Aces full of Kings');
    expect(describeScore(ev('As Ks Qs Js Ts 9c 8c'))).toBe('Royal Flush');
  });

  it('reproduces the exact category frequencies over all 2,598,960 five-card hands', () => {
    const counts = new Array(9).fill(0);
    const h = new Int32Array(5);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) {
              h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e;
              counts[categoryOf(evaluate(h, 5))]++;
            }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  });

  it('agrees with a naive reference evaluator on random 7-card hands', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
    for (let t = 0; t < 1500; t++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const x = deck.slice(0, 7);
      const y = deck.slice(7, 14);
      const fast = Math.sign(evaluate(x) - evaluate(y));
      const slow = Math.sign(cmpVec(naive7(x), naive7(y)));
      expect(fast).toBe(slow);
      expect(categoryOf(evaluate(x))).toBe(naive7(x)[0]);
    }
  });

  it('bestFive returns five cards with the same score', () => {
    const cards = parseCards('Ac Ad Ah 6s 6c 3d 9h');
    const five = bestFive(cards);
    expect(five).toHaveLength(5);
    expect(evaluate(five)).toBe(evaluate(cards));
    expect(CATEGORY_NAMES[categoryOf(evaluate(five))]).toBe('Full House');
  });
});
