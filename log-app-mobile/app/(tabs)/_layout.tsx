import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme/colors";

const TAB_ICONS: Record<string, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  today: { focused: "today", unfocused: "today-outline" },
  lift: { focused: "barbell", unfocused: "barbell-outline" },
  trends: { focused: "trending-up", unfocused: "trending-up-outline" },
  verdict: { focused: "ribbon", unfocused: "ribbon-outline" },
  plan: { focused: "clipboard", unfocused: "clipboard-outline" },
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();

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
              color={focused ? colors.rustSoft : colors.steel}
            />
          );
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
          borderTopWidth: 1,
          height: 48 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.rustSoft,
        tabBarInactiveTintColor: colors.steel,
        tabBarLabelStyle: {
          fontFamily: "Inter-Medium",
          fontSize: 11,
        },
      })}
    >
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="lift" options={{ title: "Lift" }} />
      <Tabs.Screen name="trends" options={{ title: "Trends" }} />
      <Tabs.Screen name="verdict" options={{ title: "Verdict" }} />
      <Tabs.Screen name="plan" options={{ title: "Plan" }} />
    </Tabs>
  );
}
