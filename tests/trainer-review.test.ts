import { describe, expect, it } from 'vitest';
import { evCall, requiredEquity } from '../src/core/ev';
import { applyAction, startHand } from '../src/engine/engine';
import type { Action, HandState } from '../src/engine/types';
import { estimateRange, reviewHand, type StoredHand } from '../src/review/analysis';
import { handStats, rolling } from '../src/review/progress';
import { generateDrill, gradeDrill } from '../src/trainer/drills';

describe('trainer drills', () => {
  it('call/fold drills are graded by the sign of EV(call)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const d = generateDrill('call-fold', seed);
      const { equity, required } = d.data;
      expect(required).toBeCloseTo(requiredEquity(d.pot!, d.bet!), 12);
      const ev = evCall(equity, d.pot!, d.bet!);
      const call = gradeDrill(d, 1);
      const fold = gradeDrill(d, 0);
      expect(call.correct).toBe(ev >= 0);
      expect(fold.correct).toBe(ev <= 0);
      expect((call.evLoss ?? 0) + (fold.evLoss ?? 0)).toBeCloseTo(Math.abs(ev), 9);
      // Single-range spots are small enough to enumerate exactly.
      expect(d.provenance.kind).toBe('exact');
    }
  });
  it('outs drills count winning river cards correctly', () => {
    const d = generateDrill('outs', 3);
    expect(d.board).toHaveLength(4);
    expect(gradeDrill(d, d.answer).correct).toBe(true);
    expect(gradeDrill(d, d.answer + 1).correct).toBe(false);
  });
  it('equity, combos and bluff drills accept the correct answer', () => {
    for (let seed = 10; seed < 15; seed++) {
      for (const kind of ['equity-estimate', 'combos', 'bluff-math'] as const) {
        const d = generateDrill(kind, seed);
        expect(gradeDrill(d, d.answer).correct).toBe(true);
      }
    }
  });
});

function playScript(seed: number, script: Action[]): HandState {
  let s = startHand(
    [0, 1].map((i) => ({ id: `${i}`, name: i ? 'Bot' : 'You', stack: 1000, isHuman: i === 0 })),
    0, { smallBlind: 5, bigBlind: 10 }, seed,
  );
  for (const a of script) s = applyAction(s, a);
  return s;
}

function store(s: HandState): StoredHand {
  return {
    id: 'h', timestamp: 0, handNumber: 1, seed: s.seed, humanSeat: 0, config: s.config, button: s.button,
    players: s.players.map((p) => ({ name: p.name, hole: p.hole, startStack: p.startStack, out: p.out, profileId: p.profileId })),
    board: s.board, log: s.log, net: s.result!.net, showdown: s.result!.showdown, descriptions: s.result!.descriptions,
  };
}

describe('hand review', () => {
  it('estimates tighter ranges for raisers than for limpers', () => {
    const s = playScript(1, [{ type: 'raise', amount: 30 }, { type: 'raise', amount: 90 }]);
    const est = estimateRange(s.log, s.log.length, 1, 1);
    expect(est.fraction).toBeCloseTo(0.06, 9);
    const opener = estimateRange(s.log, s.log.length, 0, 1);
    expect(opener.fraction).toBeCloseTo(0.18, 9);
  });

  it('flags folding a very strong hand to a small river bet as a mistake', () => {
    // Find a seed where the human has ≥90% equity on the river, then fold to a min-bet.
    for (let seed = 1; seed < 500; seed++) {
      let s = playScript(seed, [{ type: 'call' }, { type: 'check' }]);
      s = applyAction(s, { type: 'check' }); // flop: BB (bot) checks
      s = applyAction(s, { type: 'check' });
      s = applyAction(s, { type: 'check' }); // turn
      s = applyAction(s, { type: 'check' });
      // river: bot bets 10 into 20; human folds
      s = applyAction(s, { type: 'bet', amount: 10 });
      const quick = reviewHand(store(applyAction(s, { type: 'call' })));
      const riverCall = quick.decisions[quick.decisions.length - 1];
      if (riverCall.equity < 0.9) continue;
      s = applyAction(s, { type: 'fold' });
      const r = reviewHand(store(s));
      const last = r.decisions[r.decisions.length - 1];
      expect(last.action.type).toBe('fold');
      expect(last.verdict).toBe('mistake');
      expect(last.evLossBB).toBeGreaterThan(0);
      expect(r.mistakes).toBeGreaterThanOrEqual(1);
      expect(r.provenance.kind).toBe('heuristic');
      return;
    }
    throw new Error('no suitable seed found');
  });

  it('computes progress statistics', () => {
    expect(rolling([1, 0, 1, 0], 2).map((p) => p.value)).toEqual([1, 0.5, 0.5, 0.5]);
    const s = playScript(4, [{ type: 'fold' }]);
    const stats = handStats([store(s)]);
    expect(stats.hands).toBe(1);
    expect(stats.netBB).toBe(-0.5);
  });
});

