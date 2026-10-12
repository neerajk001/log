import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type ErrorBoundaryProps } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, shadows, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { BarChart, Sparkline } from "../../src/components/ui/charts";
import {
  Banner,
  Button,
  Card,
  Divider,
  ErrorState,
  IconBadge,
  LoadingState,
  SectionHeader,
  type IoniconName,
} from "../../src/components/ui/primitives";
import { SegmentedControl, Chip, ChipRow } from "../../src/components/ui/controls";
import { useInsights } from "../../src/hooks/useInsights";
import { useTrends } from "../../src/hooks/useTrends";
import { useMe } from "../../src/hooks/useMe";
import { useWeeklyVerdict } from "../../src/hooks/useWeeklyVerdict";
import { AskCoachRow } from "../../src/components/coach/AskCoachRow";
import { VERDICT_LABELS } from "../../src/components/VerdictStamp";
import { formatNumber } from "../../src/utils/derive";
import { startOfWeek, todayLocal, weekDayLabels } from "../../src/utils/date";
import type { TrendRange } from "../../src/api/types";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const FULL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const RANGES: { value: TrendRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "1y", label: "1Y" },
];

/** The range also picks the training window for the metrics below. */
const RANGE_DAYS: Record<TrendRange, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

/** Nutrition windows — always shown as weekly averages. */
const NUTRITION_WINDOWS: { weeks: number; label: string; phrase: string }[] = [
  { weeks: 1, label: "1W", phrase: "week" },
  { weeks: 2, label: "2W", phrase: "2 weeks" },
  { weeks: 3, label: "3W", phrase: "3 weeks" },
  { weeks: 4, label: "1M", phrase: "1 month" },
  { weeks: 8, label: "2M", phrase: "2 months" },
  { weeks: 13, label: "3M", phrase: "3 months" },
  { weeks: 26, label: "6M", phrase: "6 months" },
  { weeks: 52, label: "1Y", phrase: "1 year" },
];

function signedPct(n: number | null): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
}

/** Label for one series bucket: weekday, "Wk Oct 5", or a month name. */
function bucketLabel(start: string, bucket: "day" | "week" | "month"): string {
  const d = new Date(`${start}T00:00:00Z`);
  if (bucket === "day") return WEEKDAY_NAMES[d.getUTCDay()];
  if (bucket === "week") return `Wk ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return MONTH_NAMES[d.getUTCMonth()];
}

function monthLabel(start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  return `${FULL_MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const BUCKET_NOUN: Record<"day" | "week" | "month", string> = {
  day: "day",
  week: "week",
  month: "month",
};

const BUCKET_ADJECTIVE: Record<"day" | "week" | "month", string> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
};

/**
 * Insights — a plain-language progress summary: how consistent you've been,
 * the headline numbers, your volume trend, where that volume went, your best
 * lifts, and a streak. The weekly verdict lives on its own screen (`/verdict`).
 */
export default function InsightsScreen() {
  const [range, setRange] = useState<TrendRange>("7d");
  const [nutritionMetric, setNutritionMetric] = useState<"calories" | "protein">("calories");
  const [nutritionWeeks, setNutritionWeeks] = useState(1);
  const [weightRowsOpen, setWeightRowsOpen] = useState(false);
  const [consistencyOpen, setConsistencyOpen] = useState(false);
  const rangeDays = RANGE_DAYS[range];
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { profile } = useMe();
  const restDays = profile?.rest_days ?? [];

  const { metrics, loading, error, refetch } = useInsights(rangeDays, restDays);
  const {
    data: trends,
    loading: trendsLoading,
    error: trendsError,
    refetch: refetchTrends,
  } = useTrends(range, nutritionWeeks);
  const { data: verdict } = useWeeklyVerdict();

  // The hook's own first-load idiom: nothing has arrived yet, so show "—" rather than
  // numbers that read as real zeros (a slow load shouldn't look like a broken streak).
  const firstLoad = loading && metrics.sets === 0 && metrics.workouts === 0;

  const weightValues = useMemo(
    () => (trends?.series ?? []).map((b) => b.weight_kg).filter((v): v is number => v != null),
    [trends],
  );
  const currentAvg = weightValues.length > 0 ? weightValues[weightValues.length - 1] : null;
  const adherence = trends?.adherence_pct ?? null;
  const trackWeight = profile?.track_weight !== false;
  // The verdict entry moved here from Today. A call the engine derived from
  // strength + adherence is usable without weigh-ins, but a weight-tracker with
  // no trend yet shouldn't be told to "hold".
  const verdictUsable =
    verdict != null && (!trackWeight || verdict.weight_trend_kg_per_week != null);
  const verdictLabel = verdictUsable ? VERDICT_LABELS[verdict.verdict] : null;
  const verdictNote =
    verdictUsable && verdict.weight_trend_kg_per_week != null
      ? `${verdict.weight_trend_kg_per_week > 0 ? "+" : ""}${verdict.weight_trend_kg_per_week.toFixed(2)} kg/week`
      : verdictUsable
        ? "From your strength and consistency"
        : null;
  const bucketSize = trends?.bucket ?? "week";
  const months = trends?.months ?? [];
  const latestMonth = months[0] ?? null;
  // One-line preview shown while the consistency card is collapsed.
  const latestMonthPreview = latestMonth
    ? [
        monthLabel(latestMonth.month_start),
        `${latestMonth.workouts} workout${latestMonth.workouts === 1 ? "" : "s"}`,
        latestMonth.calorie_adherence_pct != null
          ? `${latestMonth.calorie_adherence_pct}% calories`
          : null,
        latestMonth.protein_adherence_pct != null
          ? `${latestMonth.protein_adherence_pct}% protein`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  // The most recent buckets, newest first, with the change vs the bucket before.
  const recentBuckets = useMemo(() => {
    const size = trends?.bucket ?? "week";
    const points = (trends?.series ?? []).filter((b) => b.weight_kg != null);
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
        label: i === 0 ? "Latest" : bucketLabel(b.start, size),
      }));
  }, [trends]);

  const nutritionValues = useMemo(
    () =>
      (trends?.nutrition ?? [])
        .map((b) => (nutritionMetric === "calories" ? b.calories : b.protein_g))
        .filter((v): v is number => v != null),
    [trends, nutritionMetric],
  );
  const nutritionWindow =
    NUTRITION_WINDOWS.find((w) => w.weeks === nutritionWeeks) ?? NUTRITION_WINDOWS[0];
  const currentNutrition =
    nutritionValues.length > 0 ? nutritionValues[nutritionValues.length - 1] : null;
  const rangeAverage =
    nutritionValues.length > 0
      ? Math.round(nutritionValues.reduce((a, b) => a + b, 0) / nutritionValues.length)
      : null;
  const nutritionUnit = nutritionMetric === "calories" ? "kcal" : "g";
  /**
   * The window ends on the current week when it has completed days, otherwise on the last
   * complete week — so a Monday shows last week's average instead of nothing. The label
   * follows the data rather than assuming which week it is.
   */
  const nutritionBuckets = trends?.nutrition ?? [];
  const newestNutritionWeek = nutritionBuckets[nutritionBuckets.length - 1] ?? null;
  const nutritionWeekLabel =
    nutritionWeeks === 1
      ? newestNutritionWeek?.start === startOfWeek(todayLocal())
        ? "This week"
        : "Last week"
      : `Average · last ${nutritionWindow.phrase}`;
  const nutritionLoggedDays = nutritionBuckets.reduce((sum, b) => sum + b.days, 0);
  const proteinTarget = profile?.protein_target_g ?? null;
  const calorieTarget = profile?.calorie_target ?? null;
  const nutritionTarget = nutritionMetric === "calories" ? calorieTarget : proteinTarget;
  const targetDeltaPct =
    nutritionTarget != null && rangeAverage != null && nutritionTarget > 0
      ? Math.round(((rangeAverage - nutritionTarget) / nutritionTarget) * 100)
      : null;

  const refresh = () => {
    refetch();
    refetchTrends();
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
              <SegmentedControl value={range} onChange={setRange} options={RANGES} />
            </View>
          }
        />

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}
        {trendsError ? (
          <Banner
            tone="danger"
            message={trendsError}
            actionLabel="Retry"
            onAction={refetchTrends}
            style={styles.section}
          />
        ) : null}

        {/* Weekly verdict entry — moved off Today */}
        {verdictLabel ? (
          <Pressable
            style={styles.verdictCard}
            onPress={() => router.navigate("/verdict" as never)}
            accessibilityRole="button"
            accessibilityLabel={`Weekly verdict: ${verdictLabel}`}
          >
            <IconBadge name="ribbon-outline" bg={colors.primarySoft} color={colors.primary} size={36} rounded={false} />
            <View style={styles.verdictText}>
              <Text style={typography.caption}>Weekly verdict</Text>
              <Text style={styles.verdictLabel}>{verdictLabel}</Text>
              {verdictNote ? <Text style={typography.small}>{verdictNote}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {/* Consistency summary */}
        <MotivationCard
          icon="pulse"
          iconBg={colors.primarySoft}
          iconColor={colors.primary}
          title={
            firstLoad
              ? "Your week"
              : metrics.workoutsThisWeek > 0
                ? "You're consistent!"
                : "Let's get started"
          }
          subtitle={
            firstLoad
              ? "Loading your week…"
              : metrics.workoutsThisWeek > 0
                ? `${metrics.workoutsThisWeek} workout${metrics.workoutsThisWeek === 1 ? "" : "s"} this week`
                : "No workouts logged this week yet"
          }
          onPress={() => router.navigate("/(tabs)/history" as never)}
        />

        {/* Key metrics */}
        <View style={styles.tiles}>
          <MetricTile
            icon="barbell"
            iconBg={colors.purpleSoft}
            iconColor={colors.purple}
            value={firstLoad ? "—" : String(metrics.workouts)}
            label="Workouts"
          />
          <MetricTile
            icon="layers"
            iconBg={colors.blueSoft}
            iconColor={colors.blue}
            value={firstLoad ? "—" : String(metrics.sets)}
            label="Sets"
          />
          <MetricTile
            icon="trending-up"
            iconBg={colors.greenSoft}
            iconColor={colors.green}
            value={firstLoad ? "—" : signedPct(metrics.strengthPct)}
            label="Strength"
          />
          <MetricTile
            icon="checkmark-circle"
            iconBg={colors.orangeSoft}
            iconColor={colors.orange}
            value={firstLoad ? "—" : adherence != null ? `${adherence}%` : "—"}
            label="Adherence"
          />
        </View>

        <SectionHeader title="Progress" />

        {/* Weight (R5) — the per-bucket list collapses; the number and chart stay */}
        {trackWeight ? (
        <Card style={styles.section}>
          <Pressable
            onPress={() => setWeightRowsOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={`Recent ${BUCKET_NOUN[bucketSize]}s`}
            accessibilityState={{ expanded: weightRowsOpen }}
            style={styles.cardHeader}
          >
            <View style={styles.cardHeaderLeft}>
              <IconBadge name="scale-outline" bg={colors.surfaceAlt} color={colors.text} size={30} rounded={false} />
              <Text style={typography.bodyStrong}>
                Weight · {BUCKET_ADJECTIVE[bucketSize]} average
              </Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={typography.caption}>
                {recentBuckets.length} {BUCKET_NOUN[bucketSize]}
                {recentBuckets.length === 1 ? "" : "s"}
              </Text>
              <Ionicons
                name={weightRowsOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.textMuted}
              />
            </View>
          </Pressable>
          {weightValues.length > 0 ? (
            <>
              <View style={styles.weightBody}>
                <Text style={typography.metric}>
                  {currentAvg != null ? formatNumber(currentAvg) : "—"}
                  <Text style={typography.metricUnit}> kg</Text>
                </Text>
                <Sparkline values={weightValues} width={300} height={90} />
              </View>
              {weightRowsOpen && recentBuckets.length > 1 ? (
                <View style={styles.weekList}>
                  {recentBuckets.map((w) => (
                    <View key={w.start} style={styles.weekRow}>
                      <Text style={[typography.small, styles.weekLabel]} numberOfLines={1}>
                        {w.label}
                      </Text>
                      <Text style={typography.bodyStrong}>{formatNumber(w.avg)} kg</Text>
                      <Text
                        style={[
                          typography.small,
                          w.delta == null
                            ? styles.weekFlat
                            : w.delta < 0
                              ? styles.weekDown
                              : styles.weekUp,
                        ]}
                      >
                        {w.delta == null ? "—" : `${w.delta > 0 ? "+" : ""}${w.delta.toFixed(1)} kg`}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={[typography.small, styles.note]}>
                Average of your daily weights, per {BUCKET_NOUN[bucketSize]}.
                {recentBuckets.length > 1 && !weightRowsOpen
                  ? ` Tap the header for each ${BUCKET_NOUN[bucketSize]}.`
                  : ""}
              </Text>
            </>
          ) : (
            <Text style={[typography.small, styles.note]}>
              Log weight on the Today screen to see your trend.
            </Text>
          )}
        </Card>
        ) : null}

        {/* Nutrition — calories/protein, one chart with a toggle */}
        <Card style={styles.section}>
          <View style={styles.cardHeaderLeft}>
            <IconBadge name="nutrition-outline" bg={colors.surfaceAlt} color={colors.text} size={30} rounded={false} />
            <Text style={typography.bodyStrong}>Nutrition · weekly average</Text>
          </View>

          <SegmentedControl
            value={nutritionMetric}
            onChange={setNutritionMetric}
            options={[
              { value: "calories", label: "Calories" },
              { value: "protein", label: "Protein" },
            ]}
          />

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

          {nutritionValues.length > 0 ? (
            <>
              <View style={styles.weightBody}>
                <Text style={[typography.caption, styles.note]}>{nutritionWeekLabel}</Text>
                <Text style={typography.metric}>
                  {rangeAverage != null ? formatNumber(rangeAverage) : "—"}
                  <Text style={typography.metricUnit}> {nutritionUnit}</Text>
                </Text>
                <Sparkline
                  values={nutritionValues}
                  width={300}
                  height={90}
                  color={nutritionMetric === "calories" ? colors.orange : colors.blue}
                  dots={nutritionValues.length <= 16}
                />
              </View>
              <Text style={[typography.small, styles.note]}>
                {nutritionValues.length > 1
                  ? `Mean of ${nutritionValues.length} weekly averages · from ${nutritionLoggedDays} logged day${
                      nutritionLoggedDays === 1 ? "" : "s"
                    }, completed days only.`
                  : `From ${nutritionLoggedDays} logged day${
                      nutritionLoggedDays === 1 ? "" : "s"
                    }, completed days only.`}
              </Text>
            </>
          ) : (
            <Text style={[typography.small, styles.note]}>
              No completed days logged in this window yet — anything you log today counts from
              tomorrow.
            </Text>
          )}

          {nutritionTarget != null || rangeAverage != null ? (
            <>
              <Divider />
              <View style={styles.weekList}>
                <View style={styles.weekRow}>
                  <Text style={[typography.small, styles.weekLabel]}>Target</Text>
                  <Text style={typography.bodyStrong}>
                    {nutritionTarget != null
                      ? `${formatNumber(nutritionTarget)} ${nutritionUnit}`
                      : "Not set"}
                  </Text>
                </View>
                {nutritionWeeks > 1 ? (
                  <View style={styles.weekRow}>
                    <Text style={[typography.small, styles.weekLabel]}>Latest week</Text>
                    <Text style={typography.bodyStrong}>
                      {currentNutrition != null
                        ? `${formatNumber(currentNutrition)} ${nutritionUnit}`
                        : "—"}
                    </Text>
                  </View>
                ) : null}
                {targetDeltaPct != null ? (
                  <View style={styles.weekRow}>
                    <Text style={[typography.small, styles.weekLabel]}>vs target</Text>
                    <Text style={[typography.small, styles.weekFlat]}>
                      {targetDeltaPct > 0
                        ? `${targetDeltaPct}% over`
                        : `${Math.abs(targetDeltaPct)}% under`}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[typography.small, styles.note]}>
                Target from Settings, compared with this window average.
              </Text>
            </>
          ) : (
            <Text style={[typography.small, styles.note]}>
              Set calorie and protein targets in Settings to compare them here.
            </Text>
          )}
        </Card>

        {/* Consistency, month by month — collapsed to a one-line preview */}
        {months.length > 0 ? (
          <Card style={styles.section}>
            <Pressable
              onPress={() => setConsistencyOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Consistency by month"
              accessibilityState={{ expanded: consistencyOpen }}
              style={styles.cardHeader}
            >
              <View style={styles.cardHeaderLeft}>
                <IconBadge name="calendar-outline" bg={colors.surfaceAlt} color={colors.text} size={30} rounded={false} />
                <Text style={typography.bodyStrong}>Consistency · by month</Text>
              </View>
              <View style={styles.headerRight}>
                <Text style={typography.caption}>{months.length} months</Text>
                <Ionicons
                  name={consistencyOpen ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.textMuted}
                />
              </View>
            </Pressable>

            {consistencyOpen ? (
              <>
                <View style={styles.monthList}>
                  {months.map((m) => (
                    <View key={m.month_start} style={styles.monthRow}>
                      <View style={styles.monthHead}>
                        <Text style={typography.bodyStrong}>{monthLabel(m.month_start)}</Text>
                        <Text style={typography.small}>
                          {m.workouts} workout{m.workouts === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <Text style={[typography.small, styles.monthLine]}>
                        {m.days_logged === 0
                          ? "Nothing logged this month"
                          : [
                              m.calories != null ? `avg ${formatNumber(m.calories)} kcal` : null,
                              m.protein_g != null ? `${m.protein_g} g protein` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </Text>
                      <Text style={[typography.small, styles.monthLine]}>
                        {[
                          m.protein_adherence_pct != null ? `protein ${m.protein_adherence_pct}%` : null,
                          m.calorie_adherence_pct != null ? `calories ${m.calorie_adherence_pct}%` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Set targets in Settings to track these"}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[typography.small, styles.note]}>
                  Days you hit each target, and what you averaged, month by month — completed days
                  only.
                </Text>
              </>
            ) : (
              <Text style={[typography.small, styles.note]}>{latestMonthPreview}</Text>
            )}
          </Card>
        ) : null}

        {/* Sets per week */}
        <Card style={styles.section}>
          <View style={styles.cardHeaderLeft}>
            <IconBadge name="bar-chart-outline" bg={colors.surfaceAlt} color={colors.text} size={30} rounded={false} />
            <Text style={typography.bodyStrong}>Sets per week</Text>
          </View>
          {loading && metrics.sets === 0 ? (
            <LoadingState label="Crunching your numbers…" />
          ) : metrics.sets > 0 ? (
            <BarChart data={metrics.setsSeries} axis />
          ) : (
            <Text style={typography.small}>No workouts in this range yet.</Text>
          )}
          <Text style={[typography.small, styles.note]}>Sets you logged each week.</Text>
        </Card>

        <SectionHeader title="Training" />

        {/* Muscle groups */}
        {metrics.muscles.length > 0 ? (
          <Card style={styles.section}>
            <Text style={typography.bodyStrong}>Muscle groups</Text>
            <Text style={[typography.small, styles.note]}>Sets logged per muscle group.</Text>
            <View style={styles.rankList}>
              {metrics.muscles.slice(0, 6).map((m) => (
                <View key={m.muscle} style={styles.muscleRow}>
                  <Text style={[typography.small, styles.rankName]} numberOfLines={1}>
                    {m.muscle}
                  </Text>
                  <Text style={typography.bodyStrong}>{m.sets} sets</Text>
                  <Text style={[typography.small, styles.musclePct]}>{m.pct}%</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Personal records */}
        {metrics.records.length > 0 ? (
          <Card style={styles.section}>
            <Text style={typography.bodyStrong}>Personal Records</Text>
            <View style={styles.rankList}>
              {metrics.records.slice(0, 4).map((r) => (
                <View key={r.exercise} style={styles.recordRow}>
                  <View style={styles.recordText}>
                    <Text style={[typography.small, styles.recordName]} numberOfLines={1}>
                      {r.exercise}
                    </Text>
                    <Text style={typography.caption}>
                      {r.weight_kg} kg × {r.reps} reps
                    </Text>
                  </View>
                  {r.delta != null ? (
                    <View style={styles.prBadge}>
                      <Text style={styles.prBadgeText}>+{r.delta} kg</Text>
                    </View>
                  ) : r.isNew ? (
                    <View style={[styles.prBadge, styles.prBadgeNew]}>
                      <Text style={[styles.prBadgeText, { color: colors.blue }]}>New PR</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Top exercises */}
        {metrics.top.length > 0 ? (
          <Card style={styles.section}>
            <Text style={typography.bodyStrong}>Top exercises</Text>
            <View style={styles.rankList}>
              {metrics.top.map((t, i) => (
                <View key={t.exercise} style={styles.rankRow}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Text style={[typography.small, styles.rankName]} numberOfLines={1}>
                    {t.exercise}
                  </Text>
                  <Text style={typography.small}>{t.sets} sets</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Streak */}
        <Card style={styles.section}>
          <View style={styles.cardHeaderLeft}>
            <IconBadge name="flame" bg={colors.orangeSoft} color={colors.orange} size={30} rounded={false} />
            <Text style={typography.bodyStrong}>Streak</Text>
          </View>
          <View style={styles.streakBody}>
            <Text style={styles.streakValue}>{firstLoad ? "—" : metrics.streak}</Text>
            <Text style={typography.small}>
              {metrics.streak === 1 ? "training day in a row" : "training days in a row"}
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
          <Text style={[typography.small, styles.note]}>
            {restDays.length > 0
              ? `Rest days: ${restDays.map((d) => WEEKDAY_NAMES[d]).join(", ")}. They don't break it.`
              : "Rest days never break it — set yours in Settings."}
          </Text>
        </Card>

        <AskCoachRow
          agent="general"
          label="Ask the coach about my progress"
          hint="What's working — and what to change next"
          question="About my progress — "
        />
      </ScrollView>
    </View>
  );
}

function MetricTile({
  icon,
  iconBg,
  iconColor,
  value,
  unit,
  label,
}: {
  icon: IoniconName;
  iconBg: string;
  iconColor: string;
  value: string;
  unit?: string;
  label: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <IconBadge name={icon} bg={iconBg} color={iconColor} size={34} rounded={false} />
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MotivationCard({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  onPress,
}: {
  icon: IoniconName;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.motivCard, pressed && onPress ? styles.pressed : null]}
    >
      <IconBadge name={icon} bg={iconBg} color={iconColor} size={40} rounded={false} />
      <View style={styles.motivText}>
        <Text style={typography.bodyStrong}>{title}</Text>
        <Text style={[typography.small, styles.motivSub]}>{subtitle}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    rangeWrap: { minWidth: 132, maxWidth: 168, flexShrink: 1 },

    section: { gap: spacing.md },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    pill: {
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
    },
    pillText: { fontSize: 11, fontWeight: "600", color: t.colors.textDim },
    note: { color: t.colors.textDim },

    motivCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.lg,
      ...shadows.card,
    },
    motivText: { flex: 1, gap: 2 },
    motivSub: { color: t.colors.textDim },
    pressed: { opacity: 0.85 },

    verdictCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
      ...shadows.card,
    },
    verdictText: { flex: 1, gap: 2 },
    verdictLabel: { fontSize: 16, fontWeight: "700", color: t.colors.primary },

    tiles: { flexDirection: "row", gap: spacing.sm },
    tile: {
      flex: 1,
      alignItems: "center",
      gap: 6,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      paddingVertical: spacing.md,
      paddingHorizontal: 4,
      minWidth: 0,
    },
    tileValue: { ...t.typography.h2, fontSize: 18 },
    tileUnit: { fontSize: 11, fontWeight: "500", color: t.colors.textDim },
    tileLabel: { ...t.typography.caption, color: t.colors.textDim },

    weightBody: { gap: spacing.sm, alignItems: "center" },

    weekList: { gap: spacing.xs },
    weekRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    weekLabel: { flex: 1, color: t.colors.text },
    weekUp: { color: t.colors.success },
    weekDown: { color: t.colors.blue },
    weekFlat: { color: t.colors.textMuted },

    monthList: { gap: spacing.md },
    monthRow: { gap: 3 },
    monthHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    monthLine: { color: t.colors.textDim },

    muscleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    musclePct: { color: t.colors.textDim, width: 40, textAlign: "right" },

    donutWrap: { alignItems: "center", paddingVertical: spacing.sm },
    legend: { gap: spacing.sm },
    legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendLabel: { flex: 1, color: t.colors.text },

    rankList: { gap: spacing.sm },
    rankRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    rank: { width: 16, fontSize: 12, fontWeight: "700", color: t.colors.textDim },
    rankName: { flex: 1, color: t.colors.text },
    recordRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    recordText: { flex: 1, gap: 2 },
    recordName: { color: t.colors.text },
    prBadge: {
      backgroundColor: t.colors.successSoft,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    prBadgeNew: { backgroundColor: t.colors.blueSoft },
    prBadgeText: { fontSize: 11, fontWeight: "700", color: t.colors.success },

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
