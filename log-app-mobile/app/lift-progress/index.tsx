import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { SegmentedControl } from "../../src/components/ui/controls";
import { Sparkline } from "../../src/components/ui/charts";
import {
  Card,
  Divider,
  EmptyState,
  ErrorState,
  LoadingState,
  Tag,
} from "../../src/components/ui/primitives";
import { useLiftProgress } from "../../src/hooks/useLiftProgress";
import { useEntitlement } from "../../src/hooks/useEntitlement";
import {
  formatProgressBest,
  progressChange,
  progressSparkValues,
} from "../../src/utils/liftProgress";
import type { LiftProgressExercise } from "../../src/api/types";

const RANGES = [
  { value: "30d", label: "30D", days: 30 },
  { value: "90d", label: "90D", days: 90 },
  { value: "1y", label: "1Y", days: 365 },
] as const;

type ProgressRange = (typeof RANGES)[number]["value"];

/** Every exercise with enough history to show a trend. */
export default function LiftProgressScreen() {
  const [requested, setRequested] = useState<ProgressRange>("90d");
  const { isLocked } = useEntitlement();
  // 90-day and 1-year windows are Pro. The Free account always sees 30D — the
  // server clamps the same way, so the label and the data can never disagree.
  const locked = isLocked("lift_progress_full");
  const range: ProgressRange = locked ? "30d" : requested;
  const days = RANGES.find((r) => r.value === range)?.days ?? 30;

  const changeRange = (next: ProgressRange) => {
    if (locked && next !== "30d") {
      router.navigate("/paywall" as never);
      return;
    }
    setRequested(next);
  };
  const { data, loading, error, refetch } = useLiftProgress(days);
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const exercises = data?.exercises ?? [];

  const openExercise = (exercise: LiftProgressExercise) =>
    router.navigate({
      pathname: "/lift-progress/detail",
      params: { name: exercise.name, days: String(days) },
    } as never);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
      >
        <ScreenHeader
          variant="detail"
          title="Lift progress"
          subtitle="Top set by exercise"
          onBack={() => router.back()}
        />

        <SegmentedControl
          value={range}
          onChange={changeRange}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
        {locked ? (
          <Text style={[typography.caption, styles.gateNote]}>
            90-day and 1-year windows are part of Pro.
          </Text>
        ) : null}

        {error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : loading && exercises.length === 0 ? (
          <LoadingState label="Reading your training…" />
        ) : exercises.length === 0 ? (
          <EmptyState
            icon="barbell-outline"
            title="No lift history yet"
            subtitle="Log a few sessions and your per-exercise progress shows up here."
          />
        ) : (
          <Card padded={false} style={styles.listCard}>
            {exercises.map((exercise, index) => {
              const change = progressChange(exercise);
              const spark = progressSparkValues(exercise);
              const tone =
                change?.tone === "positive"
                  ? { bg: colors.successSoft, text: colors.success }
                  : change?.tone === "negative"
                    ? { bg: colors.dangerSoft, text: colors.danger }
                    : { bg: colors.surfaceAlt, text: colors.textDim };
              return (
                <View key={exercise.name}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${exercise.name} progress`}
                    onPress={() => openExercise(exercise)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <View style={styles.rowText}>
                      <Text style={[typography.bodyStrong, styles.name]} numberOfLines={1}>
                        {exercise.name}
                      </Text>
                      <Text style={typography.caption} numberOfLines={1}>
                        {formatProgressBest(exercise) ?? "No sets"} · {exercise.sessions}{" "}
                        {exercise.sessions === 1 ? "session" : "sessions"}
                      </Text>
                    </View>
                    {spark.length > 1 ? (
                      <Sparkline
                        values={spark}
                        width={74}
                        height={30}
                        dots={false}
                        color={change?.tone === "negative" ? colors.danger : colors.primary}
                      />
                    ) : null}
                    {change ? (
                      <Tag label={change.text} bg={tone.bg} text={tone.text} />
                    ) : (
                      <Text style={[typography.caption, styles.noChange]}>—</Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    gateNote: { color: t.colors.textDim, marginTop: -spacing.sm },
    listCard: { overflow: "hidden" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      minHeight: 64,
    },
    pressed: { opacity: 0.8 },
    rowText: { flex: 1, gap: 2, minWidth: 0 },
    name: {},
    noChange: { color: t.colors.textMuted, width: 30, textAlign: "right" },
  }),
);
