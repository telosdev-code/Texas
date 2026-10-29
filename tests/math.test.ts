import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/core/cards';
import { choose, pairCombos, probHitAtLeastOne, ruleOf2And4, unpairedCombos } from '../src/core/combinatorics';
import { computeEquity, estimateExactWork, type EquityPlayer } from '../src/core/equity';
import {
  bluffToValueRatio, breakevenFoldFrequency, evBet, evCall, impliedOddsNeeded, minimumDefenseFrequency,
  optimalBluffFraction, oddsAgainst, potOddsRatio, requiredEquity, winnablePot,
} from '../src/core/ev';
import { RANGE_PRESETS, topPercentRange } from '../src/core/presets';
import { classOfCards, countCombos, formatRange, fullRange, parseRange, rangePercent, rangeToCombos } from '../src/core/ranges';

const hand = (s: string): EquityPlayer => ({ kind: 'hand', cards: parseCards(s) as [number, number] });
const range = (s: string, dead: string[] = []): EquityPlayer => ({
  kind: 'range',
  combos: rangeToCombos(parseRange(s), dead.flatMap((d) => parseCards(d))),
});

describe('combinatorics', () => {
  it('computes binomial coefficients', () => {
    expect(choose(52, 2)).toBe(1326);
    expect(choose(52, 5)).toBe(2598960);
    expect(choose(48, 5)).toBe(1712304);
    expect(choose(5, 6)).toBe(0);
  });
  it('counts starting-hand combos with card removal', () => {
    expect(unpairedCombos(0, 0)).toBe(16); // AK
    expect(unpairedCombos(1, 0)).toBe(12); // AK on an ace-high board
    expect(pairCombos(0)).toBe(6);
    expect(pairCombos(1)).toBe(3);
    expect(pairCombos(2)).toBe(1);
  });
  it('computes exact draw probabilities and compares with the rule of 2 and 4', () => {
    // flush draw on the flop: 9 outs, 47 unseen, two cards to come
    expect(probHitAtLeastOne(9, 47, 2)).toBeCloseTo(1 - (38 * 37) / (47 * 46), 12);
    expect(probHitAtLeastOne(9, 47, 2)).toBeCloseTo(0.3497, 4);
    expect(probHitAtLeastOne(9, 46, 1)).toBeCloseTo(9 / 46, 12);
    expect(ruleOf2And4(9, 2)).toBeCloseTo(0.36, 12);
    expect(ruleOf2And4(9, 1)).toBeCloseTo(0.18, 12);
  });
});

describe('ranges', () => {
  it('parses standard notation with correct combo counts', () => {
    expect(countCombos(parseRange('22+'))).toBe(78);
    expect(countCombos(parseRange('AKs'))).toBe(4);
    expect(countCombos(parseRange('AKo'))).toBe(12);
    expect(countCombos(parseRange('AK'))).toBe(16);
    expect(countCombos(parseRange('A2s+'))).toBe(48);
    expect(countCombos(parseRange('KTo+'))).toBe(36);
    expect(countCombos(parseRange('77-99'))).toBe(18);
    expect(countCombos(parseRange('A2s-A5s'))).toBe(16);
    expect(countCombos(parseRange('AKs:0.5'))).toBe(2);
    expect(countCombos(fullRange())).toBe(1326);
    expect(rangePercent(fullRange())).toBe(1);
  });
  it('removes blocked combos', () => {
    const r = parseRange('AA, AK');
    expect(countCombos(r, parseCards('Ah'))).toBe(3 + 12);
    expect(countCombos(r, parseCards('Ah Kd'))).toBe(3 + 9);
  });
  it('round-trips through formatRange', () => {
    for (const text of ['QQ+, AKs, AKo', '22-55, A2s-A5s, KTo+', ...RANGE_PRESETS.map((p) => p.text)]) {
      const r = parseRange(text);
      expect(Array.from(parseRange(formatRange(r)))).toEqual(Array.from(r));
    }
    expect(formatRange(parseRange('JJ+, AQs+, AKo'))).toBe('JJ+, AQs+, AKo');
  });
  it('maps cards to matrix classes', () => {
    expect(classOfCards(...(parseCards('As Ks') as [number, number])).label).toBe('AKs');
    expect(classOfCards(...(parseCards('2d Ac') as [number, number])).label).toBe('A2o');
    expect(classOfCards(...(parseCards('7d 7c') as [number, number])).label).toBe('77');
  });
  it('builds top-X% ranges led by premium pairs', () => {
    const r = topPercentRange(0.05);
    expect(r[0]).toBe(1); // AA
    expect(rangePercent(r)).toBeGreaterThanOrEqual(0.05);
    expect(rangePercent(r)).toBeLessThan(0.065);
  });
});

describe('equity', () => {
  it('is exactly 1 / 0 / split on a complete board', () => {
    const r = computeEquity({ players: [hand('As Ad'), hand('Ks Kd')], board: parseCards('2c 7h 9d Jc 3s') });
    expect(r.method).toBe('exact');
    expect(r.equity).toEqual([1, 0]);
    const split = computeEquity({ players: [hand('2c 3d'), hand('2h 3s')], board: parseCards('As Ks Qd Jd Tc') });
    expect(split.equity).toEqual([0.5, 0.5]);
    expect(split.tie).toEqual([0.5, 0.5]);
  });

  it('matches hand-counted outs on the turn', () => {
    // Hero 9h8h on Ah Kh 2c 3d vs villain AsAc (top set). 44 unseen river cards.
    // Hero wins only with a heart that does not pair the board for villain: 9 hearts remain, minus 2h/3h
    // (which give villain a full house) → 7 winning cards.
    const r = computeEquity({ players: [hand('9h 8h'), hand('As Ac')], board: parseCards('Ah Kh 2c 3d') });
    expect(r.method).toBe('exact');
    expect(r.outcomes).toBe(44);
    expect(r.equity[0]).toBeCloseTo(7 / 44, 12);
  });

  it('computes AA vs KK preflop by full enumeration (1,712,304 boards)', () => {
    const r = computeEquity({ players: [hand('Ah As'), hand('Kd Kc')] });
    expect(r.method).toBe('exact');
    expect(r.outcomes).toBe(1712304);
    expect(r.equity[0]).toBeGreaterThan(0.81);
    expect(r.equity[0]).toBeLessThan(0.83);
    expect(r.equity[0] + r.equity[1]).toBeCloseTo(1, 12);
  });

  it('is symmetric for suit-isomorphic hands', () => {
    const r = computeEquity({ players: [hand('As Ks'), hand('Ah Kh')], board: parseCards('2c 7d 9c') });
    expect(r.equity[0]).toBeCloseTo(0.5, 12);
  });

  it('Monte Carlo agrees with exact enumeration within its error bars', () => {
    const players = [hand('Jh Th'), hand('As Kd'), hand('6c 6d')];
    const board = parseCards('9h 8c 2h');
    const exact = computeEquity({ players, board, method: 'exact' });
    const mc = computeEquity({ players, board, method: 'monte-carlo', samples: 40_000, seed: 99 });
    expect(mc.method).toBe('monte-carlo');
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(mc.equity[i] - exact.equity[i])).toBeLessThan(4 * mc.stdError[i] + 1e-9);
      expect(mc.stdError[i]).toBeGreaterThan(0);
    }
  });

  it('handles hand vs range with card removal exactly on the river', () => {
    // Villain range {AA, KK}; hero holds an ace and the board has a king → 3 AA combos and 3 KK combos remain.
    const board = parseCards('Kc 7d 2s 9h 4c');
    const r = computeEquity({ players: [hand('Ad Qd'), range('AA, KK', ['Ad Qd', 'Kc 7d 2s 9h 4c'])], board });
    expect(r.method).toBe('exact');
    // Hero (ace-high) loses to every remaining combo.
    expect(r.equity[0]).toBe(0);
    const r2 = computeEquity({ players: [hand('7s 7h'), range('AA, KK', [])], board: parseCards('Kc 7d 2s 9h 4c') });
    // Hero has a set of sevens: beats AA (6 combos), loses to KK (3 combos remain; Kc is on the board) → 6 / 9.
    expect(r2.equity[0]).toBeCloseTo(6 / 9, 12);
  });

  it('chooses Monte Carlo when enumeration is too expensive', () => {
    const req = { players: [hand('As Ks'), range('22+, A2s+'), range('22+, KTs+')] };
    expect(estimateExactWork(req)).toBeGreaterThan(6_000_000);
    const r = computeEquity({ ...req, samples: 5000 });
    expect(r.method).toBe('monte-carlo');
    expect(r.equity.reduce((a, b) => a + b)).toBeCloseTo(1, 9);
  });

  it('rejects duplicate cards', () => {
    expect(() => computeEquity({ players: [hand('As Ks'), hand('As Qd')] })).toThrow();
  });
});

describe('expected value formulas', () => {
  it('pot odds and required equity', () => {
    // Facing a 50 bet into a 100 pot: pot is now 150, call 50 → need 50/200 = 25%.
    expect(requiredEquity(150, 50)).toBe(0.25);
    expect(potOddsRatio(150, 50)).toBe(3);
    expect(requiredEquity(150, 0)).toBe(0);
    expect(oddsAgainst(0.25)).toBe(3);
  });
  it('a call at exactly the required equity has zero EV', () => {
    for (const [pot, call] of [[150, 50], [300, 200], [75, 25]]) {
      expect(evCall(requiredEquity(pot, call), pot, call)).toBeCloseTo(0, 10);
    }
    expect(evCall(0.5, 150, 50)).toBe(50);
    expect(evCall(0, 150, 50)).toBe(-50);
  });
  it('bluffing thresholds', () => {
    expect(breakevenFoldFrequency(100, 100)).toBe(0.5);
    expect(breakevenFoldFrequency(100, 50)).toBeCloseTo(1 / 3, 12);
    expect(minimumDefenseFrequency(100, 100)).toBe(0.5);
    expect(minimumDefenseFrequency(100, 50)).toBeCloseTo(2 / 3, 12);
    // a pure bluff at the breakeven fold frequency has zero EV
    expect(evBet(100, 75, breakevenFoldFrequency(100, 75), 0)).toBeCloseTo(0, 10);
  });
  it('optimal bluff fraction makes a bluff-catcher indifferent (toy game)', () => {
    for (const [pot, bet] of [[100, 100], [100, 50], [100, 200]]) {
      const bluffFrac = optimalBluffFraction(pot, bet);
      // Caller's EV of calling with a bluff-catcher vs. a range with this many bluffs: equity = bluffFrac.
      // The pot facing the call is pot + bet.
      expect(evCall(bluffFrac, pot + bet, bet)).toBeCloseTo(0, 10);
      expect(bluffToValueRatio(pot, bet)).toBeCloseTo(bluffFrac / (1 - bluffFrac), 12);
    }
    expect(optimalBluffFraction(100, 100)).toBeCloseTo(1 / 3, 12);
  });
  it('caps the winnable pot when calling all-in for less', () => {
    // Hero has 60 in, villain bet to 700 total, a third player called 700, blinds folded 15.
    // Hero can call only 400 more (total 460): each opponent's chips count only up to 460.
    expect(winnablePot([60, 700, 700, 15], 0, 400)).toBe(60 + 460 + 460 + 15);
    // With enough chips, the winnable pot is simply everything in the middle.
    expect(winnablePot([60, 700, 700, 15], 0, 640)).toBe(60 + 700 + 700 + 15);
  });
  it('implied odds needed', () => {
    // 20% equity, pot 100, call 50: need 0.8·50/0.2 − 100 = 100 more chips when we hit.
    expect(impliedOddsNeeded(0.2, 100, 50)).toBeCloseTo(100, 10);
    expect(impliedOddsNeeded(0.5, 100, 50)).toBe(0);
    // Check: with those implied winnings the call breaks even.
    expect(evCall(0.2, 100 + 100, 50)).toBeCloseTo(0, 10);
  });
});
