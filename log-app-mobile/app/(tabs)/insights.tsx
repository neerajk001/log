import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, shadows, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { BarChart, Sparkline } from "../../src/components/ui/charts";
import {
  Card,
  ErrorState,
  IconBadge,
  LoadingState,
  SectionHeader,
  type IoniconName,
} from "../../src/components/ui/primitives";
import { SegmentedControl } from "../../src/components/ui/controls";
import { useInsights } from "../../src/hooks/useInsights";
import { useTrends } from "../../src/hooks/useTrends";
import { useMe } from "../../src/hooks/useMe";
import { AskCoachRow } from "../../src/components/coach/AskCoachRow";
import { formatNumber } from "../../src/utils/derive";
import { formatMediumDate, weekDayLabels } from "../../src/utils/date";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RANGES = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
];

function signedPct(n: number | null): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
}

/**
 * Insights — a plain-language progress summary: how consistent you've been,
 * the headline numbers, your volume trend, where that volume went, your best
 * lifts, and a streak. The weekly verdict lives on its own screen (`/verdict`).
 */
export default function InsightsScreen() {
  const [range, setRange] = useState("7");
  const rangeDays = Number(range);
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { profile } = useMe();
  const restDays = profile?.rest_days ?? [];

  const { metrics, loading, error, refetch } = useInsights(rangeDays, restDays);
  const { data: trends, loading: trendsLoading, refetch: refetchTrends } = useTrends();

  const weightValues = useMemo(
    () => (trends?.weight ?? []).map((w) => w.avg_kg).filter((v): v is number => v != null),
    [trends],
  );
  const currentAvg = weightValues.length > 0 ? weightValues[weightValues.length - 1] : null;
  const adherence = trends?.adherence_pct ?? null;

  // Recent weekly averages, newest first, with the change vs the prior week.
  const recentWeeks = useMemo(() => {
    const points = (trends?.weight ?? []).filter((w) => w.avg_kg != null);
    const last = points.slice(-6);
    const rows = last.map((w, i) => {
      const globalIndex = points.length - last.length + i;
      const prev = globalIndex > 0 ? points[globalIndex - 1].avg_kg : null;
      return {
        week_start: w.week_start,
        avg: w.avg_kg as number,
        delta: prev != null && w.avg_kg != null ? w.avg_kg - prev : null,
      };
    });
    return rows
      .reverse()
      .map((r, i) => ({
        ...r,
        label: i === 0 ? "This week" : i === 1 ? "Last week" : formatMediumDate(r.week_start),
      }));
  }, [trends]);

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

        {/* Consistency summary */}
        <MotivationCard
          icon="pulse"
          iconBg={colors.primarySoft}
          iconColor={colors.primary}
          title={metrics.workoutsThisWeek > 0 ? "You're consistent!" : "Let's get started"}
          subtitle={
            metrics.workoutsThisWeek > 0
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
            value={String(metrics.workouts)}
            label="Workouts"
          />
          <MetricTile
            icon="layers"
            iconBg={colors.blueSoft}
            iconColor={colors.blue}
            value={String(metrics.sets)}
            label="Sets"
          />
          <MetricTile
            icon="trending-up"
            iconBg={colors.greenSoft}
            iconColor={colors.green}
            value={signedPct(metrics.strengthPct)}
            label="Strength"
          />
          <MetricTile
            icon="checkmark-circle"
            iconBg={colors.orangeSoft}
            iconColor={colors.orange}
            value={adherence != null ? `${adherence}%` : "—"}
            label="Adherence"
          />
        </View>

        <SectionHeader title="Progress" />

        {/* Weight (R5) */}
        <Card style={styles.section}>
          <View style={styles.cardHeaderLeft}>
            <IconBadge name="scale-outline" bg={colors.surfaceAlt} color={colors.text} size={30} rounded={false} />
            <Text style={typography.bodyStrong}>Weight · weekly average</Text>
          </View>
          {weightValues.length > 0 ? (
            <>
              <View style={styles.weightBody}>
                <Text style={typography.metric}>
                  {currentAvg != null ? formatNumber(currentAvg) : "—"}
                  <Text style={typography.metricUnit}> kg</Text>
                </Text>
                <Sparkline values={weightValues} width={300} height={90} />
              </View>
              {recentWeeks.length > 1 ? (
                <View style={styles.weekList}>
                  {recentWeeks.map((w) => (
                    <View key={w.week_start} style={styles.weekRow}>
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
                Average of your daily weights, each week.
              </Text>
            </>
          ) : (
            <Text style={[typography.small, styles.note]}>
              Log weight on the Today screen to see your trend.
            </Text>
          )}
        </Card>

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
            <Text style={styles.streakValue}>{metrics.streak}</Text>
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
  }),
);
