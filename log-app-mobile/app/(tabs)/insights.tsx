import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type ErrorBoundaryProps } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { BarChart, DonutChart, Sparkline } from "../../src/components/ui/charts";
import { WeightChart } from "../../src/components/body/WeightChart";
import {
  Banner,
  Button,
  Card,
  Divider,
  ErrorState,
  IconBadge,
  LoadingState,
  SectionHeader,
  Tag,
  type IoniconName,
} from "../../src/components/ui/primitives";
import { SegmentedControl, Chip, ChipRow } from "../../src/components/ui/controls";
import { useInsights } from "../../src/hooks/useInsights";
import { useLiftProgress } from "../../src/hooks/useLiftProgress";
import { useTrends } from "../../src/hooks/useTrends";
import { useMe } from "../../src/hooks/useMe";
import { useEntitlement } from "../../src/hooks/useEntitlement";
import { useWeeklyVerdict } from "../../src/hooks/useWeeklyVerdict";
import { AskCoachRow } from "../../src/components/coach/AskCoachRow";
import { ProGate } from "../../src/components/billing/ProGate";
import { VERDICT_LABELS } from "../../src/components/VerdictStamp";
import { formatNumber } from "../../src/utils/derive";
import {
  formatProgressBest,
  progressChange,
  progressSparkValues,
} from "../../src/utils/liftProgress";
import { weekDayLabels } from "../../src/utils/date";
import type { TrendBucket, TrendRange } from "../../src/api/types";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const RANGES: { value: TrendRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "3M" },
  { value: "1y", label: "1Y" },
];

/** The range also picks the training window for the metrics below. */
const RANGE_DAYS: Record<TrendRange, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
const RANGE_PHRASE: Record<TrendRange, string> = {
  "7d": "this week",
  "30d": "in 30 days",
  "90d": "in 3 months",
  "1y": "this year",
};
const RANGE_NOUN: Record<TrendRange, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 3 months",
  "1y": "last 12 months",
};

type Category = "overview" | "training" | "nutrition" | "body" | "all";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "training", label: "Training" },
  { value: "nutrition", label: "Nutrition" },
  { value: "body", label: "Body" },
  { value: "all", label: "All" },
];

/** Nutrition windows — the card averages over its own window, independent of the range. */
const NUTRITION_WINDOWS: { weeks: number; label: string; phrase: string }[] = [
  { weeks: 1, label: "1W", phrase: "week" },
  { weeks: 2, label: "2W", phrase: "2 weeks" },
  { weeks: 3, label: "3W", phrase: "3 weeks" },
  { weeks: 4, label: "1M", phrase: "month" },
  { weeks: 8, label: "2M", phrase: "2 months" },
  { weeks: 13, label: "3M", phrase: "3 months" },
  { weeks: 26, label: "6M", phrase: "6 months" },
  { weeks: 52, label: "1Y", phrase: "year" },
];

function signedPct(n: number | null): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
}

/** Mean of the buckets that actually hold a value, or null when none do. */
function windowAverage(
  buckets: TrendBucket[],
  pick: (b: TrendBucket) => number | null,
): number | null {
  const values = buckets.map(pick).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

const pickNutrient = (metric: "calories" | "protein") => (b: TrendBucket) =>
  metric === "calories" ? b.calories : b.protein_g;

/** Short x-axis / bucket label: weekday, day-of-month, or month. */
function bucketLabel(start: string, bucket: "day" | "week" | "month"): string {
  const d = new Date(`${start}T00:00:00Z`);
  if (bucket === "day") return WEEKDAY_NAMES[d.getUTCDay()];
  if (bucket === "week") return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
  return MONTH_NAMES[d.getUTCMonth()];
}

/**
 * Insights — a single-column analytics view: a category + range filter, four
 * summary tiles, then body, nutrition and training detail. Everything is derived
 * from the existing lift-metrics and trends endpoints.
 */
export default function InsightsScreen() {
  const [range, setRange] = useState<TrendRange>("7d");
  const [category, setCategory] = useState<Category>("overview");
  const [nutritionMetric, setNutritionMetric] = useState<"calories" | "protein">("calories");
  const [nutritionWeeks, setNutritionWeeks] = useState(1);
  const [nutritionDetailOpen, setNutritionDetailOpen] = useState(false);
  const [weightRowsOpen, setWeightRowsOpen] = useState(false);
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(220, width - spacing.screen * 2 - spacing.lg * 2 - 2);

  const rangeDays = RANGE_DAYS[range];
  const { profile } = useMe();
  const { isLocked } = useEntitlement();
  const restDays = profile?.rest_days ?? [];
  const trackWeight = profile?.track_weight !== false;

  // The wider ranges are the Pro analytics gate. Keep every chip visible (it was
  // there before) but send a locked tap to the paywall instead of silently
  // re-rendering the same 7-day numbers under a different label.
  const changeRange = (next: TrendRange) => {
    if (next !== "7d" && isLocked("insights_full")) {
      router.navigate("/paywall" as never);
      return;
    }
    setRange(next);
  };

  const { metrics, loading, error, refetch } = useInsights(rangeDays, restDays);
  const {
    data: liftProgress,
    loading: liftProgressLoading,
    error: liftProgressError,
    refetch: refetchLiftProgress,
  } = useLiftProgress(rangeDays);
  // The server caps the nutrition window at 52 weeks. For 1Y there is no prior
  // year in the payload; requesting 104 made the whole trends call 400.
  const nutritionFetchWeeks = Math.min(nutritionWeeks * 2, 52);
  // The nutrition window is fetched twice over: the second half is the equally-long
  // window before it, which is what the "vs previous" readout compares against. The
  // headline still averages only the buckets the window actually covers.
  const {
    data: trends,
    loading: trendsLoading,
    error: trendsError,
    refetch: refetchTrends,
  } = useTrends(range, nutritionFetchWeeks);
  // The bars always show the last seven days, whatever range/window is selected. The
  // weeks argument only shapes the nutrition buckets — which this call ignores — so
  // passing the same value keeps the cache key identical to the fetch above when the
  // range is 7d, and the two share one request.
  const { data: weekTrends, refetch: refetchWeek } = useTrends("7d", nutritionFetchWeeks);
  const { data: verdict } = useWeeklyVerdict();

  // The hook's own first-load idiom: nothing has arrived yet, so show "—" rather than
  // numbers that read as real zeros.
  const firstLoad = loading && metrics.sets === 0 && metrics.workouts === 0;
  const bucket = trends?.bucket ?? "day";
  const series = useMemo(() => trends?.series ?? [], [trends]);

  /* ------------------------------------------------------------- weight */
  const weightPoints = useMemo(
    () =>
      series
        .filter((b) => b.weight_kg != null)
        .map((b) => ({ start: b.start, value: b.weight_kg as number })),
    [series],
  );
  // The Insights weight series is daily for 7d and bucketed averages for wider
  // ranges; the interactive chart shows whichever point is under the finger.
  const interactiveWeightPoints = useMemo(
    () =>
      weightPoints.map((point) => ({
        date: point.start,
        kg: point.value,
        calories: null,
        protein_g: null,
      })),
    [weightPoints],
  );
  const weightValues = weightPoints.map((p) => p.value);
  const latestWeight = weightValues.length > 0 ? weightValues[weightValues.length - 1] : null;
  const firstWeight = weightValues.length > 0 ? weightValues[0] : null;
  const weightDeltaKg =
    latestWeight != null && firstWeight != null ? latestWeight - firstWeight : null;
  const weightDeltaPct =
    latestWeight != null && firstWeight != null && firstWeight > 0
      ? ((latestWeight - firstWeight) / firstWeight) * 100
      : null;

  /* ---------------------------------------------------------- nutrition */
  // The nutrition card keeps its own window of weekly averages, independent of
  // the top range — the 1W / 2W / … control the screen has always had.
  const nutritionBuckets = useMemo(() => trends?.nutrition ?? [], [trends]);
  // The server clamps the requested window at 52 weeks, so 1Y asks for (and gets)
  // 52 buckets, not 104. The held response is "fresh" only when its bucket count
  // matches the window on screen: after a window switch the previous window's
  // buckets must not be relabelled as the new window's numbers.
  const requestedNutritionBuckets = Math.min(nutritionWeeks * 2, 52);
  const nutritionFresh =
    trends != null && nutritionBuckets.length === requestedNutritionBuckets;
  // The chosen window is the tail of the fetched buckets; the slice before it is the
  // previous, equally-long window it is compared against.
  // `nutrition_days` is the rolling, fully-completed day series. For the 1W
  // view it gives seven real completed days (ending yesterday) instead of the
  // six calendar days left after excluding the unfinished today.
  const nutritionDays = weekTrends?.nutrition_days;
  const dailyNutritionReady = (nutritionDays?.length ?? 0) >= 14;
  const nutritionCurrent = useMemo(
    () =>
      nutritionWeeks === 1 && dailyNutritionReady && nutritionDays
        ? nutritionDays.slice(-7)
        : nutritionFresh
          ? nutritionBuckets.slice(-nutritionWeeks)
          : [],
    [dailyNutritionReady, nutritionBuckets, nutritionDays, nutritionFresh, nutritionWeeks],
  );
  const nutritionPrevious = useMemo(
    () =>
      nutritionWeeks === 1 && dailyNutritionReady && nutritionDays
        ? nutritionDays.slice(0, 7)
        : nutritionFresh
          ? nutritionBuckets.slice(-nutritionWeeks * 2, -nutritionWeeks)
          : [],
    [dailyNutritionReady, nutritionBuckets, nutritionDays, nutritionFresh, nutritionWeeks],
  );
  const nutritionAverage = windowAverage(nutritionCurrent, pickNutrient(nutritionMetric));
  const nutritionPrevAverage = windowAverage(nutritionPrevious, pickNutrient(nutritionMetric));
  // Change against the previous window of the same length — not against the target,
  // which the line under the number already covers.
  const nutritionChangePct =
    nutritionAverage != null && nutritionPrevAverage != null && nutritionPrevAverage > 0
      ? Math.round(((nutritionAverage - nutritionPrevAverage) / nutritionPrevAverage) * 100)
      : null;
  const nutritionUnit = nutritionMetric === "calories" ? "kcal" : "g";
  const nutritionAccent = nutritionMetric === "calories" ? colors.orange : colors.blue;
  const nutritionAccentSoft = nutritionMetric === "calories" ? colors.orangeSoft : colors.blueSoft;
  const proteinTarget = profile?.protein_target_g ?? null;
  const calorieTarget = profile?.calorie_target ?? null;
  const nutritionTarget = nutritionMetric === "calories" ? calorieTarget : proteinTarget;
  const nutritionDiff =
    nutritionTarget != null && nutritionAverage != null ? nutritionAverage - nutritionTarget : null;
  // The average spans the chosen window (weekly averages)…
  const nutritionWindow =
    NUTRITION_WINDOWS.find((w) => w.weeks === nutritionWeeks) ?? NUTRITION_WINDOWS[0];
  const nutritionWindowLabel =
    nutritionWeeks === 1 ? "Last 7 days" : `Last ${nutritionWindow.phrase}`;
  const nutritionCompareLabel =
    nutritionWeeks === 52
      ? "no prior year loaded"
      : nutritionWeeks === 1
        ? "vs previous 7 days"
        : `vs previous ${nutritionWindow.phrase}`;

  // …but the bars stay on the last 7 days of daily intake, so a wider window
  // fades them (they only cover a week) and only the average follows the filter.
  const barsDimmed = nutritionWeeks > 1;
  const weekSeries = useMemo(
    () =>
      dailyNutritionReady && nutritionDays
        ? nutritionDays.slice(-7)
        : weekTrends?.series ?? [],
    [dailyNutritionReady, nutritionDays, weekTrends],
  );
  const nutritionChart = useMemo(
    () =>
      weekSeries.map((b) => ({
        iso: b.start,
        label: bucketLabel(b.start, "day"),
        value: (nutritionMetric === "calories" ? b.calories : b.protein_g) ?? 0,
      })),
    [weekSeries, nutritionMetric],
  );
  const weekLoggedDays = weekSeries.reduce((sum, b) => sum + b.days, 0);

  /* ------------------------------------------------------------- weight rows */
  const recentWeightRows = useMemo(() => {
    const points = series.filter((b) => b.weight_kg != null);
    return points
      .slice(-6)
      .reverse()
      .map((b, i, arr) => ({
        start: b.start,
        avg: b.weight_kg as number,
        delta:
          arr[i + 1]?.weight_kg != null
            ? (b.weight_kg as number) - (arr[i + 1].weight_kg as number)
            : null,
        label: i === 0 ? "Latest" : bucketLabel(b.start, bucket),
      }));
  }, [series, bucket]);

  /* ------------------------------------------------------------- training */
  // The set series is daily until 90 days, where it aggregates weekly (matching
  // useInsights) — the title must follow the series, not the trends bucket.
  const setsWeekly = rangeDays >= 90;
  const setsTitle = setsWeekly ? "Sets per week" : "Sets by day";
  const progressExercises = liftProgress?.exercises.slice(0, 5) ?? [];
  const muscleColors = [
    colors.orange,
    colors.blue,
    colors.green,
    colors.purple,
    colors.pink,
    colors.teal,
    colors.amber,
  ];
  const donutSlices = metrics.muscles
    .slice(0, 7)
    .map((m, i) => ({ label: m.muscle, value: m.sets, color: muscleColors[i % muscleColors.length] }));

  const adherence = trends?.adherence_pct ?? null;

  // Always expose the verdict entry; the screen itself explains insufficient
  // weigh-in data instead of hiding the only route to it.
  const verdictLabel = verdict ? VERDICT_LABELS[verdict.verdict] : null;

  const show = {
    summary: category === "overview" || category === "all",
    verdict: category === "overview" || category === "all",
    weight: (category === "overview" || category === "body" || category === "all") && trackWeight,
    nutrition: category === "overview" || category === "nutrition" || category === "all",
    nutritionHeading: category !== "training",
    training: category === "training" || category === "all",
    progress: category === "overview" || category === "training" || category === "all",
    records: category === "training" || category === "all",
    consistency: category === "training" || category === "all",
  };
  const bodyHeading =
    category === "body" ? "Body" : category === "nutrition" ? "Nutrition" : "Body & Nutrition";

  const refresh = () => {
    refetch();
    refetchLiftProgress();
    refetchTrends();
    refetchWeek();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading || trendsLoading}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
      >
        <ScreenHeader
          variant="page"
          title="Insights"
          right={
            <View style={styles.rangeWrap}>
              <SegmentedControl value={range} onChange={changeRange} options={RANGES} />
            </View>
          }
        />

        <ChipRow>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              active={category === c.value}
              onPress={() => setCategory(c.value)}
            />
          ))}
        </ChipRow>

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}
        {trendsError ? (
          <Banner tone="danger" message={trendsError} actionLabel="Retry" onAction={refetchTrends} />
        ) : null}

        {/* Verdict entry (moved here from Today) */}
        {show.verdict && verdictLabel ? (
          <Pressable
            style={styles.verdictCard}
            onPress={() => router.navigate("/verdict" as never)}
            accessibilityRole="button"
            accessibilityLabel={`Weekly verdict: ${verdictLabel}`}
          >
            <IconBadge name="ribbon-outline" bg={colors.primarySoft} color={colors.primary} size={34} rounded={false} />
            <View style={styles.verdictText}>
              <Text style={typography.caption}>Weekly verdict</Text>
              <Text style={styles.verdictLabel}>{verdictLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open detailed body and nutrition analysis"
          onPress={() => router.navigate("/insights/body" as never)}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Card style={styles.deepDive}>
            <IconBadge name="analytics-outline" bg={colors.primarySoft} color={colors.primary} size={38} rounded={false} />
            <View style={styles.deepDiveText}>
              <View style={styles.deepDiveTitleRow}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  Body & nutrition analysis
                </Text>
                {isLocked("insights_full") ? (
                  <Tag label="PRO" bg={colors.primarySoft} text={colors.primary} />
                ) : null}
              </View>
              <Text style={typography.small} numberOfLines={2}>
                Weight rate, calorie and protein hit rates, weekend patterns, maintenance estimate.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Card>
        </Pressable>

        {/* Progress summary */}
        {show.summary ? (
          <View style={styles.summary}>
            <SummaryCard
              icon="barbell"
              iconBg={colors.purpleSoft}
              iconColor={colors.purple}
              value={firstLoad ? "—" : String(metrics.workouts)}
              label="Workouts"
              sub={firstLoad || metrics.workoutsThisWeek === 0 ? "" : `${metrics.workoutsThisWeek} this week`}
            />
            <SummaryCard
              icon="layers"
              iconBg={colors.blueSoft}
              iconColor={colors.blue}
              value={firstLoad ? "—" : String(metrics.sets)}
              label="Total sets"
              sub={
                firstLoad || metrics.workouts === 0
                  ? ""
                  : `${Math.round(metrics.sets / metrics.workouts)}/workout`
              }
            />
            <SummaryCard
              icon="trending-up"
              iconBg={colors.greenSoft}
              iconColor={colors.green}
              value={firstLoad ? "—" : signedPct(metrics.strengthPct)}
              label="Strength"
              sub={!firstLoad && metrics.strengthPct != null ? "vs previous" : ""}
            />
            <SummaryCard
              icon="checkmark-circle"
              iconBg={colors.orangeSoft}
              iconColor={colors.orange}
              value={firstLoad ? "—" : adherence != null ? `${adherence}%` : "—"}
              label="Adherence"
              sub={adherence != null ? "This week" : ""}
            />
          </View>
        ) : null}

        {/* Body & Nutrition */}
        {show.summary || show.weight || show.nutrition ? (
          <SectionHeader title={bodyHeading} />
        ) : null}

        {category === "body" && !trackWeight ? (
          <Card style={styles.section}>
            <Text style={[typography.small, styles.note]}>
              Bodyweight tracking is off. Turn it on in Settings to see your weight trend here.
            </Text>
          </Card>
        ) : null}

        {show.weight ? (
          <Card style={styles.section}>
            <Pressable
              onPress={() => setWeightRowsOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Weight detail"
              accessibilityState={{ expanded: weightRowsOpen }}
              style={styles.cardHeader}
            >
              <View style={styles.cardHeaderLeft}>
                <IconBadge name="scale-outline" bg={colors.surfaceAlt} color={colors.text} size={32} rounded={false} />
                <View style={styles.cardHeaderText}>
                  <Text style={typography.bodyStrong}>Weight</Text>
                  <Text style={typography.caption}>Daily average</Text>
                </View>
              </View>
              <Ionicons
                name={weightRowsOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>

            {weightValues.length > 0 ? (
              <>
                <View style={styles.metricRow}>
                  <Text style={typography.metric}>
                    {latestWeight != null ? formatNumber(latestWeight) : "—"}
                    <Text style={typography.metricUnit}> kg</Text>
                  </Text>
                  {weightDeltaPct != null ? (
                    <Tag
                      label={`${weightDeltaPct > 0 ? "+" : ""}${weightDeltaPct.toFixed(1)}%`}
                      bg={weightDeltaPct <= 0 ? colors.successSoft : colors.tagNeutralBg}
                      text={weightDeltaPct <= 0 ? colors.success : colors.tagNeutralText}
                    />
                  ) : null}
                </View>
                {weightDeltaKg != null ? (
                  <Text style={[typography.small, weightDeltaKg <= 0 ? styles.down : styles.up]}>
                    {weightDeltaKg <= 0 ? "↓" : "↑"} {Math.abs(weightDeltaKg).toFixed(1)} kg{" "}
                    {RANGE_PHRASE[range]}
                  </Text>
                ) : null}
                <WeightChart
                  points={interactiveWeightPoints}
                  width={chartWidth}
                  height={112}
                  showTrailingAverage={false}
                  showRange={false}
                />
                <View style={styles.xLabels}>
                  {weightPoints.map((p) => (
                    <Text
                      key={p.start}
                      style={styles.xLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {bucketLabel(p.start, bucket)}
                    </Text>
                  ))}
                </View>
                {weightRowsOpen && recentWeightRows.length > 1 ? (
                  <View style={styles.rows}>
                    {recentWeightRows.map((w) => (
                      <View key={w.start} style={styles.row}>
                        <Text style={[typography.small, styles.rowName]} numberOfLines={1}>
                          {w.label}
                        </Text>
                        <Text style={typography.bodyStrong}>{formatNumber(w.avg)} kg</Text>
                        <Text
                          style={[
                            typography.small,
                            w.delta == null ? styles.flat : w.delta < 0 ? styles.down : styles.up,
                          ]}
                        >
                          {w.delta == null ? "—" : `${w.delta > 0 ? "+" : ""}${w.delta.toFixed(1)} kg`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <Text style={[typography.caption, styles.note]}>
                  Tap the chart to inspect a point · average of your weigh-ins per {bucket}.
                </Text>
              </>
            ) : (
              <Text style={[typography.small, styles.note]}>
                Log your weight on the Today screen to see a trend here.
              </Text>
            )}
          </Card>
        ) : null}

        {show.nutrition && show.nutritionHeading ? (
          <Card style={styles.section}>
            <View style={styles.cardHeaderLeft}>
              <IconBadge
                name="nutrition"
                bg={nutritionAccent}
                color={colors.onPrimary}
                size={34}
                rounded={false}
              />
              <View style={styles.cardHeaderText}>
                <Text style={typography.bodyStrong}>Nutrition</Text>
                <Text style={typography.caption}>Average · {nutritionWindowLabel}</Text>
              </View>
            </View>

            <View style={styles.metricToggle}>
              {(["calories", "protein"] as const).map((m) => {
                const active = nutritionMetric === m;
                const accent = m === "calories" ? colors.orange : colors.blue;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setNutritionMetric(m)}
                    style={[styles.metricPill, active ? { backgroundColor: accent } : null]}
                  >
                    <Ionicons
                      name={m === "calories" ? "flame" : "barbell"}
                      size={16}
                      color={active ? colors.onPrimary : colors.textDim}
                    />
                    <Text
                      style={[styles.metricPillText, active ? { color: colors.onPrimary } : null]}
                    >
                      {m === "calories" ? "Calories" : "Protein"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <ChipRow>
              {NUTRITION_WINDOWS.map((w) => (
                <Chip
                  key={w.weeks}
                  label={w.label}
                  active={nutritionWeeks === w.weeks}
                  onPress={() => setNutritionWeeks(w.weeks)}
                />
              ))}
            </ChipRow>

            {!nutritionFresh && !trendsError ? (
              <LoadingState label="Loading your nutrition…" />
            ) : nutritionAverage != null ? (
              <>
                <View style={styles.metricRow}>
                  <Text style={typography.metric}>
                    {formatNumber(nutritionAverage)}
                    <Text style={typography.metricUnit}> {nutritionUnit}</Text>
                  </Text>
                  {nutritionChangePct != null ? (
                    <View style={styles.changeWrap}>
                      <View style={[styles.changePill, { backgroundColor: nutritionAccentSoft }]}>
                        <Ionicons
                          name={nutritionChangePct > 0 ? "arrow-up" : "arrow-down"}
                          size={13}
                          color={nutritionAccent}
                        />
                        <Text style={[styles.changeValue, { color: nutritionAccent }]}>
                          {signedPct(nutritionChangePct)}
                        </Text>
                      </View>
                      <Text style={styles.changeCaption}>{nutritionCompareLabel}</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={[typography.small, styles.note]}>
                  {nutritionTarget != null ? (
                    <>
                      {`Target ${formatNumber(nutritionTarget)} ${nutritionUnit}`}
                      {nutritionDiff != null && nutritionDiff !== 0 ? (
                        <Text style={{ color: nutritionAccent }}>
                          {` · ${formatNumber(Math.abs(nutritionDiff))} ${nutritionUnit} ${
                            nutritionDiff > 0 ? "over" : "under"
                          }`}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    "No target set — add one in Settings to compare."
                  )}
                </Text>

                <View style={barsDimmed ? styles.chartDimmed : undefined}>
                  <BarChart
                    data={nutritionChart}
                    axis
                    color={nutritionAccent}
                    target={nutritionTarget}
                    unit={nutritionUnit}
                  />
                </View>

                <View style={styles.footerRow}>
                  <Ionicons name="calendar-outline" size={14} color={colors.textDim} />
                  <Text style={[typography.caption, styles.footerText]} numberOfLines={2}>
                    {barsDimmed
                      ? `Showing last week · from ${weekLoggedDays} log${weekLoggedDays === 1 ? "" : "s"}`
                      : `From ${weekLoggedDays} logged day${weekLoggedDays === 1 ? "" : "s"} · completed days only`}
                  </Text>
                  <Pressable
                    onPress={() => setNutritionDetailOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel="Daily nutrition breakdown"
                    accessibilityState={{ expanded: nutritionDetailOpen }}
                    hitSlop={8}
                    style={styles.footerLink}
                  >
                    <Text style={styles.footerLinkText}>View details</Text>
                    <Ionicons
                      name={nutritionDetailOpen ? "chevron-up" : "chevron-forward"}
                      size={14}
                      color={colors.primary}
                    />
                  </Pressable>
                </View>

                {nutritionDetailOpen ? (
                  <View style={styles.detailRows}>
                    {nutritionChart.map((d) => (
                      <View key={d.iso} style={styles.detailRow}>
                        <Text style={[typography.small, styles.detailLabel]}>{d.label}</Text>
                        <Text style={typography.bodyStrong}>
                          {d.value > 0 ? `${formatNumber(d.value)} ${nutritionUnit}` : "—"}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={[typography.small, styles.note]}>
                No completed days logged in this window yet — anything you log today counts from
                tomorrow.
              </Text>
            )}
          </Card>
        ) : null}

        {/* Training Performance */}
        {show.training ? (
          <>
            <SectionHeader title="Training Performance" />

            <Card style={styles.section}>
              <View style={styles.cardHeaderLeft}>
                <IconBadge name="bar-chart-outline" bg={colors.surfaceAlt} color={colors.text} size={32} rounded={false} />
                <View style={styles.cardHeaderText}>
                  <Text style={typography.bodyStrong}>{setsTitle}</Text>
                  <Text style={typography.caption}>Total sets logged</Text>
                </View>
              </View>
              <View style={styles.metricRow}>
                <Text style={typography.metric}>
                  {firstLoad ? "—" : formatNumber(metrics.sets)}
                  <Text style={typography.metricUnit}> sets</Text>
                </Text>
              </View>
              <Text style={[typography.small, styles.note]}>
                {metrics.workouts} workout{metrics.workouts === 1 ? "" : "s"} · {RANGE_NOUN[range]}
              </Text>
              {loading && metrics.sets === 0 ? (
                <LoadingState label="Crunching your numbers…" />
              ) : metrics.sets > 0 ? (
                <BarChart data={metrics.setsSeries} axis color={colors.primary} unit="sets" />
              ) : (
                <Text style={[typography.small, styles.note]}>No sets logged in this range yet.</Text>
              )}
            </Card>

            <Card style={styles.section}>
              <View style={styles.cardHeaderLeft}>
                <IconBadge name="pie-chart-outline" bg={colors.surfaceAlt} color={colors.text} size={32} rounded={false} />
                <View style={styles.cardHeaderText}>
                  <Text style={typography.bodyStrong}>Muscle groups</Text>
                  <Text style={typography.caption}>Sets logged per muscle group</Text>
                </View>
              </View>
              {donutSlices.length > 0 ? (
                <View style={styles.muscleWrap}>
                  <DonutChart
                    slices={donutSlices}
                    size={124}
                    thickness={17}
                    centerTop={formatNumber(metrics.sets)}
                    centerBottom="sets"
                  />
                  <View style={styles.legend}>
                    {donutSlices.map((s) => {
                      const slice = metrics.muscles.find((m) => m.muscle === s.label);
                      return (
                        <View key={s.label} style={styles.legendRow}>
                          <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                          <Text style={[typography.small, styles.legendLabel]} numberOfLines={1}>
                            {s.label}
                          </Text>
                          <Text style={typography.bodyStrong}>{s.value}</Text>
                          <Text style={[typography.caption, styles.legendPct]}>{slice?.pct ?? 0}%</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <Text style={[typography.small, styles.note]}>
                  No sets in this range yet — log a lift to see your breakdown.
                </Text>
              )}
            </Card>

            <Card style={styles.section}>
              <View style={styles.cardHeaderLeft}>
                <IconBadge name="trophy-outline" bg={colors.surfaceAlt} color={colors.text} size={32} rounded={false} />
                <View style={styles.cardHeaderText}>
                  <Text style={typography.bodyStrong}>Top exercises</Text>
                  <Text style={typography.caption}>By sets logged · {RANGE_NOUN[range]}</Text>
                </View>
              </View>
              {metrics.top.length > 0 ? (
                <View style={styles.rankList}>
                  {metrics.top.map((t, i) => (
                    <View key={t.exercise} style={styles.rankRow}>
                      <Text style={styles.rank}>{i + 1}</Text>
                      <Text style={[typography.small, styles.rankName]} numberOfLines={1}>
                        {t.exercise}
                      </Text>
                      <Text style={typography.bodyStrong}>{t.sets} sets</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[typography.small, styles.note]}>No exercises logged in this range yet.</Text>
              )}
            </Card>
          </>
        ) : null}

        {show.progress ? (
          <ProGate
            gate="insights_full"
            icon="trending-up-outline"
            title="Lift progress over time"
            subtitle="Per-exercise trends, best sets and sparklines from your full history."
          >
            {category === "overview" ? <SectionHeader title="Lift Progress" /> : null}
            <Card style={styles.section}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <IconBadge name="trending-up-outline" bg={colors.surfaceAlt} color={colors.text} size={32} rounded={false} />
                  <View style={styles.cardHeaderText}>
                    <Text style={typography.bodyStrong}>Lift progress</Text>
                    <Text style={typography.caption}>Top set by exercise · {RANGE_NOUN[range]}</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="View all lift progress"
                  onPress={() => router.navigate("/lift-progress" as never)}
                  hitSlop={8}
                >
                  <Text style={[typography.caption, styles.progressLink]}>View all</Text>
                </Pressable>
              </View>
              {progressExercises.length > 0 ? (
                <View style={styles.progressList}>
                  {progressExercises.map((exercise, i) => {
                    const change = progressChange(exercise);
                    const spark = progressSparkValues(exercise);
                    const tone =
                      change?.tone === "positive"
                        ? colors.success
                        : change?.tone === "negative"
                          ? colors.danger
                          : colors.textDim;
                    return (
                      <View key={exercise.name}>
                        {i > 0 ? <Divider /> : null}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`View ${exercise.name} progress`}
                          onPress={() =>
                            router.navigate({
                              pathname: "/lift-progress/detail",
                              params: { name: exercise.name, days: String(rangeDays) },
                            } as never)
                          }
                          style={({ pressed }) => [styles.progressRow, pressed && styles.pressed]}
                        >
                          <View style={styles.progressText}>
                            <Text style={[typography.small, styles.progressName]} numberOfLines={1}>
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
                              width={64}
                              height={28}
                              dots={false}
                              color={change?.tone === "negative" ? colors.danger : colors.primary}
                            />
                          ) : null}
                          <Text style={[styles.progressChange, { color: tone }]}>
                            {change?.text ?? "—"}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : liftProgressError ? (
                <Text style={[typography.small, styles.note]}>
                  Could not load lift progress. Pull to refresh.
                </Text>
              ) : liftProgressLoading ? (
                <Text style={[typography.small, styles.note]}>Loading lift progress…</Text>
              ) : (
                <Text style={[typography.small, styles.note]}>
                  Log the same exercise a few times to see its trend here.
                </Text>
              )}
            </Card>
          </ProGate>
        ) : null}

        {/* Personal records */}
        {show.records ? (
          <ProGate
            gate="insights_full"
            icon="trophy-outline"
            title="Personal records"
            subtitle="Your best set per exercise, PR deltas and new records."
          >
          <Card style={styles.section}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <IconBadge name="trophy" bg={colors.surfaceAlt} color={colors.text} size={32} rounded={false} />
                <View style={styles.cardHeaderText}>
                  <Text style={typography.bodyStrong}>Personal records</Text>
                  <Text style={typography.caption}>Best kg set per exercise</Text>
                </View>
              </View>
              <Text style={typography.caption}>In range</Text>
            </View>
            {metrics.records.length > 0 ? (
              <View>
                {metrics.records.map((r, i) => (
                  <View key={r.exercise}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.recordRow}>
                      <View style={styles.recordText}>
                        <Text style={[typography.small, styles.recordName]} numberOfLines={1}>
                          {r.exercise}
                        </Text>
                        <Text style={typography.caption}>
                          {r.weight_kg} kg × {r.reps} rep{r.reps === 1 ? "" : "s"}
                        </Text>
                      </View>
                      {r.delta != null ? (
                        <Tag label={`+${r.delta} kg`} bg={colors.successSoft} text={colors.success} />
                      ) : r.isNew ? (
                        <Tag label="New PR" bg={colors.blueSoft} text={colors.blue} />
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[typography.small, styles.note]}>
                Log some lifts and your best sets show up here.
              </Text>
            )}
          </Card>
          </ProGate>
        ) : null}

        {/* Consistency */}
        {show.consistency ? (
          <ProGate
            gate="insights_full"
            icon="flame-outline"
            title="Consistency"
            subtitle="Training days in a row, week dots and your rest-day rules."
          >
          <Card style={styles.section}>
            <View style={styles.cardHeaderLeft}>
              <IconBadge name="flame" bg={colors.orangeSoft} color={colors.orange} size={32} rounded={false} />
              <View style={styles.cardHeaderText}>
                <Text style={typography.bodyStrong}>Consistency</Text>
                <Text style={typography.caption}>Training days in a row</Text>
              </View>
            </View>
            <View style={styles.streakBody}>
              <Text style={styles.streakValue}>{firstLoad ? "—" : metrics.streak}</Text>
              <Text style={typography.small}>
                {metrics.streak === 1 ? "training day" : "training days"} in a row
              </Text>
            </View>
            <View style={styles.dots}>
              {metrics.weekInfo.map((d, i) => (
                <View key={d.iso} style={styles.dotCol}>
                  <View
                    style={[styles.dot, d.trained ? styles.dotActive : d.rest ? styles.dotRest : null]}
                  />
                  <Text style={styles.dotLabel}>{weekDayLabels()[i]}</Text>
                </View>
              ))}
            </View>
            <Text style={[typography.caption, styles.note]}>
              {restDays.length > 0
                ? `Rest days: ${restDays.map((d) => WEEKDAY_NAMES[d]).join(", ")}. They don't break it.`
                : "Rest days never break it — set yours in Settings."}
            </Text>
          </Card>
          </ProGate>
        ) : null}

        <AskCoachRow
          agent="general"
          label="Ask the coach about my progress"
          hint="What's working — and what to change next"
          question="About my progress — "
        />

        <View style={styles.footerSpace} />
      </ScrollView>
    </View>
  );
}

function SummaryCard({
  icon,
  iconBg,
  iconColor,
  value,
  label,
  sub,
}: {
  icon: IoniconName;
  iconBg: string;
  iconColor: string;
  value: string;
  label: string;
  sub?: string;
}) {
  const { typography } = useTheme();
  const styles = useStyles();
  return (
    <Card padded={false} style={styles.tile}>
      <IconBadge name={icon} bg={iconBg} color={iconColor} size={28} rounded={false} />
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={[typography.caption, styles.tileLabel]} numberOfLines={2}>
        {label}
      </Text>
      {sub ? (
        <Text style={styles.tileSub} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    footerSpace: { height: spacing.xxl },
    rangeWrap: { minWidth: 132, maxWidth: 168, flexShrink: 1 },
    deepDive: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderColor: t.colors.cardBorder },
    deepDiveText: { flex: 1, gap: 2, minWidth: 0 },
    deepDiveTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

    section: { gap: spacing.md },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
    cardHeaderText: { gap: 1, flexShrink: 1 },
    note: { color: t.colors.textDim },
    chartDimmed: { opacity: 0.35 },

    metricToggle: {
      flexDirection: "row",
      gap: 3,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.pill,
      padding: 3,
    },
    metricPill: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      height: 38,
      borderRadius: radii.pill,
    },
    metricPillText: { fontSize: 14, fontWeight: "700", color: t.colors.textDim },

    changeWrap: { alignItems: "flex-end", gap: 2 },
    changePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    changeValue: { fontSize: 13, fontWeight: "800" },
    changeCaption: { ...t.typography.caption, fontSize: 10, color: t.colors.textDim },

    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    footerText: { flex: 1, color: t.colors.textDim },
    footerLink: { flexDirection: "row", alignItems: "center", gap: 2 },
    footerLinkText: { fontSize: 12, fontWeight: "700", color: t.colors.primary },
    detailRows: { gap: spacing.xs },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    detailLabel: { color: t.colors.text },

    verdictCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      padding: spacing.md,
    },
    verdictText: { flex: 1, gap: 2 },
    verdictLabel: { fontSize: 16, fontWeight: "700", color: t.colors.primary },

    summary: { flexDirection: "row", gap: spacing.sm },
    tile: {
      flex: 1,
      gap: 3,
      padding: spacing.sm + 2,
      minWidth: 0,
      overflow: "hidden",
    },
    tileValue: { ...t.typography.h2, fontSize: 20, marginTop: 2 },
    tileLabel: { color: t.colors.textDim },
    tileSub: { fontSize: 10, lineHeight: 13, fontWeight: "600", color: t.colors.textMuted },

    metricRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    down: { color: t.colors.success },
    up: { color: t.colors.textDim },
    flat: { color: t.colors.textMuted },

    xLabels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, marginTop: 2 },
    xLabel: { ...t.typography.caption, color: t.colors.textMuted, fontSize: 10, textAlign: "center" },

    rows: { gap: spacing.xs },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    rowName: { flex: 1, color: t.colors.text },

    muscleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    legend: { flex: 1, gap: spacing.sm, minWidth: 0 },
    legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    legendDot: { width: 9, height: 9, borderRadius: 5 },
    legendLabel: { flex: 1, color: t.colors.text, minWidth: 0 },
    legendPct: { color: t.colors.textDim, width: 34, textAlign: "right" },

    rankList: { gap: spacing.sm },
    rankRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    rank: { width: 16, fontSize: 12, fontWeight: "700", color: t.colors.textDim },
    rankName: { flex: 1, color: t.colors.text },

    pressed: { opacity: 0.8 },
    progressList: { gap: 0 },
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    progressText: { flex: 1, gap: 1, minWidth: 0 },
    progressName: { color: t.colors.text, fontWeight: "600" },
    progressChange: { fontSize: 12, fontWeight: "700", width: 52, textAlign: "right" },
    progressLink: { color: t.colors.primary, fontWeight: "700" },

    recordRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    recordText: { flex: 1, gap: 2 },
    recordName: { color: t.colors.text },

    streakBody: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
    streakValue: { ...t.typography.h1, fontSize: 30, fontWeight: "800" },
    dots: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
    dotCol: { alignItems: "center", gap: 6 },
    dot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: t.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    dotActive: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
    dotRest: { borderColor: t.colors.textMuted, borderStyle: "dashed" },
    dotLabel: { fontSize: 10, fontWeight: "600", color: t.colors.textMuted },

    errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
    errorTitle: { textAlign: "center" },
    errorText: { textAlign: "center", color: t.colors.textDim },
  }),
);

/**
 * Route-level fallback (expo-router picks this up): a render crash on Insights becomes
 * a friendly, retryable card instead of a red box.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <View style={styles.errorWrap}>
        <IconBadge name="alert-circle-outline" bg={colors.surface} color={colors.danger} size={56} rounded={false} />
        <Text style={[typography.h3, styles.errorTitle]}>Insights couldn&apos;t load</Text>
        <Text style={[typography.small, styles.errorText]}>
          {error?.message ?? "Something went wrong on this screen."}
        </Text>
        <Button label="Try again" icon="refresh" onPress={() => void retry()} />
      </View>
    </View>
  );
}
