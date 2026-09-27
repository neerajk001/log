import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { parsePositiveInt, parsePositiveNumber } from "../utils/parse";

export interface SetEntry {
  weight: string;
  reps: string;
  done: boolean;
}

export function makeEmptySets(count: number): SetEntry[] {
  return Array.from({ length: Math.max(1, count) }, () => ({ weight: "", reps: "", done: false }));
}

export const MAX_SET = { weight_kg: 9999, reps: 9999 } as const;

export function isValidSet(set: SetEntry): boolean {
  return (
    parsePositiveNumber(set.weight, MAX_SET.weight_kg) != null &&
    parsePositiveInt(set.reps, MAX_SET.reps) != null
  );
}

/**
 * Set logger table: Set | Weight (kg) | Reps | done toggle, matching the
 * design's numbered rows with inline inputs.
 */
export function SetTable({
  sets,
  onUpdate,
  onToggleDone,
  onRemove,
  columns = true,
}: {
  sets: SetEntry[];
  onUpdate: (index: number, patch: Partial<SetEntry>) => void;
  onToggleDone: (index: number) => void;
  onRemove?: (index: number) => void;
  columns?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.table}>
      {columns ? (
        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, styles.colSet]}>Set</Text>
          <Text style={[styles.headerCell, styles.colInput]}>Weight (kg)</Text>
          <Text style={[styles.headerCell, styles.colInput]}>Reps</Text>
          <View style={styles.colDone} />
        </View>
      ) : null}

      {sets.map((set, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.setBadge, set.done && styles.setBadgeDone]}>
            <Text style={[styles.setBadgeText, set.done && styles.setBadgeTextDone]}>{i + 1}</Text>
          </View>

          <TextInput
            value={set.weight}
            onChangeText={(t) => onUpdate(i, { weight: t })}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.colInput]}
          />
          <TextInput
            value={set.reps}
            onChangeText={(t) => onUpdate(i, { reps: t })}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.colInput]}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: set.done }}
            accessibilityLabel={`Set ${i + 1} done`}
            onPress={() => onToggleDone(i)}
            style={[styles.done, set.done && styles.doneActive]}
          >
            {set.done ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
          </Pressable>

          {onRemove ? (
            <Pressable onPress={() => onRemove(i)} hitSlop={8} accessibilityLabel={`Remove set ${i + 1}`}>
              <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    table: { gap: spacing.sm },
    headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 2 },
    headerCell: { ...t.typography.caption, color: t.colors.textDim },
    colSet: { width: 32, textAlign: "center" },
    colInput: { flex: 1 },
    colDone: { width: 34 },

    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    setBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: t.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    setBadgeDone: { backgroundColor: t.colors.primarySoft },
    setBadgeText: { fontSize: 13, fontWeight: "700", color: t.colors.textDim },
    setBadgeTextDone: { color: t.colors.primary },

    input: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.sm,
      height: 44,
      paddingHorizontal: spacing.md,
      fontSize: 15,
      color: t.colors.text,
    },

    done: {
      width: 34,
      height: 34,
      borderRadius: radii.sm,
      borderWidth: 1.5,
      borderColor: t.colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    doneActive: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
  }),
);
