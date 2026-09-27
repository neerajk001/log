import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/colors";
import { radii, spacing } from "../theme/spacing";
import type { VerdictKind } from "../api/types";

const LABELS: Record<VerdictKind, string> = {
  hold: "Hold Steady",
  adjust_calories: "Adjust Calories",
  check_recovery: "Check Recovery",
};

function verdictTones(colors: Palette): Record<VerdictKind, { bg: string; border: string; color: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> {
  return {
    hold: { bg: colors.successSoft, border: colors.success, color: colors.success, icon: "checkmark-circle" },
    adjust_calories: { bg: colors.warningSoft, border: colors.warning, color: colors.warning, icon: "swap-vertical" },
    check_recovery: { bg: colors.dangerSoft, border: colors.danger, color: colors.danger, icon: "bed-outline" },
  };
}

/** Weekly verdict badge — the product's signature output. */
export function VerdictStamp({ verdict }: { verdict: VerdictKind }) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const tone = verdictTones(colors)[verdict];
  return (
    <View style={[styles.stamp, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Ionicons name={tone.icon} size={22} color={tone.color} />
      <Text style={[typography.h2, styles.label, { color: tone.color }]}>
        {LABELS[verdict].toUpperCase()}
      </Text>
    </View>
  );
}

const useStyles = makeUseStyles(() =>
  StyleSheet.create({
    stamp: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      borderRadius: radii.lg,
      borderWidth: 2,
    },
    label: { letterSpacing: 1, fontSize: 18 },
  }),
);
