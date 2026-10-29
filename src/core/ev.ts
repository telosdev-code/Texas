/**
 * Expected-value and pot-odds formulas. All amounts are in chips.
 *
 * Conventions: `pot` is the pot *before* the decision and already includes any bet you are facing.
 * EVs are measured relative to folding (folding = 0), counting only chips won or lost from now on.
 * These are exact formulas; their real-world accuracy depends on the stated assumptions
 * (e.g. "no further betting" when equity is realised at showdown).
 */

/** Equity needed to break even on a call: call / (pot + call). */
export function requiredEquity(pot: number, toCall: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}

/** Pot odds expressed as "X : 1" (pot : call). */
export function potOddsRatio(pot: number, toCall: number): number {
  return toCall <= 0 ? Infinity : pot / toCall;
}

/** EV of calling with `equity`, assuming the hand is checked down (no further betting): eq·pot − (1−eq)·call. */
export function evCall(equity: number, pot: number, toCall: number): number {
  return equity * pot - (1 - equity) * toCall;
}

/**
 * EV of betting `bet` into `pot` when villain folds `foldFreq` of the time,
 * and we have `equityWhenCalled` against villain's calling range (no further betting).
 */
export function evBet(pot: number, bet: number, foldFreq: number, equityWhenCalled: number): number {
  const calledEv = equityWhenCalled * (pot + bet) - (1 - equityWhenCalled) * bet;
  return foldFreq * pot + (1 - foldFreq) * calledEv;
}

/** Fold frequency at which a pure bluff (0% equity) breaks even: bet / (pot + bet). */
export function breakevenFoldFrequency(pot: number, bet: number): number {
  return bet / (pot + bet);
}

/** Minimum defense frequency: pot / (pot + bet). Defending less lets any two cards bluff profitably. */
export function minimumDefenseFrequency(pot: number, bet: number): number {
  return pot / (pot + bet);
}

/**
 * In the classic polarized river toy game (bettor has nuts or air, caller has a bluff-catcher),
 * the bettor makes the caller indifferent by bluffing this fraction of their betting range:
 * bet / (pot + 2·bet). Exact *within that model*.
 */
export function optimalBluffFraction(pot: number, bet: number): number {
  return bet / (pot + 2 * bet);
}

/** Bluffs per value bet implied by optimalBluffFraction: bet / (pot + bet). */
export function bluffToValueRatio(pot: number, bet: number): number {
  return bet / (pot + bet);
}

/**
 * Implied odds: extra chips you must win on later streets, when you hit, to make a call break even.
 * Solves eq·(pot + X) − (1−eq)·call = 0 for X.
 */
export function impliedOddsNeeded(equity: number, pot: number, toCall: number): number {
  if (equity <= 0) return Infinity;
  return Math.max(0, ((1 - equity) * toCall) / equity - pot);
}

/** Convert a probability to "X to 1 against" odds. */
export function oddsAgainst(p: number): number {
  return p <= 0 ? Infinity : (1 - p) / p;
}

/**
 * The pot a call can actually win, excluding the caller's own call. When the caller is all-in for
 * less than the bet, every opponent's contribution is capped at the caller's final total (the
 * excess forms a side pot the caller is not eligible for).
 * `contributions` = chips each player has put in this hand so far (caller included).
 */
export function winnablePot(contributions: readonly number[], caller: number, callAmount: number): number {
  const callerTotal = contributions[caller] + callAmount;
  return contributions.reduce((sum, c, i) => sum + (i === caller ? c : Math.min(c, callerTotal)), 0);
}
