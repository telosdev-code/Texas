import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PROVENANCE_EXPLAINER, PROVENANCE_LABEL, type Provenance } from '@shared/core/provenance';
import { colors } from '@/theme';

const ICON: Record<Provenance['kind'], string> = { exact: '=', 'monte-carlo': '≈', heuristic: '~', solver: '⚖' };
const COLOR: Record<Provenance['kind'], string> = {
  exact: colors.provExact,
  'monte-carlo': colors.provMc,
  heuristic: colors.provHeur,
  solver: colors.provSolver,
};

export function provenanceDetail(p: Provenance): string {
  switch (p.kind) {
    case 'exact':
    case 'heuristic':
      return p.detail;
    case 'monte-carlo':
      return `${p.samples.toLocaleString('en-US')} samples, 95% CI ±${(1.96 * p.stdError * 100).toFixed(2)} pts.${p.detail ? ' ' + p.detail : ''}`;
    case 'solver':
      return `${p.algorithm} on ${p.game}, ${p.iterations.toLocaleString('en-US')} iterations, exploitability ${p.exploitability.toExponential(2)}.`;
  }
}

/** Tappable tag saying whether a number is exact, a Monte Carlo estimate, a heuristic, or solver output. */
export function ProvenanceBadge({ p, compact = false }: { p: Provenance; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const c = COLOR[p.kind];
  const label = compact ? PROVENANCE_LABEL[p.kind].split(' ')[0] : PROVENANCE_LABEL[p.kind];
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${PROVENANCE_LABEL[p.kind]}. ${provenanceDetail(p)}`}
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        style={[styles.badge, { borderColor: c, borderStyle: p.kind === 'heuristic' ? 'dashed' : 'solid' }]}
      >
        <Text style={[styles.text, { color: c }]}>
          {ICON[p.kind]} {label}
        </Text>
      </Pressable>
      {open && (
        <View style={styles.pop}>
          <Text style={styles.popText}>
            <Text style={{ fontWeight: '700' }}>{PROVENANCE_LABEL[p.kind]}. </Text>
            {PROVENANCE_EXPLAINER[p.kind]}
          </Text>
          <Text style={[styles.popText, { fontStyle: 'italic', marginTop: 4 }]}>{provenanceDetail(p)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 1, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '600' },
  pop: { marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: '#0d1915', borderWidth: 1, borderColor: colors.border, maxWidth: 320 },
  popText: { color: colors.text, fontSize: 13 },
});
