import { cardsToString } from '../core/cards';
import type { LogEntry } from '../engine/types';

export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const num = (x: number) => x.toLocaleString('en-US');
export const signed = (x: number, d = 1) => `${x > 0 ? '+' : ''}${x.toFixed(d)}`;
export const prettyCards = (cs: number[]) =>
  cardsToString(cs).replace(/c/g, '♣').replace(/d/g, '♦').replace(/h/g, '♥').replace(/s/g, '♠');

/** Third-person verb, or the bare form when the player is "You" ("You call" vs "TAG 1 calls"). */
const verb = (name: string, base: string, third = `${base}s`) => `${name} ${name === 'You' ? base : third}`;

export function describeLog(e: LogEntry, names: string[]): string {
  switch (e.kind) {
    case 'blind':
      return `${verb(names[e.player], 'post')} ${e.blind} ${e.amount}`;
    case 'street':
      return `— ${e.street.toUpperCase()}: ${prettyCards(e.board)}`;
    case 'uncalled':
      return `Uncalled ${e.amount} returned to ${names[e.player]}`;
    case 'award': {
      const who = e.players.map((p) => names[p]).join(' & ');
      const pot = `${e.potIndex > 0 ? `side pot ${e.potIndex}` : 'the pot'} (${e.amount})${e.handDescription ? ` with ${e.handDescription}` : ''}`;
      return e.players.length > 1 ? `${who} win ${pot}` : `${verb(who, 'win')} ${pot}`;
    }
    case 'action': {
      const n = names[e.player];
      const a = e.action;
      const allIn = e.allIn ? ' (all-in)' : '';
      if (a.type === 'fold') return verb(n, 'fold');
      if (a.type === 'check') return verb(n, 'check');
      if (a.type === 'call') return `${verb(n, 'call')} ${e.added}${allIn}`;
      if (a.type === 'bet') return `${verb(n, 'bet')} ${a.amount}${allIn}`;
      return `${verb(n, 'raise')} to ${a.amount}${allIn}`;
    }
  }
}
