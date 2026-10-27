import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { parseIso } from "../../utils/date";

function headerDate(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Today's top bar: a menu button on the left, the screen title and the selected
 * date in the middle, and day/settings actions on the right.
 */
export function TodayHeader({
  date,
  onMenu,
  onCalendar,
  onSettings,
}: {
  date: string;
  onMenu: () => void;
  onCalendar: () => void;
  onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <View style={[styles.row, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        onPress={onMenu}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        <Ionicons name="menu" size={22} color={colors.text} />
      </Pressable>

      <View style={styles.titleBlock}>
        <Text style={[typography.h1, styles.title]} numberOfLines={1}>
          Today
        </Text>
        <Text style={[typography.small, styles.date]} numberOfLines={1}>
          {headerDate(date)}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a date"
          onPress={onCalendar}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Ionicons name="calendar-outline" size={21} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={onSettings}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Ionicons name="settings-outline" size={21} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    titleBlock: { flex: 1, minWidth: 0, gap: 1 },
    title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
    date: { color: t.colors.textDim, fontSize: 13, fontWeight: "500" },
    actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    action: {
      width: 44,
      height: 44,
      borderRadius: radii.lg,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    pressed: { opacity: 0.7 },
  }),
);
