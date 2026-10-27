import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { Card, IconBadge } from "../ui/primitives";

/** Rough session length from the prescribed sets, rounded to 5 minutes. */
function estimateMinutes(totalSets: number): number {
  return Math.max(20, Math.round((5 + totalSets * 2.5) / 5) * 5);
}

/** Today's prescribed session with a direct "Log lift" action. */
export function TodayPlanCard({
  dayName,
  exerciseCount,
  totalSets,
  onLogLift,
  onViewPlan,
}: {
  dayName: string;
  exerciseCount: number;
  totalSets: number;
  onLogLift: () => void;
  onViewPlan: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const minutes = estimateMinutes(totalSets);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[typography.h2, styles.heading]}>Today&apos;s plan</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View full plan"
          onPress={onViewPlan}
          hitSlop={8}
          style={({ pressed }) => [styles.viewPlan, pressed && styles.pressed]}
        >
          <Text style={styles.viewPlanText}>View full plan</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.primary} />
        </Pressable>
      </View>

      <Card padded={false} style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${dayName}`}
          onPress={onLogLift}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        >
          <IconBadge name="barbell" bg={colors.blueSoft} color={colors.blue} size={50} rounded={false} />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {dayName}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"} · ~{minutes} min
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log lift"
          onPress={onLogLift}
          style={({ pressed }) => [styles.logButton, pressed && styles.pressed]}
        >
          <Text style={styles.logText}>Log lift</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.onPrimary} />
        </Pressable>
      </Card>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    section: { marginTop: spacing.xxl },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    heading: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
    viewPlan: { flexDirection: "row", alignItems: "center", gap: 2 },
    viewPlanText: { fontSize: 13, fontWeight: "700", color: t.colors.primary },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radii.xl,
      borderColor: t.colors.cardBorder,
      padding: spacing.md,
    },
    main: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, minWidth: 0 },
    text: { flex: 1, minWidth: 0, gap: 3 },
    title: { fontSize: 17, fontWeight: "700", color: t.colors.text },
    subtitle: { ...t.typography.small, color: t.colors.textDim },
    logButton: {
      height: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      borderRadius: radii.pill,
      backgroundColor: t.colors.primary,
      paddingHorizontal: spacing.md,
    },
    logText: { fontSize: 13, fontWeight: "700", color: t.colors.onPrimary },
    pressed: { opacity: 0.7 },
  }),
);
