import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { REVIEW_PROVENANCE, type StoredHand, type Verdict } from '@shared/review/analysis';
import { drillStats, handStats } from '@shared/review/progress';
import { DRILL_INFO, type DrillKind } from '@shared/trainer/drills';
import { describeLog, num, pct, prettyCards, signed } from '@shared/ui/format';
import { useStore } from '@shared/ui/store';
import { compute } from '@shared/workers/client';
import { CardRow } from '@/components/Card';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { Button, Chip, H3, Muted, Panel, Screen } from '@/components/ui';
import { colors, radius, space } from '@/theme';

const VERDICT: Record<Verdict, { label: string; color: string }> = {
  good: { label: '✓ Good', color: colors.pos },
  close: { label: '≈ Close', color: colors.provExact },
  mistake: { label: '✗ Likely mistake', color: colors.neg },
  info: { label: 'ℹ Info', color: colors.muted },
};

export function ReviewScreen() {
  const { hands, setReview, clearHands } = useStore();
  const [tab, setTab] = useState<'hands' | 'progress'>('hands');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ordered = useMemo(() => [...hands].reverse(), [hands]);
  const hand = hands.find((h) => h.id === selected) ?? ordered[0];

  const analyzeAll = async () => {
    setBusy(true);
    for (const h of hands.filter((x) => !x.review)) {
      try {
        setReview(h.id, await compute.review(h));
      } catch {
        /* skip */
      }
    }
    setBusy(false);
  };

  return (
    <Screen>
      <View style={styles.provRow}>
        <Muted small>Call/fold decisions vs. equity needed, against opponent ranges estimated from their actions.</Muted>
        <ProvenanceBadge p={REVIEW_PROVENANCE} />
      </View>
      <View style={styles.wrap}>
        <Chip label={`Hand history (${hands.length})`} on={tab === 'hands'} onPress={() => setTab('hands')} />
        <Chip label="Progress" on={tab === 'progress'} onPress={() => setTab('progress')} />
      </View>
      {tab === 'progress' ? (
        <Progress />
      ) : hands.length === 0 ? (
        <Muted>No hands yet. Play some hands and they will appear here.</Muted>
      ) : (
        <>
          <Panel>
            <View style={styles.wrap}>
              <Button label={busy ? 'Analyzing…' : 'Analyze all'} onPress={analyzeAll} disabled={busy || hands.every((h) => h.review)} />
              <Button
                variant="ghost"
                label="Clear"
                onPress={() =>
                  Alert.alert('Delete all stored hands?', undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: clearHands },
                  ])
                }
              />
            </View>
            {ordered.slice(0, 40).map((h) => {
              const net = h.net[h.humanSeat] / h.config.bigBlind;
              const on = hand?.id === h.id;
              return (
                <Pressable key={h.id} onPress={() => setSelected(h.id)} style={[styles.handItem, on && styles.handOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={styles.hn}>#{h.handNumber}</Text>
                  <CardRow cards={h.players[h.humanSeat].hole} size="xs" />
                  <Text style={{ flex: 1, color: net > 0 ? colors.pos : net < 0 ? colors.neg : colors.muted }}>{signed(net)} BB</Text>
                  <Text style={{ color: h.review ? (h.review.mistakes ? colors.neg : colors.pos) : colors.muted }}>
                    {h.review ? (h.review.mistakes ? `${h.review.mistakes} ✗` : '✓') : '–'}
                  </Text>
                </Pressable>
              );
            })}
          </Panel>
          {hand && <HandDetail hand={hand} />}
        </>
      )}
    </Screen>
  );
}

function HandDetail({ hand }: { hand: StoredHand }) {
  const { setReview } = useStore();
  const [busy, setBusy] = useState(false);
  const names = hand.players.map((p) => p.name);
  const byLog = new Map(hand.review?.decisions.map((d) => [d.logIndex, d]) ?? []);
  const bb = hand.config.bigBlind;
  return (
    <Panel>
      <H3>Hand #{hand.handNumber}</H3>
      <View style={styles.wrap}>
        <CardRow cards={hand.players[hand.humanSeat].hole} size="md" />
        <View style={{ width: space.md }} />
        <CardRow cards={hand.board} size="md" slots={5} />
      </View>
      {hand.showdown && (
        <Muted small>
          Showdown:{' '}
          {hand.players
            .map((p, i) => (hand.descriptions[i] ? `${p.name} ${prettyCards(p.hole)} (${hand.descriptions[i]})` : null))
            .filter(Boolean)
            .join(' · ')}
        </Muted>
      )}
      {!hand.review && (
        <Button
          variant="primary"
          label={busy ? 'Analyzing…' : 'Analyze my decisions'}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            compute.review(hand).then((r) => setReview(hand.id, r)).finally(() => setBusy(false));
          }}
        />
      )}
      {hand.review && (
        <Text style={styles.text}>
          {hand.review.decisions.length} decisions · {hand.review.mistakes} likely mistake{hand.review.mistakes === 1 ? '' : 's'}
          {hand.review.evLossBB > 0 ? ` · est. cost ${hand.review.evLossBB.toFixed(2)} BB` : ''}
        </Text>
      )}
      {hand.log.map((e, i) => {
        const d = byLog.get(i);
        return (
          <View key={i}>
            <Text style={[styles.logLine, e.kind === 'street' && { color: colors.accent, marginTop: 6 }, e.kind === 'award' && { color: colors.pos }, d && { fontWeight: '700' }]}>
              {describeLog(e, names)}
            </Text>
            {d && (
              <View style={[styles.decision, { borderLeftColor: VERDICT[d.verdict].color }]}>
                <View style={styles.between}>
                  <Text style={[styles.text, { fontWeight: '700' }]}>{VERDICT[d.verdict].label}</Text>
                  {d.evLossBB > 0 && <Text style={{ color: colors.neg }}>−{d.evLossBB.toFixed(2)} BB</Text>}
                </View>
                <Text style={styles.text}>{d.note}</Text>
                {d.toCall > 0 && (
                  <Muted small>
                    Needed {pct(d.required)} ({d.toCall} / {d.pot + d.toCall}) · EV(call) {signed(d.evCall / bb, 2)} BB
                  </Muted>
                )}
                <View style={styles.provRow}>
                  <Muted small>Equity {pct(d.equity)}</Muted>
                  <ProvenanceBadge compact p={d.equityProvenance} />
                </View>
                {d.opponents.map((o) => (
                  <Muted key={o.seat} small>
                    {o.name}: {o.reason} → top {pct(o.fraction, 0)}
                  </Muted>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </Panel>
  );
}

function Progress() {
  const { hands, drills } = useStore();
  const hs = handStats(hands);
  const ds = drillStats(drills, Object.keys(DRILL_INFO) as DrillKind[]);
  const tiles: [string, string][] = [
    [num(hs.hands), 'hands played'],
    [signed(hs.netBB, 1), 'net big blinds (simulated)'],
    [hs.decisions ? pct(hs.mistakes / hs.decisions, 0) : '–', 'decisions flagged'],
    [hs.reviewed ? hs.evLossBBPer100.toFixed(1) : '–', 'est. BB lost / 100 hands'],
  ];
  return (
    <>
      <View style={styles.tiles}>
        {tiles.map(([v, l]) => (
          <View key={l} style={styles.tile}>
            <Text style={styles.tileNum}>{v}</Text>
            <Muted small>{l}</Muted>
          </View>
        ))}
      </View>
      <Panel>
        <H3>Trainer accuracy</H3>
        {ds.map((d) => (
          <View key={d.kind} style={styles.between}>
            <Text style={[styles.text, { flex: 1 }]}>{DRILL_INFO[d.kind].title}</Text>
            <Text style={styles.text}>
              {d.attempts ? `${pct(d.accuracy, 0)} · last 20 ${pct(d.recentAccuracy, 0)} · ${d.attempts}×` : '–'}
            </Text>
          </View>
        ))}
      </Panel>
      <Muted small>Trend charts are coming to the mobile app; the web app shows them today.</Muted>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  provRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  handItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.sm },
  handOn: { backgroundColor: colors.surface2 },
  hn: { color: colors.muted, width: 40, fontSize: 13 },
  text: { color: colors.text, fontSize: 15 },
  logLine: { color: colors.text, fontSize: 14, paddingVertical: 1 },
  decision: { backgroundColor: colors.surface2, borderLeftWidth: 4, borderRadius: radius.md, padding: space.md, marginVertical: 6, gap: 4 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.md, flexBasis: '47%', flexGrow: 1 },
  tileNum: { color: colors.text, fontSize: 24, fontWeight: '700' },
});
