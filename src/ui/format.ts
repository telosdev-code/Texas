import { cardsToString } from '../core/cards';
import type { LogEntry } from '../engine/types';

export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const num = (x: number) => x.toLocaleString('en-US');
export const signed = (x: number, d = 1) => `${x > 0 ? '+' : ''}${x.toFixed(d)}`;
export const prettyCards = (cs: number[]) =>
  cardsToString(cs).replace(/c/g, '♣').replace(/d/g, '♦').replace(/h/g, '♥').replace(/s/g, '♠');

export function describeLog(e: LogEntry, names: string[]): string {
  switch (e.kind) {
    case 'blind':
      return `${names[e.player]} posts ${e.blind} ${e.amount}`;
    case 'street':
      return `— ${e.street.toUpperCase()}: ${prettyCards(e.board)}`;
    case 'uncalled':
      return `Uncalled ${e.amount} returned to ${names[e.player]}`;
    case 'award':
      return `${e.players.map((p) => names[p]).join(' & ')} win${e.players.length > 1 ? '' : 's'} ${e.potIndex > 0 ? `side pot ${e.potIndex}` : 'the pot'} (${e.amount})${e.handDescription ? ` with ${e.handDescription}` : ''}`;
    case 'action': {
      const n = names[e.player];
      const a = e.action;
      const allIn = e.allIn ? ' (all-in)' : '';
      if (a.type === 'fold') return `${n} folds`;
      if (a.type === 'check') return `${n} checks`;
      if (a.type === 'call') return `${n} calls ${e.added}${allIn}`;
      if (a.type === 'bet') return `${n} bets ${a.amount}${allIn}`;
      return `${n} raises to ${a.amount}${allIn}`;
    }
  }
}
