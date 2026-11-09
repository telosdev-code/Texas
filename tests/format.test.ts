import { describe, expect, it } from 'vitest';
import { describeLog } from '../src/ui/format';

const names = ['You', 'TAG 1'];
describe('hand log wording', () => {
  it('conjugates verbs for "You" and for other players', () => {
    const call = { kind: 'action', street: 'preflop', player: 0, action: { type: 'call' }, added: 41, allIn: false, potBefore: 0, toCall: 41, stackBefore: 1000 } as const;
    expect(describeLog(call, names)).toBe('You call 41');
    expect(describeLog({ ...call, player: 1 }, names)).toBe('TAG 1 calls 41');
    expect(describeLog({ ...call, action: { type: 'raise', amount: 120 }, allIn: true }, names)).toBe('You raise to 120 (all-in)');
    expect(describeLog({ kind: 'blind', player: 1, amount: 10, blind: 'BB' }, names)).toBe('TAG 1 posts BB 10');
    expect(describeLog({ kind: 'award', potIndex: 0, players: [0], amount: 200, handDescription: 'Pair of Aces' }, names)).toBe(
      'You win the pot (200) with Pair of Aces',
    );
    expect(describeLog({ kind: 'award', potIndex: 1, players: [0, 1], amount: 50 }, names)).toBe('You & TAG 1 win side pot 1 (50)');
  });
});
