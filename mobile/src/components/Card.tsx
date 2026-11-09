import { StyleSheet, Text, View } from 'react-native';
import { RANK_CHARS, SUIT_NAMES, SUIT_SYMBOLS, rankOf, suitOf, type Card } from '@shared/core/cards';
import { colors } from '@/theme';

const SIZES = {
  xs: { w: 22, h: 30, f: 11 },
  sm: { w: 30, h: 42, f: 14 },
  md: { w: 40, h: 56, f: 18 },
  lg: { w: 52, h: 72, f: 22 },
};
const SUIT_COLOR = [colors.club, colors.diamond, colors.heart, colors.spade];

export function CardView({ card, size = 'md', faceDown = false }: { card?: Card | null; size?: keyof typeof SIZES; faceDown?: boolean }) {
  const s = SIZES[size];
  const box = { width: s.w, height: s.h, borderRadius: size === 'lg' ? 8 : 6 };
  if (card === undefined || card === null) return <View style={[styles.card, styles.empty, box]} accessibilityLabel="empty card slot" />;
  if (faceDown) return <View style={[styles.card, styles.back, box]} accessibilityLabel="face-down card" />;
  const r = rankOf(card);
  const su = suitOf(card);
  const rank = RANK_CHARS[r] === 'T' ? '10' : RANK_CHARS[r];
  return (
    <View style={[styles.card, box]} accessible accessibilityLabel={`${rank} of ${SUIT_NAMES[su]}`}>
      <Text style={[styles.rank, { fontSize: s.f, color: SUIT_COLOR[su] }]} allowFontScaling={false}>
        {rank}
      </Text>
      <Text style={{ fontSize: s.f * 0.9, color: SUIT_COLOR[su], lineHeight: s.f * 1.05 }} allowFontScaling={false}>
        {SUIT_SYMBOLS[su]}
      </Text>
    </View>
  );
}

export function CardRow({ cards, size = 'sm', slots = 0 }: { cards: Card[]; size?: keyof typeof SIZES; slots?: number }) {
  const out: (Card | null)[] = [...cards];
  while (out.length < slots) out.push(null);
  return (
    <View style={styles.row}>
      {out.map((c, i) => (
        <CardView key={i} card={c} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d8d4c8',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  rank: { fontWeight: '700', lineHeight: undefined },
  back: { backgroundColor: '#8b2323', borderColor: '#f4efe3', borderWidth: 2 },
  empty: { backgroundColor: 'rgba(255,255,255,0.06)', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)', shadowOpacity: 0, elevation: 0 },
  row: { flexDirection: 'row', gap: 4 },
});
