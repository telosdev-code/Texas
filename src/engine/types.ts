import type { Card } from '../core/cards';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

/** For bet/raise, `amount` is the player's total bet on this street after the action ("raise to"). */
export interface Action {
  type: ActionType;
  amount?: number;
}

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
}

export interface SeatInfo {
  id: string;
  name: string;
  stack: number;
  isHuman: boolean;
  /** Strategy profile id for computer players. */
  profileId?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  isHuman: boolean;
  profileId?: string;
  stack: number;
  /** Stack at the start of the hand (before blinds). */
  startStack: number;
  hole: Card[];
  /** Not dealt in (no chips at hand start). */
  out: boolean;
  folded: boolean;
  allIn: boolean;
  /** Chips committed on the current street. */
  streetBet: number;
  /** Chips committed this hand. */
  totalBet: number;
  needsToAct: boolean;
  /**
   * `fullRaiseBet` at the time this player last acted on this street (null = not yet acted).
   * A player may only re-raise if a full raise has happened since they last acted —
   * this is how a short all-in "raise" fails to reopen the betting.
   */
  actedAtFullRaise: number | null;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Chips needed to call (capped at stack). */
  callAmount: number;
  /** Chips owed before capping at stack. */
  toCall: number;
  canBet: boolean;
  canRaise: boolean;
  /** Minimum legal total street bet for a bet/raise (may equal maxRaiseTo when only an all-in is possible). */
  minRaiseTo: number;
  maxRaiseTo: number;
}

export type LogEntry =
  | { kind: 'blind'; player: number; amount: number; blind: 'SB' | 'BB' }
  | {
      kind: 'action';
      street: Street;
      player: number;
      action: Action;
      /** Chips moved into the pot by this action. */
      added: number;
      allIn: boolean;
      /** Snapshot before the action, for analysis. */
      potBefore: number;
      toCall: number;
      stackBefore: number;
    }
  | { kind: 'street'; street: Street; board: Card[] }
  | { kind: 'uncalled'; player: number; amount: number }
  | { kind: 'award'; potIndex: number; players: number[]; amount: number; handDescription?: string };

export interface Pot {
  amount: number;
  eligible: number[];
}

export interface HandResult {
  /** Net chips won (+) or lost (−) per player this hand. */
  net: number[];
  pots: (Pot & { winners: number[]; shares: number[] })[];
  showdown: boolean;
  /** Final hand description per player who reached showdown. */
  descriptions: (string | null)[];
}

export interface HandState {
  handNumber: number;
  seed: number;
  config: TableConfig;
  players: PlayerState[];
  button: number;
  sb: number;
  bb: number;
  street: Street;
  board: Card[];
  deck: Card[];
  deckPos: number;
  /** Highest total street bet. */
  currentBet: number;
  /** Size of the last full bet/raise increment — the minimum raise increment. */
  lastRaiseSize: number;
  /** currentBet level established by the last *full* bet or raise on this street. */
  fullRaiseBet: number;
  /** Index of player to act, or -1 if no action is pending. */
  toAct: number;
  complete: boolean;
  log: LogEntry[];
  result: HandResult | null;
}
