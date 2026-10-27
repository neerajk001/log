import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { SegmentedControl } from "../../src/components/ui/controls";
import { Sparkline } from "../../src/components/ui/charts";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconBadge,
  LoadingState,
  ProgressBar,
  SectionHeader,
  Tag,
} from "../../src/components/ui/primitives";
import { LockedCard } from "../../src/components/billing/ProGate";
import { useBodyAnalysis } from "../../src/hooks/useBodyAnalysis";
import { useEntitlement } from "../../src/hooks/useEntitlement";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { formatMediumDate } from "../../src/utils/date";
import { formatNumber } from "../../src/utils/derive";
import type {
  BodyAnalysis,
  BodyAnalysisMacro,
  BodyAnalysisRange,
} from "../../src/api/types";

const RANGES: { value: BodyAnalysisRange; label: string }[] = [
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "1y", label: "1Y" },
];

function Metric({ label, value }: { label: string; value: string }) {
  const { typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[typography.caption, styles.metricLabel]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MacroCard({
  title,
  unit,
  macro,
  color,
  hitLabel,
  extra,
}: {
  title: string;
  unit: string;
  macro: BodyAnalysisMacro;
  color: string;
  hitLabel: string;
  extra?: string | null;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const hasTarget = macro.target != null && macro.target > 0;

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={typography.h3}>{title}</Text>
        {extra ? <Tag label={extra} bg={colors.surfaceAlt} text={colors.textDim} /> : null}
      </View>

      <View style={styles.averageRow}>
        <Text style={styles.average}>{macro.average != null ? formatNumber(macro.average) : "—"}</Text>
        <Text style={[typography.small, styles.averageUnit]}>
          {unit}
          {hasTarget ? ` / ${formatNumber(macro.target as number)}` : ""}
        </Text>
      </View>
      {hasTarget ? (
        <ProgressBar value={macro.average ?? 0} max={macro.target as number} color={color} />
      ) : (
        <Text style={[typography.caption, styles.note]}>No target set.</Text>
      )}

      <View style={styles.metrics}>
        <Metric
          label={hitLabel}
          value={macro.hit_rate_pct != null ? `${macro.hit_rate_pct}%` : "—"}
        />
        <Metric
          label="Weekday"
          value={macro.weekday_avg != null ? `${formatNumber(macro.weekday_avg)} ${unit}` : "—"}
        />
        <Metric
          label="Weekend"
          value={macro.weekend_avg != null ? `${formatNumber(macro.weekend_avg)} ${unit}` : "—"}
        />
      </View>

      <Text style={[typography.caption, styles.note]}>
        {macro.days_logged} {macro.days_logged === 1 ? "day" : "days"} logged
        {macro.variability != null ? ` · ±${formatNumber(macro.variability)} ${unit} day-to-day` : ""}
      </Text>
    </Card>
  );
}

export default function BodyAnalysisScreen() {
  const today = useCurrentDate();
  const [range, setRange] = useState<BodyAnalysisRange>("90d");
  const { isPro, isLocked } = useEntitlement();
  const locked = !isPro || isLocked("insights_full");
  const { data, loading, error, refetch } = useBodyAnalysis(range, today, !locked);
  // A range switch must never show the previous window's numbers under the new
  // label while the fresh read is in flight.
  const stale = data != null && data.range !== range;
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(220, width - spacing.screen * 2 - spacing.lg * 2);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch(true);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const header = (
    <ScreenHeader
      variant="detail"
      title="Body & nutrition"
      subtitle="Detailed analysis"
      onBack={() => router.back()}
    />
  );

  if (locked) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {header}
          <LockedCard
            title="Detailed body & nutrition analysis"
            subtitle="Pro breaks down your weight rate, calorie/protein hit rates, weekend patterns and estimated maintenance."
            icon="analytics-outline"
          />
          <Card style={styles.card}>
            <Text style={typography.h3}>What you&apos;ll see</Text>
            {[
              "Weight rate and plateau detection",
              "Calorie and protein hit rates",
              "Weekday vs weekend patterns",
              "Estimated maintenance calories",
              "Goal weight ETA with a data-quality check",
            ].map((item) => (
              <View key={item} style={styles.bulletRow}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <Text style={[typography.small, styles.bulletText]}>{item}</Text>
              </View>
            ))}
          </Card>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {header}

        <SegmentedControl
          value={range}
          onChange={setRange}
          options={RANGES.map((option) => ({ value: option.value, label: option.label }))}
        />

        {error ? (
          <ErrorState message={error} onRetry={() => void refetch()} />
        ) : (loading && !data) || stale ? (
          <LoadingState label="Reading your weight and nutrition…" />
        ) : !data || (data.weight.weigh_ins === 0 && data.calories.days_logged === 0) ? (
          <EmptyState
            icon="analytics-outline"
            title="Not enough data yet"
            subtitle="Log weight, calories and protein for a few weeks and the detailed analysis appears here."
          >
            <Button
              label="Go to Today"
              icon="arrow-forward"
              iconPosition="trailing"
              onPress={() => router.navigate("/(tabs)/today" as never)}
            />
          </EmptyState>
        ) : (
          <AnalysisContent data={data} chartWidth={chartWidth} />
        )}
      </ScrollView>
    </View>
  );
}

function AnalysisContent({
  data,
  chartWidth,
}: {
  data: BodyAnalysis;
  chartWidth: number;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { weight, data_quality: quality, calories, protein, implied_maintenance: maintenance } = data;
  const rate = weight.rate_kg_per_week;

  return (
    <>
      <Card style={styles.quality}>
        <IconBadge
          name={quality.sufficient ? "checkmark-circle-outline" : "information-circle-outline"}
          bg={quality.sufficient ? colors.successSoft : colors.warningSoft}
          color={quality.sufficient ? colors.success : colors.warning}
          size={36}
          rounded={false}
        />
        <View style={styles.qualityText}>
          <Text style={typography.bodyStrong} numberOfLines={1}>
            {quality.sufficient ? "Good data" : "Thin data"}
          </Text>
          <Text style={typography.small} numberOfLines={2}>
            {quality.days_with_calories} of {quality.days} days logged · {quality.weigh_ins} weigh-ins
            {quality.sufficient ? "" : " — treat this as directional."}
          </Text>
        </View>
      </Card>

      <SectionHeader title="Weight" />
      <Card style={styles.card}>
        <View style={styles.weightTop}>
          <View>
            <View style={styles.weightValueRow}>
              <Text style={styles.weightValue}>
                {weight.latest_kg != null ? weight.latest_kg.toFixed(1) : "—"}
              </Text>
              <Text style={[typography.small, styles.averageUnit]}>kg latest</Text>
            </View>
            <Text style={[typography.caption, styles.note]}>
              {weight.average_7d_kg != null
                ? `7-day average ${weight.average_7d_kg.toFixed(1)} kg`
                : "No 7-day average yet"}
            </Text>
          </View>
          {weight.plateau ? (
            <Tag label="PLATEAU" bg={colors.warningSoft} text={colors.warning} />
          ) : null}
        </View>

        {weight.points.length >= 2 ? (
          <Sparkline
            values={weight.points.map((point) => point.kg)}
            width={chartWidth}
            height={92}
            dots={weight.points.length < 40}
          />
        ) : null}

        <View style={styles.metrics}>
          <Metric
            label="Rate"
            value={rate != null ? `${rate > 0 ? "+" : ""}${rate.toFixed(2)} kg/wk` : "—"}
          />
          <Metric
            label="Change"
            value={weight.change_kg != null ? `${weight.change_kg > 0 ? "+" : ""}${weight.change_kg.toFixed(1)} kg` : "—"}
          />
          <Metric
            label="Goal"
            value={
              weight.goal?.weeks_to_target != null
                ? `~${weight.goal.weeks_to_target} wk`
                : weight.goal?.target_kg != null
                  ? `${weight.goal.target_kg} kg`
                  : "—"
            }
          />
        </View>

        {weight.goal?.target_kg != null ? (
          <Text style={[typography.caption, styles.note]}>
            Target {weight.goal.target_kg} kg
            {weight.goal.weeks_to_target != null && weight.goal.target_date
              ? ` · around ${formatMediumDate(weight.goal.target_date)} at this rate`
              : weight.goal.direction === "maintaining"
                ? " · maintaining"
                : " · need a clearer trend for an ETA"}
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Nutrition" />
      <MacroCard
        title="Calories"
        unit="kcal"
        macro={calories}
        color={colors.primary}
        hitLabel="On target"
      />
      <MacroCard
        title="Protein"
        unit="g"
        macro={protein}
        color={colors.success}
        hitLabel="Target hit"
        extra={
          protein.grams_per_kg != null ? `${protein.grams_per_kg.toFixed(1)} g/kg` : null
        }
      />

      <SectionHeader title="Energy balance" />
      {maintenance ? (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={typography.h3}>Estimated maintenance</Text>
            <Tag label="ESTIMATE" bg={colors.surfaceAlt} text={colors.textDim} />
          </View>
          <View style={styles.averageRow}>
            <Text style={styles.average}>{formatNumber(maintenance.kcal)}</Text>
            <Text style={[typography.small, styles.averageUnit]}>kcal / day</Text>
          </View>
          <Text style={[typography.small, styles.note]}>
            Likely range {formatNumber(maintenance.low)}–{formatNumber(maintenance.high)} kcal
          </Text>
          <Text style={[typography.caption, styles.note]}>{maintenance.note}</Text>
          <Text style={[typography.caption, styles.note]}>
            Estimate assumes about 7,700 kcal per kg of body-weight change. Use it as a direction,
            not a prescription.
          </Text>
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text style={typography.bodyStrong}>Maintenance estimate needs more data</Text>
          <Text style={[typography.small, styles.note]}>
            It needs at least three weeks of weigh-ins and consistent calorie logs.
          </Text>
        </Card>
      )}

      {data.insights.length > 0 ? (
        <>
          <SectionHeader title="What this means" />
          <Card style={styles.card}>
            {data.insights.map((insight) => (
              <View key={insight} style={styles.bulletRow}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <Text style={[typography.small, styles.bulletText]}>{insight}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Text style={[typography.caption, styles.footer]}>
        Analysis only — not medical advice. The weekly verdict remains the instruction.
      </Text>
    </>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.md },
    card: { gap: spacing.sm },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    quality: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    qualityText: { flex: 1, gap: 2, minWidth: 0 },
    weightTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    weightValueRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
    weightValue: { fontSize: 34, fontWeight: "700", color: t.colors.text },
    averageRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
    average: { fontSize: 30, fontWeight: "700", color: t.colors.text },
    averageUnit: { color: t.colors.textDim },
    metrics: {
      flexDirection: "row",
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.xs,
    },
    metric: { flex: 1, alignItems: "center", gap: 1, paddingHorizontal: 2 },
    metricValue: { fontSize: 14, fontWeight: "700", color: t.colors.text },
    metricLabel: { color: t.colors.textMuted },
    note: { color: t.colors.textDim },
    bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    dot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
    bulletText: { flex: 1, color: t.colors.text, lineHeight: 19 },
    footer: { color: t.colors.textMuted, textAlign: "center", lineHeight: 17, marginTop: spacing.sm },
  }),
);
