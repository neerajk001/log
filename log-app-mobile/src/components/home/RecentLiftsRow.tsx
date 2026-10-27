import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, EmptyState, IconBadge, SectionHeader } from "../ui/primitives";
import { formatLiftSet } from "../../utils/plate";
import type { LiftLog } from "../../api/types";

export interface LiftGroup {
  name: string;
  sets: LiftLog[];
}

/**
 * Best set today: kg outranks a machine position, which outranks bodyweight;
 * within a mode compare load/position (or reps for bodyweight).
 */
function topSet(sets: LiftLog[]): LiftLog {
  const rank = (set: LiftLog): number =>
    set.weight_kg != null ? 2 : set.plate_position != null ? 1 : 0;
  return sets.reduce((best, set) => {
    const a = rank(set);
    const b = rank(best);
    if (a !== b) return a > b ? set : best;
    if (a === 2) {
      return (set.weight_kg ?? 0) > (best.weight_kg ?? 0) ? set : best;
    }
    if (a === 1) {
      return (set.plate_position ?? 0) > (best.plate_position ?? 0) ? set : best;
    }
    return set.reps > best.reps ? set : best;
  }, sets[0]);
}

/**
 * Today's exercises as expandable strips: tap one to see every set logged for
 * it. Three show by default; the rest stay on this screen behind "View all".
 */
export function RecentLiftsRow({
  groups,
  onAddLift,
}: {
  groups: LiftGroup[];
  onAddLift: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? groups : groups.slice(0, 3);

  const toggle = (name: string) =>
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <View style={styles.section}>
      <SectionHeader title="Recent Lifts" />
      {groups.length === 0 ? (
        <EmptyState compact icon="barbell-outline" title="No lifts logged yet." subtitle="Log your sets directly.">
          <Button label="Add Lift" icon="add" onPress={onAddLift} />
        </EmptyState>
      ) : (
        <>
          <View style={styles.list}>
            {visible.map((g) => {
              const top = topSet(g.sets);
              const isOpen = !!expanded[g.name];
              return (
                <Card key={g.name} padded={false} style={styles.liftCard}>
                  <Pressable
                    onPress={() => toggle(g.name)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={`${g.name}, ${g.sets.length} sets`}
                    style={({ pressed }) => [styles.liftRow, pressed && styles.pressed]}
                  >
                    <IconBadge name="barbell" bg={colors.greenSoft} color={colors.green} size={38} rounded={false} />
                    <View style={styles.liftText}>
                      <Text style={typography.bodyStrong} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={[typography.small, styles.liftMeta]} numberOfLines={1}>
                        {formatLiftSet(top)} · {g.sets.length} {g.sets.length === 1 ? "set" : "sets"}
                      </Text>
                    </View>
                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={colors.textMuted}
                    />
                  </Pressable>

                  {isOpen ? (
                    <View style={styles.sets}>
                      {g.sets.map((set, i) => (
                        <View key={set.id} style={styles.setRow}>
                          <Text style={styles.setLabel}>Set {i + 1}</Text>
                          <Text style={styles.setValue}>{formatLiftSet(set)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>

          {groups.length > 3 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showAll ? "Show fewer lifts" : "View all lifts"}
              onPress={() => setShowAll((v) => !v)}
              hitSlop={8}
              style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
            >
              <Text style={styles.viewAllText}>
                {showAll ? "Show less" : "View all"}
              </Text>
              <Ionicons
                name={showAll ? "chevron-up" : "chevron-down"}
                size={15}
                color={colors.primary}
              />
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    section: { marginTop: spacing.xxl },
    list: { gap: spacing.sm },
    liftCard: { borderColor: t.colors.cardBorder, overflow: "hidden" },
    liftRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
    liftText: { flex: 1, gap: 2, minWidth: 0 },
    liftMeta: { color: t.colors.textDim },
    pressed: { opacity: 0.7 },

    sets: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: 6,
    },
    setRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    setLabel: { ...t.typography.caption, color: t.colors.textMuted },
    setValue: { ...t.typography.small, fontWeight: "600", color: t.colors.text },

    viewAll: {
      alignSelf: "flex-end",
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingVertical: spacing.sm,
      opacity: 0.55,
    },
    viewAllPressed: { opacity: 0.35 },
    viewAllText: { fontSize: 13, fontWeight: "700", color: t.colors.primary },
  }),
);
