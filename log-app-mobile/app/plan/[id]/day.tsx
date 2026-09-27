import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { makeUseStyles, useTheme } from "../../../src/theme/ThemeContext";
import { spacing } from "../../../src/theme/spacing";
import { ScreenHeader } from "../../../src/components/ScreenHeader";
import { ExerciseRow } from "../../../src/components/ExerciseRow";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "../../../src/components/ui/primitives";
import { usePlans } from "../../../src/hooks/usePlans";
import { muscleGroupsForDay } from "../../../src/utils/derive";

/** Plan day details (design 03.02). */
export default function PlanDayScreen() {
  const { id, dayId } = useLocalSearchParams<{ id: string; dayId: string }>();
  const { activePlan, days, loading, error, refetch } = usePlans();
  const { typography } = useTheme();
  const styles = useStyles();

  const day = useMemo(() => days.find((d) => d.id === dayId) ?? null, [days, dayId]);
  const planId = id ?? activePlan?.id;

  if (loading && !day) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="detail" title="Day" onBack={() => router.back()} />
          <LoadingState />
        </View>
      </View>
    );
  }

  if (error && !day) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="detail" title="Day" onBack={() => router.back()} />
          <ErrorState message={error} onRetry={refetch} />
        </View>
      </View>
    );
  }

  if (!day) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="detail" title="Day" onBack={() => router.back()} />
          <EmptyState icon="clipboard-outline" title="Day not found" subtitle="This plan may have changed." />
        </View>
      </View>
    );
  }

  const muscles = muscleGroupsForDay(day.day_name, day.exercises.map((e) => e.name));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader
          variant="detail"
          title={day.day_name}
          subtitle={muscles.join(" • ")}
          onBack={() => router.back()}
          right={
            <Button
              label="Edit Day"
              variant="outline"
              size="sm"
              onPress={() =>
                router.navigate({ pathname: "/plan/[id]/edit-day", params: { id: planId, dayId: day.id } } as never)
              }
            />
          }
        />

        <Card style={styles.metaCard}>
          <Text style={typography.bodyStrong}>
            {day.exercises.length} exercise{day.exercises.length === 1 ? "" : "s"}
          </Text>
          <Text style={typography.caption}>~{"—"} min estimated</Text>
        </Card>

        <View style={styles.list}>
          {day.exercises.map((ex, i) => (
            <ExerciseRow
              key={`${ex.name}-${i}`}
              index={i + 1}
              name={ex.name}
              sets={ex.sets}
              reps={ex.reps}
              muscle={muscleGroupsForDay(day.day_name, [ex.name])[0]}
              showChevron
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    padded: { padding: spacing.screen },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    metaCard: { gap: 2 },
    list: { gap: spacing.sm },
  }),
);
