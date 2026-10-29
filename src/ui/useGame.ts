import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createHeuristicBot, profileById } from '../bots/heuristicBot';
import { playerView, type Strategy } from '../bots/types';
import { createRng, randomSeed } from '../core/rng';
import { applyAction, nextButton, startHand } from '../engine/engine';
import type { Action, HandState, SeatInfo } from '../engine/types';
import type { StoredHand } from '../review/analysis';
import { KEYS, load, save } from '../storage/storage';
import { compute } from '../workers/client';
import { useStore, type TableSettings } from './store';

export const HUMAN_SEAT = 0;

interface Session {
  seats: SeatInfo[];
  button: number;
  handNumber: number;
  /** Fingerprint of the settings the session was created with. */
  settingsKey: string;
}

const settingsKey = (s: TableSettings) =>
  JSON.stringify([s.opponents.map((o) => o.profileId), s.startingStackBB, s.bigBlind]);

function newSession(s: TableSettings): Session {
  const stack = s.startingStackBB * s.bigBlind;
  const seats: SeatInfo[] = [
    { id: 'you', name: 'You', stack, isHuman: true },
    ...s.opponents.map((o, i) => {
      const p = profileById(o.profileId);
      return { id: `bot${i}`, name: `${p.name} ${i + 1}`, stack, isHuman: false, profileId: p.id };
    }),
  ];
  return { seats, button: seats.length - 1, handNumber: 0, settingsKey: settingsKey(s) };
}

/** Drives a session of hands: dealing, bot turns, persistence and auto-review. */
export function useGame() {
  const { settings, addHand, setReview } = useStore();
  const [session, setSession] = useState<Session>(() => {
    const saved = load<Session | null>(KEYS.session, null);
    return saved && saved.settingsKey === settingsKey(settings) ? saved : newSession(settings);
  });
  const [hand, setHand] = useState<HandState | null>(null);
  const rngRef = useRef(createRng(randomSeed()));
  const bots = useMemo(() => {
    const m = new Map<number, Strategy>();
    session.seats.forEach((s, i) => s.profileId && m.set(i, createHeuristicBot(profileById(s.profileId))));
    return m;
  }, [session.seats]);

  useEffect(() => save(KEYS.session, session), [session]);

  const restart = useCallback(() => {
    setHand(null);
    setSession(newSession(settings));
  }, [settings]);

  // Settings changes that alter the table restart the session.
  useEffect(() => {
    if (session.settingsKey !== settingsKey(settings)) restart();
  }, [settings, session.settingsKey, restart]);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const deal = useCallback(() => {
    const sess = sessionRef.current;
    // Simulated chips: busted computer players re-buy automatically.
    const startStack = settings.startingStackBB * settings.bigBlind;
    const seats = sess.seats.map((s) => (!s.isHuman && s.stack <= 0 ? { ...s, stack: startStack } : s));
    const button = nextButton(seats, sess.button);
    const handNumber = sess.handNumber + 1;
    setSession({ ...sess, seats, button, handNumber });
    setHand(startHand(seats, button, { smallBlind: settings.bigBlind / 2, bigBlind: settings.bigBlind }, randomSeed(), handNumber));
  }, [settings]);

  const rebuy = useCallback(() => {
    setSession((sess) => ({
      ...sess,
      seats: sess.seats.map((s) => (s.isHuman ? { ...s, stack: settings.startingStackBB * settings.bigBlind } : s)),
    }));
  }, [settings]);

  const act = useCallback((a: Action) => setHand((h) => (h && !h.complete ? applyAction(h, a) : h)), []);

  // Bot turns.
  useEffect(() => {
    if (!hand || hand.complete || hand.toAct === HUMAN_SEAT) return;
    const seat = hand.toAct;
    const t = setTimeout(() => {
      const bot = bots.get(seat);
      if (!bot) return;
      const action = bot.decide(playerView(hand, seat), rngRef.current);
      setHand((h) => (h === hand ? applyAction(h, action) : h));
    }, settings.botDelayMs);
    return () => clearTimeout(t);
  }, [hand, bots, settings.botDelayMs]);

  // Hand finished: update stacks, store history, kick off review.
  const recorded = useRef<string>('');
  useEffect(() => {
    if (!hand?.complete || recorded.current === `${hand.seed}:${hand.handNumber}`) return;
    recorded.current = `${hand.seed}:${hand.handNumber}`;
    setSession((sess) => ({ ...sess, seats: sess.seats.map((s, i) => ({ ...s, stack: hand.players[i].stack })) }));
    const humanActed = hand.log.some((e) => e.kind === 'action' && e.player === HUMAN_SEAT);
    const stored: StoredHand = {
      id: `${Date.now()}-${hand.seed}`,
      timestamp: Date.now(),
      handNumber: hand.handNumber,
      seed: hand.seed,
      humanSeat: HUMAN_SEAT,
      config: hand.config,
      button: hand.button,
      players: hand.players.map((p) => ({ name: p.name, profileId: p.profileId, hole: p.hole, startStack: p.startStack, out: p.out })),
      board: hand.board,
      log: hand.log,
      net: hand.result!.net,
      showdown: hand.result!.showdown,
      descriptions: hand.result!.descriptions,
    };
    addHand(stored);
    if (settings.autoReview && humanActed) compute.review(stored).then((r) => setReview(stored.id, r)).catch(() => {});
  }, [hand, addHand, setReview, settings.autoReview]);

  return { session, hand, deal, act, rebuy, restart };
}
