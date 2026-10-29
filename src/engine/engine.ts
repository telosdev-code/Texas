import { evaluate, describeScore } from '../core/evaluator';
import { createRng, shuffle } from '../core/rng';
import { buildPots, splitPot } from './pots';
import type { Action, HandState, LegalActions, PlayerState, SeatInfo, Street, TableConfig } from './types';

/**
 * Pure No-Limit Texas Hold'em hand engine. Every transition returns a new state object.
 *
 * Rules implemented:
 *  - blinds (heads-up: button posts the small blind, acts first preflop and last postflop)
 *  - min bet = big blind; min raise = previous full raise increment
 *  - a short all-in raise does not reopen betting for players who already acted
 *  - uncalled bets are returned; main pot + side pots; odd chips go clockwise from the button
 */

const clone = <T>(x: T): T => structuredClone(x);

export const potTotal = (s: HandState) => s.players.reduce((a, p) => a + p.totalBet, 0);
const isLive = (p: PlayerState) => !p.out && !p.folded;
const canAct = (p: PlayerState) => isLive(p) && !p.allIn;

/** Next seat index after `from` (clockwise) satisfying `pred`. */
function nextSeat(players: PlayerState[] | SeatInfo[], from: number, pred: (i: number) => boolean): number {
  const n = players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(i)) return i;
  }
  return -1;
}

/** Button for the next hand: the next seat with chips after the previous button. */
export function nextButton(seats: SeatInfo[], prevButton: number): number {
  return nextSeat(seats, prevButton, (i) => seats[i].stack > 0);
}

export function startHand(
  seats: SeatInfo[],
  buttonSeat: number,
  config: TableConfig,
  seed: number,
  handNumber = 1,
): HandState {
  const players: PlayerState[] = seats.map((s) => ({
    id: s.id,
    name: s.name,
    isHuman: s.isHuman,
    profileId: s.profileId,
    stack: s.stack,
    startStack: s.stack,
    hole: [],
    out: s.stack <= 0,
    folded: false,
    allIn: false,
    streetBet: 0,
    totalBet: 0,
    needsToAct: false,
    actedAtFullRaise: null,
  }));
  const active = players.filter((p) => !p.out).length;
  if (active < 2) throw new Error('Need at least two players with chips');
  const button = players[buttonSeat] && !players[buttonSeat].out ? buttonSeat : nextSeat(players, buttonSeat, (i) => !players[i].out);
  const sb = active === 2 ? button : nextSeat(players, button, (i) => !players[i].out);
  const bb = nextSeat(players, sb, (i) => !players[i].out);

  const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), createRng(seed));
  const s: HandState = {
    handNumber,
    seed,
    config,
    players,
    button,
    sb,
    bb,
    street: 'preflop',
    board: [],
    deck,
    deckPos: 0,
    currentBet: config.bigBlind,
    lastRaiseSize: config.bigBlind,
    fullRaiseBet: config.bigBlind,
    toAct: -1,
    complete: false,
    log: [],
    result: null,
  };
  // Deal two cards each, starting left of the button.
  for (let round = 0; round < 2; round++) {
    let i = button;
    for (let k = 0; k < active; k++) {
      i = nextSeat(players, i, (j) => !players[j].out);
      players[i].hole.push(deck[s.deckPos++]);
    }
  }
  post(s, sb, config.smallBlind, 'SB');
  post(s, bb, config.bigBlind, 'BB');
  for (const p of players) p.needsToAct = canAct(p);
  s.toAct = bb;
  advance(s);
  return s;
}

function post(s: HandState, i: number, amount: number, blind: 'SB' | 'BB') {
  const p = s.players[i];
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.streetBet += a;
  p.totalBet += a;
  if (p.stack === 0) p.allIn = true;
  s.log.push({ kind: 'blind', player: i, amount: a, blind });
}

export function legalActions(s: HandState, i: number = s.toAct): LegalActions {
  const p = s.players[i];
  const toCall = Math.max(0, s.currentBet - p.streetBet);
  const callAmount = Math.min(toCall, p.stack);
  const maxRaiseTo = p.streetBet + p.stack;
  const raiseRights = p.actedAtFullRaise === null || p.actedAtFullRaise < s.fullRaiseBet;
  const opponentsCanRespond = s.players.some((q, j) => j !== i && canAct(q));
  const canAggress = !s.complete && raiseRights && p.stack > toCall && opponentsCanRespond;
  const fullMin = s.currentBet === 0 ? s.config.bigBlind : s.currentBet + s.lastRaiseSize;
  return {
    canFold: toCall > 0,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount,
    toCall,
    canBet: canAggress && s.currentBet === 0,
    canRaise: canAggress && s.currentBet > 0,
    minRaiseTo: Math.min(fullMin, maxRaiseTo),
    maxRaiseTo,
  };
}

export class IllegalActionError extends Error {}

export function applyAction(state: HandState, action: Action): HandState {
  if (state.complete || state.toAct < 0) throw new IllegalActionError('Hand is not awaiting an action');
  const i = state.toAct;
  const legal = legalActions(state, i);
  const s = clone(state);
  const p = s.players[i];
  const potBefore = potTotal(s);
  const stackBefore = p.stack;
  let added = 0;
  let type = action.type;
  if (type === 'bet' || type === 'raise') type = s.currentBet === 0 ? 'bet' : 'raise';

  switch (type) {
    case 'fold':
      if (!legal.canFold) throw new IllegalActionError('Cannot fold when you can check');
      p.folded = true;
      break;
    case 'check':
      if (!legal.canCheck) throw new IllegalActionError('Cannot check facing a bet');
      break;
    case 'call':
      if (!legal.canCall) throw new IllegalActionError('Nothing to call');
      added = legal.callAmount;
      break;
    case 'bet':
    case 'raise': {
      if (!(type === 'bet' ? legal.canBet : legal.canRaise)) throw new IllegalActionError(`Cannot ${type} now`);
      const to = Math.round(action.amount ?? NaN);
      if (!(to >= legal.minRaiseTo && to <= legal.maxRaiseTo))
        throw new IllegalActionError(`${type} must be between ${legal.minRaiseTo} and ${legal.maxRaiseTo}`);
      added = to - p.streetBet;
      const increment = to - s.currentBet;
      if (increment >= s.lastRaiseSize) {
        // Full bet/raise: reopens action for everyone.
        s.lastRaiseSize = increment;
        s.fullRaiseBet = to;
      }
      s.currentBet = to;
      for (const [j, q] of s.players.entries()) if (j !== i && canAct(q)) q.needsToAct = true;
      break;
    }
  }
  p.stack -= added;
  p.streetBet += added;
  p.totalBet += added;
  if (p.stack === 0 && added > 0) p.allIn = true;
  p.needsToAct = false;
  p.actedAtFullRaise = s.fullRaiseBet;
  s.log.push({
    kind: 'action',
    street: s.street,
    player: i,
    action: type === 'bet' || type === 'raise' ? { type, amount: p.streetBet } : { type },
    added,
    allIn: p.allIn,
    potBefore,
    toCall: legal.toCall,
    stackBefore,
  });
  advance(s);
  return s;
}

/** Move to the next actor, next street, or finish the hand. Mutates `s` (only called on fresh clones). */
function advance(s: HandState) {
  for (;;) {
    const live = s.players.filter(isLive);
    if (live.length === 1) {
      returnUncalled(s);
      finishUncontested(s);
      return;
    }
    const next = findNextToAct(s, s.toAct);
    if (next >= 0) {
      s.toAct = next;
      return;
    }
    returnUncalled(s);
    if (s.street === 'river') {
      showdown(s);
      return;
    }
    nextStreet(s);
  }
}

function findNextToAct(s: HandState, from: number): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k + n) % n;
    const p = s.players[i];
    if (!p.needsToAct || !canAct(p)) continue;
    const othersCanAct = s.players.some((q, j) => j !== i && canAct(q));
    if (!othersCanAct && p.streetBet >= s.currentBet) {
      // Nobody left to bet against and nothing to call: no decision to make.
      p.needsToAct = false;
      continue;
    }
    return i;
  }
  return -1;
}

function returnUncalled(s: HandState) {
  let top = -1;
  let max = 0;
  let second = 0;
  s.players.forEach((p, i) => {
    if (p.streetBet > max) {
      second = max;
      max = p.streetBet;
      top = i;
    } else if (p.streetBet > second) second = p.streetBet;
  });
  if (top >= 0 && max > second) {
    const p = s.players[top];
    const amount = max - second;
    p.stack += amount;
    p.streetBet -= amount;
    p.totalBet -= amount;
    if (p.stack > 0) p.allIn = false;
    s.currentBet = second;
    s.log.push({ kind: 'uncalled', player: top, amount });
  }
}

function nextStreet(s: HandState) {
  const order: Street[] = ['preflop', 'flop', 'turn', 'river'];
  s.street = order[order.indexOf(s.street) + 1];
  const count = s.street === 'flop' ? 3 : 1;
  for (let k = 0; k < count; k++) s.board.push(s.deck[s.deckPos++]);
  s.log.push({ kind: 'street', street: s.street, board: [...s.board] });
  s.currentBet = 0;
  s.lastRaiseSize = s.config.bigBlind;
  s.fullRaiseBet = 0;
  const actors = s.players.filter(canAct);
  for (const p of s.players) {
    p.streetBet = 0;
    p.actedAtFullRaise = null;
    p.needsToAct = actors.length >= 2 && canAct(p);
  }
  s.toAct = s.button; // search starts left of the button
}

/** Clockwise order starting left of the button (used for the odd-chip rule). */
function orderFromButton(s: HandState): number[] {
  const n = s.players.length;
  return Array.from({ length: n }, (_, k) => (s.button + 1 + k) % n);
}

function finishUncontested(s: HandState) {
  const winner = s.players.findIndex(isLive);
  const amount = potTotal(s);
  s.players[winner].stack += amount;
  s.log.push({ kind: 'award', potIndex: 0, players: [winner], amount });
  s.result = {
    net: s.players.map((p) => p.stack - p.startStack),
    pots: [{ amount, eligible: [winner], winners: [winner], shares: [amount] }],
    showdown: false,
    descriptions: s.players.map(() => null),
  };
  s.toAct = -1;
  s.complete = true;
}

function showdown(s: HandState) {
  const scores = s.players.map((p) => (isLive(p) ? evaluate([...p.hole, ...s.board]) : -1));
  const pots = buildPots(
    s.players.map((p) => p.totalBet),
    s.players.map((p) => !isLive(p)),
  );
  const order = orderFromButton(s);
  const resultPots = pots.map((pot, potIndex) => {
    const best = Math.max(...pot.eligible.map((i) => scores[i]));
    const winners = pot.eligible.filter((i) => scores[i] === best);
    const shares = splitPot(pot.amount, winners, order);
    winners.forEach((w, k) => (s.players[w].stack += shares[k]));
    s.log.push({ kind: 'award', potIndex, players: winners, amount: pot.amount, handDescription: describeScore(best) });
    return { ...pot, winners, shares };
  });
  s.result = {
    net: s.players.map((p) => p.stack - p.startStack),
    pots: resultPots,
    showdown: true,
    descriptions: scores.map((sc) => (sc >= 0 ? describeScore(sc) : null)),
  };
  s.toAct = -1;
  s.complete = true;
}

/** Positions labels (BTN, SB, BB, UTG, …) for the players dealt in. */
export function positionLabels(s: HandState): string[] {
  const labels = s.players.map(() => '');
  const n = s.players.length;
  const active: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = (s.button + k) % n;
    if (!s.players[i].out) active.push(i);
  }
  const m = active.length;
  const names: Record<number, string[]> = {
    2: ['BTN/SB', 'BB'],
    3: ['BTN', 'SB', 'BB'],
    4: ['BTN', 'SB', 'BB', 'UTG'],
    5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
    7: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
    8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
    9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
  };
  active.forEach((seat, k) => (labels[seat] = names[m]?.[k] ?? ''));
  return labels;
}
