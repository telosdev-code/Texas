import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '@/theme';

type Variant = 'default' | 'primary' | 'ghost' | 'fold' | 'call' | 'raise';
const VARIANT: Record<Variant, { bg: string; border: string; text: string }> = {
  default: { bg: colors.surface2, border: colors.border, text: colors.text },
  primary: { bg: colors.accent, border: colors.accent, text: colors.accentInk },
  ghost: { bg: 'transparent', border: colors.border, text: colors.text },
  fold: { bg: '#3a2323', border: '#5a3030', text: colors.text },
  call: { bg: '#1d3a4a', border: '#2b5568', text: colors.text },
  raise: { bg: '#4a3a12', border: '#7a5f1c', text: '#ffe7a8' },
};

export function Button({
  label,
  onPress,
  variant = 'default',
  disabled = false,
  big = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  big?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = VARIANT[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: v.bg, borderColor: v.border, minHeight: big ? 52 : 44, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[styles.btnText, { color: v.text, fontSize: big ? 17 : 15 }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={[styles.chip, on && { borderColor: colors.accent, backgroundColor: colors.surface2 }]}
    >
      <Text style={[styles.chipText, on && { color: colors.accent, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2} accessibilityRole="header">{children}</Text>;
}
export function H3({ children }: { children: ReactNode }) {
  return <Text style={styles.h3} accessibilityRole="header">{children}</Text>;
}
export function Muted({ children, small }: { children: ReactNode; small?: boolean }) {
  return <Text style={[styles.muted, small && { fontSize: 13 }]}>{children}</Text>;
}
export function Body({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xl * 2, gap: space.md },
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  btn: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontWeight: '600', textAlign: 'center' },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bg },
  chipText: { color: colors.text, fontSize: 14 },
  h2: { color: colors.text, fontSize: 22, fontWeight: '700' },
  h3: { color: colors.text, fontSize: 17, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 15 },
  body: { color: colors.text, fontSize: 15 },
});
