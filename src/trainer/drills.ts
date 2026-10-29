import { type Card, cardToString } from '../core/cards';
import { choose, probHitAtLeastOne, ruleOf2And4 } from '../core/combinatorics';
import { computeEquity } from '../core/equity';
import { evaluate } from '../core/evaluator';
import {
  breakevenFoldFrequency, evCall, minimumDefenseFrequency, optimalBluffFraction, potOddsRatio, requiredEquity,
} from '../core/ev';
import { RANGE_PRESETS, topPercentRange } from '../core/presets';
import type { Provenance } from '../core/provenance';
import { countCombos, formatRange, parseRange, rangeToCombos, type Range } from '../core/ranges';
import { createRng, type Rng, shuffle } from '../core/rng';

export type DrillKind = 'call-fold' | 'equity-estimate' | 'outs' | 'combos' | 'bluff-math';

export const DRILL_INFO: Record<DrillKind, { title: string; blurb: string }> = {
  'call-fold': { title: 'Call or fold?', blurb: 'Facing a bet against a stated range. Graded by exact expected value.' },
  'equity-estimate': { title: 'Estimate equity', blurb: 'Guess your winning chances, then see the exact answer.' },
  outs: { title: 'Count the outs', blurb: 'One card to come: how many cards win the hand for you?' },
  combos: { title: 'Count combinations', blurb: 'How many combos of a range remain once you account for card removal?' },
  'bluff-math': { title: 'Bluffing math', blurb: 'Break-even fold frequency, minimum defense, and balanced bluffing ratios.' },
};

export interface Step {
  label: string;
  value: string;
  formula?: string;
}

/** A question in a drill. All data needed to render it and grade it is precomputed. */
export interface Drill {
  id: string;
  kind: DrillKind;
  prompt: string;
  hero?: Card[];
  villain?: Card[];
  board?: Card[];
  villainRangeText?: string;
  villainRangeName?: string;
  pot?: number;
  bet?: number;
  /** For multiple-choice drills. */
  choices?: string[];
  /** Kind-specific answer key. */
  answer: number;
  /** Extra numbers for explanations. */
  data: Record<string, number>;
  provenance: Provenance;
  assumptions: string[];
}

export interface Grade {
  correct: boolean;
  /** 0..1 */
  score: number;
  /** EV lost by the user's choice, in chips (call-fold only). */
  evLoss?: number;
  headline: string;
  steps: Step[];
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const chips = (x: number) => `${Math.round(x * 10) / 10}`;
const cs = (c: Card[]) => c.map(cardToString).join(' ');

function deal(rng: Rng, n: number, exclude: Card[] = []): Card[] {
  const deck = shuffle(Array.from({ length: 52 }, (_, i) => i).filter((c) => !exclude.includes(c)), rng);
  return deck.slice(0, n);
}

const VILLAIN_RANGES: { name: string; text: string }[] = [
  { name: 'Tight value range', text: formatRange(topPercentRange(0.08)) },
  { name: 'Solid range (top 20%)', text: formatRange(topPercentRange(0.2)) },
  { name: 'Wide range (top 40%)', text: formatRange(topPercentRange(0.4)) },
  { name: 'Loose recreational range (~60%)', text: RANGE_PRESETS.find((p) => p.id === 'calling-station')!.text },
];

const BET_FRACTIONS = [0.33, 0.5, 0.66, 0.75, 1, 1.5];

// ---------------------------------------------------------------------- generators

export function generateDrill(kind: DrillKind, seed: number): Drill {
  const rng = createRng(seed);
  const id = `${kind}-${seed}`;
  switch (kind) {
    case 'call-fold':
      return callFold(rng, id);
    case 'equity-estimate':
      return equityEstimate(rng, id);
    case 'outs':
      return outsDrill(rng, id);
    case 'combos':
      return combosDrill(rng, id);
    case 'bluff-math':
      return bluffMath(rng, id);
  }
}

function callFold(rng: Rng, id: string): Drill {
  // Try a few random spots and keep the closest decision (most instructive).
  let best: Drill | null = null;
  let bestGap = Infinity;
  for (let attempt = 0; attempt < 4; attempt++) {
    const boardLen = [3, 4, 5][rng.int(3)];
    const cards = deal(rng, 2 + boardLen);
    const hero = cards.slice(0, 2);
    const board = cards.slice(2);
    const vr = VILLAIN_RANGES[rng.int(VILLAIN_RANGES.length)];
    const range: Range = parseRange(vr.text);
    const combos = rangeToCombos(range, [...hero, ...board]);
    if (combos.length === 0) continue;
    const potBefore = 20 * (2 + rng.int(14));
    const bet = Math.max(5, Math.round((potBefore * BET_FRACTIONS[rng.int(BET_FRACTIONS.length)]) / 5) * 5);
    const pot = potBefore + bet;
    const eq = computeEquity({ players: [{ kind: 'hand', cards: [hero[0], hero[1]] }, { kind: 'range', combos }], board });
    const req = requiredEquity(pot, bet);
    const gap = Math.abs(eq.equity[0] - req);
    if (gap < bestGap) {
      bestGap = gap;
      const street = boardLen === 3 ? 'flop' : boardLen === 4 ? 'turn' : 'river';
      best = {
        id,
        kind: 'call-fold',
        prompt: `On the ${street}, villain bets ${bet} into a pot of ${potBefore}. Call or fold?`,
        hero,
        board,
        villainRangeName: vr.name,
        villainRangeText: vr.text,
        pot,
        bet,
        answer: evCall(eq.equity[0], pot, bet) > 0 ? 1 : 0,
        data: {
          equity: eq.equity[0],
          win: eq.win[0],
          tie: eq.tie[0],
          required: req,
          evCall: evCall(eq.equity[0], pot, bet),
          combos: combos.length,
          boardLen,
          outcomes: eq.outcomes,
        },
        provenance: eq.provenance,
        assumptions: [
          `Villain's betting range is exactly: ${vr.name}.`,
          boardLen < 5
            ? 'No further betting after your call (you realise your full equity). Real hands have later streets, so treat this as an approximation.'
            : 'This is the river: calling ends the betting, so the EV is exact given the range.',
        ],
      };
    }
    if (gap < 0.1) break;
  }
  return best ?? callFold(createRng(rng.int(1e9)), id);
}

function equityEstimate(rng: Rng, id: string): Drill {
  const boardLen = [0, 3, 3, 4][rng.int(4)];
  const cards = deal(rng, 4 + boardLen);
  const hero = cards.slice(0, 2);
  const villain = cards.slice(2, 4);
  const board = cards.slice(4);
  const eq = computeEquity({
    players: [{ kind: 'hand', cards: [hero[0], hero[1]] }, { kind: 'hand', cards: [villain[0], villain[1]] }],
    board,
  });
  return {
    id,
    kind: 'equity-estimate',
    prompt: board.length ? 'Both hands are face up. What is your equity?' : 'All-in preflop, hands face up. What is your equity?',
    hero,
    villain,
    board,
    answer: eq.equity[0],
    data: { win: eq.win[0], tie: eq.tie[0], outcomes: eq.outcomes },
    provenance: eq.provenance,
    assumptions: ['Equity = probability of winning plus half the probability of a two-way split.'],
  };
}

function outsDrill(rng: Rng, id: string): Drill {
  for (let attempt = 0; attempt < 200; attempt++) {
    const cards = deal(rng, 8);
    const hero = cards.slice(0, 2);
    const villain = cards.slice(2, 4);
    const board = cards.slice(4);
    const h = evaluate([...hero, ...board]);
    const v = evaluate([...villain, ...board]);
    if (h >= v) continue; // hero must be behind on the turn
    let outs = 0;
    let ties = 0;
    const used = [...hero, ...villain, ...board];
    for (let c = 0; c < 52; c++) {
      if (used.includes(c)) continue;
      const hh = evaluate([...hero, ...board, c]);
      const vv = evaluate([...villain, ...board, c]);
      if (hh > vv) outs++;
      else if (hh === vv) ties++;
    }
    if (outs < 2 || outs > 20) continue;
    return {
      id,
      kind: 'outs',
      prompt: 'Turn, both hands face up and you are behind. How many river cards win the hand for you outright?',
      hero,
      villain,
      board,
      answer: outs,
      data: { outs, ties, unseen: 44 },
      provenance: { kind: 'exact', detail: 'Every one of the 44 possible river cards was checked.' },
      assumptions: ['"Outs" here are cards that make you win outright (splits are counted separately).'],
    };
  }
  return outsDrill(createRng(rng.int(1e9)), id);
}

const COMBO_RANGES = ['AA, KK, AK', 'QQ+, AK', 'JJ+, AQs+, AKo', 'TT+, AJs+, KQs', '99+, AQ+', 'AA, KK, QQ, AK, AQs'];

function combosDrill(rng: Rng, id: string): Drill {
  const text = COMBO_RANGES[rng.int(COMBO_RANGES.length)];
  const range = parseRange(text);
  // Board with at least one card that blocks the range most of the time.
  const board = deal(rng, 3);
  const hero = rng.next() < 0.5 ? deal(rng, 2, board) : [];
  const dead = [...board, ...hero];
  const remaining = countCombos(range, dead);
  const full = countCombos(range);
  return {
    id,
    kind: 'combos',
    prompt: `Villain's range is ${text}. Given the cards you can see, how many combinations remain?`,
    hero,
    board,
    villainRangeText: text,
    answer: remaining,
    data: { full, remaining },
    provenance: { kind: 'exact', detail: 'Counted by listing every combination and removing those that use a visible card.' },
    assumptions: ['Pairs have 6 combos, suited hands 4, offsuit hands 12, before removal.'],
  };
}

function bluffMath(rng: Rng, id: string): Drill {
  const pot = 20 * (3 + rng.int(10));
  const frac = [0.33, 0.5, 0.75, 1, 1.5, 2][rng.int(6)];
  const bet = Math.round((pot * frac) / 5) * 5;
  const q = rng.int(3);
  const value = q === 0 ? breakevenFoldFrequency(pot, bet) : q === 1 ? minimumDefenseFrequency(pot, bet) : optimalBluffFraction(pot, bet);
  const prompt =
    q === 0
      ? `You bluff ${bet} into a pot of ${pot} with a hand that never wins at showdown. How often must villain fold for the bluff to break even?`
      : q === 1
        ? `Villain bets ${bet} into a pot of ${pot}. What minimum fraction of your range must continue so that villain's bluffs are not automatically profitable?`
        : `River, polarized toy game: you bet ${bet} into ${pot} with either the nuts or air. What fraction of your betting range should be bluffs to make a bluff-catcher indifferent?`;
  const wrong = new Set<number>();
  const candidates = [
    bet / pot, pot / (pot + 2 * bet), bet / (pot + bet), pot / (pot + bet), bet / (pot + 2 * bet), (pot + bet) / (pot + 2 * bet), 0.5,
  ];
  for (const c of candidates) if (Math.abs(c - value) > 0.02 && c < 1 && c > 0) wrong.add(Math.round(c * 1000) / 1000);
  const options = shuffle([value, ...shuffle([...wrong], rng).slice(0, 3)], rng);
  return {
    id,
    kind: 'bluff-math',
    prompt,
    pot,
    bet,
    choices: options.map((o) => pct(o)),
    answer: options.indexOf(value),
    data: { question: q, value, pot, bet },
    provenance:
      q === 2
        ? { kind: 'exact', detail: 'Closed-form result of the polarized river toy game (an exact solution of a simplified model, not of full Hold\'em).' }
        : { kind: 'exact', detail: 'Closed-form break-even formula.' },
    assumptions:
      q === 2
        ? ['Model: bettor has only nuts or pure bluffs; caller has only bluff-catchers; one bet size; no raising.']
        : ['Only the chips in the pot and the bet matter (no later streets).'],
  };
}

// ---------------------------------------------------------------------- grading

/**
 * Grade a user's answer.
 * call-fold: answer 1 = call, 0 = fold. equity-estimate: fraction 0..1. outs/combos: integer. bluff-math: choice index.
 */
export function gradeDrill(d: Drill, userAnswer: number): Grade {
  switch (d.kind) {
    case 'call-fold': {
      const { equity, required, evCall: ev, win, tie, combos, boardLen } = d.data;
      const pot = d.pot!;
      const bet = d.bet!;
      const userEv = userAnswer === 1 ? ev : 0;
      const bestEv = Math.max(ev, 0);
      const evLoss = bestEv - userEv;
      const correct = evLoss <= 1e-9;
      return {
        correct,
        score: correct ? 1 : 0,
        evLoss,
        headline: `${ev > 0 ? 'Call' : 'Fold'} is better by ${chips(Math.abs(ev))} chips.`,
        steps: [
          { label: 'Pot if you call', value: `${pot} in the pot, ${bet} to call`, formula: 'pot already includes villain\'s bet' },
          { label: 'Pot odds', value: `${potOddsRatio(pot, bet).toFixed(2)} : 1` },
          { label: 'Required equity', value: pct(required), formula: `call / (pot + call) = ${bet} / (${pot} + ${bet})` },
          {
            label: 'Your equity vs. range',
            value: `${pct(equity)} (win ${pct(win)}, split ${pct(tie)})`,
            formula: `vs. ${combos} villain combos after card removal`,
          },
          {
            label: 'EV(call)',
            value: `${ev >= 0 ? '+' : ''}${chips(ev)} chips`,
            formula: `eq·pot − (1−eq)·call = ${equity.toFixed(3)}·${pot} − ${(1 - equity).toFixed(3)}·${bet}`,
          },
          { label: 'EV(fold)', value: '0 chips', formula: 'measured from now; chips already in the pot are sunk' },
          ...(boardLen < 5
            ? [{ label: 'Caveat', value: 'Future betting can change this (implied odds / reverse implied odds).' }]
            : []),
        ],
      };
    }
    case 'equity-estimate': {
      const err = Math.abs(userAnswer - d.answer);
      return {
        correct: err <= 0.05,
        score: Math.max(0, 1 - err / 0.25),
        headline: `Exact equity: ${pct(d.answer)} — you were ${pct(err)} away.`,
        steps: [
          { label: 'Your estimate', value: pct(userAnswer) },
          { label: 'Win', value: pct(d.data.win) },
          { label: 'Split', value: pct(d.data.tie) },
          { label: 'Equity', value: pct(d.answer), formula: 'win + split / 2' },
          { label: 'Method', value: `${d.data.outcomes.toLocaleString('en-US')} boards enumerated` },
        ],
      };
    }
    case 'outs': {
      const { outs, ties } = d.data;
      const p = outs / 44;
      return {
        correct: userAnswer === outs,
        score: userAnswer === outs ? 1 : Math.max(0, 1 - Math.abs(userAnswer - outs) / 4),
        headline: `${outs} outs${ties ? ` (+${ties} that split)` : ''}.`,
        steps: [
          { label: 'Your answer', value: `${userAnswer}` },
          { label: 'Winning river cards', value: `${outs} of 44 unseen` },
          { label: 'Exact chance to win', value: pct(p), formula: `${outs} / 44` },
          { label: 'Rule of 2 estimate', value: pct(ruleOf2And4(outs, 1)), formula: `${outs} × 2% (heuristic)` },
          {
            label: 'Equity incl. splits',
            value: pct((outs + ties / 2) / 44),
            formula: ties ? `(${outs} + ${ties}/2) / 44` : undefined,
          },
          {
            label: 'From the flop (2 cards)',
            value: `Same outs would hit ${pct(probHitAtLeastOne(outs, 45, 2))} of the time`,
            formula: `1 − C(${45 - outs},2)/C(45,2) vs. rule of 4: ${pct(ruleOf2And4(outs, 2))}`,
          },
        ],
      };
    }
    case 'combos': {
      const { full, remaining } = d.data;
      return {
        correct: Math.abs(userAnswer - remaining) < 1e-9,
        score: Math.abs(userAnswer - remaining) < 1e-9 ? 1 : 0,
        headline: `${remaining} combos remain (of ${full}).`,
        steps: [
          { label: 'Your answer', value: `${userAnswer}` },
          { label: 'Before card removal', value: `${full}`, formula: 'pairs 6 · suited 4 · offsuit 12' },
          {
            label: 'Visible cards',
            value: cs([...(d.hero ?? []), ...(d.board ?? [])]),
          },
          {
            label: 'Rule',
            value: 'A pair with one card of its rank visible: C(3,2) = 3. With two visible: 1. Unpaired XY: (4 − seenX)·(4 − seenY).',
            formula: `e.g. C(3,2) = ${choose(3, 2)}`,
          },
          { label: 'After removal', value: `${remaining}` },
        ],
      };
    }
    case 'bluff-math': {
      const { question, pot, bet, value } = d.data;
      const correct = userAnswer === d.answer;
      const formula =
        question === 0
          ? `bet / (pot + bet) = ${bet} / ${pot + bet}`
          : question === 1
            ? `pot / (pot + bet) = ${pot} / ${pot + bet}`
            : `bet / (pot + 2·bet) = ${bet} / ${pot + 2 * bet}`;
      const why =
        question === 0
          ? 'You risk the bet to win the pot: break even when P(fold)·pot = (1 − P(fold))·bet.'
          : question === 1
            ? 'If you fold more than 1 − MDF, a bet with any two cards shows an immediate profit.'
            : 'Caller risks the bet to win pot + bet; indifferent when P(bluff) = bet / (pot + 2·bet).';
      return {
        correct,
        score: correct ? 1 : 0,
        headline: `Answer: ${pct(value)}`,
        steps: [
          { label: 'Formula', value: pct(value), formula },
          { label: 'Why', value: why },
          ...(question === 2
            ? [{ label: 'Bluff : value', value: `${(bet / (pot + bet)).toFixed(2)} bluffs per value bet`, formula: 'bet / (pot + bet)' }]
            : []),
        ],
      };
    }
  }
}
