import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii } from "../theme/spacing";
import { addDays, dayNumber, parseIso, weekdayShort } from "../utils/date";

/**
 * Horizontal day selector (7-day rolling window centred on the selected date).
 * The selected chip is filled orange with a dot, matching the design.
 */
export function DateStrip({
  selected,
  today,
  onSelect,
}: {
  selected: string;
  today: string;
  onSelect: (iso: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const days = Array.from({ length: 7 }, (_, i) => addDays(selected, i - 3));
  const canGoForward = selected < today;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous week"
        hitSlop={8}
        style={styles.arrow}
        onPress={() => onSelect(addDays(selected, -7))}
      >
        <Ionicons name="chevron-back" size={14} color={colors.textDim} />
      </Pressable>

      <View style={styles.days}>
        {days.map((iso) => {
          const active = iso === selected;
          const isFuture = iso > today;
          return (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: isFuture }}
              onPress={() => !isFuture && onSelect(iso)}
              disabled={isFuture}
              style={[styles.day, active && styles.dayActive, isFuture && styles.dayFuture]}
            >
              <Text style={[styles.weekday, active && styles.textActive]}>
                {weekdayShort(iso)}
              </Text>
              <Text style={[styles.number, active && styles.textActive]}>{dayNumber(iso)}</Text>
              <View style={[styles.dot, active && styles.dotActive]} />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next week"
        hitSlop={8}
        style={styles.arrow}
        onPress={() => canGoForward && onSelect(addDays(selected, 7))}
        disabled={!canGoForward}
      >
        <Ionicons
          name="chevron-forward"
          size={14}
          color={canGoForward ? colors.textDim : colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

/** Formats the strip's selected date for a header chip. */
export function stripLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  return parseIso(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    wrap: { flexDirection: "row", alignItems: "center", gap: 4 },
    arrow: {
      width: 28,
      height: 40,
      borderRadius: radii.sm,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    days: { flex: 1, flexDirection: "row", gap: 3 },
    day: {
      flex: 1,
      alignItems: "center",
      gap: 1,
      paddingVertical: 6,
      borderRadius: radii.sm,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      minWidth: 0,
    },
    dayActive: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
    dayFuture: { opacity: 0.4 },
    weekday: { fontSize: 10, fontWeight: "600", color: t.colors.textDim },
    number: { fontSize: 13, fontWeight: "700", color: t.colors.text },
    textActive: { color: t.colors.onPrimary },
    dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "transparent" },
    dotActive: { backgroundColor: t.colors.onPrimary },
  }),
);
