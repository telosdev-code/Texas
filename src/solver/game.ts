/**
 * Generic two-player zero-sum extensive-form game interface.
 *
 * Any game expressed this way can be solved by `solveCfr`. Kuhn poker is the reference
 * implementation today; future Hold'em subgames (e.g. a river spot with discretized bet sizes)
 * implement the same interface.
 */
export interface ExtensiveGame<S> {
  name: string;
  root(): S;
  isTerminal(s: S): boolean;
  /** Payoff to player 0 at a terminal state (player 1 receives the negative). */
  utility(s: S): number;
  isChance(s: S): boolean;
  chanceOutcomes(s: S): { state: S; prob: number }[];
  currentPlayer(s: S): 0 | 1;
  /** Identifies everything the acting player knows. Must satisfy perfect recall. */
  infoSetKey(s: S): string;
  actions(s: S): string[];
  next(s: S, action: string): S;
}

/** Strategy profile: info set key → action → probability. */
export type StrategyProfile = Record<string, Record<string, number>>;
