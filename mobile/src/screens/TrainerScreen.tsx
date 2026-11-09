import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { randomSeed } from '@shared/core/rng';
import { DRILL_INFO, gradeDrill, type Drill, type DrillKind, type Grade } from '@shared/trainer/drills';
import { pct } from '@shared/ui/format';
import { useStore } from '@shared/ui/store';
import { compute } from '@shared/workers/client';
import { CardRow } from '@/components/Card';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { Body, Button, Chip, H3, Muted, Panel, Screen } from '@/components/ui';
import { colors, space } from '@/theme';

const KINDS = Object.keys(DRILL_INFO) as DrillKind[];
type Mode = DrillKind | 'mixed';

export function TrainerScreen() {
  const { addDrill } = useStore();
  const [mode, setMode] = useState<Mode>('call-fold');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const next = useCallback(() => {
    const kind = mode === 'mixed' ? KINDS[Math.floor(Math.random() * KINDS.length)] : mode;
    setLoading(true);
    setGrade(null);
    setError(null);
    compute
      .drill(kind, randomSeed())
      .then(setDrill)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mode]);

  useEffect(next, [next]);

  const submit = (answer: number) => {
    if (!drill || grade) return;
    const g = gradeDrill(drill, answer);
    setGrade(g);
    Haptics.notificationAsync(g.correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setScore((s) => ({ right: s.right + (g.correct ? 1 : 0), total: s.total + 1 }));
    addDrill({ kind: drill.kind, timestamp: Date.now(), correct: g.correct, score: g.score, evLoss: g.evLoss });
  };

  return (
    <Screen>
      <View style={styles.head}>
        <Muted>Make the decision first. The math comes afterwards.</Muted>
        <Text style={styles.score} accessibilityLiveRegion="polite">
          This session: {score.right} / {score.total}
        </Text>
      </View>
      <View style={styles.wrap}>
        {[...KINDS, 'mixed' as const].map((k) => (
          <Chip key={k} label={k === 'mixed' ? 'Mixed' : DRILL_INFO[k].title} on={mode === k} onPress={() => setMode(k)} />
        ))}
      </View>
      {mode !== 'mixed' && <Muted small>{DRILL_INFO[mode].blurb}</Muted>}
      {error && <Text style={{ color: colors.neg }}>Could not generate a drill: {error}</Text>}
      {loading && <ActivityIndicator color={colors.accent} />}
      {drill && !loading && <DrillView drill={drill} grade={grade} onSubmit={submit} />}
      {drill && grade && !loading && (
        <Panel style={{ borderColor: grade.correct ? colors.pos : colors.neg }}>
          <H3>
            {grade.correct ? '✓ Correct' : '✗ Not quite'} — {grade.headline}
          </H3>
          {grade.evLoss !== undefined && grade.evLoss > 0 && (
            <Text style={{ color: colors.neg }}>This choice costs {grade.evLoss.toFixed(1)} chips on average.</Text>
          )}
          {grade.steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepLabel}>{s.label}</Text>
              <Text style={styles.stepValue}>{s.value}</Text>
              {s.formula && <Text style={styles.formula}>{s.formula}</Text>}
            </View>
          ))}
          <View style={styles.provRow}>
            <Muted small>Result type:</Muted>
            <ProvenanceBadge p={drill.provenance} />
          </View>
          {drill.assumptions.map((a, i) => (
            <Muted key={i} small>
              • {a}
            </Muted>
          ))}
          <Button big variant="primary" label="Next question →" onPress={next} />
        </Panel>
      )}
    </Screen>
  );
}

function DrillView({ drill, grade, onSubmit }: { drill: Drill; grade: Grade | null; onSubmit: (a: number) => void }) {
  const [estimate, setEstimate] = useState(50);
  const [count, setCount] = useState('');
  useEffect(() => {
    setEstimate(50);
    setCount('');
  }, [drill.id]);
  const done = !!grade;

  return (
    <Panel>
      <Text style={styles.prompt}>{drill.prompt}</Text>
      <View style={styles.cards}>
        {drill.hero && drill.hero.length > 0 && (
          <View>
            <Text style={styles.label}>YOU</Text>
            <CardRow cards={drill.hero} size="lg" />
          </View>
        )}
        {drill.villain && (
          <View>
            <Text style={styles.label}>VILLAIN</Text>
            <CardRow cards={drill.villain} size="lg" />
          </View>
        )}
        {drill.board && (drill.board.length > 0 || drill.kind !== 'combos') && (
          <View>
            <Text style={styles.label}>BOARD</Text>
            <CardRow cards={drill.board} size="md" slots={drill.kind === 'combos' ? 0 : 5} />
          </View>
        )}
      </View>
      {drill.villainRangeName && (
        <Body>
          Assume villain's range is <Text style={{ fontWeight: '700' }}>{drill.villainRangeName}</Text>:{'\n'}
          <Text style={styles.formula}>{drill.villainRangeText}</Text>
        </Body>
      )}

      {drill.kind === 'call-fold' && (
        <View style={styles.row}>
          <Button big variant="fold" label="Fold" disabled={done} onPress={() => onSubmit(0)} style={styles.grow} />
          <Button big variant="call" label={`Call ${drill.bet}`} disabled={done} onPress={() => onSubmit(1)} style={styles.grow} />
        </View>
      )}
      {drill.kind === 'equity-estimate' && (
        <View style={{ gap: space.sm }}>
          <Body>
            Your estimate: <Text style={{ fontWeight: '700' }}>{estimate}%</Text>
            {grade ? `   ·   exact ${pct(drill.answer)}` : ''}
          </Body>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={estimate}
            disabled={done}
            onValueChange={setEstimate}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
            accessibilityLabel="Equity estimate in percent"
          />
          <Button variant="primary" label="Lock in" disabled={done} onPress={() => onSubmit(estimate / 100)} />
        </View>
      )}
      {(drill.kind === 'outs' || drill.kind === 'combos') && (
        <View style={styles.row}>
          <TextInput
            value={count}
            onChangeText={(t) => setCount(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            editable={!done}
            placeholder="?"
            placeholderTextColor={colors.muted}
            style={styles.input}
            accessibilityLabel={drill.kind === 'outs' ? 'Number of outs' : 'Number of combinations'}
            onSubmitEditing={() => count !== '' && onSubmit(Number(count))}
            returnKeyType="done"
          />
          <Button variant="primary" label="Check" disabled={done || count === ''} onPress={() => onSubmit(Number(count))} style={styles.grow} />
        </View>
      )}
      {drill.kind === 'bluff-math' && drill.choices && (
        <View style={styles.choices}>
          {drill.choices.map((c, i) => (
            <Button
              key={i}
              label={c}
              disabled={done}
              onPress={() => onSubmit(i)}
              style={[styles.choice, grade && i === drill.answer ? { borderColor: colors.pos, opacity: 1 } : null]}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  score: { color: colors.text, fontSize: 15, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  prompt: { color: colors.text, fontSize: 17, fontWeight: '600' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  label: { color: colors.muted, fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  grow: { flexGrow: 1, flexBasis: 0 },
  input: {
    width: 100,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    fontSize: 20,
    textAlign: 'center',
    backgroundColor: colors.bg,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { flexBasis: '45%', flexGrow: 1 },
  step: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, gap: 2 },
  stepLabel: { color: colors.muted, fontSize: 13 },
  stepValue: { color: colors.text, fontSize: 15 },
  formula: { color: colors.muted, fontSize: 12, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  provRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
