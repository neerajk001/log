import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../src/theme/ThemeContext";
import { spacing } from "../src/theme/spacing";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { VerdictStamp, VERDICT_LABELS } from "../src/components/VerdictStamp";
import { Card, Divider, ErrorState, LoadingState } from "../src/components/ui/primitives";
import { useWeeklyVerdict } from "../src/hooks/useWeeklyVerdict";
import { useMe } from "../src/hooks/useMe";
import { formatNumber } from "../src/utils/derive";
import type { VerdictKind } from "../src/api/types";

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** What each verdict means in plain words, and the one thing to do about it. */
const VERDICT_COPY: Record<VerdictKind, { meaning: string; action: string }> = {
  hold: {
    meaning: "Your rate of change and your strength both look right.",
    action: "Keep everything as it is this week — same food, same training.",
  },
  adjust_calories: {
    meaning: "Your weight isn't responding the way the plan expects.",
    action: "Change one thing this week: your intake. Keep training as it is.",
  },
  check_recovery: {
    meaning: "Your strength has dropped two weeks in a row.",
    action: "Prioritise sleep and food this week, and don't add load yet.",
  },
};

/** Weekly verdict detail — the verdict, its three signals, and the reasoning. */
export default function VerdictScreen() {
  const { typography } = useTheme();
  const styles = useStyles();
  const { data: verdict, loading, error, refetch } = useWeeklyVerdict();
  const { profile } = useMe();

  const insufficient =
    verdict != null && profile?.track_weight !== false && verdict.weight_trend_kg_per_week == null;
  const weightTrend =
    verdict?.weight_trend_kg_per_week != null
      ? `${verdict.weight_trend_kg_per_week > 0 ? "+" : ""}${verdict.weight_trend_kg_per_week.toFixed(2)} kg/week`
      : "—";
  const copy = verdict ? VERDICT_COPY[verdict.verdict] : null;
  const changeLine =
    verdict == null
      ? ""
      : verdict.previous_verdict == null
        ? "First verdict — from next week you'll see what changed."
        : verdict.previous_verdict === verdict.verdict
          ? `Same call as last week (${VERDICT_LABELS[verdict.verdict]}).`
          : `Changed from ${VERDICT_LABELS[verdict.previous_verdict]} to ${VERDICT_LABELS[verdict.verdict]}.`;
  const weekAverage =
    verdict != null
      ? [
          verdict.week.avg_calories != null
            ? `${formatNumber(verdict.week.avg_calories)} kcal`
            : null,
          verdict.week.avg_protein_g != null ? `${verdict.week.avg_protein_g} g protein` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader variant="detail" title="Weekly Verdict" onBack={() => router.back()} />

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}

        <Card style={styles.card}>
          {insufficient ? (
            <Text style={[typography.small, styles.note]}>
              {verdict?.reasoning[0] ?? "Keep logging to unlock your weekly verdict."}
            </Text>
          ) : verdict ? (
            <View style={styles.body}>
              <VerdictStamp verdict={verdict.verdict} />

              {copy ? (
                <View style={styles.verdictCopy}>
                  <Text style={[typography.small, styles.meaning]}>{copy.meaning}</Text>
                  <Text style={[typography.bodyStrong, styles.action]}>{copy.action}</Text>
                </View>
              ) : null}

              <Text style={[typography.caption, styles.change]}>{changeLine}</Text>
              {profile?.track_weight === false ? (
                <Text style={[typography.caption, styles.change]}>
                  Weight tracking is off, so this call uses your strength and consistency.
                </Text>
              ) : null}

              <View style={styles.signals}>
                {profile?.track_weight !== false ? (
                  <SignalRow label="Weight trend" value={weightTrend} />
                ) : null}
                <SignalRow
                  label="Strength trend"
                  value={verdict.strength_trend ? titleCase(verdict.strength_trend) : "—"}
                />
                <SignalRow
                  label={
                    profile?.protein_target_g != null
                      ? `Protein adherence · ${profile.protein_target_g} g`
                      : "Protein adherence"
                  }
                  value={verdict.adherence_pct != null ? `${verdict.adherence_pct}%` : "—"}
                />
                {verdict.calorie_adherence_pct != null ? (
                  <SignalRow
                    label={
                      profile?.calorie_target != null
                        ? `Calorie adherence · ${profile.calorie_target} kcal`
                        : "Calorie adherence"
                    }
                    value={`${verdict.calorie_adherence_pct}%`}
                  />
                ) : null}
              </View>
              <Divider />
              <Text style={[typography.caption, styles.whyTitle]}>Why</Text>
              {verdict.reasoning.map((line, i) => (
                <Text key={i} style={[typography.small, styles.whyLine]}>
                  • {line}
                </Text>
              ))}
            </View>
          ) : loading ? (
            <LoadingState label="Loading verdict…" />
          ) : (
            <Text style={typography.small}>No verdict yet.</Text>
          )}
        </Card>

        {verdict ? (
          <Card style={styles.card}>
            <Text style={typography.bodyStrong}>This week</Text>
            <View style={styles.signals}>
              <SignalRow label="Workouts" value={String(verdict.week.workouts)} />
              <SignalRow label="Sets logged" value={String(verdict.week.sets)} />
              <SignalRow
                label="Days logged"
                value={`${verdict.week.days_logged} day${verdict.week.days_logged === 1 ? "" : "s"}`}
              />
              <SignalRow label="Daily average" value={weekAverage || "—"} />
            </View>
            <Text style={[typography.small, styles.note]}>
              Everything you logged this week — the verdict is built from these.
            </Text>
          </Card>
        ) : null}
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
    card: { gap: spacing.md },
    body: { gap: spacing.md, marginTop: spacing.xs },
    note: { color: t.colors.textDim },
    signals: { gap: spacing.sm },
    signalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    verdictCopy: { gap: spacing.xs },
    meaning: { color: t.colors.textDim },
    action: { color: t.colors.text, lineHeight: 20 },
    change: { color: t.colors.textMuted },
    whyTitle: { color: t.colors.textDim, marginTop: spacing.xs },
    whyLine: { color: t.colors.text, lineHeight: 19 },
  }),
);
