import { PREFLOP_EQUITY_SAMPLES, PREFLOP_EQUITY_VS_RANDOM } from './data/preflopEquity.ts';
import type { Provenance } from './provenance.ts';
import { emptyRange, HAND_CLASSES, parseRange, type Range } from './ranges.ts';

/** Hand classes sorted strongest-first by Monte Carlo equity vs. one random hand. */
export const CLASSES_BY_EQUITY = [...HAND_CLASSES].sort(
  (a, b) => PREFLOP_EQUITY_VS_RANDOM[b.index] - PREFLOP_EQUITY_VS_RANDOM[a.index],
);

export const PREFLOP_RANKING_PROVENANCE: Provenance = {
  kind: 'monte-carlo',
  samples: PREFLOP_EQUITY_SAMPLES,
  stdError: 0.0021,
  detail: 'Ordering by equity vs. one random hand. Not a solver ranking: hand values differ multiway and by position.',
};

/** The strongest `fraction` of all 1326 combos, ordered by equity vs. a random hand. */
export function topPercentRange(fraction: number): Range {
  const r = emptyRange();
  let combos = 0;
  const target = fraction * 1326;
  for (const h of CLASSES_BY_EQUITY) {
    if (combos >= target - 1e-9) break;
    r[h.index] = 1;
    combos += h.combos;
  }
  return r;
}

export interface RangePreset {
  id: string;
  name: string;
  text: string;
  description: string;
  provenance: Provenance;
}

const H = (detail: string): Provenance => ({ kind: 'heuristic', detail });

/**
 * Example ranges for study. These are hand-written heuristics in the spirit of common
 * 100bb six-max advice — NOT solver output.
 */
export const RANGE_PRESETS: RangePreset[] = [
  {
    id: 'utg-open',
    name: 'Early position open (~15%)',
    text: '66+, A9s+, A5s-A4s, KTs+, QTs+, JTs, T9s, AJo+, KQo',
    description: 'A tight first-in raising range from early position.',
    provenance: H('Hand-written example range, not solver output.'),
  },
  {
    id: 'co-open',
    name: 'Cutoff open (~26%)',
    text: '33+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, ATo+, KTo+, QTo+, JTo',
    description: 'Wider because fewer players remain to act behind.',
    provenance: H('Hand-written example range, not solver output.'),
  },
  {
    id: 'btn-open',
    name: 'Button open (~42%)',
    text: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o',
    description: 'Position lets you play many more hands profitably.',
    provenance: H('Hand-written example range, not solver output.'),
  },
  {
    id: '3bet-value',
    name: '3-bet for value',
    text: 'QQ+, AKs, AKo',
    description: 'The strongest hands that prefer a bigger pot.',
    provenance: H('Hand-written example range, not solver output.'),
  },
  {
    id: 'calling-station',
    name: 'Loose calling range (~60%)',
    text: '22+, A2+, K2s+, K5o+, Q2s+, Q8o+, J4s+, J8o+, T6s+, T8o+, 96s+, 98o, 85s+, 75s+, 64s+, 54s',
    description: 'What a recreational "calling station" might see a flop with.',
    provenance: H('Illustrative opponent model, not solver output.'),
  },
];

export function presetRange(id: string): Range {
  const p = RANGE_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return parseRange(p.text);
}
