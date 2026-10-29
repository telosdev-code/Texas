/**
 * Card model. A card is an integer 0..51: card = rank * 4 + suit.
 * rank: 0 = deuce … 12 = ace. suit: 0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades.
 */
export type Card = number;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANK_NAMES = [
  'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace',
];
export const RANK_PLURALS = [
  'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces',
];

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit;

export function cardToString(c: Card): string {
  return RANK_CHARS[rankOf(c)] + SUIT_CHARS[suitOf(c)];
}

export function parseCard(s: string): Card {
  const t = s.trim();
  if (t.length !== 2) throw new Error(`Invalid card "${s}"`);
  const r = RANK_CHARS.indexOf(t[0].toUpperCase());
  const su = SUIT_CHARS.indexOf(t[1].toLowerCase());
  if (r < 0 || su < 0) throw new Error(`Invalid card "${s}"`);
  return makeCard(r, su);
}

/** Parse "AsKd", "As Kd", or "As,Kd" into cards. */
export function parseCards(s: string): Card[] {
  const compact = s.replace(/[\s,]+/g, '');
  if (compact.length % 2 !== 0) throw new Error(`Invalid card list "${s}"`);
  const out: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) out.push(parseCard(compact.slice(i, i + 2)));
  if (new Set(out).size !== out.length) throw new Error(`Duplicate card in "${s}"`);
  return out;
}

export const cardsToString = (cs: readonly Card[]): string => cs.map(cardToString).join(' ');

export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

/** All cards not in `exclude`, in ascending order. */
export function remainingDeck(exclude: Iterable<Card>): Card[] {
  const used = new Uint8Array(52);
  for (const c of exclude) used[c] = 1;
  const out: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used[c]) out.push(c);
  return out;
}
