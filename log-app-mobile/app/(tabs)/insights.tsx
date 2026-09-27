import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { VerdictStamp } from "../../src/components/VerdictStamp";
import { BarChart, DonutChart, Sparkline } from "../../src/components/ui/charts";
import { Card, IconBadge, LoadingState, ErrorState, Divider } from "../../src/components/ui/primitives";
import { SegmentedControl } from "../../src/components/ui/controls";
import { useInsights } from "../../src/hooks/useInsights";
import { useWeeklyVerdict } from "../../src/hooks/useWeeklyVerdict";
import { useTrends } from "../../src/hooks/useTrends";
import { formatNumber } from "../../src/utils/derive";

const RANGES = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
];

/**
 * Insights — verdict first, then the signals behind it. No streaks, no
 * cheerleading: the weekly verdict is the product, everything else is the
 * evidence for it. The range selector drives the training sections only;
 * verdict and weight use fixed windows (noted under the header).
 */
export default function InsightsScreen() {
  const [range, setRange] = useState("7");
  const rangeDays = Number(range);
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const sliceColors = [colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.chart5, colors.teal, colors.amber];
  const volumeLabel = rangeDays >= 90 ? "Last 13 weeks" : `Last ${rangeDays} days`;

  const { metrics, loading, error, refetch } = useInsights(rangeDays);
  const { data: verdict, loading: verdictLoading, refetch: refetchVerdict } = useWeeklyVerdict();
  const { data: trends, refetch: refetchTrends } = useTrends();

  const hasData = metrics.workouts > 0;

  const weightValues = useMemo(
    () => (trends?.weight ?? []).map((w) => w.avg_kg).filter((v): v is number => v != null),
    [trends],
  );
  const currentAvg = weightValues.length > 0 ? weightValues[weightValues.length - 1] : null;

  const insufficient =
    verdict != null && verdict.weight_trend_kg_per_week == null;

  const refresh = () => {
    refetch();
    refetchVerdict();
    refetchTrends();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading || verdictLoading} onRefresh={refresh} tintColor={colors.primary} />}
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
        <Text style={[typography.caption, styles.scopeNote]}>
          Training sections follow the range above. Verdict and weight use fixed windows.
        </Text>

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}

        {/* Weekly verdict — the product */}
        <Card style={styles.section}>
          <Text style={typography.bodyStrong}>Weekly Verdict</Text>
          {insufficient ? (
            <Text style={[typography.small, styles.verdictNote]}>
              {verdict?.reasoning[0] ?? "Keep logging to unlock your weekly verdict."}
            </Text>
          ) : verdict ? (
            <View style={styles.verdictBody}>
              <VerdictStamp verdict={verdict.verdict} />
              <View style={styles.signals}>
                <SignalRow
                  label="Weight trend"
                  value={verdict.weight_trend_kg_per_week != null ? `${verdict.weight_trend_kg_per_week.toFixed(2)} kg/wk` : "—"}
                />
                <SignalRow label="Strength trend" value={verdict.strength_trend ?? "—"} />
                <SignalRow label="Protein adherence" value={verdict.adherence_pct != null ? `${verdict.adherence_pct}%` : "—"} />
              </View>
              <Divider />
              <Text style={[typography.caption, styles.whyTitle]}>Why</Text>
              {verdict.reasoning.map((line, i) => (
                <Text key={i} style={[typography.small, styles.whyLine]}>
                  • {line}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={typography.small}>Loading verdict…</Text>
          )}
        </Card>

        {/* Weight signal */}
        <Card style={styles.section}>
          <Text style={typography.bodyStrong}>Weight · 4-week average</Text>
          {weightValues.length > 0 ? (
            <View style={styles.weightBody}>
              <Text style={typography.metric}>
                {currentAvg != null ? formatNumber(currentAvg) : "—"}
                <Text style={typography.metricUnit}> kg</Text>
              </Text>
              <Sparkline values={weightValues} width={300} height={110} />
            </View>
          ) : (
            <Text style={[typography.small, styles.verdictNote]}>
              Log weight on the Today screen to see your trend.
            </Text>
          )}
        </Card>

        {/* Training: volume + muscle balance */}
        <Card style={styles.section}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <IconBadge name="bar-chart-outline" bg={colors.surfaceAlt} color={colors.text} size={30} rounded={false} />
              <Text style={typography.bodyStrong}>Training Volume</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{volumeLabel}</Text>
            </View>
          </View>
          {loading && !hasData ? (
            <LoadingState label="Crunching your numbers…" />
          ) : hasData ? (
            <BarChart data={metrics.volumeSeries} />
          ) : (
            <Text style={typography.small}>No workouts in this range yet.</Text>
          )}
          {metrics.muscles.length > 0 ? (
            <>
              <Divider />
              <Text style={typography.bodyStrong}>Muscle Balance</Text>
              <View style={styles.donutWrap}>
                <DonutChart
                  slices={metrics.muscles.slice(0, 6).map((m, i) => ({
                    label: m.muscle,
                    value: m.sets,
                    color: sliceColors[i % sliceColors.length],
                  }))}
                  centerTop={String(metrics.muscles.reduce((s, m) => s + m.sets, 0))}
                  centerBottom="sets"
                />
              </View>
              <View style={styles.legend}>
                {metrics.muscles.slice(0, 6).map((m, i) => (
                  <View key={m.muscle} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: sliceColors[i % sliceColors.length] }]} />
                    <Text style={[typography.small, styles.legendLabel]} numberOfLines={1}>
                      {m.muscle}
                    </Text>
                    <Text style={typography.small}>{m.pct}%</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </Card>

        {/* Lifts: top exercises + personal records */}
        <Card style={styles.section}>
          <Text style={typography.bodyStrong}>Top Exercises</Text>
          {metrics.top.length > 0 ? (
            <View style={styles.rankList}>
              {metrics.top.map((t, i) => (
                <View key={t.exercise} style={styles.rankRow}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Text style={[typography.small, styles.rankName]} numberOfLines={1}>
                    {t.exercise}
                  </Text>
                  <Text style={typography.small}>{formatNumber(t.volume)} kg</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={typography.small}>No lifts yet.</Text>
          )}
          {metrics.records.length > 0 ? (
            <>
              <Divider />
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
            </>
          ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  const { typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.signalRow}>
      <Text style={typography.small}>{label}</Text>
      <Text style={typography.bodyStrong}>{value}</Text>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    rangeWrap: { minWidth: 132, maxWidth: 168, flexShrink: 1 },
    scopeNote: { color: t.colors.textDim, marginTop: -spacing.sm },

    section: { gap: spacing.md },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    pill: { backgroundColor: t.colors.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
    pillText: { fontSize: 11, fontWeight: "600", color: t.colors.textDim },

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
    prBadge: { backgroundColor: t.colors.successSoft, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    prBadgeNew: { backgroundColor: t.colors.blueSoft },
    prBadgeText: { fontSize: 11, fontWeight: "700", color: t.colors.success },

    verdictBody: { gap: spacing.md, marginTop: spacing.xs },
    verdictNote: { color: t.colors.textDim, marginTop: spacing.xs },
    signals: { gap: spacing.sm },
    signalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    whyTitle: { color: t.colors.textDim, marginTop: spacing.xs },
    whyLine: { color: t.colors.text, lineHeight: 19 },
    weightBody: { gap: spacing.sm, alignItems: "center" },
  }),
);
