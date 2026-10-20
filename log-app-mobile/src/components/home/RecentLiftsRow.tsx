import { ScrollView, StyleSheet, Text, View } from "react-native";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, EmptyState, SectionHeader } from "../ui/primitives";
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

/** Exercises for the given day's lift groups — compact cards beside each other. */
export function RecentLiftsRow({
  groups,
  deltas,
  onViewAll,
  onAddLift,
}: {
  groups: LiftGroup[];
  /** Change in top-set weight vs the previous session, per exercise (kg). */
  deltas: Map<string, number>;
  onViewAll: () => void;
  onAddLift: () => void;
}) {
  const { typography } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.section}>
      <SectionHeader title="Recent Lifts" actionLabel="View All" onAction={onViewAll} />
      {groups.length === 0 ? (
        <EmptyState compact icon="barbell-outline" title="No lifts logged yet." subtitle="Log your sets directly.">
          <Button label="Add Lift" icon="add" onPress={onAddLift} />
        </EmptyState>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {groups.map((g) => {
            const top = topSet(g.sets);
            const delta = deltas.get(g.name);
            const caption =
              delta != null && delta !== 0
                ? `${delta > 0 ? "+" : "−"}${Math.abs(delta)} kg`
                : g.sets.length === 1
                  ? "Best set today"
                  : `${g.sets.length} sets`;
            return (
              <Card key={g.name} padded={false} style={styles.liftCard}>
                <Text style={[typography.caption, styles.liftName]} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  {formatSetLoad(top.weight_kg, top.reps)}
                </Text>
                <Text style={[typography.caption, styles.liftCaption]} numberOfLines={1}>
                  {caption}
                </Text>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    section: { marginTop: spacing.xxl },
    row: { gap: spacing.sm, paddingVertical: 2 },
    liftCard: { width: 112, gap: 2, padding: spacing.md, borderColor: t.colors.cardBorder },
    liftName: { color: t.colors.textDim },
    liftCaption: { color: t.colors.textMuted },
  }),
);
