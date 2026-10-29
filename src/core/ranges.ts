import { type Card, makeCard, RANK_CHARS } from './cards.ts';

/**
 * The 169 starting-hand classes laid out in the standard 13×13 matrix.
 * Row/column index 0 = Ace … 12 = Deuce. Diagonal = pairs, upper-right = suited, lower-left = offsuit.
 * A Range is a weight in [0, 1] per cell (index = row * 13 + col).
 */
export type Range = Float64Array;
export type HandKind = 'pair' | 'suited' | 'offsuit';

export interface HandClass {
  index: number;
  row: number;
  col: number;
  /** Higher card rank (0 = deuce … 12 = ace). */
  hi: number;
  lo: number;
  kind: HandKind;
  label: string;
  /** Number of card combinations: 6, 4 or 12. */
  combos: number;
}

export interface WeightedCombo {
  cards: [Card, Card];
  weight: number;
  classIndex: number;
}

const rankAt = (i: number) => 12 - i; // matrix index → rank

export const HAND_CLASSES: HandClass[] = (() => {
  const out: HandClass[] = [];
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const kind: HandKind = row === col ? 'pair' : col > row ? 'suited' : 'offsuit';
      const hi = rankAt(Math.min(row, col));
      const lo = rankAt(Math.max(row, col));
      const label = RANK_CHARS[hi] + RANK_CHARS[lo] + (kind === 'pair' ? '' : kind === 'suited' ? 's' : 'o');
      out.push({ index: row * 13 + col, row, col, hi, lo, kind, label, combos: kind === 'pair' ? 6 : kind === 'suited' ? 4 : 12 });
    }
  }
  return out;
})();

const BY_LABEL = new Map(HAND_CLASSES.map((h) => [h.label, h]));

export function classIndex(hi: number, lo: number, kind: HandKind): number {
  const a = 12 - hi;
  const b = 12 - lo;
  if (kind === 'pair') return a * 13 + a;
  return kind === 'suited' ? a * 13 + b : b * 13 + a;
}

/** Class of a concrete two-card hand. */
export function classOfCards(c1: Card, c2: Card): HandClass {
  const r1 = c1 >> 2;
  const r2 = c2 >> 2;
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const kind: HandKind = r1 === r2 ? 'pair' : (c1 & 3) === (c2 & 3) ? 'suited' : 'offsuit';
  return HAND_CLASSES[classIndex(hi, lo, kind)];
}

/** All concrete card combinations for a class. */
export function combosOfClass(h: HandClass): [Card, Card][] {
  const out: [Card, Card][] = [];
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = 0; s2 < 4; s2++) {
      if (h.kind === 'pair' && s2 <= s1) continue;
      if (h.kind === 'suited' && s1 !== s2) continue;
      if (h.kind === 'offsuit' && s1 === s2) continue;
      out.push([makeCard(h.hi, s1), makeCard(h.lo, s2)]);
    }
  }
  return out;
}

export const emptyRange = (): Range => new Float64Array(169);
export const fullRange = (): Range => new Float64Array(169).fill(1);

/** Expand a range into weighted combos, removing any combo that uses a dead card (card removal). */
export function rangeToCombos(range: Range, dead: readonly Card[] = []): WeightedCombo[] {
  const d = new Uint8Array(52);
  for (const c of dead) d[c] = 1;
  const out: WeightedCombo[] = [];
  for (const h of HAND_CLASSES) {
    const w = range[h.index];
    if (w <= 0) continue;
    for (const cards of combosOfClass(h)) {
      if (d[cards[0]] || d[cards[1]]) continue;
      out.push({ cards, weight: w, classIndex: h.index });
    }
  }
  return out;
}

/** Weighted number of combos in a range, optionally after card removal. */
export function countCombos(range: Range, dead: readonly Card[] = []): number {
  if (dead.length === 0) {
    let n = 0;
    for (const h of HAND_CLASSES) n += range[h.index] * h.combos;
    return n;
  }
  return rangeToCombos(range, dead).reduce((s, c) => s + c.weight, 0);
}

/** Fraction of all 1326 starting hands contained in the range. */
export const rangePercent = (range: Range) => countCombos(range) / 1326;

// ---------------------------------------------------------------- parsing

const rankIndex = (ch: string) => {
  const r = RANK_CHARS.indexOf(ch.toUpperCase());
  if (r < 0) throw new Error(`Unknown rank "${ch}"`);
  return r;
};

/**
 * Parse common range notation:
 *   "QQ+", "77-99", "AKs", "AKo", "AK" (suited and offsuit), "A2s+", "KTo+", "A2s-A5s", "AKs:0.5" (weight).
 */
export function parseRange(text: string): Range {
  const range = emptyRange();
  const tokens = text.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
  for (const raw of tokens) {
    const [body, weightStr] = raw.split(':');
    const weight = weightStr === undefined ? 1 : Number(weightStr);
    if (!(weight >= 0 && weight <= 1)) throw new Error(`Bad weight in "${raw}"`);
    for (const idx of expandToken(body)) range[idx] = weight;
  }
  return range;
}

function expandToken(tok: string): number[] {
  const dash = tok.indexOf('-');
  if (dash > 0) {
    const a = parseSimple(tok.slice(0, dash));
    const b = parseSimple(tok.slice(dash + 1));
    if (a.kinds.join() !== b.kinds.join()) throw new Error(`Mismatched range "${tok}"`);
    const out: number[] = [];
    if (a.hi === a.lo && b.hi === b.lo) {
      const [from, to] = [Math.min(a.hi, b.hi), Math.max(a.hi, b.hi)];
      for (let r = from; r <= to; r++) out.push(classIndex(r, r, 'pair'));
      return out;
    }
    if (a.hi !== b.hi) throw new Error(`Range "${tok}" must share the high card`);
    const [from, to] = [Math.min(a.lo, b.lo), Math.max(a.lo, b.lo)];
    for (let lo = from; lo <= to; lo++) for (const k of a.kinds) out.push(classIndex(a.hi, lo, k));
    return out;
  }
  const plus = tok.endsWith('+');
  const s = parseSimple(plus ? tok.slice(0, -1) : tok);
  const out: number[] = [];
  if (s.hi === s.lo) {
    for (let r = s.hi; r <= (plus ? 12 : s.hi); r++) out.push(classIndex(r, r, 'pair'));
    return out;
  }
  for (let lo = s.lo; lo <= (plus ? s.hi - 1 : s.lo); lo++) for (const k of s.kinds) out.push(classIndex(s.hi, lo, k));
  return out;
}

function parseSimple(t: string): { hi: number; lo: number; kinds: HandKind[] } {
  if (t.length < 2 || t.length > 3) throw new Error(`Cannot parse "${t}"`);
  const r1 = rankIndex(t[0]);
  const r2 = rankIndex(t[1]);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  if (hi === lo) {
    if (t.length === 3) throw new Error(`Pairs cannot be suited/offsuit: "${t}"`);
    return { hi, lo, kinds: ['pair'] };
  }
  const suffix = t[2]?.toLowerCase();
  const kinds: HandKind[] = suffix === 's' ? ['suited'] : suffix === 'o' ? ['offsuit'] : suffix === undefined ? ['suited', 'offsuit'] : [];
  if (!kinds.length) throw new Error(`Bad suffix in "${t}"`);
  return { hi, lo, kinds };
}

/** Serialize a range to compact notation (inverse of parseRange for 0/1 weights). */
export function formatRange(range: Range): string {
  const parts: string[] = [];
  const byWeight = new Map<number, number[]>();
  for (let i = 0; i < 169; i++) {
    const w = range[i];
    if (w > 0) byWeight.set(w, [...(byWeight.get(w) ?? []), i]);
  }
  const weights = [...byWeight.keys()].sort((a, b) => b - a);
  for (const w of weights) {
    const set = new Set(byWeight.get(w));
    const suffix = w === 1 ? '' : `:${+w.toFixed(3)}`;
    const R = (r: number) => RANK_CHARS[r];
    // pairs, from AA downwards
    let r = 12;
    while (r >= 0) {
      if (!set.has(classIndex(r, r, 'pair'))) { r--; continue; }
      const top = r;
      while (r - 1 >= 0 && set.has(classIndex(r - 1, r - 1, 'pair'))) r--;
      const bottom = r;
      const tok = top === bottom ? R(top) + R(top) : top === 12 ? `${R(bottom)}${R(bottom)}+` : `${R(top)}${R(top)}-${R(bottom)}${R(bottom)}`;
      parts.push(tok + suffix);
      r--;
    }
    for (const kind of ['suited', 'offsuit'] as const) {
      const k = kind === 'suited' ? 's' : 'o';
      for (let hi = 12; hi >= 1; hi--) {
        let lo = hi - 1;
        while (lo >= 0) {
          if (!set.has(classIndex(hi, lo, kind))) { lo--; continue; }
          const top = lo;
          while (lo - 1 >= 0 && set.has(classIndex(hi, lo - 1, kind))) lo--;
          const bottom = lo;
          const name = (x: number) => `${R(hi)}${R(x)}${k}`;
          const tok = top === bottom ? name(top) : top === hi - 1 ? `${name(bottom)}+` : `${name(top)}-${name(bottom)}`;
          parts.push(tok + suffix);
          lo--;
        }
      }
    }
  }
  return parts.join(', ');
}

export const classByLabel = (label: string) => BY_LABEL.get(label);
