import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import type { Palette } from "../../src/theme/colors";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Button, EmptyState, ErrorState, LoadingState, IconBadge, SectionHeader } from "../../src/components/ui/primitives";
import { usePlans } from "../../src/hooks/usePlans";
import { muscleGroupsForDay } from "../../src/utils/derive";

function accents(colors: Palette) {
  return [
    { bg: colors.primarySoft, color: colors.primary },
    { bg: colors.purpleSoft, color: colors.purple },
    { bg: colors.greenSoft, color: colors.green },
    { bg: colors.blueSoft, color: colors.blue },
    { bg: colors.tealSoft, color: colors.teal },
    { bg: colors.amberSoft, color: colors.amber },
  ];
}

export default function PlanScreen() {
  const { activePlan, days, loading, error, refetch } = usePlans();
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const ACCENTS = useMemo(() => accents(colors), [colors]);

  const planId = activePlan?.id;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.primary} />}
      >
        <ScreenHeader
          variant="page"
          title="Plan"
          subtitle="Your training program"
          right={
            <>
              <Button
                label="Import"
                icon="sparkles-outline"
                variant="outline"
                size="sm"
                onPress={() => router.navigate("/plan/import" as never)}
              />
              <Button
                label="Edit"
                icon="create-outline"
                variant="outline"
                size="sm"
                disabled={!planId}
                onPress={() => router.navigate({ pathname: "/plan/options", params: { id: planId } } as never)}
              />
            </>
          }
        />

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}

        {loading && !activePlan ? (
          <LoadingState label="Loading your plan…" />
        ) : !activePlan ? (
          <EmptyState
            icon="clipboard-outline"
            title="No plan yet"
            subtitle="Have your AI coach build one, import an existing plan, or build it manually."
          >
            <Button
              label="Plan by coach"
              icon="sparkles-outline"
              onPress={() => router.navigate("/coach/onboarding" as never)}
            />
            <Button
              label="Import (AI)"
              icon="cloud-upload-outline"
              variant="outline"
              onPress={() => router.navigate("/plan/import" as never)}
            />
            <Button
              label="Build manually"
              icon="create-outline"
              variant="outline"
              onPress={() => router.navigate({ pathname: "/plan/import", params: { mode: "manual" } } as never)}
            />
          </EmptyState>
        ) : (
          <>
            <Pressable
              style={styles.planCard}
              onPress={() => router.navigate({ pathname: "/plan/options", params: { id: activePlan.id } } as never)}
            >
              <IconBadge name="barbell" bg={colors.primarySoft} color={colors.primary} size={40} rounded={false} />
              <View style={styles.planText}>
                <View style={styles.planTitleRow}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>
                    {activePlan.name}
                  </Text>
                  {activePlan.is_active ? (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>Active</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={typography.small}>
                  {days.length} workout day{days.length === 1 ? "" : "s"} •{" "}
                  {activePlan.source === "ai_parsed" ? "AI parsed" : "Manual"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>

            <View style={styles.section}>
              <SectionHeader title="Workout Days" />
              <View style={styles.list}>
                {days.map((day, i) => {
                  const accent = ACCENTS[i % ACCENTS.length];
                  const muscles = muscleGroupsForDay(day.day_name, day.exercises.map((e) => e.name));
                  return (
                    <Pressable
                      key={day.id}
                      style={styles.dayRow}
                      onPress={() =>
                        router.navigate({ pathname: "/plan/[id]/day", params: { id: activePlan.id, dayId: day.id } } as never)
                      }
                    >
                      <IconBadge name="barbell-outline" bg={accent.bg} color={accent.color} size={40} rounded={false} />
                      <View style={styles.dayText}>
                        <Text style={typography.bodyStrong} numberOfLines={1}>
                          {day.day_name}
                        </Text>
                        <Text style={typography.small} numberOfLines={1}>
                          {muscles.length > 0 ? muscles.join(" • ") : `${day.exercises.length} exercises`}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    planCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
    },
    planText: { flex: 1, gap: 3 },
    planTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    activePill: {
      backgroundColor: t.colors.successSoft,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    activePillText: { fontSize: 10, fontWeight: "700", color: t.colors.success },
    section: { gap: spacing.sm },
    list: { gap: spacing.sm },
    dayRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
    },
    dayText: { flex: 1, gap: 2 },
  }),
);
