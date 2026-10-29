import type { Card } from './cards.ts';
import { choose } from './combinatorics.ts';
import { evaluate } from './evaluator.ts';
import type { Provenance } from './provenance.ts';
import { createRng, type Rng } from './rng.ts';
import type { WeightedCombo } from './ranges.ts';

/** A player is either a known hand or a weighted range of combos. */
export type EquityPlayer =
  | { kind: 'hand'; cards: [Card, Card] }
  | { kind: 'range'; combos: WeightedCombo[] };

export interface EquityRequest {
  players: EquityPlayer[];
  board?: Card[];
  dead?: Card[];
  /** Exact enumeration is used when the estimated number of hand evaluations is at most this. */
  maxExactEvaluations?: number;
  /** Monte Carlo trials when enumeration is too expensive. */
  samples?: number;
  seed?: number;
  /** Force a method (useful for tests and teaching comparisons). */
  method?: 'auto' | 'exact' | 'monte-carlo';
}

export interface EquityResult {
  method: 'exact' | 'monte-carlo';
  /** Share of the pot each player wins on average (wins + split shares). */
  equity: number[];
  win: number[];
  tie: number[];
  /** Standard error of each equity (0 for exact). */
  stdError: number[];
  /** Exact: number of weighted (combo-assignment × board) outcomes enumerated. MC: trials. */
  outcomes: number;
  provenance: Provenance;
}

export const DEFAULT_MAX_EXACT = 6_000_000;
export const DEFAULT_SAMPLES = 100_000;

function validate(req: EquityRequest) {
  const { players, board = [], dead = [] } = req;
  if (players.length < 2) throw new Error('Need at least two players');
  if (board.length > 5) throw new Error('Board has at most 5 cards');
  const seen = new Set<Card>();
  const add = (c: Card) => {
    if (seen.has(c)) throw new Error('A card appears twice');
    seen.add(c);
  };
  board.forEach(add);
  dead.forEach(add);
  for (const p of players) {
    if (p.kind === 'hand') p.cards.forEach(add);
    else if (p.combos.length === 0) throw new Error('A range is empty');
  }
}

/** Estimated number of hand evaluations full enumeration would need. */
export function estimateExactWork(req: EquityRequest): number {
  const board = req.board ?? [];
  const known = board.length + (req.dead?.length ?? 0) + req.players.reduce((n, p) => n + (p.kind === 'hand' ? 2 : 0), 0);
  let assignments = 1;
  let rangePlayers = 0;
  for (const p of req.players) {
    if (p.kind === 'range') {
      assignments *= p.combos.length;
      rangePlayers++;
    }
  }
  const unseen = 52 - known - 2 * rangePlayers;
  return assignments * choose(unseen, 5 - board.length) * req.players.length;
}

export function computeEquity(req: EquityRequest): EquityResult {
  validate(req);
  const method = req.method ?? 'auto';
  const useExact =
    method === 'exact' || (method === 'auto' && estimateExactWork(req) <= (req.maxExactEvaluations ?? DEFAULT_MAX_EXACT));
  return useExact ? enumerateExact(req) : monteCarlo(req);
}

// ------------------------------------------------------------ shared scoring

/** Scores players for one complete board and adds results. Returns nothing; mutates accumulators. */
function scoreShowdown(
  holes: Card[][],
  board: Card[],
  hand7: Int32Array[],
  scores: Int32Array,
  weight: number,
  win: Float64Array,
  tie: Float64Array,
  share: Float64Array | null,
) {
  const n = holes.length;
  let best = -1;
  let nBest = 0;
  for (let i = 0; i < n; i++) {
    const h = hand7[i];
    h[0] = holes[i][0];
    h[1] = holes[i][1];
    for (let j = 0; j < board.length; j++) h[2 + j] = board[j];
    const s = evaluate(h, 2 + board.length);
    scores[i] = s;
    if (s > best) {
      best = s;
      nBest = 1;
    } else if (s === best) nBest++;
  }
  for (let i = 0; i < n; i++) {
    if (scores[i] !== best) {
      if (share) share[i] = 0;
      continue;
    }
    if (nBest === 1) win[i] += weight;
    else tie[i] += weight / nBest;
    if (share) share[i] = 1 / nBest;
  }
}

// ------------------------------------------------------------ exact

function enumerateExact(req: EquityRequest): EquityResult {
  const { players } = req;
  const board0 = req.board ?? [];
  const dead = req.dead ?? [];
  const n = players.length;
  const need = 5 - board0.length;
  const win = new Float64Array(n);
  const tie = new Float64Array(n);
  const hand7 = Array.from({ length: n }, () => new Int32Array(7));
  const scores = new Int32Array(n);
  const used = new Uint8Array(52);
  for (const c of board0) used[c] = 1;
  for (const c of dead) used[c] = 1;
  for (const p of players) if (p.kind === 'hand') { used[p.cards[0]] = 1; used[p.cards[1]] = 1; }

  const holes: Card[][] = players.map((p) => (p.kind === 'hand' ? p.cards : [0, 0]));
  const board = [...board0, 0, 0, 0, 0, 0].slice(0, 5);
  let totalWeight = 0;
  let outcomes = 0;

  const enumerateBoards = (weight: number) => {
    const deck: Card[] = [];
    for (let c = 0; c < 52; c++) if (!used[c]) deck.push(c);
    const L = deck.length;
    const b = board0.length;
    if (need === 0) {
      scoreShowdown(holes, board, hand7, scores, weight, win, tie, null);
      totalWeight += weight;
      outcomes++;
      return;
    }
    // Iterative k-combination enumeration over deck indices.
    const idx = Array.from({ length: need }, (_, i) => i);
    for (;;) {
      for (let i = 0; i < need; i++) board[b + i] = deck[idx[i]];
      scoreShowdown(holes, board, hand7, scores, weight, win, tie, null);
      totalWeight += weight;
      outcomes++;
      let k = need - 1;
      while (k >= 0 && idx[k] === L - need + k) k--;
      if (k < 0) break;
      idx[k]++;
      for (let j = k + 1; j < need; j++) idx[j] = idx[j - 1] + 1;
    }
  };

  const assign = (pi: number, weight: number) => {
    if (pi === n) {
      enumerateBoards(weight);
      return;
    }
    const p = players[pi];
    if (p.kind === 'hand') {
      assign(pi + 1, weight);
      return;
    }
    for (const combo of p.combos) {
      const [a, b] = combo.cards;
      if (used[a] || used[b] || combo.weight <= 0) continue;
      used[a] = used[b] = 1;
      holes[pi] = combo.cards;
      assign(pi + 1, weight * combo.weight);
      used[a] = used[b] = 0;
    }
  };
  assign(0, 1);

  if (totalWeight === 0) throw new Error('No valid combination of hands (all combos conflict)');
  const eq = Array.from({ length: n }, (_, i) => (win[i] + tie[i]) / totalWeight);
  return {
    method: 'exact',
    equity: eq,
    win: Array.from(win, (w) => w / totalWeight),
    tie: Array.from(tie, (t) => t / totalWeight),
    stdError: eq.map(() => 0),
    outcomes,
    provenance: { kind: 'exact', detail: `Enumerated all ${outcomes.toLocaleString('en-US')} outcomes.` },
  };
}

// ------------------------------------------------------------ Monte Carlo

/** Cumulative-weight sampler for a range. */
function makeSampler(combos: WeightedCombo[]) {
  const cum = new Float64Array(combos.length);
  let s = 0;
  combos.forEach((c, i) => {
    s += c.weight;
    cum[i] = s;
  });
  return (rng: Rng): WeightedCombo => {
    const x = rng.next() * s;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] > x) hi = mid;
      else lo = mid + 1;
    }
    return combos[lo];
  };
}

function monteCarlo(req: EquityRequest): EquityResult {
  const { players } = req;
  const samples = req.samples ?? DEFAULT_SAMPLES;
  const rng = createRng(req.seed ?? 12345);
  const board0 = req.board ?? [];
  const n = players.length;
  const need = 5 - board0.length;
  const baseUsed = new Uint8Array(52);
  for (const c of board0) baseUsed[c] = 1;
  for (const c of req.dead ?? []) baseUsed[c] = 1;
  for (const p of players) if (p.kind === 'hand') { baseUsed[p.cards[0]] = 1; baseUsed[p.cards[1]] = 1; }

  const samplers = players.map((p) => (p.kind === 'range' ? makeSampler(p.combos.filter((c) => c.weight > 0)) : null));
  const holes: Card[][] = players.map((p) => (p.kind === 'hand' ? p.cards : [0, 0]));
  const used = new Uint8Array(52);
  const board = [...board0, 0, 0, 0, 0, 0].slice(0, 5);
  const win = new Float64Array(n);
  const tie = new Float64Array(n);
  const share = new Float64Array(n);
  const sumSq = new Float64Array(n);
  const hand7 = Array.from({ length: n }, () => new Int32Array(7));
  const scores = new Int32Array(n);
  let rejections = 0;

  for (let t = 0; t < samples; t++) {
    // Rejection sampling: draw every range independently, reject the whole draw on any card conflict.
    // This samples exactly from the joint distribution ∝ Π weights over non-conflicting assignments.
    for (;;) {
      used.set(baseUsed);
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const sampler = samplers[i];
        if (!sampler) continue;
        const c = sampler(rng).cards;
        if (used[c[0]] || used[c[1]]) ok = false;
        else {
          used[c[0]] = used[c[1]] = 1;
          holes[i] = c;
        }
      }
      if (ok) break;
      if (++rejections > samples * 50 + 10_000) throw new Error('Ranges conflict too often to sample');
    }
    for (let k = 0; k < need; k++) {
      let c: number;
      do c = rng.int(52);
      while (used[c]);
      used[c] = 1;
      board[board0.length + k] = c;
    }
    scoreShowdown(holes, board, hand7, scores, 1, win, tie, share);
    for (let i = 0; i < n; i++) sumSq[i] += share[i] * share[i];
  }

  const eq = Array.from({ length: n }, (_, i) => (win[i] + tie[i]) / samples);
  const se = eq.map((m, i) => Math.sqrt(Math.max(0, sumSq[i] / samples - m * m) / samples));
  return {
    method: 'monte-carlo',
    equity: eq,
    win: Array.from(win, (w) => w / samples),
    tie: Array.from(tie, (x) => x / samples),
    stdError: se,
    outcomes: samples,
    provenance: { kind: 'monte-carlo', samples, stdError: Math.max(...se) },
  };
}
