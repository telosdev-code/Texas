import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { BOT_PROFILES, profileById } from '@shared/bots/heuristicBot';
import { describeScore, evaluate } from '@shared/core/evaluator';
import type { EquityResult } from '@shared/core/equity';
import { potOddsRatio, requiredEquity, winnablePot } from '@shared/core/ev';
import { fullRange, rangeToCombos } from '@shared/core/ranges';
import { legalActions, positionLabels, potTotal } from '@shared/engine/engine';
import type { Action, HandState } from '@shared/engine/types';
import { describeLog, num, pct } from '@shared/ui/format';
import { DEFAULT_SETTINGS, useStore, type TableSettings } from '@shared/ui/store';
import { HUMAN_SEAT, useGame } from '@shared/ui/useGame';
import { compute } from '@shared/workers/client';
import { CardView } from '@/components/Card';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { Body, Button, Chip, H3, Muted, Panel, Screen } from '@/components/ui';
import { colors, radius, space } from '@/theme';

const RANDOM_COMBOS = rangeToCombos(fullRange());

export function PlayScreen() {
  const { settings } = useStore();
  const { session, hand, deal, act, rebuy, restart } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const human = session.seats[HUMAN_SEAT];
  const canDeal = (!hand || hand.complete) && human.stack > 0;
  const myTurn = !!hand && !hand.complete && hand.toAct === HUMAN_SEAT;

  useEffect(() => {
    if (hand?.complete && hand.result && hand.result.net[HUMAN_SEAT] > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [hand?.complete, hand?.result]);

  return (
    <Screen>
      <Table hand={hand} seats={session.seats} showBotCards={settings.showBotCards} />

      {myTurn ? (
        <ActionBar
          hand={hand}
          onAct={(a) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            act(a);
          }}
        />
      ) : (
        <View style={styles.dealBar}>
          {hand?.complete && <ResultLine hand={hand} />}
          {hand && !hand.complete && <Muted>Waiting for {hand.players[hand.toAct]?.name}…</Muted>}
          {canDeal && <Button big variant="primary" label={hand ? 'Deal next hand' : 'Deal first hand'} onPress={deal} />}
          {(!hand || hand.complete) && human.stack <= 0 && (
            <Button big variant="primary" label={`Re-buy ${settings.startingStackBB} BB (simulated chips)`} onPress={rebuy} />
          )}
        </View>
      )}

      {settings.showHud && myTurn && hand.players[HUMAN_SEAT].hole.length > 0 && <Hud hand={hand} />}

      <Panel>
        <H3>Hand {hand?.handNumber ?? '–'} log</H3>
        <HandLog hand={hand} names={(hand?.players ?? session.seats).map((p) => p.name)} />
      </Panel>

      <View style={styles.row}>
        <Button label="⚙ Table settings" onPress={() => setShowSettings(true)} />
        <Button
          variant="ghost"
          label="New session"
          onPress={() =>
            Alert.alert('New session', 'Reset all stacks and start a new session?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: restart },
            ])
          }
        />
      </View>
      <Muted small>Simulated chips only. Opponents use heuristic rule-based strategies, not GTO.</Muted>
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </Screen>
  );
}

// ------------------------------------------------------------------ table

/** Seat i on a unit circle (seat 0 at the bottom, clockwise), pushed toward top and bottom on portrait tables. */
function seatPos(i: number, n: number) {
  const angle = ((90 + (i * 360) / n) * Math.PI) / 180;
  const y = Math.sin(angle);
  return { x: Math.cos(angle), y: Math.sign(y) * Math.abs(y) ** 0.6 };
}

function lastActionLabel(hand: HandState, seat: number): string | null {
  for (let k = hand.log.length - 1; k >= 0; k--) {
    const e = hand.log[k];
    if (e.kind === 'street') return null;
    if (e.kind === 'action' && e.player === seat) {
      const t = e.action.type;
      return e.allIn ? 'All-in' : t[0].toUpperCase() + t.slice(1);
    }
  }
  return null;
}

const SEAT_W = 86;
const SEAT_H = 74;

function Table({ hand, seats, showBotCards }: { hand: HandState | null; seats: { name: string; stack: number }[]; showBotCards: boolean }) {
  const { width: screenW } = useWindowDimensions();
  const width = Math.min(screenW - space.lg * 2, 700);
  const height = Math.min(width * 1.35, 620);
  const n = seats.length;
  const labels = hand ? positionLabels(hand) : [];
  const winners = new Set(hand?.result?.pots.flatMap((p) => p.winners) ?? []);
  const rx = width / 2 - SEAT_W / 2;
  const ry = height / 2 - SEAT_H / 2;

  return (
    <View style={{ width, height, alignSelf: 'center' }} accessibilityLabel="Poker table">
      <View style={[styles.felt, { left: width * 0.08, right: width * 0.08, top: height * 0.07, bottom: height * 0.07, borderRadius: width }]} />
      <View style={[styles.center, { top: height / 2 - 48, width }]}>
        <View style={styles.board}>
          {[0, 1, 2, 3, 4].map((k) => (
            <CardView key={k} card={hand?.board[k] ?? null} size="sm" />
          ))}
        </View>
        <View style={styles.pot}>
          <Text style={styles.potText}>
            Pot <Text style={{ fontWeight: '700' }}>{hand ? num(potTotal(hand)) : 0}</Text>
          </Text>
        </View>
      </View>
      {seats.map((s, i) => {
        const pos = seatPos(i, n);
        const p = hand?.players[i];
        const showCards = !!p && p.hole.length > 0 && (i === HUMAN_SEAT || showBotCards || (hand!.complete && !!hand!.result?.showdown && !p.folded));
        const toAct = !!hand && !hand.complete && hand.toAct === i;
        const last = hand && p ? lastActionLabel(hand, i) : null;
        const cx = width / 2 + pos.x * rx;
        const cy = height / 2 + pos.y * ry;
        return (
          <View key={i} style={[styles.seat, { left: cx - SEAT_W / 2, top: cy - SEAT_H / 2, opacity: p?.folded || p?.out ? 0.45 : 1 }]}>
            <View style={styles.seatCards}>
              {p && p.hole.length > 0 && !p.folded
                ? p.hole.map((c, k) => <CardView key={k} card={c} faceDown={!showCards} size={i === HUMAN_SEAT ? 'sm' : 'xs'} />)
                : null}
            </View>
            <View style={[styles.seatInfo, toAct && styles.seatToAct, winners.has(i) && styles.seatWinner]}>
              <Text style={styles.seatName} numberOfLines={1}>
                {hand?.button === i ? 'Ⓓ ' : ''}
                {s.name}
              </Text>
              <Text style={styles.seatStack}>{num(p ? p.stack : s.stack)}</Text>
              <Text style={styles.seatTag} numberOfLines={1}>
                {[labels[i], p?.allIn ? 'All-in' : last].filter(Boolean).join(' · ')}
              </Text>
              {p && p.streetBet > 0 && !hand!.complete && <Text style={styles.bet}>bet {num(p.streetBet)}</Text>}
              {hand?.complete && hand.result?.showdown && p && !p.folded && !p.out && (
                <Text style={styles.seatHand} numberOfLines={2}>
                  {hand.result.descriptions[i]}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ResultLine({ hand }: { hand: HandState }) {
  const net = hand.result!.net[HUMAN_SEAT];
  const bb = hand.config.bigBlind;
  return (
    <Text style={[styles.result, { color: net > 0 ? colors.pos : net < 0 ? colors.neg : colors.text }]}>
      {net > 0 ? `You won ${num(net)}` : net < 0 ? `You lost ${num(-net)}` : 'You broke even'} ({(net / bb).toFixed(1)} BB)
    </Text>
  );
}

// ------------------------------------------------------------------ actions

function ActionBar({ hand, onAct }: { hand: HandState; onAct: (a: Action) => void }) {
  const l = legalActions(hand, HUMAN_SEAT);
  const me = hand.players[HUMAN_SEAT];
  const pot = potTotal(hand);
  const canAgg = l.canBet || l.canRaise;
  const clamp = (v: number) => Math.max(l.minRaiseTo, Math.min(l.maxRaiseTo, Math.round(v)));
  const [amount, setAmount] = useState(l.minRaiseTo);
  useEffect(() => setAmount(l.minRaiseTo), [l.minRaiseTo, hand.street]);
  const sizeTo = (frac: number) => clamp(hand.currentBet + frac * (pot + l.toCall));
  const presets: [string, number][] = [
    ['Min', l.minRaiseTo],
    ['½ pot', sizeTo(0.5)],
    ['¾ pot', sizeTo(0.75)],
    ['Pot', sizeTo(1)],
    ['All-in', l.maxRaiseTo],
  ];
  const to = clamp(amount);

  return (
    <Panel>
      {canAgg && l.maxRaiseTo > l.minRaiseTo && (
        <>
          <View style={styles.wrap}>
            {presets.map(([label, v]) => (
              <Chip key={label} label={label} on={to === v} onPress={() => setAmount(v)} />
            ))}
          </View>
          <Slider
            minimumValue={l.minRaiseTo}
            maximumValue={l.maxRaiseTo}
            step={1}
            value={to}
            onValueChange={setAmount}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
            accessibilityLabel="Bet size"
          />
        </>
      )}
      <View style={styles.row}>
        {l.canFold && <Button big variant="fold" label="Fold" onPress={() => onAct({ type: 'fold' })} style={styles.grow} />}
        {l.canCheck && <Button big variant="call" label="Check" onPress={() => onAct({ type: 'check' })} style={styles.grow} />}
        {l.canCall && (
          <Button
            big
            variant="call"
            label={`Call ${num(l.callAmount)}${l.callAmount >= me.stack ? ' (all-in)' : ''}`}
            onPress={() => onAct({ type: 'call' })}
            style={styles.grow}
          />
        )}
        {canAgg && (
          <Button
            big
            variant="raise"
            label={`${l.canBet ? 'Bet' : 'Raise to'} ${num(to)}${to === l.maxRaiseTo ? ' (all-in)' : ''}`}
            onPress={() => onAct({ type: l.canBet ? 'bet' : 'raise', amount: to })}
            style={styles.grow}
          />
        )}
      </View>
    </Panel>
  );
}

// ------------------------------------------------------------------ HUD

function Hud({ hand }: { hand: HandState }) {
  const me = hand.players[HUMAN_SEAT];
  const l = legalActions(hand, HUMAN_SEAT);
  const pot = potTotal(hand);
  const opponents = hand.players.filter((p, i) => i !== HUMAN_SEAT && !p.out && !p.folded).length;
  const [eq, setEq] = useState<EquityResult | null>(null);
  const key = `${me.hole.join()}|${hand.board.join()}|${opponents}`;

  useEffect(() => {
    let alive = true;
    setEq(null);
    compute
      .equity({
        players: [{ kind: 'hand', cards: [me.hole[0], me.hole[1]] }, ...Array.from({ length: opponents }, () => ({ kind: 'range' as const, combos: RANDOM_COMBOS }))],
        board: hand.board,
        samples: 4000,
        maxExactEvaluations: 300_000,
        seed: hand.seed,
      })
      .then((r) => alive && setEq(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Recompute only when the cards or number of opponents change.
  }, [key]);

  // A short-stacked call can only win the matched part of each opponent's chips.
  const effPot = winnablePot(hand.players.map((p) => p.totalBet), HUMAN_SEAT, l.callAmount);
  const req = requiredEquity(effPot, l.callAmount);
  const made = hand.board.length >= 3 ? describeScore(evaluate([...me.hole, ...hand.board])) : null;
  return (
    <Panel>
      <H3>Decision math</H3>
      {made && <Row label="Your hand" value={made} />}
      <Row label="Pot / to call" value={`${num(pot)} / ${num(l.callAmount)}`} />
      {l.toCall > 0 && (
        <>
          <Row label="Pot odds" value={`${potOddsRatio(effPot, l.callAmount).toFixed(2)} : 1`} />
          <Row
            label="Equity needed"
            value={pct(req)}
            badge={<ProvenanceBadge compact p={{ kind: 'exact', detail: `call / (pot + call) = ${l.callAmount} / ${effPot + l.callAmount}` }} />}
          />
        </>
      )}
      <Row
        label={`Equity vs ${opponents} random hand${opponents > 1 ? 's' : ''}`}
        value={eq ? pct(eq.equity[0]) : 'computing…'}
        valueColor={eq && l.toCall > 0 ? (eq.equity[0] >= req ? colors.pos : colors.neg) : undefined}
        badge={eq ? <ProvenanceBadge compact p={eq.provenance} /> : undefined}
      />
      <Muted small>
        Opponents who bet rarely hold random hands, so this overstates your equity against aggression. Review recomputes each
        decision against estimated ranges.
      </Muted>
    </Panel>
  );
}

function Row({ label, value, badge, valueColor }: { label: string; value: string; badge?: React.ReactNode; valueColor?: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <View style={styles.kvValue}>
        <Text style={[styles.kvText, valueColor ? { color: valueColor, fontWeight: '700' } : null]}>{value}</Text>
        {badge}
      </View>
    </View>
  );
}

function HandLog({ hand, names }: { hand: HandState | null; names: string[] }) {
  if (!hand?.log.length) return <Muted small>No hand in progress.</Muted>;
  return (
    <View style={{ gap: 2 }}>
      {hand.log.map((e, i) => (
        <Text
          key={i}
          style={{
            fontSize: 14,
            color: e.kind === 'street' ? colors.accent : e.kind === 'award' ? colors.pos : e.kind === 'action' ? colors.text : colors.muted,
            marginTop: e.kind === 'street' ? 4 : 0,
          }}
        >
          {describeLog(e, names)}
        </Text>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ settings

function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { settings, setSettings } = useStore();
  const [s, setS] = useState<TableSettings>(settings);
  useEffect(() => {
    if (visible) setS(settings);
  }, [visible, settings]);
  const setOpp = (n: number) =>
    setS({ ...s, opponents: Array.from({ length: n }, (_, i) => s.opponents[i] ?? { profileId: BOT_PROFILES[i % BOT_PROFILES.length].id }) });
  const cycle = (i: number) => {
    const idx = BOT_PROFILES.findIndex((p) => p.id === s.opponents[i].profileId);
    const next = BOT_PROFILES[(idx + 1) % BOT_PROFILES.length].id;
    setS({ ...s, opponents: s.opponents.map((o, k) => (k === i ? { profileId: next } : o)) });
  };
  const restarts =
    JSON.stringify([s.opponents, s.startingStackBB, s.bigBlind]) !== JSON.stringify([settings.opponents, settings.startingStackBB, settings.bigBlind]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <H3>Table settings</H3>
        <Body>Opponents</Body>
        <View style={styles.wrap}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <Chip key={n} label={n === 1 ? '1 (heads-up)' : String(n)} on={s.opponents.length === n} onPress={() => setOpp(n)} />
          ))}
        </View>
        <Muted small>Tap a seat to change its playing style.</Muted>
        {s.opponents.map((o, i) => {
          const p = profileById(o.profileId);
          return (
            <Pressable key={i} onPress={() => cycle(i)} style={styles.oppRow} accessibilityRole="button" accessibilityHint="Changes this opponent's style">
              <Text style={styles.kvLabel}>Seat {i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.kvText}>
                  {p.name} — {p.short}
                </Text>
                <Muted small>{p.description}</Muted>
              </View>
            </Pressable>
          );
        })}
        <Body>Starting stack</Body>
        <View style={styles.wrap}>
          {[20, 50, 100, 200].map((bb) => (
            <Chip key={bb} label={`${bb} BB`} on={s.startingStackBB === bb} onPress={() => setS({ ...s, startingStackBB: bb })} />
          ))}
        </View>
        <Body>Blinds</Body>
        <View style={styles.wrap}>
          {[2, 10, 20, 100].map((b) => (
            <Chip key={b} label={`${b / 2} / ${b}`} on={s.bigBlind === b} onPress={() => setS({ ...s, bigBlind: b })} />
          ))}
        </View>
        <Body>Computer speed</Body>
        <View style={styles.wrap}>
          {(
            [
              ['Fast', 150],
              ['Normal', 650],
              ['Slow', 1400],
            ] as const
          ).map(([label, ms]) => (
            <Chip key={label} label={label} on={s.botDelayMs === ms} onPress={() => setS({ ...s, botDelayMs: ms })} />
          ))}
        </View>
        <Toggle label="Show decision math while playing" value={s.showHud} onChange={(v) => setS({ ...s, showHud: v })} />
        <Toggle label="Study mode: show opponents' cards" value={s.showBotCards} onChange={(v) => setS({ ...s, showBotCards: v })} />
        <Toggle label="Analyze my decisions after each hand" value={s.autoReview} onChange={(v) => setS({ ...s, autoReview: v })} />
        {restarts && <Text style={{ color: colors.warn }}>Changing players, stacks or blinds starts a new session.</Text>}
        <View style={styles.row}>
          <Button variant="ghost" label="Defaults" onPress={() => setS(DEFAULT_SETTINGS)} />
          <View style={styles.grow} />
          <Button label="Cancel" onPress={onClose} />
          <Button
            variant="primary"
            label="Apply"
            onPress={() => {
              setSettings(s);
              onClose();
            }}
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.kv}>
      <Text style={[styles.kvText, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  felt: { position: 'absolute', backgroundColor: colors.felt, borderWidth: 10, borderColor: colors.feltEdge },
  center: { position: 'absolute', left: 0, alignItems: 'center', gap: 6 },
  board: { flexDirection: 'row', gap: 4 },
  pot: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 3 },
  potText: { color: colors.text, fontSize: 14 },
  seat: { position: 'absolute', width: SEAT_W, alignItems: 'center' },
  seatCards: { flexDirection: 'row', gap: 2, minHeight: 30, marginBottom: 2 },
  seatInfo: {
    width: SEAT_W,
    backgroundColor: 'rgba(10,20,16,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  seatToAct: { borderColor: colors.accent, borderWidth: 2 },
  seatWinner: { borderColor: colors.pos, borderWidth: 2 },
  seatName: { color: colors.text, fontSize: 11, fontWeight: '600' },
  seatStack: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  seatTag: { color: colors.muted, fontSize: 10 },
  seatHand: { color: colors.muted, fontSize: 9, textAlign: 'center' },
  bet: { color: '#111', backgroundColor: '#f2f2f2', borderRadius: 99, paddingHorizontal: 6, fontSize: 10, fontWeight: '700', marginTop: 2, overflow: 'hidden' },
  dealBar: { alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  result: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' },
  wrap: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  grow: { flexGrow: 1, flexBasis: 0 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, minHeight: 28 },
  kvLabel: { color: colors.muted, fontSize: 14, flexShrink: 1 },
  kvValue: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  kvText: { color: colors.text, fontSize: 15 },
  oppRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
});
