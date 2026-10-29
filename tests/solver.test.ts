import { describe, expect, it } from 'vitest';
import { exploitability, expectedValue, solveCfr } from '../src/solver/cfr';
import { KUHN_GAME_VALUE, kuhnPoker } from '../src/solver/kuhn';
import { fromProfile } from '../src/solver/strategySource';

describe('CFR solver on Kuhn poker', () => {
  const res = solveCfr(kuhnPoker, { iterations: 3000, variant: 'CFR+' });

  it('converges to the known game value −1/18', () => {
    expect(res.gameValue).toBeCloseTo(KUHN_GAME_VALUE, 3);
  });

  it('reaches near-zero exploitability', () => {
    expect(res.exploitability).toBeGreaterThanOrEqual(-1e-12);
    expect(res.exploitability).toBeLessThan(0.004);
    const longer = solveCfr(kuhnPoker, { iterations: 10000, variant: 'CFR+' });
    expect(longer.exploitability).toBeLessThan(res.exploitability);
  });

  it('matches the analytic equilibrium family', () => {
    const s = res.average;
    const alpha = s['J:'].b; // first player bluffs the Jack with frequency α ∈ [0, 1/3]
    expect(alpha).toBeLessThanOrEqual(1 / 3 + 0.01);
    expect(s['K:'].b).toBeCloseTo(3 * alpha, 1); // and value-bets the King 3α
    expect(s['Q:'].b).toBeLessThan(0.02); // never bets the Queen
    expect(s['J:b'].b).toBeLessThan(0.02); // second player never calls with a Jack
    expect(s['K:b'].b).toBeGreaterThan(0.98); // always calls with a King
    expect(s['Q:b'].b).toBeCloseTo(1 / 3, 1); // calls 1/3 with the Queen
    expect(s['J:p'].b).toBeCloseTo(1 / 3, 1); // bluffs 1/3 after a check with a Jack
  });

  it('a uniformly random strategy is exploitable', () => {
    const uniform = Object.fromEntries(Object.keys(res.average).map((k) => [k, { p: 0.5, b: 0.5 }]));
    expect(exploitability(kuhnPoker, uniform)).toBeGreaterThan(0.1);
    // Position matters: with both players uniform, player 0 still gets an exact value of +1/8.
    expect(expectedValue(kuhnPoker, uniform)).toBeCloseTo(1 / 8, 12);
  });

  it('only accepts solver provenance as a StrategySource', () => {
    expect(() => fromProfile(res.average, { kind: 'heuristic', detail: 'x' })).toThrow();
    expect(fromProfile(res.average, res.provenance).policy('K:')).toBeDefined();
  });
});
