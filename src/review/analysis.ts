import type { Card } from '../core/cards';
import { computeEquity, type EquityPlayer } from '../core/equity';
import { evCall, requiredEquity, winnablePot } from '../core/ev';
import { topPercentRange } from '../core/presets';
import type { Provenance } from '../core/provenance';
import { formatRange, rangeToCombos } from '../core/ranges';
import type { Action, LogEntry, Street, TableConfig } from '../engine/types';

/** A finished hand as persisted for review. Contains everything needed to replay it. */
export interface StoredHand {
  id: string;
  timestamp: number;
  handNumber: number;
  seed: number;
  humanSeat: number;
  config: TableConfig;
  button: number;
  players: { name: string; profileId?: string; hole: Card[]; startStack: number; out: boolean }[];
  board: Card[];
  log: LogEntry[];
  net: number[];
  showdown: boolean;
  descriptions: (string | null)[];
  review?: HandReview;
}

export interface OpponentRangeEstimate {
  seat: number;
  name: string;
  fraction: number;
  reason: string;
  rangeText: string;
}

export type Verdict = 'good' | 'mistake' | 'close' | 'info';

export interface DecisionReview {
  logIndex: number;
  street: Street;
  board: Card[];
  action: Action;
  pot: number;
  toCall: number;
  required: number;
  equity: number;
  stdError: number;
  equityProvenance: Provenance;
  opponents: OpponentRangeEstimate[];
  evCall: number;
  verdict: Verdict;
  /** EV lost vs. the better of call/fold, in big blinds (only for call/fold decisions). */
  evLossBB: number;
  note: string;
}

export interface HandReview {
  decisions: DecisionReview[];
  mistakes: number;
  evLossBB: number;
  provenance: Provenance;
}

export const REVIEW_PROVENANCE: Provenance = {
  kind: 'heuristic',
  detail:
    'Opponent ranges are estimated from their actions with simple rules; equity against those ranges is then computed exactly or by Monte Carlo. Flags assume no further betting.',
};

/** Heuristic range estimate from an opponent's actions before the decision point. */
export function estimateRange(log: LogEntry[], upTo: number, seat: number, bbSeat: number): Omit<OpponentRangeEstimate, 'name' | 'rangeText'> {
  let preflopRaisesBefore = 0;
  let fraction = seat === bbSeat ? 1 : 0.55;
  let reason = seat === bbSeat ? 'Big blind, no raise: any two cards' : 'Entered the pot without raising';
  let postflopAggression = 0;
  for (let i = 0; i < upTo; i++) {
    const e = log[i];
    if (e.kind !== 'action') continue;
    if (e.street === 'preflop') {
      const agg = e.action.type === 'raise' || e.action.type === 'bet';
      if (e.player === seat) {
        if (agg && preflopRaisesBefore === 0) {
          fraction = 0.18;
          reason = 'Raised first in: top ~18%';
        } else if (agg) {
          fraction = 0.06;
          reason = 'Re-raised preflop: top ~6%';
        } else if (e.action.type === 'call' && preflopRaisesBefore > 0) {
          fraction = Math.min(fraction, preflopRaisesBefore > 1 ? 0.08 : 0.3);
          reason = preflopRaisesBefore > 1 ? 'Called a re-raise: top ~8%' : 'Called a raise: top ~30%';
        } else if (e.action.type === 'call') {
          fraction = 0.55;
          reason = 'Limped: top ~55%';
        }
      }
      if (agg) preflopRaisesBefore++;
    } else if (e.player === seat && (e.action.type === 'bet' || e.action.type === 'raise')) {
      postflopAggression++;
    }
  }
  if (postflopAggression > 0) {
    fraction *= Math.pow(0.6, postflopAggression);
    reason += `, then bet/raised postflop ×${postflopAggression} (narrowed)`;
  }
  return { seat, fraction: Math.max(0.03, fraction), reason };
}

/** Chips each player had committed before log entry `upTo` (net of returned uncalled bets). */
export function contributionsBefore(log: LogEntry[], upTo: number, n: number): number[] {
  const c = new Array(n).fill(0);
  for (let i = 0; i < upTo; i++) {
    const e = log[i];
    if (e.kind === 'blind') c[e.player] += e.amount;
    else if (e.kind === 'action') c[e.player] += e.added;
    else if (e.kind === 'uncalled') c[e.player] -= e.amount;
  }
  return c;
}

export function reviewHand(h: StoredHand, samples = 6000): HandReview {
  const decisions: DecisionReview[] = [];
  const bb = h.config.bigBlind;
  const bbSeat = (h.log.find((e) => e.kind === 'blind' && e.blind === 'BB') as { player: number } | undefined)?.player ?? -1;
  const folded = new Set<number>();
  let board: Card[] = [];
  h.log.forEach((e, idx) => {
    if (e.kind === 'street') board = e.board;
    if (e.kind !== 'action') return;
    if (e.player !== h.humanSeat) {
      if (e.action.type === 'fold') folded.add(e.player);
      return;
    }
    const hero = h.players[h.humanSeat].hole as [Card, Card];
    const opponents: OpponentRangeEstimate[] = h.players
      .map((p, seat) => ({ p, seat }))
      .filter(({ p, seat }) => seat !== h.humanSeat && !p.out && !folded.has(seat))
      .map(({ p, seat }) => {
        const est = estimateRange(h.log, idx, seat, bbSeat);
        return { ...est, name: p.name, rangeText: formatRange(topPercentRange(est.fraction)) };
      });
    const dead = [...hero, ...board];
    const players: EquityPlayer[] = [
      { kind: 'hand', cards: hero },
      ...opponents.map((o) => ({ kind: 'range' as const, combos: rangeToCombos(topPercentRange(o.fraction), dead) })),
    ];
    const eq = computeEquity({ players, board, samples, seed: h.seed ^ idx, maxExactEvaluations: 1_500_000 });
    // Calling all-in for less than the bet can only win the matched part of each opponent's chips.
    const toCall = Math.min(e.toCall, e.stackBefore);
    const pot = winnablePot(contributionsBefore(h.log, idx, h.players.length), h.humanSeat, toCall);
    const req = requiredEquity(pot, toCall);
    const ev = evCall(eq.equity[0], pot, toCall);
    const margin = 0.04 + 2 * eq.stdError[0];
    let verdict: Verdict = 'info';
    let evLossBB = 0;
    let note = '';
    const eqPct = `${(eq.equity[0] * 100).toFixed(1)}%`;
    const reqPct = `${(req * 100).toFixed(1)}%`;
    const t = e.action.type;
    if (toCall > 0 && (t === 'fold' || t === 'call')) {
      const diff = eq.equity[0] - req;
      if (t === 'fold') {
        evLossBB = Math.max(0, ev) / bb;
        verdict = diff > margin ? 'mistake' : diff > -margin ? 'close' : 'good';
        note =
          verdict === 'mistake'
            ? `Folded with ~${eqPct} equity when only ${reqPct} was needed.`
            : verdict === 'close'
              ? `Close: ~${eqPct} equity vs. ${reqPct} needed.`
              : `Good fold: ~${eqPct} equity, ${reqPct} needed.`;
      } else {
        evLossBB = Math.max(0, -ev) / bb;
        verdict = diff < -margin ? 'mistake' : diff < margin ? 'close' : 'good';
        note =
          verdict === 'mistake'
            ? `Called with ~${eqPct} equity but needed ${reqPct}. Only implied odds could justify this.`
            : verdict === 'close'
              ? `Close: ~${eqPct} equity vs. ${reqPct} needed.`
              : `Profitable call: ~${eqPct} equity vs. ${reqPct} needed.`;
      }
      if (verdict !== 'mistake') evLossBB = 0;
    } else if (t === 'bet' || t === 'raise') {
      const size = e.added;
      note =
        eq.equity[0] >= 0.5
          ? `Value-oriented: ~${eqPct} equity vs. the estimated ranges.`
          : `Semi-bluff/bluff: ~${eqPct} equity. It needs folds — a pure bluff of ${size} into ${pot} must work ${((100 * size) / (pot + size)).toFixed(0)}% of the time.`;
    } else if (t === 'check') {
      note = `Checked with ~${eqPct} equity.`;
    }
    decisions.push({
      logIndex: idx,
      street: e.street,
      board: [...board],
      action: e.action,
      pot,
      toCall,
      required: req,
      equity: eq.equity[0],
      stdError: eq.stdError[0],
      equityProvenance: eq.provenance,
      opponents,
      evCall: ev,
      verdict,
      evLossBB,
      note,
    });
  });
  return {
    decisions,
    mistakes: decisions.filter((d) => d.verdict === 'mistake').length,
    evLossBB: decisions.reduce((a, d) => a + d.evLossBB, 0),
    provenance: REVIEW_PROVENANCE,
  };
}
