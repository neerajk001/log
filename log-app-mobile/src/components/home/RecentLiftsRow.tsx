import { ScrollView, StyleSheet, Text, View } from "react-native";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, EmptyState, SectionHeader } from "../ui/primitives";
import type { LiftLog } from "../../api/types";

export interface LiftGroup {
  name: string;
  sets: LiftLog[];
}

/** Best set today, measured by weight then reps. */
function topSet(sets: LiftLog[]): LiftLog {
  return sets.reduce((best, s) => (s.weight_kg > best.weight_kg ? s : best), sets[0]);
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
              <Card key={g.name} style={styles.liftCard}>
                <Text style={[typography.caption, styles.liftName]} numberOfLines={2}>
                  {g.name}
                </Text>
                <Text style={typography.h3}>
                  {top.weight_kg} × {top.reps}
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
    liftCard: { width: 150, gap: spacing.xs },
    liftName: { color: t.colors.textDim, minHeight: 28 },
    liftCaption: { color: t.colors.textMuted },
  }),
);
