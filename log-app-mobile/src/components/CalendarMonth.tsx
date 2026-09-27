import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { monthLabel, monthMatrix } from "../utils/date";

/** Month calendar with workout dots and a selectable day. */
export function CalendarMonth({
  month,
  onPrevMonth,
  onNextMonth,
  selected,
  onSelect,
  marked,
  max,
}: {
  month: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  selected: string;
  onSelect: (iso: string) => void;
  marked: Set<string>;
  max?: string;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const cells = monthMatrix(month.getUTCFullYear(), month.getUTCMonth());
  const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable onPress={onPrevMonth} hitSlop={8} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={18} color={colors.textDim} />
        </Pressable>
        <Text style={typography.h3}>{monthLabel(month)}</Text>
        <Pressable onPress={onNextMonth} hitSlop={8} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {weekdays.map((w, i) => (
          <Text key={`${w}-${i}`} style={[styles.weekday, styles.cell]}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const isSelected = cell.iso === selected;
          const isMarked = marked.has(cell.iso);
          const isFuture = max != null && cell.iso > max;
          return (
            <Pressable
              key={cell.iso}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: isFuture }}
              onPress={() => !isFuture && onSelect(cell.iso)}
              disabled={isFuture}
              style={styles.cell}
            >
              <View style={[styles.dayCircle, isSelected && styles.dayCircleActive]}>
                <Text
                  style={[
                    styles.dayText,
                    !cell.inMonth && styles.dayTextOut,
                    isSelected && styles.dayTextActive,
                  ]}
                >
                  {cell.day}
                </Text>
              </View>
              <View style={[styles.dot, isMarked && styles.dotActive]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.sm,
    },
    weekRow: { flexDirection: "row" },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: `${100 / 7}%`, alignItems: "center", gap: 3, paddingVertical: 4 },
    weekday: { ...t.typography.caption, color: t.colors.textDim, textAlign: "center" },
    dayCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    dayCircleActive: { backgroundColor: t.colors.primary },
    dayText: { fontSize: 14, fontWeight: "600", color: t.colors.text },
    dayTextOut: { color: t.colors.textMuted },
    dayTextActive: { color: t.colors.onPrimary },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "transparent" },
    dotActive: { backgroundColor: t.colors.primary },
  }),
);
