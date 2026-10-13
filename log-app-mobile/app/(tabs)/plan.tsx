import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, type ErrorBoundaryProps } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import type { Palette } from "../../src/theme/colors";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Button, Card, EmptyState, ErrorState, LoadingState, IconBadge, SectionHeader } from "../../src/components/ui/primitives";
import { usePlans } from "../../src/hooks/usePlans";
import { muscleGroupsForDay } from "../../src/utils/derive";
import { AskCoachRow } from "../../src/components/coach/AskCoachRow";

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
  // One day open at a time — collapsed by default keeps the screen short.
  const [openDayId, setOpenDayId] = useState<string | null>(null);

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

            {activePlan.rationale ? (
              <Card style={styles.whyCard}>
                <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
                <View style={styles.whyText}>
                  <Text style={typography.caption}>WHY THIS PLAN</Text>
                  <Text style={typography.small}>{activePlan.rationale}</Text>
                </View>
              </Card>
            ) : null}

            <AskCoachRow
              agent="training"
              label="Ask the coach to change my plan"
              hint="Swap exercises, adjust sets, switch plans"
              question="About my plan — "
            />

            <View style={styles.section}>
              <SectionHeader title="Workout Days" />
              <View style={styles.list}>
                {days.map((day, i) => {
                  const accent = ACCENTS[i % ACCENTS.length];
                  const muscles = muscleGroupsForDay(day.day_name, day.exercises.map((e) => e.name));
                  const open = openDayId === day.id;
                  return (
                    <View key={day.id} style={[styles.dayRow, open && styles.dayRowOpen]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        accessibilityLabel={`${day.day_name}, ${day.exercises.length} exercises`}
                        onPress={() => setOpenDayId((cur) => (cur === day.id ? null : day.id))}
                        style={styles.dayHeader}
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
                        <Ionicons
                          name={open ? "chevron-up" : "chevron-down"}
                          size={18}
                          color={colors.textMuted}
                        />
                      </Pressable>

                      {open ? (
                        <View style={styles.dayBody}>
                          {day.rationale ? (
                            <Text style={typography.small}>{day.rationale}</Text>
                          ) : null}

                          <View style={styles.exercises}>
                            {day.exercises.map((ex, ei) => (
                              <View key={`${ex.name}-${ei}`} style={styles.exerciseRow}>
                                <View style={styles.exIndex}>
                                  <Text style={styles.exIndexText}>{ei + 1}</Text>
                                </View>
                                <Text style={[typography.body, styles.exName]} numberOfLines={1}>
                                  {ex.name}
                                </Text>
                                <Text style={typography.small}>
                                  {ex.sets} × {ex.reps}
                                  {ex.weight_kg != null ? ` · ${ex.weight_kg} kg` : ""}
                                </Text>
                              </View>
                            ))}
                          </View>

                          <View style={styles.dayActions}>
                            <AskCoachRow
                              agent="training"
                              compact
                              label="Ask the coach about this day"
                              question={`About my ${day.day_name} day — `}
                            />
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                router.navigate({
                                  pathname: "/plan/[id]/edit-day",
                                  params: { id: activePlan.id, dayId: day.id },
                                } as never)
                              }
                              hitSlop={8}
                              style={styles.editDay}
                            >
                              <Ionicons name="create-outline" size={15} color={colors.primary} />
                              <Text style={styles.editDayText}>Edit day</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
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
    whyCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    whyText: { flex: 1, gap: 2 },
    section: { gap: spacing.sm },
    list: { gap: spacing.sm },
    dayRow: {
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
    },
    dayRowOpen: { borderColor: t.colors.primary },
    dayHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    dayText: { flex: 1, gap: 2 },
    dayBody: { marginTop: spacing.md, gap: spacing.sm },
    exercises: { gap: spacing.sm },
    exerciseRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    exIndex: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: t.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    exIndexText: { fontSize: 11, fontWeight: "700", color: t.colors.textDim },
    exName: { flex: 1 },
    dayActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: spacing.md,
    },
    editDay: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
    editDayText: { fontSize: 13, fontWeight: "600", color: t.colors.primary },

    errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
    errorTitle: { textAlign: "center" },
    errorText: { textAlign: "center", color: t.colors.textDim },
  }),
);

/**
 * Route-level fallback (expo-router picks this up): a render crash on Plan becomes a
 * friendly, retryable card instead of a red box.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <View style={styles.errorWrap}>
        <IconBadge name="alert-circle-outline" bg={colors.surface} color={colors.danger} size={56} rounded={false} />
        <Text style={[typography.h3, styles.errorTitle]}>Plan couldn&apos;t load</Text>
        <Text style={[typography.small, styles.errorText]}>
          {error?.message ?? "Something went wrong on this screen."}
        </Text>
        <Button label="Try again" icon="refresh" onPress={() => void retry()} />
      </View>
    </View>
  );
}
