import { useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { SegmentedControl } from "../../src/components/ui/controls";
import { BarChart, Sparkline } from "../../src/components/ui/charts";
import {
  Card,
  Divider,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
} from "../../src/components/ui/primitives";
import { StatTile } from "../../src/components/StatTile";
import { useLiftProgress } from "../../src/hooks/useLiftProgress";
import { formatNumber } from "../../src/utils/derive";
import { formatMediumDate } from "../../src/utils/date";
import {
  formatProgressBest,
  formatProgressSet,
  progressChange,
  progressModeLabel,
  progressSparkValues,
  progressUnit,
  progressValueLabel,
  recentProgressPoints,
} from "../../src/utils/liftProgress";

const RANGES = [
  { value: "30d", label: "30D", days: 30 },
  { value: "90d", label: "90D", days: 90 },
  { value: "1y", label: "1Y", days: 365 },
] as const;

type ProgressRange = (typeof RANGES)[number]["value"];

/** One exercise's session-by-session progress. */
export default function ExerciseProgressScreen() {
  const params = useLocalSearchParams<{ name?: string | string[]; days?: string }>();
  const raw = Array.isArray(params.name) ? params.name[0] : params.name;
  const exerciseName = raw ?? "";
  const initialRange: ProgressRange =
    params.days === "365" ? "1y" : params.days === "30" ? "30d" : "90d";
  const [range, setRange] = useState<ProgressRange>(initialRange);
  const days = RANGES.find((r) => r.value === range)?.days ?? 90;
  const { data, loading, error, refetch } = useLiftProgress(days);
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();

  const exercise = data?.exercises.find((e) => e.name === exerciseName) ?? null;
  const change = exercise ? progressChange(exercise) : null;
  const changeColor =
    change?.tone === "positive"
      ? colors.success
      : change?.tone === "negative"
        ? colors.danger
        : colors.textDim;
  const spark = exercise ? progressSparkValues(exercise) : [];
  const recent = exercise ? recentProgressPoints(exercise) : [];
  const bars = exercise
    ? exercise.points.slice(-12).map((point) => ({
        iso: point.date,
        label: point.date.slice(5).replace("-", "/"),
        value: exercise.mode === "kg" ? point.volume : point.reps,
      }))
    : [];
  const chartWidth = Math.max(200, width - spacing.screen * 2 - spacing.lg * 2);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
      >
        <ScreenHeader
          variant="detail"
          title={exerciseName || "Exercise progress"}
          subtitle={exercise ? progressModeLabel(exercise.mode) : "Detailed analysis"}
          onBack={() => router.back()}
        />

        <SegmentedControl
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />

        {error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : loading && exercise == null ? (
          <LoadingState label="Loading exercise history…" />
        ) : exercise == null ? (
          <EmptyState
            icon="barbell-outline"
            title="No progress yet"
            subtitle="Log this exercise in the selected range to see its trend."
          />
        ) : (
          <>
            <View style={styles.tiles}>
              <StatTile
                icon="trophy-outline"
                iconBg={colors.orangeSoft}
                iconColor={colors.orange}
                value={formatProgressBest(exercise) ?? "—"}
                label="Best in range"
              />
              <StatTile
                icon="calendar-outline"
                iconBg={colors.blueSoft}
                iconColor={colors.blue}
                value={String(exercise.sessions)}
                label={exercise.sessions === 1 ? "Session" : "Sessions"}
              />
              <StatTile
                icon="layers-outline"
                iconBg={colors.greenSoft}
                iconColor={colors.green}
                value={
                  exercise.mode === "kg"
                    ? `${formatNumber(exercise.volume)} kg`
                    : String(exercise.sets)
                }
                label={exercise.mode === "kg" ? "Volume" : "Sets"}
              />
              <StatTile
                icon="trending-up-outline"
                iconBg={colors.purpleSoft}
                iconColor={colors.purple}
                value={change?.text ?? "—"}
                label="vs previous"
              />
            </View>

            <SectionHeader title="Progress" />
            <Card style={styles.section}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderText}>
                  <Text style={typography.bodyStrong}>{progressValueLabel(exercise.mode)}</Text>
                  <Text style={typography.caption}>
                    {exercise.points.length} {exercise.points.length === 1 ? "session" : "sessions"} ·{" "}
                    {progressUnit(exercise.mode)}
                  </Text>
                </View>
                {change ? (
                  <Text style={[typography.bodyStrong, { color: changeColor }]}>
                    {change.text}
                  </Text>
                ) : null}
              </View>
              <Sparkline values={spark} width={chartWidth} height={140} />
              <View style={styles.chartFoot}>
                <Text style={typography.caption}>
                  {exercise.points[0] ? formatMediumDate(exercise.points[0].date) : ""}
                </Text>
                <Text style={typography.caption}>
                  {exercise.points[exercise.points.length - 1]
                    ? formatMediumDate(exercise.points[exercise.points.length - 1].date)
                    : ""}
                </Text>
              </View>
            </Card>

            <Card style={styles.section}>
              <View style={styles.cardHeaderText}>
                <Text style={typography.bodyStrong}>
                  {exercise.mode === "kg" ? "Volume by session" : "Reps by session"}
                </Text>
                <Text style={typography.caption}>
                  {exercise.mode === "kg" ? "Last 12 sessions" : "Total reps per session"}
                </Text>
              </View>
              <BarChart
                data={bars}
                axis
                height={150}
                color={colors.primary}
                unit={exercise.mode === "kg" ? "kg" : "reps"}
              />
            </Card>

            <Card style={styles.section}>
              <View style={styles.cardHeaderText}>
                <Text style={typography.bodyStrong}>Recent sessions</Text>
                <Text style={typography.caption}>Newest first</Text>
              </View>
              {recent.map((point, index) => (
                <View key={point.date}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.sessionRow}>
                    <View style={styles.sessionText}>
                      <Text style={[typography.small, styles.sessionDate]}>
                        {formatMediumDate(point.date)}
                      </Text>
                      <Text style={typography.caption}>
                        {point.sets} {point.sets === 1 ? "set" : "sets"} · {point.reps} reps
                        {exercise.mode === "kg"
                          ? ` · ${formatNumber(point.volume)} kg volume`
                          : ""}
                      </Text>
                    </View>
                    <Text style={[typography.small, styles.sessionBest]} numberOfLines={1}>
                      {formatProgressSet(point.best_set, exercise.mode) ?? "—"}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    section: { gap: spacing.md },
    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    cardHeaderText: { gap: 2, flex: 1, minWidth: 0 },
    chartFoot: { flexDirection: "row", justifyContent: "space-between" },
    sessionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    sessionText: { flex: 1, gap: 1, minWidth: 0 },
    sessionDate: { color: t.colors.text, fontWeight: "600" },
    sessionBest: { color: t.colors.textDim, maxWidth: "45%", textAlign: "right" },
  }),
);
