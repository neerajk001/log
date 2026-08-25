import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { router } from "expo-router";
import { useWeeklyVerdict } from "../../src/hooks/useWeeklyVerdict";
import { VerdictStamp } from "../../src/components/VerdictStamp";
import { colors } from "../../src/theme/colors";
import { typography } from "../../src/theme/typography";
import { spacing } from "../../src/theme/spacing";

function formatWeightTrend(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)} kg/wk`;
}

function formatAdherence(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function VerdictScreen() {
  const { data, loading, error, refetch } = useWeeklyVerdict();

  const insufficient =
    data != null && data.weight_trend_kg_per_week == null && data.reasoning.length === 1 &&
    /at least \d+ days/i.test(data.reasoning[0]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor={colors.rust}
          />
        }
      >
        <View style={styles.header}>
          <Text style={typography.screenTitle}>Verdict</Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={typography.bodySmall}>{error}</Text>
          </View>
        ) : null}

        {insufficient ? (
          <View style={styles.emptyState}>
            <Text style={[typography.bodyLabel, styles.emptyTitle]}>
              Not enough data
            </Text>
            <Text style={typography.bodySmall}>
              Log at least 7 days of weight data to receive a verdict.
            </Text>
            <Pressable
              style={styles.cta}
              onPress={() => router.navigate("/(tabs)/today" as any)}
            >
              <Text style={styles.ctaLabel}>Go to Today</Text>
            </Pressable>
          </View>
        ) : null}

        {data && !insufficient ? (
          <>
            <VerdictStamp verdict={data.verdict} />

            <View style={styles.section}>
              <Text style={typography.sectionLabel}>Signals</Text>

              <View style={styles.signalRow}>
                <Text style={typography.bodyLabel}>Weight trend</Text>
                <Text style={typography.dataSmall}>
                  {formatWeightTrend(data.weight_trend_kg_per_week)}
                </Text>
              </View>

              <View style={styles.signalRow}>
                <Text style={typography.bodyLabel}>Strength trend</Text>
                <Text style={typography.dataSmall}>
                  {data.strength_trend ?? "—"}
                </Text>
              </View>

              <View style={styles.signalRow}>
                <Text style={typography.bodyLabel}>Adherence</Text>
                <Text style={typography.dataSmall}>
                  {formatAdherence(data.adherence_pct)}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={typography.sectionLabel}>Why</Text>
              <View style={styles.whyBox}>
                {data.reasoning.map((line, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={[typography.body, styles.bullet]}>•</Text>
                    <Text style={[typography.body, styles.bulletText]}>
                      {line}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.graphite,
  },
  scroll: {
    padding: spacing.screenPadding,
    paddingBottom: 80,
  },
  header: {
    marginTop: spacing.sectionTop,
    marginBottom: spacing.sectionBottom,
  },
  section: {
    marginTop: spacing.sectionTop,
    marginBottom: spacing.sectionBottom,
  },
  signalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  whyBox: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 16,
    marginTop: 8,
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bullet: {
    color: colors.rust,
  },
  bulletText: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.rust,
    padding: 12,
    marginTop: 8,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 24,
    marginTop: 24,
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    color: colors.chalk,
  },
  cta: {
    marginTop: 8,
    backgroundColor: colors.rust,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: spacing.cardRadius,
  },
  ctaLabel: {
    fontFamily: "JetBrainsMono",
    fontSize: 13,
    color: colors.chalk,
    fontWeight: "600",
  },
});