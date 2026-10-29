import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { applyAction, IllegalActionError, legalActions, nextButton, potTotal, startHand } from '../src/engine/engine';
import { buildPots, splitPot } from '../src/engine/pots';
import type { Action, HandState, SeatInfo } from '../src/engine/types';

const cfg = { smallBlind: 5, bigBlind: 10 };
const seats = (...stacks: number[]): SeatInfo[] =>
  stacks.map((stack, i) => ({ id: `p${i}`, name: `P${i}`, stack, isHuman: i === 0 }));
const act = (s: HandState, ...actions: Action[]) => actions.reduce(applyAction, s);
const chips = (s: HandState) => s.players.reduce((a, p) => a + p.stack, 0) + (s.complete ? 0 : potTotal(s));

describe('dealing and blinds', () => {
  it('deals two unique cards to each player and posts blinds left of the button', () => {
    const s = startHand(seats(1000, 1000, 1000, 1000), 0, cfg, 42);
    const all = s.players.flatMap((p) => p.hole);
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
    expect([s.sb, s.bb]).toEqual([1, 2]);
    expect(s.players[1].streetBet).toBe(5);
    expect(s.players[2].streetBet).toBe(10);
    expect(s.toAct).toBe(3); // UTG
    expect(potTotal(s)).toBe(15);
  });

  it('heads-up: button posts SB and acts first preflop, last postflop', () => {
    let s = startHand(seats(1000, 1000), 0, cfg, 1);
    expect(s.sb).toBe(0);
    expect(s.bb).toBe(1);
    expect(s.toAct).toBe(0);
    s = act(s, { type: 'call' });
    expect(s.toAct).toBe(1); // BB option
    expect(legalActions(s).canCheck).toBe(true);
    expect(legalActions(s).canRaise).toBe(true);
    s = act(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(1); // BB first postflop
  });

  it('skips busted players and moves the button to the next seat with chips', () => {
    const st = seats(1000, 0, 1000, 1000);
    expect(nextButton(st, 0)).toBe(2);
    const s = startHand(st, 0, cfg, 3);
    expect(s.players[1].out).toBe(true);
    expect(s.players[1].hole).toHaveLength(0);
    expect([s.sb, s.bb]).toEqual([2, 3]);
  });
});

describe('betting rules', () => {
  it('enforces min bet and min raise', () => {
    let s = startHand(seats(1000, 1000, 1000), 0, cfg, 5);
    // UTG = button in 3-handed (seat 0)
    expect(legalActions(s).minRaiseTo).toBe(20);
    expect(() => act(s, { type: 'raise', amount: 15 })).toThrow(IllegalActionError);
    s = act(s, { type: 'raise', amount: 30 }); // raise of 20
    expect(legalActions(s).minRaiseTo).toBe(50); // 30 + 20
    s = act(s, { type: 'raise', amount: 80 }); // raise of 50
    expect(legalActions(s).minRaiseTo).toBe(130);
    expect(() => act(s, { type: 'check' })).toThrow(IllegalActionError);
  });

  it('a short all-in raise does not reopen betting for players who already acted', () => {
    // seat0 (BTN) 1000, seat1 (SB) 1000, seat2 (BB) 1000, seat3 (UTG) 140
    let s = startHand(seats(1000, 1000, 1000, 140), 0, cfg, 9);
    expect(s.toAct).toBe(3);
    s = act(s, { type: 'call' }); // UTG limps 10
    s = act(s, { type: 'raise', amount: 100 }); // BTN raises to 100 (full raise of 90)
    s = act(s, { type: 'fold' }, { type: 'fold' }); // SB, BB fold
    expect(s.toAct).toBe(3);
    s = act(s, { type: 'raise', amount: 140 }); // UTG all-in for 140: a raise of 40 < 90 → not a full raise
    expect(s.toAct).toBe(0);
    const l = legalActions(s);
    expect(l.canCall).toBe(true);
    expect(l.callAmount).toBe(40);
    expect(l.canRaise).toBe(false);
  });

  it('a full all-in raise does reopen betting', () => {
    let s = startHand(seats(1000, 1000, 1000, 300), 0, cfg, 9);
    s = act(s, { type: 'call' }, { type: 'raise', amount: 100 }, { type: 'call' }, { type: 'fold' });
    s = act(s, { type: 'raise', amount: 300 }); // UTG all-in: raise of 200 ≥ 90
    expect(s.toAct).toBe(0);
    expect(legalActions(s).canRaise).toBe(true);
    expect(legalActions(s).minRaiseTo).toBe(500);
  });

  it('returns an uncalled bet', () => {
    let s = startHand(seats(1000, 1000), 0, cfg, 2);
    s = act(s, { type: 'raise', amount: 1000 }); // button shoves
    s = act(s, { type: 'fold' });
    expect(s.complete).toBe(true);
    expect(s.players[0].stack).toBe(1010);
    expect(s.players[1].stack).toBe(990);
    expect(s.log.some((e) => e.kind === 'uncalled' && e.amount === 990)).toBe(true);
  });

  it('all fold to the big blind', () => {
    let s = startHand(seats(500, 500, 500), 0, cfg, 11);
    s = act(s, { type: 'fold' }, { type: 'fold' });
    expect(s.complete).toBe(true);
    expect(s.result!.net).toEqual([0, -5, 5]);
    expect(s.result!.showdown).toBe(false);
  });

  it('runs out the board when everyone is all-in', () => {
    let s = startHand(seats(200, 200), 0, cfg, 4);
    s = act(s, { type: 'raise', amount: 200 }, { type: 'call' });
    expect(s.complete).toBe(true);
    expect(s.board).toHaveLength(5);
    expect(s.result!.showdown).toBe(true);
    expect(chips(s)).toBe(400);
  });
});

describe('side pots', () => {
  it('builds main and side pots from different all-in amounts', () => {
    const pots = buildPots([100, 300, 600, 600], [false, false, false, false]);
    expect(pots).toEqual([
      { amount: 400, eligible: [0, 1, 2, 3] },
      { amount: 600, eligible: [1, 2, 3] },
      { amount: 600, eligible: [2, 3] },
    ]);
  });
  it('keeps folded chips in the pot but excludes the folder', () => {
    const pots = buildPots([50, 200, 200], [true, false, false]);
    expect(pots).toEqual([{ amount: 450, eligible: [1, 2] }]);
  });
  it('splits odd chips clockwise from the button', () => {
    expect(splitPot(101, [2, 0], [1, 2, 0])).toEqual([51, 50]);
    expect(splitPot(100, [2, 0], [1, 2, 0])).toEqual([50, 50]);
  });
  it('awards side pots correctly in a three-way all-in', () => {
        for (let seed = 1; seed < 200; seed++) {
      let s = startHand(seats(100, 600, 300), 0, cfg, seed);
      // BTN all-in 100, SB all-in 600, BB calls all-in for 300 → SB's last 300 is uncalled.
      s = act(s, { type: 'raise', amount: 100 }, { type: 'raise', amount: 600 }, { type: 'call' });
      expect(s.complete).toBe(true);
      expect(chips(s)).toBe(1000);
      const pots = s.result!.pots;
      expect(pots.map((p) => p.amount)).toEqual([300, 400]);
      expect(pots[0].eligible).toEqual([0, 1, 2]);
      expect(pots[1].eligible).toEqual([1, 2]);
      // Seat 0 can never win more than the main pot.
      expect(s.players[0].stack).toBeLessThanOrEqual(300);
      expect(s.log.some((e) => e.kind === 'uncalled' && e.player === 1 && e.amount === 300)).toBe(true);
    }
  });
});

describe('random play invariants', () => {
  it('conserves chips and only ever reaches legal states over many random hands', () => {
    const rng = createRng(2024);
    for (let h = 0; h < 600; h++) {
      const n = 2 + rng.int(8);
      const stacks = Array.from({ length: n }, () => (rng.next() < 0.15 ? 0 : 20 + rng.int(2000)));
      if (stacks.filter((x) => x > 0).length < 2) continue;
      const start = stacks.reduce((a, b) => a + b, 0);
      let s = startHand(seats(...stacks), rng.int(n), cfg, rng.int(1e9), h);
      let steps = 0;
      while (!s.complete) {
        const l = legalActions(s);
        const options: Action[] = [];
        if (l.canFold) options.push({ type: 'fold' });
        if (l.canCheck) options.push({ type: 'check' });
        if (l.canCall) options.push({ type: 'call' }, { type: 'call' });
        if (l.canBet || l.canRaise) {
          const amt = l.minRaiseTo + rng.int(l.maxRaiseTo - l.minRaiseTo + 1);
          options.push({ type: l.canBet ? 'bet' : 'raise', amount: amt });
        }
        s = applyAction(s, options[rng.int(options.length)]);
        expect(chips(s)).toBe(start);
        for (const p of s.players) expect(p.stack).toBeGreaterThanOrEqual(0);
        expect(++steps).toBeLessThan(500);
      }
      expect(s.players.reduce((a, p) => a + p.stack, 0)).toBe(start);
      expect(s.result!.net.reduce((a, b) => a + b, 0)).toBe(0);
      const cards = [...s.board, ...s.players.flatMap((p) => p.hole)];
      expect(new Set(cards).size).toBe(cards.length);
    }
  });
});
