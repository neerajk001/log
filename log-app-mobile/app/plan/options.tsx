import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Banner, Card, Divider, IconBadge, ListRow, LoadingState, EmptyState } from "../../src/components/ui/primitives";
import { usePlans } from "../../src/hooks/usePlans";
import { usePlansApi } from "../../src/api/plans";

/** Plan options (design 03.06). */
export default function PlanOptionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plans, activePlan, loading } = usePlans();
  const api = usePlansApi();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const plan = useMemo(
    () => plans.find((p) => p.id === id) ?? activePlan,
    [plans, id, activePlan],
  );

  if (loading && !plan) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="detail" title="Plan Options" onBack={() => router.back()} />
          <LoadingState />
        </View>
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="detail" title="Plan Options" onBack={() => router.back()} />
          <EmptyState icon="clipboard-outline" title="No plan found" subtitle="Import or build a plan first." />
        </View>
      </View>
    );
  }

  const totalExercises = plan.days.reduce((sum, d) => sum + d.exercises.length, 0);

  const duplicate = async () => {
    setBusy("duplicate");
    setError(null);
    try {
      await api.createPlan({
        name: `${plan.name} (copy)`,
        source: plan.source,
        days: plan.days.map((d) => ({
          day_name: d.day_name,
          exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps })),
        })),
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate plan");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader variant="detail" title="Plan Options" onBack={() => router.back()} />

        {error ? <Banner tone="danger" message={error} /> : null}

        <Card style={styles.summary}>
          <IconBadge name="barbell" bg={colors.primarySoft} color={colors.primary} size={44} rounded={false} />
          <View style={styles.summaryText}>
            <View style={styles.titleRow}>
              <Text style={typography.bodyStrong} numberOfLines={1}>
                {plan.name}
              </Text>
              {plan.is_active ? (
                <View style={styles.activePill}>
                  <Text style={styles.activePillText}>Active</Text>
                </View>
              ) : null}
            </View>
            <Text style={typography.small}>
              {plan.days.length} workout day{plan.days.length === 1 ? "" : "s"} • {totalExercises} exercise
              {totalExercises === 1 ? "" : "s"}
            </Text>
          </View>
        </Card>

        <View style={styles.menu}>
          <ListRow
            icon="create-outline"
            title="Edit Plan"
            subtitle="Modify exercises, sets or days"
            onPress={() =>
              plan.days[0]
                ? router.navigate({ pathname: "/plan/[id]/edit-day", params: { id: plan.id, dayId: plan.days[0].id } } as never)
                : undefined
            }
          />
          <Divider />
          <ListRow
            icon="sparkles-outline"
            title="Import New Plan"
            subtitle="Replace current plan using AI"
            onPress={() => router.navigate("/plan/import" as never)}
          />
          <Divider />
          <ListRow
            icon="copy-outline"
            title="Duplicate Plan"
            subtitle="Create a copy of this plan"
            onPress={busy ? undefined : duplicate}
          />
          <Divider />
          <ListRow icon="checkmark-circle-outline" title="Set as Active" disabled subtitle="Not available — no API endpoint" onPress={() => {}} />
          <Divider />
          <ListRow
            icon="trash-outline"
            iconBg={colors.dangerSoft}
            iconColor={colors.danger}
            title="Delete Plan"
            subtitle="Not available — no API endpoint"
            destructive
            disabled
            onPress={() => {}}
          />
        </View>

        <Banner
          tone="info"
          message="Deleting a plan isn't supported by the API yet, so that option is disabled. Activating a non-active plan isn't available either."
        />
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    padded: { padding: spacing.screen },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    summary: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    summaryText: { flex: 1, gap: 3 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    activePill: {
      backgroundColor: t.colors.successSoft,
      borderRadius: 999,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    activePillText: { fontSize: 10, fontWeight: "700", color: t.colors.success },
    menu: {
      backgroundColor: t.colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      overflow: "hidden",
    },
  }),
);
