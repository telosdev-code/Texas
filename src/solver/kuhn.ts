import type { ExtensiveGame } from './game';

/**
 * Kuhn poker: a 3-card (J, Q, K) toy poker game, small enough to solve exactly.
 * Each player antes 1 and gets one card. Player 0 checks or bets 1; the opponent responds.
 * Its equilibrium is known in closed form: player 0's game value is −1/18.
 */
export interface KuhnState {
  cards: [number, number] | null;
  history: string; // 'p' = pass/check/fold, 'b' = bet/call
}

const CARD_NAMES = ['J', 'Q', 'K'];
const TERMINALS = new Set(['pp', 'bp', 'bb', 'pbp', 'pbb']);

export const kuhnPoker: ExtensiveGame<KuhnState> = {
  name: 'Kuhn poker',
  root: () => ({ cards: null, history: '' }),
  isTerminal: (s) => TERMINALS.has(s.history),
  isChance: (s) => s.cards === null,
  chanceOutcomes: () => {
    const out: { state: KuhnState; prob: number }[] = [];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) out.push({ state: { cards: [a, b], history: '' }, prob: 1 / 6 });
    return out;
  },
  currentPlayer: (s) => (s.history.length % 2) as 0 | 1,
  infoSetKey: (s) => CARD_NAMES[s.cards![s.history.length % 2]] + ':' + s.history,
  actions: () => ['p', 'b'],
  next: (s, a) => ({ cards: s.cards, history: s.history + a }),
  utility: (s) => {
    const [c0, c1] = s.cards!;
    const h = s.history;
    const showdown = c0 > c1 ? 1 : -1;
    if (h === 'pp') return showdown; // both check: win the antes
    if (h === 'bb' || h === 'pbb') return 2 * showdown; // bet called
    if (h === 'bp') return 1; // player 1 folds
    return -1; // 'pbp': player 0 folds
  },
};

export const KUHN_GAME_VALUE = -1 / 18;

export const KUHN_INFOSET_LABELS: Record<string, string> = {
  '': 'First to act',
  p: 'After a check',
  b: 'Facing a bet',
  pb: 'Checked, then facing a bet',
};
