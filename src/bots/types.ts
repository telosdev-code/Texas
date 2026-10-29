import type { Card } from '../core/cards';
import type { Provenance } from '../core/provenance';
import type { Rng } from '../core/rng';
import { legalActions, positionLabels, potTotal } from '../engine/engine';
import type { Action, HandState, LegalActions, Street } from '../engine/types';

/** Everything a player is allowed to know when deciding. Hidden cards are never included. */
export interface PlayerView {
  seat: number;
  hole: Card[];
  board: Card[];
  street: Street;
  pot: number;
  toCall: number;
  currentBet: number;
  stack: number;
  bigBlind: number;
  legal: LegalActions;
  position: string;
  opponentsInHand: number;
  /** Number of bets/raises made on this street so far (preflop the big blind counts as the first bet). */
  raisesThisStreet: number;
  /** Was this player the last aggressor on the previous street? */
  wasLastAggressor: boolean;
  publicActions: { seat: number; street: Street; type: Action['type']; amount?: number }[];
}

/**
 * A decision-making policy. Heuristic bots, scripted opponents, and future solver-backed
 * strategies all implement this interface, so they are interchangeable at the table.
 */
export interface Strategy {
  id: string;
  name: string;
  provenance: Provenance;
  decide(view: PlayerView, rng: Rng): Action;
}

export function playerView(s: HandState, seat: number): PlayerView {
  const p = s.players[seat];
  const legal = legalActions(s, seat);
  const publicActions = s.log.flatMap((e) =>
    e.kind === 'action' ? [{ seat: e.player, street: e.street, type: e.action.type, amount: e.action.amount }] : [],
  );
  const streetAgg = publicActions.filter((a) => a.street === s.street && (a.type === 'bet' || a.type === 'raise')).length;
  const order: Street[] = ['preflop', 'flop', 'turn', 'river'];
  const prev = order[order.indexOf(s.street) - 1];
  const prevAgg = prev ? publicActions.filter((a) => a.street === prev && (a.type === 'bet' || a.type === 'raise')) : [];
  return {
    seat,
    hole: [...p.hole],
    board: [...s.board],
    street: s.street,
    pot: potTotal(s),
    toCall: legal.toCall,
    currentBet: s.currentBet,
    stack: p.stack,
    bigBlind: s.config.bigBlind,
    legal,
    position: positionLabels(s)[seat],
    opponentsInHand: s.players.filter((q, i) => i !== seat && !q.out && !q.folded).length,
    raisesThisStreet: streetAgg + (s.street === 'preflop' ? 1 : 0),
    wasLastAggressor: prevAgg.length > 0 && prevAgg[prevAgg.length - 1].seat === seat,
    publicActions,
  };
}
