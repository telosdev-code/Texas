import { Linking, StyleSheet, Text, View } from 'react-native';
import { Body, Button, H2, Muted, Panel, Screen } from '@/components/ui';
import { colors } from '@/theme';

/** Placeholder for web features not yet ported to the native app. */
export function NotPortedScreen({ title, summary, plan }: { title: string; summary: string; plan: string[] }) {
  return (
    <Screen>
      <H2>{title}</H2>
      <Body>{summary}</Body>
      <Panel>
        <Text style={styles.badge}>Not yet in the mobile app</Text>
        <Muted small>Planned for the React Native port:</Muted>
        <View style={{ gap: 4 }}>
          {plan.map((p) => (
            <Muted key={p} small>
              • {p}
            </Muted>
          ))}
        </View>
      </Panel>
      <Button label="See the roadmap on GitHub" onPress={() => Linking.openURL('https://github.com/telosdev-code/Texas')} />
    </Screen>
  );
}

const styles = StyleSheet.create({ badge: { color: colors.warn, fontWeight: '700' } });
