import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, type ErrorBoundaryProps } from "expo-router";
import { useClerk } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { DateStrip } from "../../src/components/DateStrip";
import { MetricCard } from "../../src/components/MetricCard";
import { ActivitySheet } from "../../src/components/ActivitySheet";
import { CalendarSheet } from "../../src/components/CalendarSheet";
import { MealSheet } from "../../src/components/MealSheet";
import { MealsSheet } from "../../src/components/MealsSheet";
import { TodayHeader } from "../../src/components/home/TodayHeader";
import { TodaysWorkoutCard } from "../../src/components/home/TodaysWorkoutCard";
import { NutritionCard } from "../../src/components/home/NutritionCard";
import { PhysiqueEntryCard } from "../../src/components/home/PhysiqueCard";
import { RecentLiftsRow } from "../../src/components/home/RecentLiftsRow";
import {
  SectionHeader,
  Button,
  Banner,
  Card,
  LoadingState,
  IconBadge,
} from "../../src/components/ui/primitives";
import { OverflowMenu } from "../../src/components/ui/controls";
import { useTodayLog } from "../../src/hooks/useTodayLog";
import { useMe } from "../../src/hooks/useMe";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { useLiftLogs } from "../../src/hooks/useLiftLogs";
import { useActivity } from "../../src/hooks/useActivity";
import { useMeals } from "../../src/hooks/useMeals";
import { usePlanToday } from "../../src/hooks/usePlanToday";
import { useDailyComparison } from "../../src/hooks/useDailyComparison";
import type { MealLog } from "../../src/api/types";
import { muscleGroupsForDay } from "../../src/utils/derive";

type Footnote = { text: string; tone?: "positive" | "negative" | "neutral" };

export default function TodayScreen() {
  const today = useCurrentDate();
  const { signOut } = useClerk();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const [activeDate, setActiveDate] = useState(today);
  const prevTodayRef = useRef(today);
  // Midnight rollover while the app is open: follow into the new day only
  // if the user was viewing today — a deliberately chosen past date stays.
  useEffect(() => {
    setActiveDate((cur) => (cur === prevTodayRef.current ? today : cur));
    prevTodayRef.current = today;
  }, [today]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [mealsOpen, setMealsOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealLog | null>(null);

  const {
    data,
    placeholder,
    loading,
    error,
    fieldErrors,
    retry,
    save,
    retrySave,
    refetch,
  } = useTodayLog(activeDate);
  const { profile, error: meError, refetch: refetchMe } = useMe();
  const tracksWeight = profile?.track_weight !== false;

  const {
    entries: lifts,
    loading: liftsLoading,
    error: liftsError,
    refetch: refetchLifts,
  } = useLiftLogs(activeDate);
  const {
    entries: activities,
    addEntry: addActivity,
    deleteEntry: deleteActivity,
    loading: activitiesLoading,
    error: activitiesError,
    refetch: refetchActivities,
  } = useActivity(activeDate);
  const { meals, error: mealsError, refetch: refetchMeals } = useMeals(activeDate);
  const { day, error: planError, refetch: refetchPlan } = usePlanToday(activeDate);
  const { weightDeltaKg } = useDailyComparison(today);

  const mealTotals = useMemo(
    () =>
      meals.reduce(
        (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein_g }),
        { calories: 0, protein: 0 },
      ),
    [meals],
  );

  /* Nutrition goals from Settings — shown on the rings and the day summary. */
  const proteinTarget = profile?.protein_target_g ?? null;
  const calorieTarget = profile?.calorie_target ?? null;
  const loggedCalories = data?.calories ?? mealTotals.calories;
  const loggedProtein = data?.protein_g ?? mealTotals.protein;

  const groupedLifts = useMemo(() => {
    const map = new Map<string, typeof lifts>();
    for (const l of lifts) {
      const arr = map.get(l.exercise_name) ?? [];
      arr.push(l);
      map.set(l.exercise_name, arr);
    }
    return Array.from(map.entries()).map(([name, sets]) => ({ name, sets }));
  }, [lifts]);

  const workoutExerciseNames = useMemo(
    () => (day?.exercises ?? []).map((ex) => ex.name),
    [day],
  );
  const workoutMuscles = useMemo(
    () => (day ? muscleGroupsForDay(day.day_name, workoutExerciseNames) : []),
    [day, workoutExerciseNames],
  );

  const confirmDeleteActivity = useCallback(
    (id: string) => {
      Alert.alert("Delete activity?", "This removes the logged activity.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteActivity(id).catch(() => {}) },
      ]);
    },
    [deleteActivity],
  );

  const goLift = useCallback(() => {
    router.navigate({ pathname: "/(tabs)/lift", params: { date: activeDate } } as never);
  }, [activeDate]);
  // Carry the day and date the card is showing so the Lift screen opens on them
  // (and keeps them for the next set), rather than snapping back to today.
  const goLiftDay = useCallback(
    (dayId: string) => {
      router.navigate({
        pathname: "/(tabs)/lift",
        params: { dayId, date: activeDate },
      } as never);
    },
    [activeDate],
  );
  const goHistory = useCallback(() => {
    router.navigate("/(tabs)/history" as never);
  }, []);
  const goLogMeal = useCallback(() => {
    router.navigate({
      pathname: "/coach/new",
      params: { agent: "meal", date: activeDate },
    } as never);
  }, [activeDate]);

  // Pull-to-refresh owns its own spinner: coupling it to the slowest section's
  // load state (refreshing = OR of all loadings) pinned the indicator on screen
  // long after most content was interactive.
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const refetchAll = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.allSettled([
        refetch(),
        refetchLifts(),
        refetchActivities(),
        refetchMeals(),
        refetchPlan(),
      ]);
    } finally {
      setManualRefreshing(false);
    }
  }, [refetch, refetchLifts, refetchActivities, refetchMeals, refetchPlan]);

  /* Week-over-week footnotes only make sense on the live day. */
  const isToday = activeDate === today;
  const weightFootnote: Footnote | undefined =
    isToday && tracksWeight && weightDeltaKg != null && weightDeltaKg !== 0
      ? {
          text: `${weightDeltaKg < 0 ? "↓" : "↑"} ${Math.abs(weightDeltaKg).toFixed(1)} kg this week`,
          tone: weightDeltaKg < 0 ? "positive" : "neutral",
        }
      : undefined;

  const sleepValue = data?.sleep_hours ?? null;
  const sleepQuality =
    sleepValue == null ? null : sleepValue >= 7 ? "Good" : sleepValue >= 6 ? "Fair" : "Low";
  const sleepFootnote: Footnote | undefined = sleepQuality
    ? { text: sleepQuality, tone: "neutral" }
    : undefined;

  // One banner at a time — stacked errors buried the content they referred to.
  const banner = error
    ? { tone: "danger" as const, message: error, actionLabel: "Retry", onAction: refetch }
    : meError && !profile
      ? { tone: "danger" as const, message: meError, actionLabel: "Retry", onAction: refetchMe }
      : retry
        ? {
            tone: "warning" as const,
            message: "Couldn't save — your entry is kept.",
            actionLabel: "Retry",
            onAction: retrySave,
          }
        : planError
          ? {
              tone: "danger" as const,
              message: planError,
              actionLabel: "Retry",
              onAction: () => refetchPlan(),
            }
          : mealsError
            ? {
                tone: "danger" as const,
                message: mealsError,
                actionLabel: "Retry",
                onAction: refetchMeals,
              }
            : liftsError
              ? {
                  tone: "danger" as const,
                  message: liftsError,
                  actionLabel: "Retry",
                  onAction: () => refetchLifts(),
                }
              : activitiesError
                ? {
                    tone: "danger" as const,
                    message: activitiesError,
                    actionLabel: "Retry",
                    onAction: () => refetchActivities(),
                  }
                : null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={refetchAll} tintColor={colors.primary} />}
      >
        <TodayHeader
          date={activeDate}
          onMenu={() => setMenuOpen(true)}
          onCalendar={() => setCalendarOpen(true)}
          onSettings={() => router.navigate("/settings" as never)}
        />

        {activeDate !== today ? (
          <Pressable onPress={() => setActiveDate(today)} style={styles.backToday}>
            <Ionicons name="arrow-back" size={14} color={colors.primary} />
            <Text style={styles.backTodayText}>Back to today</Text>
          </Pressable>
        ) : null}

        <View style={styles.dateStripBlock}>
          <DateStrip selected={activeDate} today={today} onSelect={setActiveDate} />
        </View>

        {banner ? (
          <Banner
            tone={banner.tone}
            message={banner.message}
            actionLabel={banner.actionLabel}
            onAction={banner.onAction}
            style={styles.block}
          />
        ) : null}

        {day ? (
          <View style={styles.block}>
            <TodaysWorkoutCard
              dayName={day.day_name}
              exerciseCount={day.exercises.length}
              muscles={workoutMuscles}
              onLogLift={() => goLiftDay(day.id)}
              onOpenDay={() => goLiftDay(day.id)}
            />
          </View>
        ) : null}

        {profile?.meal_tracking_enabled !== false ? (
          <View style={styles.block}>
            <NutritionCard
              loggedCalories={loggedCalories}
              calorieTarget={calorieTarget}
              loggedProtein={loggedProtein}
              proteinTarget={proteinTarget}
              mealCount={meals.length}
              onLogMeal={goLogMeal}
              onPressMeals={() => setMealsOpen(true)}
              onEdit={(field, value) => {
                void save(field, value);
              }}
            />
          </View>
        ) : null}

        {profile?.ai_coach_enabled !== false ? (
          <View style={styles.block}>
            <PhysiqueEntryCard />
          </View>
        ) : null}

        {loading && !data ? (
          <LoadingState label="Loading today…" />
        ) : (
          <View style={styles.grid}>
            {tracksWeight ? (
              <MetricCard
                field="weight_kg"
                label="Weight"
                unit="kg"
                icon="scale-outline"
                iconBg={colors.blueSoft}
                iconColor={colors.blue}
                value={data?.weight_kg ?? null}
                placeholder={placeholder?.weight_kg ?? null}
                onSave={(v) => save("weight_kg", v)}
                fieldError={fieldErrors.weight_kg}
                footnote={weightFootnote}
              />
            ) : null}
            <MetricCard
              field="sleep_hours"
              label="Sleep"
              unit="hours"
              icon="moon"
              iconBg={colors.purpleSoft}
              iconColor={colors.purple}
              value={data?.sleep_hours ?? null}
              placeholder={placeholder?.sleep_hours ?? null}
              onSave={(v) => save("sleep_hours", v)}
              fieldError={fieldErrors.sleep_hours}
              footnote={sleepFootnote}
            />
          </View>
        )}

        {liftsLoading && lifts.length === 0 ? (
          <LoadingState label="Loading lifts…" />
        ) : (
          <RecentLiftsRow groups={groupedLifts} onViewAll={goHistory} onAddLift={goLift} />
        )}

        <View style={styles.section}>
          {activitiesLoading && activities.length === 0 ? (
            <LoadingState label="Loading activity…" />
          ) : activities.length === 0 ? (
            <Card style={styles.activityEmpty}>
              <IconBadge name="walk-outline" bg={colors.tealSoft} color={colors.teal} size={36} rounded={false} />
              <View style={styles.activityText}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  Activity
                </Text>
                <Text style={typography.small} numberOfLines={1}>
                  Log your walk, run, cycle or more.
                </Text>
              </View>
              <Button label="Add" icon="add" variant="outline" size="sm" onPress={() => setActivityOpen(true)} />
            </Card>
          ) : (
            <>
              <SectionHeader title="Activity" actionLabel="Add" onAction={() => setActivityOpen(true)} />
              <View style={styles.list}>
                {activities.map((a) => (
                  <Card key={a.id} style={styles.activityRow}>
                    <IconBadge name="walk-outline" bg={colors.tealSoft} color={colors.teal} size={36} rounded={false} />
                    <View style={styles.activityText}>
                      <Text style={typography.bodyStrong} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text style={typography.small} numberOfLines={1}>
                        {a.duration_min} min
                        {a.distance_km != null ? ` · ${a.distance_km} km` : ""}
                      </Text>
                    </View>
                    <Pressable onPress={() => confirmDeleteActivity(a.id)} hitSlop={14} accessibilityLabel="Delete activity">
                      <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                  </Card>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.footerSpace} />
      </ScrollView>

      <CalendarSheet
        visible={calendarOpen}
        selected={activeDate}
        max={today}
        onClose={() => setCalendarOpen(false)}
        onSelect={setActiveDate}
      />

      <ActivitySheet
        visible={activityOpen}
        date={activeDate}
        onClose={() => setActivityOpen(false)}
        onSubmit={async (payload) => {
          await addActivity(payload);
        }}
      />

      <MealsSheet
        visible={mealsOpen}
        meals={meals}
        onClose={() => setMealsOpen(false)}
        onSelect={(meal) => {
          setMealsOpen(false);
          setEditingMeal(meal);
        }}
        onLogMeal={() => {
          setMealsOpen(false);
          goLogMeal();
        }}
      />

      <MealSheet
        key={editingMeal?.id ?? "none"}
        meal={editingMeal}
        visible={editingMeal != null}
        onClose={() => setEditingMeal(null)}
        onSaved={refetchMeals}
      />

      <OverflowMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          ...(profile?.ai_coach_enabled !== false
            ? [
                {
                  label: "AI coach",
                  icon: "sparkles-outline" as const,
                  onPress: () => router.navigate("/coach" as never),
                },
              ]
            : []),
          {
            label: "Log out",
            icon: "log-out-outline",
            destructive: true,
            onPress: () => {
              signOut().catch(() => {});
            },
          },
        ]}
      />
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl },
    block: { marginTop: spacing.md },
    section: { marginTop: spacing.xxl },
    list: { gap: spacing.sm },
    footerSpace: { height: spacing.xxl },

    dateStripBlock: { marginTop: spacing.lg },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: spacing.sm,
      marginTop: spacing.md,
    },

    backToday: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
      marginTop: spacing.md,
      paddingVertical: 4,
    },
    backTodayText: { fontSize: 13, fontWeight: "600", color: t.colors.primary },

    activityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderColor: t.colors.cardBorder },
    activityEmpty: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    activityText: { flex: 1, gap: 2, minWidth: 0 },

    errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
    errorTitle: { textAlign: "center" },
    errorText: { textAlign: "center", color: t.colors.textDim },
  }),
);

/**
 * Route-level fallback (expo-router picks this up): a render crash on Today becomes
 * a friendly, retryable card instead of a red box.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <View style={styles.errorWrap}>
        <IconBadge name="alert-circle-outline" bg={colors.surface} color={colors.danger} size={56} rounded={false} />
        <Text style={[typography.h3, styles.errorTitle]}>Today couldn&apos;t load</Text>
        <Text style={[typography.small, styles.errorText]}>
          {error?.message ?? "Something went wrong on this screen."}
        </Text>
        <Button label="Try again" icon="refresh" onPress={() => void retry()} />
      </View>
    </View>
  );
}
