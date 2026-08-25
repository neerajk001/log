import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { router } from "expo-router";
import { useTrends } from "../../src/hooks/useTrends";
import { WeightSparkline } from "../../src/components/WeightSparkline";
import { colors } from "../../src/theme/colors";
import { typography } from "../../src/theme/typography";
import { spacing } from "../../src/theme/spacing";
import type { LiftDelta } from "../../src/api/types";

function formatKg(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)} kg`;
}

function deltaColor(delta: LiftDelta["delta"]): string {
  if (delta === "up") return colors.moss;
  if (delta === "down") return colors.rust;
  return colors.chalkDim;
}

export default function TrendsScreen() {
  const { data, loading, error, refetch } = useTrends();

  const noWeightData = data != null && data.weight.every((w) => w.avg_kg == null);

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
          <Text style={typography.screenTitle}>Trends</Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={typography.bodySmall}>{error}</Text>
          </View>
        ) : null}

        {noWeightData ? (
          <View style={styles.emptyState}>
            <Text style={[typography.bodyLabel, styles.emptyTitle]}>
              Not enough data
            </Text>
            <Text style={typography.bodySmall}>
              Log weight on the Today screen for a week to start seeing trends.
            </Text>
            <Pressable
              style={styles.cta}
              onPress={() => router.navigate("/(tabs)/today" as any)}
            >
              <Text style={styles.ctaLabel}>Go to Today</Text>
            </Pressable>
          </View>
        ) : null}

        {data && !noWeightData ? (
          <>
            <View style={styles.section}>
              <Text style={typography.sectionLabel}>Weight (4-week avg)</Text>
              <View style={styles.card}>
                <WeightSparkline data={data.weight} />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={typography.sectionLabel}>Lifts (this week vs last)</Text>
              {data.lifts.length === 0 ? (
                <View style={styles.card}>
                  <Text style={typography.bodySmall}>
                    No lift data yet — log a session to see deltas.
                  </Text>
                </View>
              ) : (
                <View style={styles.card}>
                  {data.lifts.map((l, i) => (
                    <View
                      key={l.exercise}
                      style={[
                        styles.liftRow,
                        i < data.lifts.length - 1 ? styles.liftRowDivider : null,
                      ]}
                    >
                      <Text style={[typography.body, styles.exerciseName]}>
                        {l.exercise}
                      </Text>
                      <View style={styles.liftValues}>
                        <Text style={typography.dataSmall}>
                          {formatKg(l.this_week_kg)}
                        </Text>
                        <Text style={[typography.bodySmall, styles.liftVs]}>
                          vs {formatKg(l.last_week_kg)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          typography.bodyLabel,
                          { color: deltaColor(l.delta) },
                        ]}
                      >
                        {l.delta}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={typography.sectionLabel}>Protein adherence (this week)</Text>
              <View style={styles.card}>
                {data.adherence_pct == null ? (
                  <Text style={typography.bodySmall}>
                    Set a protein target to see adherence.
                  </Text>
                ) : (
                  <View style={styles.adherenceRow}>
                    <View style={styles.adherenceTrack}>
                      <View
                        style={[
                          styles.adherenceFill,
                          { width: `${data.adherence_pct}%` },
                        ]}
                      />
                    </View>
                    <Text style={[typography.dataSmall, styles.adherenceLabel]}>
                      {data.adherence_pct}%
                    </Text>
                  </View>
                )}
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 16,
    marginTop: 8,
  },
  liftRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 12,
  },
  liftRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  exerciseName: {
    flex: 1,
  },
  liftValues: {
    alignItems: "flex-end",
  },
  liftVs: {
    color: colors.chalkDim,
  },
  adherenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  adherenceTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.hairline,
    borderRadius: 4,
    overflow: "hidden",
  },
  adherenceFill: {
    height: "100%",
    backgroundColor: colors.rust,
  },
  adherenceLabel: {
    minWidth: 48,
    textAlign: "right",
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