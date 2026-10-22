import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, EmptyState, IconBadge, SectionHeader } from "../ui/primitives";
import { formatSetLoad } from "../../utils/bodyweight";
import type { LiftLog } from "../../api/types";

export interface LiftGroup {
  name: string;
  sets: LiftLog[];
}

/** Best set today, measured by weight then reps (bodyweight sets never outrank loaded ones). */
function topSet(sets: LiftLog[]): LiftLog {
  return sets.reduce((best, s) => {
    if (s.weight_kg == null) return best;
    if (best.weight_kg == null) return s;
    return s.weight_kg > best.weight_kg ? s : best;
  }, sets[0]);
}

/** Compact one-row strips: exercise, top set and set count, nothing else. */
export function RecentLiftsRow({
  groups,
  onViewAll,
  onAddLift,
}: {
  groups: LiftGroup[];
  onViewAll: () => void;
  onAddLift: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  // Keep the section short; the rest lives behind "View All".
  const visible = groups.slice(0, 3);

  return (
    <View style={styles.section}>
      <SectionHeader title="Recent Lifts" actionLabel="View All" onAction={onViewAll} />
      {groups.length === 0 ? (
        <EmptyState compact icon="barbell-outline" title="No lifts logged yet." subtitle="Log your sets directly.">
          <Button label="Add Lift" icon="add" onPress={onAddLift} />
        </EmptyState>
      ) : (
        <View style={styles.list}>
          {visible.map((g) => {
            const top = topSet(g.sets);
            return (
              <Card key={g.name} padded={false} style={styles.liftCard}>
                <Pressable
                  onPress={onViewAll}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${g.name} history`}
                  style={styles.liftRow}
                >
                  <IconBadge name="barbell" bg={colors.greenSoft} color={colors.green} size={38} rounded={false} />
                  <View style={styles.liftText}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text style={[typography.small, styles.liftMeta]} numberOfLines={1}>
                      {formatSetLoad(top.weight_kg, top.reps)} · {g.sets.length}{" "}
                      {g.sets.length === 1 ? "set" : "sets"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    section: { marginTop: spacing.xxl },
    list: { gap: spacing.sm },
    liftCard: { borderColor: t.colors.cardBorder },
    liftRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
    liftText: { flex: 1, gap: 2, minWidth: 0 },
    liftMeta: { color: t.colors.textDim },
  }),
);
