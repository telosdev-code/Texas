import { describe, expect, it } from 'vitest';
import { BOT_PROFILES, createHeuristicBot } from '../src/bots/heuristicBot';
import { playerView } from '../src/bots/types';
import { createRng } from '../src/core/rng';
import { applyAction, startHand } from '../src/engine/engine';

describe('heuristic bots', () => {
  it('every profile only takes legal actions and play terminates', () => {
    const rng = createRng(77);
    const bots = BOT_PROFILES.map(createHeuristicBot);
    for (let h = 0; h < 60; h++) {
      const seats = bots.map((b, i) => ({ id: b.id, name: b.name, stack: 200 + rng.int(1500), isHuman: false, profileId: b.id, i }));
      let s = startHand(seats, h % seats.length, { smallBlind: 5, bigBlind: 10 }, rng.int(1e9), h);
      let steps = 0;
      while (!s.complete) {
        const action = bots[s.toAct].decide(playerView(s, s.toAct), rng);
        s = applyAction(s, action); // throws on any illegal action
        expect(++steps).toBeLessThan(300);
      }
    }
  });

  it('player views never leak opponents\' hole cards', () => {
    const s = startHand(
      [0, 1, 2].map((i) => ({ id: `${i}`, name: `${i}`, stack: 1000, isHuman: false })),
      0, { smallBlind: 5, bigBlind: 10 }, 5,
    );
    const v = playerView(s, 1);
    const json = JSON.stringify(v);
    expect(v.hole).toEqual(s.players[1].hole);
    expect(json).not.toContain('"deck"');
    for (const c of [...s.players[0].hole, ...s.players[2].hole]) expect(v.hole).not.toContain(c);
  });
});
