import { computeEquity, type EquityPlayer } from '../core/equity';
import { PREFLOP_EQUITY_VS_RANDOM } from '../core/data/preflopEquity';
import { CLASSES_BY_EQUITY } from '../core/presets';
import { classOfCards, fullRange, rangeToCombos } from '../core/ranges';
import type { Rng } from '../core/rng';
import type { Action } from '../engine/types';
import type { PlayerView, Strategy } from './types';

/** Tunable personality parameters, each in [0, 1]. */
export interface BotParams {
  /** Fraction of starting hands played when first to enter the pot. */
  looseness: number;
  /** Probability of betting/raising instead of checking/calling with a hand worth playing. */
  aggression: number;
  /** Probability of betting with weak hands when checked to. */
  bluffFrequency: number;
  /** How much the bot ignores pot odds and calls anyway. */
  stickiness: number;
  /** Bet size as a fraction of the pot. */
  betSize: number;
}

export interface BotProfile {
  id: string;
  name: string;
  short: string;
  description: string;
  params: BotParams;
}

export const BOT_PROFILES: BotProfile[] = [
  {
    id: 'rock',
    name: 'Rock',
    short: 'Tight-passive',
    description: 'Plays very few hands and rarely bluffs. When a Rock bets big, believe them.',
    params: { looseness: 0.12, aggression: 0.3, bluffFrequency: 0.03, stickiness: 0.05, betSize: 0.5 },
  },
  {
    id: 'tag',
    name: 'TAG',
    short: 'Tight-aggressive',
    description: 'Selective preflop, bets and raises with strong hands and some well-chosen bluffs.',
    params: { looseness: 0.2, aggression: 0.75, bluffFrequency: 0.2, stickiness: 0.1, betSize: 0.66 },
  },
  {
    id: 'lag',
    name: 'LAG',
    short: 'Loose-aggressive',
    description: 'Plays many hands and applies constant pressure. Defend wider against them.',
    params: { looseness: 0.38, aggression: 0.8, bluffFrequency: 0.35, stickiness: 0.15, betSize: 0.75 },
  },
  {
    id: 'station',
    name: 'Calling Station',
    short: 'Loose-passive',
    description: 'Calls far too often and rarely raises. Value bet relentlessly; never bluff them.',
    params: { looseness: 0.6, aggression: 0.15, bluffFrequency: 0.03, stickiness: 0.6, betSize: 0.5 },
  },
  {
    id: 'maniac',
    name: 'Maniac',
    short: 'Hyper-aggressive',
    description: 'Bets and raises almost everything. Call down lighter and let them bluff.',
    params: { looseness: 0.7, aggression: 0.95, bluffFrequency: 0.6, stickiness: 0.3, betSize: 1.0 },
  },
  {
    id: 'pot-odds',
    name: 'Pot-Odds Purist',
    short: 'Math-only',
    description:
      'Calls exactly when its equity vs. random hands beats the pot odds. Shows why equity vs. random hands is a poor range assumption.',
    params: { looseness: 0.3, aggression: 0.5, bluffFrequency: 0.1, stickiness: 0, betSize: 0.66 },
  },
];

export const profileById = (id: string | undefined) => BOT_PROFILES.find((p) => p.id === id) ?? BOT_PROFILES[1];

/** Preflop percentile: fraction of all combos that are stronger (0 = AA … ~1 = 32o). */
const PERCENTILE = (() => {
  const pct = new Float64Array(169);
  let cum = 0;
  for (const h of CLASSES_BY_EQUITY) {
    pct[h.index] = cum / 1326;
    cum += h.combos;
  }
  return pct;
})();

export function preflopPercentile(c1: number, c2: number): number {
  return PERCENTILE[classOfCards(c1, c2).index];
}
export const preflopEquityVsRandom = (c1: number, c2: number) => PREFLOP_EQUITY_VS_RANDOM[classOfCards(c1, c2).index];

let randomCombosCache: ReturnType<typeof rangeToCombos> | null = null;

/** Quick Monte Carlo equity vs. `opponents` uniformly random hands. Heuristic input only. */
export function quickEquity(hole: number[], board: number[], opponents: number, samples: number, seed: number): number {
  randomCombosCache ??= rangeToCombos(fullRange());
  const players: EquityPlayer[] = [{ kind: 'hand', cards: [hole[0], hole[1]] }];
  for (let k = 0; k < Math.max(1, opponents); k++) players.push({ kind: 'range', combos: randomCombosCache });
  return computeEquity({ players, board, method: 'monte-carlo', samples, seed }).equity[0];
}

function sizeBet(v: PlayerView, frac: number): number {
  const { legal } = v;
  const target = v.currentBet + Math.max(v.bigBlind, Math.round(frac * (v.pot + v.toCall)));
  return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, target));
}

export function createHeuristicBot(profile: BotProfile): Strategy {
  const P = profile.params;
  return {
    id: profile.id,
    name: profile.name,
    provenance: { kind: 'heuristic', detail: `${profile.name} — hand-written rule-based strategy, not GTO.` },
    decide(v: PlayerView, rng: Rng): Action {
      const { legal } = v;
      const aggressive = (amount: number): Action =>
        legal.canBet ? { type: 'bet', amount } : { type: 'raise', amount };
      const canAgg = legal.canBet || legal.canRaise;
      const passive = (): Action => (legal.canCheck ? { type: 'check' } : { type: 'fold' });

      if (v.street === 'preflop') {
        const pct = preflopPercentile(v.hole[0], v.hole[1]);
        const raises = v.raisesThisStreet - 1; // raises beyond the big blind
        const threshold = P.looseness * Math.pow(0.4, raises) * (raises > 0 ? 1 + P.stickiness : 1);
        if (pct <= threshold * 0.35 && canAgg && rng.next() < 0.5 + P.aggression / 2) {
          return aggressive(sizeBet(v, raises === 0 ? 0.75 + P.betSize * 0.5 : 1.0));
        }
        if (pct <= threshold) {
          if (raises === 0 && canAgg && rng.next() < P.aggression) return aggressive(sizeBet(v, 0.75 + P.betSize * 0.5));
          return legal.canCheck ? { type: 'check' } : { type: 'call' };
        }
        // Occasional light 3-bet bluff for aggressive profiles.
        if (raises === 1 && canAgg && pct < 0.6 && rng.next() < P.bluffFrequency * 0.15) return aggressive(sizeBet(v, 1.0));
        return passive();
      }

      const eq = quickEquity(v.hole, v.board, v.opponentsInHand, 300, (rng.next() * 2 ** 31) | 0);
      const required = v.toCall > 0 ? v.toCall / (v.pot + v.toCall) : 0;
      const strong = eq >= 0.55 + 0.1 * (v.opponentsInHand - 1) * 0.5;
      const monster = eq >= 0.8;

      if (v.toCall === 0) {
        if (canAgg && (strong && rng.next() < P.aggression)) return aggressive(sizeBet(v, P.betSize));
        // Continuation bets and bluffs.
        const cbet = v.wasLastAggressor ? P.aggression * 0.5 : 0;
        if (canAgg && rng.next() < P.bluffFrequency + cbet * (1 - P.bluffFrequency)) return aggressive(sizeBet(v, P.betSize * 0.8));
        return { type: 'check' };
      }

      if (monster && canAgg && rng.next() < P.aggression) return aggressive(sizeBet(v, P.betSize + 0.25));
      if (eq + P.stickiness * 0.2 >= required) {
        if (strong && canAgg && rng.next() < P.aggression * 0.35) return aggressive(sizeBet(v, P.betSize + 0.25));
        return { type: 'call' };
      }
      if (canAgg && rng.next() < P.bluffFrequency * 0.1) return aggressive(sizeBet(v, P.betSize + 0.5));
      return { type: 'fold' };
    },
  };
}
