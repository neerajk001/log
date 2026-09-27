import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/theme/ThemeContext";

type IconPair = {
  focused: keyof typeof Ionicons.glyphMap;
  unfocused: keyof typeof Ionicons.glyphMap;
};

const TAB_ICONS: Record<string, IconPair> = {
  today: { focused: "home", unfocused: "home-outline" },
  lift: { focused: "barbell", unfocused: "barbell-outline" },
  insights: { focused: "stats-chart", unfocused: "stats-chart-outline" },
  history: { focused: "time", unfocused: "time-outline" },
  plan: { focused: "clipboard", unfocused: "clipboard-outline" },
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, size }) => {
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          return (
            <Ionicons
              name={focused ? icons.focused : icons.unfocused}
              size={size}
              color={focused ? colors.primary : colors.textMuted}
            />
          );
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom + (Platform.OS === "android" ? 6 : 4),
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      })}
    >
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="lift" options={{ title: "Lift" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="plan" options={{ title: "Plan" }} />
    </Tabs>
  );
}
