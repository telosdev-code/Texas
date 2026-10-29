import type { Provenance } from '../core/provenance';
import type { ExtensiveGame, StrategyProfile } from './game';

interface Node {
  actions: string[];
  regret: Float64Array;
  strategySum: Float64Array;
}

export interface CfrOptions {
  iterations: number;
  /** CFR+ (regret flooring + linear averaging) converges much faster than vanilla CFR. */
  variant?: 'CFR' | 'CFR+';
  /** Called every `reportEvery` iterations (e.g. for a convergence chart). */
  onProgress?: (iteration: number, exploitability: number) => void;
  reportEvery?: number;
}

export interface CfrResult {
  average: StrategyProfile;
  /** Expected value for player 0 when both play the average strategy. */
  gameValue: number;
  exploitability: number;
  iterations: number;
  provenance: Provenance;
}

function regretMatch(node: Node, out: Float64Array) {
  let sum = 0;
  for (let a = 0; a < out.length; a++) sum += Math.max(0, node.regret[a]);
  for (let a = 0; a < out.length; a++) out[a] = sum > 0 ? Math.max(0, node.regret[a]) / sum : 1 / out.length;
}

/** Counterfactual Regret Minimization over the full game tree (chance enumerated exactly). */
export function solveCfr<S>(game: ExtensiveGame<S>, opts: CfrOptions): CfrResult {
  const nodes = new Map<string, Node>();
  const variant = opts.variant ?? 'CFR+';
  const getNode = (key: string, actions: string[]) => {
    let n = nodes.get(key);
    if (!n) {
      n = { actions, regret: new Float64Array(actions.length), strategySum: new Float64Array(actions.length) };
      nodes.set(key, n);
    }
    return n;
  };

  // Returns utility for `traverser` given reach probabilities.
  const cfr = (s: S, traverser: 0 | 1, reach0: number, reach1: number, reachC: number, weight: number): number => {
    if (game.isTerminal(s)) {
      const u = game.utility(s);
      return traverser === 0 ? u : -u;
    }
    if (game.isChance(s)) {
      let v = 0;
      for (const o of game.chanceOutcomes(s)) v += o.prob * cfr(o.state, traverser, reach0, reach1, reachC * o.prob, weight);
      return v;
    }
    const player = game.currentPlayer(s);
    const actions = game.actions(s);
    const node = getNode(game.infoSetKey(s), actions);
    const strat = new Float64Array(actions.length);
    regretMatch(node, strat);
    const util = new Float64Array(actions.length);
    let nodeUtil = 0;
    for (let a = 0; a < actions.length; a++) {
      const ns = game.next(s, actions[a]);
      util[a] =
        player === 0
          ? cfr(ns, traverser, reach0 * strat[a], reach1, reachC, weight)
          : cfr(ns, traverser, reach0, reach1 * strat[a], reachC, weight);
      nodeUtil += strat[a] * util[a];
    }
    if (player === traverser) {
      const myReach = player === 0 ? reach0 : reach1;
      const oppReach = (player === 0 ? reach1 : reach0) * reachC;
      for (let a = 0; a < actions.length; a++) {
        node.regret[a] += oppReach * (util[a] - nodeUtil);
        if (variant === 'CFR+') node.regret[a] = Math.max(0, node.regret[a]);
        node.strategySum[a] += weight * myReach * strat[a];
      }
    }
    return nodeUtil;
  };

  const average = (): StrategyProfile => {
    const out: StrategyProfile = {};
    for (const [key, n] of nodes) {
      const sum = n.strategySum.reduce((a, b) => a + b, 0);
      out[key] = Object.fromEntries(n.actions.map((a, i) => [a, sum > 0 ? n.strategySum[i] / sum : 1 / n.actions.length]));
    }
    return out;
  };

  const every = opts.reportEvery ?? 0;
  for (let t = 1; t <= opts.iterations; t++) {
    const w = variant === 'CFR+' ? t : 1;
    // Alternating updates.
    cfr(game.root(), 0, 1, 1, 1, w);
    cfr(game.root(), 1, 1, 1, 1, w);
    if (every && opts.onProgress && t % every === 0) opts.onProgress(t, exploitability(game, average()));
  }
  const avg = average();
  const expl = exploitability(game, avg);
  return {
    average: avg,
    gameValue: expectedValue(game, avg),
    exploitability: expl,
    iterations: opts.iterations,
    provenance: { kind: 'solver', algorithm: variant, game: game.name, iterations: opts.iterations, exploitability: expl },
  };
}

/** Expected value for player 0 when both players follow `profile`. Exact (full tree walk). */
export function expectedValue<S>(game: ExtensiveGame<S>, profile: StrategyProfile): number {
  const walk = (s: S): number => {
    if (game.isTerminal(s)) return game.utility(s);
    if (game.isChance(s)) return game.chanceOutcomes(s).reduce((v, o) => v + o.prob * walk(o.state), 0);
    const strat = profile[game.infoSetKey(s)];
    return game.actions(s).reduce((v, a) => v + (strat?.[a] ?? 0) * walk(game.next(s, a)), 0);
  };
  return walk(game.root());
}

/** Value player `p` gets by best-responding to the opponent's fixed strategy in `profile`. */
export function bestResponseValue<S>(game: ExtensiveGame<S>, profile: StrategyProfile, p: 0 | 1): number {
  // Collect, for each of p's info sets, the histories in it with the opponent·chance reach probability.
  const infoSets = new Map<string, { s: S; reach: number }[]>();
  const collect = (s: S, reach: number) => {
    if (game.isTerminal(s) || reach === 0) return;
    if (game.isChance(s)) {
      for (const o of game.chanceOutcomes(s)) collect(o.state, reach * o.prob);
      return;
    }
    const player = game.currentPlayer(s);
    const actions = game.actions(s);
    if (player === p) {
      const key = game.infoSetKey(s);
      if (!infoSets.has(key)) infoSets.set(key, []);
      infoSets.get(key)!.push({ s, reach });
      for (const a of actions) collect(game.next(s, a), reach);
    } else {
      const strat = profile[game.infoSetKey(s)];
      for (const a of actions) collect(game.next(s, a), reach * (strat?.[a] ?? 0));
    }
  };
  collect(game.root(), 1);

  const bestAction = new Map<string, string>();
  const sign = p === 0 ? 1 : -1;
  // Value for p of state s, where p plays the best response and the opponent plays `profile`.
  const value = (s: S): number => {
    if (game.isTerminal(s)) return sign * game.utility(s);
    if (game.isChance(s)) return game.chanceOutcomes(s).reduce((v, o) => v + o.prob * value(o.state), 0);
    const actions = game.actions(s);
    if (game.currentPlayer(s) === p) return value(game.next(s, chooseAction(game.infoSetKey(s), actions)));
    const strat = profile[game.infoSetKey(s)];
    return actions.reduce((v, a) => v + (strat?.[a] ?? 0) * value(game.next(s, a)), 0);
  };
  const chooseAction = (key: string, actions: string[]): string => {
    const known = bestAction.get(key);
    if (known) return known;
    const hist = infoSets.get(key) ?? [];
    let best = actions[0];
    let bestV = -Infinity;
    for (const a of actions) {
      const v = hist.reduce((acc, h) => acc + h.reach * value(game.next(h.s, a)), 0);
      if (v > bestV) {
        bestV = v;
        best = a;
      }
    }
    bestAction.set(key, best);
    return best;
  };
  return value(game.root());
}

/** Average gain available to a best-responding opponent: 0 exactly at a Nash equilibrium. */
export function exploitability<S>(game: ExtensiveGame<S>, profile: StrategyProfile): number {
  return (bestResponseValue(game, profile, 0) + bestResponseValue(game, profile, 1)) / 2;
}
