import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../src/theme/ThemeContext";
import { spacing } from "../src/theme/spacing";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { VerdictStamp } from "../src/components/VerdictStamp";
import { Card, Divider, ErrorState, LoadingState } from "../src/components/ui/primitives";
import { useWeeklyVerdict } from "../src/hooks/useWeeklyVerdict";

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Weekly verdict detail — the verdict, its three signals, and the reasoning. */
export default function VerdictScreen() {
  const { typography } = useTheme();
  const styles = useStyles();
  const { data: verdict, loading, error, refetch } = useWeeklyVerdict();

  const insufficient = verdict != null && verdict.weight_trend_kg_per_week == null;
  const weightTrend =
    verdict?.weight_trend_kg_per_week != null
      ? `${verdict.weight_trend_kg_per_week > 0 ? "+" : ""}${verdict.weight_trend_kg_per_week.toFixed(2)} kg/week`
      : "—";

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
              <View style={styles.signals}>
                <SignalRow label="Weight trend" value={weightTrend} />
                <SignalRow
                  label="Strength trend"
                  value={verdict.strength_trend ? titleCase(verdict.strength_trend) : "—"}
                />
                <SignalRow
                  label="Protein adherence"
                  value={verdict.adherence_pct != null ? `${verdict.adherence_pct}%` : "—"}
                />
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
    whyTitle: { color: t.colors.textDim, marginTop: spacing.xs },
    whyLine: { color: t.colors.text, lineHeight: 19 },
  }),
);
