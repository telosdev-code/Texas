import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { colors } from '@/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 20 }} allowFontScaling={false}>{glyph}</Text>;
  };

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Play', headerTitle: "Hold'em Math Lab", tabBarIcon: icon('♠') }} />
      <Tabs.Screen name="train" options={{ title: 'Train', headerTitle: 'Decision trainer', tabBarIcon: icon('◎') }} />
      <Tabs.Screen name="equity" options={{ title: 'Equity', tabBarIcon: icon('⚖') }} />
      <Tabs.Screen name="ranges" options={{ title: 'Ranges', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="review" options={{ title: 'Review', headerTitle: 'Review & progress', tabBarIcon: icon('↗') }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: icon('✎') }} />
    </Tabs>
  );
}
