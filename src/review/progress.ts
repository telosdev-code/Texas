import type { DrillKind } from '../trainer/drills';
import type { StoredHand } from './analysis';

export interface DrillRecord {
  kind: DrillKind;
  timestamp: number;
  correct: boolean;
  score: number;
  evLoss?: number;
}

export interface ProgressPoint {
  index: number;
  value: number;
}

/** Rolling mean over a trailing window. */
export function rolling(values: number[], window: number): ProgressPoint[] {
  const out: ProgressPoint[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push({ index: i + 1, value: sum / Math.min(i + 1, window) });
  }
  return out;
}

export interface DrillStats {
  kind: DrillKind;
  attempts: number;
  accuracy: number;
  recentAccuracy: number;
  avgScore: number;
}

export function drillStats(records: DrillRecord[], kinds: DrillKind[]): DrillStats[] {
  return kinds.map((kind) => {
    const r = records.filter((x) => x.kind === kind);
    const recent = r.slice(-20);
    const acc = (xs: DrillRecord[]) => (xs.length ? xs.filter((x) => x.correct).length / xs.length : 0);
    return {
      kind,
      attempts: r.length,
      accuracy: acc(r),
      recentAccuracy: acc(recent),
      avgScore: r.length ? r.reduce((a, x) => a + x.score, 0) / r.length : 0,
    };
  });
}

export interface HandStats {
  hands: number;
  reviewed: number;
  decisions: number;
  mistakes: number;
  evLossBBPer100: number;
  netBB: number;
  /** Mistakes per graded decision, rolling over 25 reviewed hands. */
  mistakeTrend: ProgressPoint[];
  netTrend: ProgressPoint[];
}

export function handStats(hands: StoredHand[]): HandStats {
  const reviewed = hands.filter((h) => h.review);
  const decisions = reviewed.reduce((a, h) => a + h.review!.decisions.length, 0);
  const mistakes = reviewed.reduce((a, h) => a + h.review!.mistakes, 0);
  const evLoss = reviewed.reduce((a, h) => a + h.review!.evLossBB, 0);
  let cum = 0;
  const netTrend = hands.map((h, i) => {
    cum += h.net[h.humanSeat] / h.config.bigBlind;
    return { index: i + 1, value: cum };
  });
  const perHandRate = reviewed.map((h) => {
    const graded = h.review!.decisions.filter((d) => d.verdict !== 'info').length;
    return graded ? h.review!.mistakes / graded : 0;
  });
  return {
    hands: hands.length,
    reviewed: reviewed.length,
    decisions,
    mistakes,
    evLossBBPer100: reviewed.length ? (100 * evLoss) / reviewed.length : 0,
    netBB: cum,
    mistakeTrend: rolling(perHandRate, 25),
    netTrend,
  };
}
