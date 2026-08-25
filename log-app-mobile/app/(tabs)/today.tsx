import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { colors } from "../../src/theme/colors";
import { typography } from "../../src/theme/typography";
import { spacing } from "../../src/theme/spacing";
import { TodayTile } from "../../src/components/TodayTile";
import { FAB } from "../../src/components/FAB";
import { useTodayLog } from "../../src/hooks/useTodayLog";
import { useWeeklyVerdict } from "../../src/hooks/useWeeklyVerdict";
import type { VerdictKind } from "../../src/api/types";

const VERDICT_LABEL: Record<VerdictKind, string> = {
  hold: "Hold Steady",
  adjust_calories: "Adjust Calories",
  check_recovery: "Check Recovery",
};

export default function TodayScreen() {
  const { data, placeholder, saveField, fieldErrors, error } = useTodayLog();
  const { data: verdict } = useWeeklyVerdict();

  const showEmptyVerdict =
    !verdict ||
    (verdict.weight_trend_kg_per_week == null &&
      verdict.reasoning.length === 1 &&
      /at least \d+ days/i.test(verdict.reasoning[0]));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={typography.screenTitle}>Today</Text>
        </View>

        <View style={styles.section}>
          <Text style={typography.sectionLabel}>Daily Log</Text>
          <View style={styles.tileRow}>
            <TodayTile
              label="Weight"
              value={data?.weight_kg ?? null}
              placeholder={placeholder?.weight_kg ?? null}
              unit="kg"
              fieldError={fieldErrors.weight_kg}
              onSave={(v) => saveField("weight_kg", v)}
            />
            <TodayTile
              label="Calories"
              value={data?.calories ?? null}
              placeholder={placeholder?.calories ?? null}
              unit="kcal"
              fieldError={fieldErrors.calories}
              onSave={(v) => saveField("calories", v)}
            />
          </View>
          <View style={styles.tileRow}>
            <TodayTile
              label="Protein"
              value={data?.protein_g ?? null}
              placeholder={placeholder?.protein_g ?? null}
              unit="g"
              fieldError={fieldErrors.protein_g}
              onSave={(v) => saveField("protein_g", v)}
            />
            <TodayTile
              label="Sleep"
              value={data?.sleep_hours ?? null}
              placeholder={placeholder?.sleep_hours ?? null}
              unit="hrs"
              fieldError={fieldErrors.sleep_hours}
              onSave={(v) => saveField("sleep_hours", v)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.sectionLabel}>Verdict</Text>
          <Pressable
            style={styles.verdictCard}
            onPress={() => router.navigate("/(tabs)/verdict" as any)}
          >
            {showEmptyVerdict ? (
              <>
                <Text style={typography.bodySmall}>Not enough data</Text>
                <Text style={typography.bodySmall}>
                  Log at least 7 days to receive a verdict
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.verdictLabel}>
                  {VERDICT_LABEL[verdict!.verdict]}
                </Text>
                <Text style={typography.bodySmall}>Tap for full breakdown</Text>
              </>
            )}
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={typography.bodySmall}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <FAB label="Log Lift" onPress={() => router.navigate("/(tabs)/lift" as any)} />
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
    paddingBottom: 100,
  },
  header: {
    marginTop: spacing.sectionTop,
    marginBottom: spacing.sectionBottom,
  },
  section: {
    marginTop: spacing.sectionTop,
    marginBottom: spacing.sectionBottom,
  },
  tileRow: {
    flexDirection: "row",
    gap: spacing.tileGap,
    marginTop: 8,
  },
  verdictCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 16,
    marginTop: 8,
    gap: 4,
    alignItems: "center",
  },
  verdictLabel: {
    fontFamily: "Oswald",
    fontWeight: "700",
    fontSize: 20,
    color: colors.rust,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  errorBanner: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.rust,
    padding: 12,
    marginTop: 16,
  },
});