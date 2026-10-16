import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, type ErrorBoundaryProps } from "expo-router";
import { useClerk, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DateStrip } from "../../src/components/DateStrip";
import { MetricCard } from "../../src/components/MetricCard";
import { ActivitySheet } from "../../src/components/ActivitySheet";
import { CalendarSheet } from "../../src/components/CalendarSheet";
import { MealSheet } from "../../src/components/MealSheet";
import { MealsSheet } from "../../src/components/MealsSheet";
import { TodaysWorkoutCard } from "../../src/components/home/TodaysWorkoutCard";
import { NutritionCard } from "../../src/components/home/NutritionCard";
import { RecentLiftsRow } from "../../src/components/home/RecentLiftsRow";
import {
  SectionHeader,
  EmptyState,
  Button,
  Banner,
  Card,
  LoadingState,
  IconBadge,
} from "../../src/components/ui/primitives";
import { IconButton, OverflowMenu } from "../../src/components/ui/controls";
import { useTodayLog } from "../../src/hooks/useTodayLog";
import { useMe } from "../../src/hooks/useMe";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { useLiftLogs } from "../../src/hooks/useLiftLogs";
import { useActivity } from "../../src/hooks/useActivity";
import { useMeals } from "../../src/hooks/useMeals";
import { usePlanToday } from "../../src/hooks/usePlanToday";
import { useRecentExercises } from "../../src/hooks/useRecentExercises";
import { useDailyComparison } from "../../src/hooks/useDailyComparison";
import type { MealLog } from "../../src/api/types";
import { formatMediumDate, parseIso } from "../../src/utils/date";
import { muscleGroupsForDay, totalVolume } from "../../src/utils/derive";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

/** "MON, 12 OCT 2026" — the day the strip is pointed at. */
function dateLabel(iso: string): string {
  return parseIso(iso)
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

type Footnote = { text: string; tone?: "positive" | "negative" | "neutral" };

export default function TodayScreen() {
  const today = useCurrentDate();
  const { user } = useUser();
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
  const { lastByExercise } = useRecentExercises(30);
  const { weightDeltaKg, sleepDeltaHours } = useDailyComparison(today);

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
  // Rough set-based estimate — the app doesn't time sessions.
  const workoutDurationMin = useMemo(
    () => (day?.exercises ?? []).reduce((sum, ex) => sum + ex.sets, 0) * 3,
    [day],
  );
  const workoutVolumeKg = useMemo(() => totalVolume(lifts), [lifts]);

  const liftDeltas = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of groupedLifts) {
      const prev = lastByExercise.get(g.name)?.weight_kg ?? null;
      if (prev == null || prev <= 0) continue;
      const top = g.sets.reduce((m, s) => Math.max(m, s.weight_kg), 0);
      const delta = Math.round((top - prev) * 10) / 10;
      if (delta !== 0) map.set(g.name, delta);
    }
    return map;
  }, [groupedLifts, lastByExercise]);

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
    router.navigate("/(tabs)/lift" as never);
  }, []);
  // Carry the day the card is showing so the Lift screen opens on it (and keeps it
  // for the next set), rather than snapping back to today's rotation.
  const goLiftDay = useCallback((dayId: string) => {
    router.navigate({ pathname: "/(tabs)/lift", params: { dayId } } as never);
  }, []);
  const goHistory = useCallback(() => {
    router.navigate("/(tabs)/history" as never);
  }, []);
  const goLogMeal = useCallback(() => {
    router.navigate({ pathname: "/coach/new", params: { agent: "meal" } } as never);
  }, []);

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
  const sleepFootnote: Footnote | undefined = !isToday
    ? undefined
    : sleepDeltaHours != null && sleepDeltaHours !== 0
      ? {
          text: `${sleepQuality ? `${sleepQuality} · ` : ""}${sleepDeltaHours > 0 ? "+" : "−"}${Math.abs(
            sleepDeltaHours,
          )}h from last week`,
          tone: sleepDeltaHours > 0 ? "positive" : "neutral",
        }
      : sleepQuality
        ? { text: sleepQuality, tone: "neutral" }
        : undefined;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={refetchAll} tintColor={colors.primary} />}
      >
        <ScreenHeader
          variant="brand"
          right={
            <>
              <Pressable onPress={() => setCalendarOpen(true)} style={styles.todayChip}>
                <Ionicons name="calendar-outline" size={16} color={colors.text} />
                <Text style={styles.todayChipText} numberOfLines={1}>
                  {activeDate === today ? "Today" : formatMediumDate(activeDate)}
                </Text>
              </Pressable>
              {profile?.ai_coach_enabled !== false ? (
                <Pressable
                  onPress={() => router.navigate("/coach" as never)}
                  style={styles.coachChip}
                  accessibilityRole="button"
                  accessibilityLabel="Open AI coach"
                >
                  <Ionicons name="sparkles" size={15} color={colors.primary} />
                  <Text style={styles.coachChipText}>Coach</Text>
                </Pressable>
              ) : null}
              <IconButton name="ellipsis-horizontal" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} />
            </>
          }
        />

        {activeDate !== today ? (
          <Pressable onPress={() => setActiveDate(today)} style={styles.backToday}>
            <Ionicons name="arrow-back" size={14} color={colors.primary} />
            <Text style={styles.backTodayText}>Back to today</Text>
          </Pressable>
        ) : null}

        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>{dateLabel(activeDate)}</Text>
          <DateStrip selected={activeDate} today={today} onSelect={setActiveDate} />
        </View>

        <View style={styles.greetingRow}>
          <View style={styles.greeting}>
            <Text style={typography.h2}>
              {greeting()}, {user?.firstName ?? "there"}
            </Text>
            <Text style={typography.small}>Consistency today, strength tomorrow.</Text>
          </View>
          <View style={styles.encouragement}>
            <IconBadge name="trending-up" bg={colors.primarySoft} color={colors.primary} size={26} rounded={false} />
            <Text style={styles.encouragementText}>Small steps{"\n"}big results.</Text>
          </View>
        </View>

        {error ? <Banner tone="danger" message={error} actionLabel="Retry" onAction={refetch} style={styles.block} /> : null}
        {/* Only worth showing when we truly don't know their settings yet. */}
        {meError && !profile ? (
          <Banner tone="danger" message={meError} actionLabel="Retry" onAction={refetchMe} style={styles.block} />
        ) : null}
        {retry ? (
          <Banner
            tone="warning"
            message="Couldn't save — your entry is kept."
            actionLabel="Retry"
            onAction={retrySave}
            style={styles.block}
          />
        ) : null}
        {planError ? (
          <Banner tone="danger" message={planError} actionLabel="Retry" onAction={() => refetchPlan()} style={styles.block} />
        ) : null}

        {day ? (
          <View style={styles.block}>
            <TodaysWorkoutCard
              dayName={day.day_name}
              exerciseNames={workoutExerciseNames}
              muscles={workoutMuscles}
              durationMin={workoutDurationMin}
              volumeKg={workoutVolumeKg}
              onLogLift={() => goLiftDay(day.id)}
              onOpenDay={() => goLiftDay(day.id)}
            />
          </View>
        ) : null}

        {profile?.meal_tracking_enabled !== false ? (
          <>
            <View style={styles.block}>
              <NutritionCard
                loggedCalories={loggedCalories}
                calorieTarget={calorieTarget}
                loggedProtein={loggedProtein}
                proteinTarget={proteinTarget}
                mealCount={meals.length}
                mealCalories={mealTotals.calories}
                mealProtein={mealTotals.protein}
                dateLabel={activeDate === today ? "Today" : formatMediumDate(activeDate)}
                onPressDate={() => setCalendarOpen(true)}
                onLogMeal={goLogMeal}
                onPressMeals={() => setMealsOpen(true)}
                onEdit={(field, value) => {
                  void save(field, value);
                }}
              />
            </View>
            {mealsError ? (
              <Banner tone="danger" message={mealsError} actionLabel="Retry" onAction={refetchMeals} style={styles.block} />
            ) : null}
          </>
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

        {liftsError ? (
          <Banner tone="danger" message={liftsError} actionLabel="Retry" onAction={() => refetchLifts()} style={styles.block} />
        ) : null}
        {liftsLoading && lifts.length === 0 ? (
          <LoadingState label="Loading lifts…" />
        ) : (
          <RecentLiftsRow
            groups={groupedLifts}
            deltas={liftDeltas}
            onViewAll={goHistory}
            onAddLift={goLift}
          />
        )}

        <View style={styles.section}>
          <SectionHeader
            title="Activity"
            {...(activities.length > 0 ? { actionLabel: "Add", onAction: () => setActivityOpen(true) } : {})}
          />
          {activitiesError ? (
            <Banner
              tone="danger"
              message={activitiesError}
              actionLabel="Retry"
              onAction={() => refetchActivities()}
              style={styles.block}
            />
          ) : null}
          {activitiesLoading && activities.length === 0 ? (
            <LoadingState label="Loading activity…" />
          ) : activities.length === 0 ? (
            <EmptyState
              compact
              icon="walk-outline"
              title="No activity logged yet."
              subtitle="Log your walk, run, cycle or more."
            >
              <Button label="Add Activity" icon="add" variant="outline" onPress={() => setActivityOpen(true)} />
            </EmptyState>
          ) : (
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
                      {a.calories_burned != null ? ` · ${a.calories_burned} kcal` : ""}
                    </Text>
                  </View>
                  <Pressable onPress={() => confirmDeleteActivity(a.id)} hitSlop={14} accessibilityLabel="Delete activity">
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                </Card>
              ))}
            </View>
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
          { label: "Settings", icon: "settings-outline", onPress: () => router.navigate("/settings" as never) },
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

    dateBlock: { marginTop: spacing.sm, gap: spacing.sm },
    dateLabel: { ...t.typography.caption, color: t.colors.textDim },

    greetingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    greeting: { flex: 1, gap: 2, minWidth: 0 },
    encouragement: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      maxWidth: 156,
    },
    encouragementText: { ...t.typography.caption, color: t.colors.text, flexShrink: 1 },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: spacing.sm,
      marginTop: spacing.md,
    },

    todayChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      height: 38,
      maxWidth: 150,
      flexShrink: 1,
    },
    todayChipText: { fontSize: 13, fontWeight: "600", color: t.colors.text, flexShrink: 1 },

    coachChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: t.colors.primarySoft,
      borderWidth: 1,
      borderColor: t.colors.primary,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      height: 38,
      flexShrink: 0,
    },
    coachChipText: { fontSize: 13, fontWeight: "700", color: t.colors.primary },

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
    activityText: { flex: 1, gap: 2 },

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
