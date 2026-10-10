import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useClerk, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import type { Palette } from "../../src/theme/colors";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DateStrip } from "../../src/components/DateStrip";
import { MetricCard } from "../../src/components/MetricCard";
import { ActivitySheet } from "../../src/components/ActivitySheet";
import { CalendarSheet } from "../../src/components/CalendarSheet";
import { SectionHeader, EmptyState, Button, Banner, Card, LoadingState, IconBadge, type IoniconName } from "../../src/components/ui/primitives";
import { SegmentedControl, IconButton, OverflowMenu } from "../../src/components/ui/controls";
import { useTodayLog } from "../../src/hooks/useTodayLog";
import { useMe } from "../../src/hooks/useMe";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { useLiftLogs } from "../../src/hooks/useLiftLogs";
import { useActivity } from "../../src/hooks/useActivity";
import { useWeeklyVerdict } from "../../src/hooks/useWeeklyVerdict";
import { useMeals } from "../../src/hooks/useMeals";
import { MealSheet } from "../../src/components/MealSheet";
import type { DailyField, MealLog } from "../../src/api/types";
import { formatMediumDate } from "../../src/utils/date";

interface FieldConfig {
  field: DailyField;
  label: string;
  unit: string;
  icon: IoniconName;
  iconBg: string;
  iconColor: string;
}

function fieldConfigs(colors: Palette): FieldConfig[] {
  return [
    { field: "weight_kg", label: "Weight", unit: "kg", icon: "scale-outline", iconBg: colors.blueSoft, iconColor: colors.blue },
    { field: "calories", label: "Calories", unit: "kcal", icon: "flame", iconBg: colors.orangeSoft, iconColor: colors.orange },
    { field: "protein_g", label: "Protein", unit: "g", icon: "nutrition-outline", iconBg: colors.greenSoft, iconColor: colors.green },
    { field: "sleep_hours", label: "Sleep", unit: "hours", icon: "moon", iconBg: colors.purpleSoft, iconColor: colors.purple },
  ];
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

export default function TodayScreen() {
  const today = useCurrentDate();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const fields = useMemo(() => fieldConfigs(colors), [colors]);

  const [activeDate, setActiveDate] = useState(today);
  const prevTodayRef = useRef(today);
  // Midnight rollover while the app is open: follow into the new day only
  // if the user was viewing today — a deliberately chosen past date stays.
  useEffect(() => {
    setActiveDate((cur) => (cur === prevTodayRef.current ? today : cur));
    prevTodayRef.current = today;
  }, [today]);
  const [segment, setSegment] = useState<"log" | "defaults">("log");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data, placeholder, loading, error, fieldErrors, retry, save, retrySave, refetch } =
    useTodayLog(activeDate);
  const { profile, defaults, update: updateMe } = useMe();
  const { entries: lifts, deleteEntry: deleteLift, loading: liftsLoading, error: liftsError, refetch: refetchLifts } = useLiftLogs(activeDate);
  const {
    entries: activities,
    addEntry: addActivity,
    deleteEntry: deleteActivity,
    loading: activitiesLoading,
    error: activitiesError,
    refetch: refetchActivities,
  } = useActivity(activeDate);
  const { data: verdict } = useWeeklyVerdict();
  const { meals, loading: mealsLoading, error: mealsError, refetch: refetchMeals } = useMeals(activeDate);
  const [editingMeal, setEditingMeal] = useState<MealLog | null>(null);

  const mealTotals = useMemo(
    () =>
      meals.reduce(
        (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein_g }),
        { calories: 0, protein: 0 },
      ),
    [meals],
  );

  /* Auto-repeat locked defaults into a day that's missing them. */
  const appliedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    appliedRef.current = new Set();
  }, [activeDate]);

  useEffect(() => {
    if (loading || !data) return;
    for (const f of fields) {
      const locked = defaults[f.field];
      if (locked != null && (data[f.field] ?? null) == null) {
        const key = `${activeDate}:${f.field}`;
        if (appliedRef.current.has(key)) continue;
        appliedRef.current.add(key);
        save(f.field, locked);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, defaults, loading, activeDate]);

  const toggleLock = useCallback(
    async (field: DailyField) => {
      const current = defaults[field] ?? null;
      if (current != null) {
        await updateMe({ daily_defaults: { ...defaults, [field]: null } });
        return;
      }
      const seed = data?.[field] ?? placeholder?.[field] ?? null;
      if (seed == null) {
        Alert.alert("Nothing to lock", "Log a value first, then lock it to repeat daily.");
        return;
      }
      await updateMe({ daily_defaults: { ...defaults, [field]: seed } });
    },
    [defaults, data, placeholder, updateMe],
  );

  const missingDefaults = useMemo(
    () => fields.filter((f) => defaults[f.field] != null && (data?.[f.field] ?? null) == null),
    [defaults, data, fields],
  );

  const applyAllDefaults = useCallback(async () => {
    for (const f of missingDefaults) await save(f.field, defaults[f.field] ?? null);
  }, [missingDefaults, defaults, save]);

  const groupedLifts = useMemo(() => {
    const map = new Map<string, typeof lifts>();
    for (const l of lifts) {
      const arr = map.get(l.exercise_name) ?? [];
      arr.push(l);
      map.set(l.exercise_name, arr);
    }
    return Array.from(map.entries()).map(([name, sets]) => ({ name, sets }));
  }, [lifts]);

  const confirmDeleteLift = useCallback(
    (id: string) => {
      Alert.alert("Delete set?", "This removes the logged set.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteLift(id).catch(() => {}) },
      ]);
    },
    [deleteLift],
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
    router.navigate("/(tabs)/lift" as never);
  }, []);

  const refreshing = loading || liftsLoading || activitiesLoading;
  const refetchAll = useCallback(() => {
    refetch();
    refetchLifts();
    refetchActivities();
  }, [refetch, refetchLifts, refetchActivities]);

  const verdictLabel =
    verdict && verdict.weight_trend_kg_per_week != null
      ? { hold: "Hold Steady", adjust_calories: "Adjust Calories", check_recovery: "Check Recovery" }[verdict.verdict]
      : null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.primary} />}
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

        <View style={styles.dateStrip}>
          <DateStrip selected={activeDate} today={today} onSelect={setActiveDate} />
        </View>

        <View style={styles.greeting}>
          <Text style={typography.h2}>
            {greeting()}, {user?.firstName ?? "there"}
          </Text>
          <Text style={typography.small}>Consistency today, strength tomorrow.</Text>
        </View>

        <SegmentedControl
          style={styles.segment}
          value={segment}
          onChange={setSegment}
          options={[
            { value: "log", label: "Log" },
            { value: "defaults", label: "Daily Defaults" },
          ]}
        />

        {error ? <Banner tone="danger" message={error} actionLabel="Retry" onAction={refetch} style={styles.block} /> : null}
        {retry ? (
          <Banner
            tone="warning"
            message="Couldn't save — your entry is kept."
            actionLabel="Retry"
            onAction={retrySave}
            style={styles.block}
          />
        ) : null}

        {segment === "defaults" ? (
          <Card style={styles.block}>
            <Text style={typography.bodyStrong}>Daily defaults</Text>
            <Text style={[typography.small, styles.defaultsHelp]}>
              Lock a field to repeat its value every day. Locked values are filled in automatically
              when you open a new day.
            </Text>
            <Button
              label={
                missingDefaults.length > 0
                  ? `Repeat ${missingDefaults.length} default${missingDefaults.length > 1 ? "s" : ""} for this day`
                  : "Defaults set — manage locks below"
              }
              variant={missingDefaults.length > 0 ? "primary" : "outline"}
              icon="refresh"
              disabled={missingDefaults.length === 0}
              onPress={applyAllDefaults}
              style={styles.defaultsButton}
            />
          </Card>
        ) : null}

        {loading && !data ? (
          <LoadingState label="Loading today…" />
        ) : (
          <View style={styles.grid}>
            {fields.map((f) => (
              <MetricCard
                key={f.field}
                field={f.field}
                label={f.label}
                unit={f.unit}
                icon={f.icon}
                iconBg={f.iconBg}
                iconColor={f.iconColor}
                value={data?.[f.field] ?? null}
                placeholder={placeholder?.[f.field] ?? null}
                locked={defaults[f.field] != null}
                onToggleLock={() => toggleLock(f.field)}
                onSave={(v) => save(f.field, v)}
                fieldError={fieldErrors[f.field]}
              />
            ))}
          </View>
        )}

        {segment === "log" ? (
          <>
            {verdictLabel ? (
              <Pressable style={styles.verdictCard} onPress={() => router.navigate("/verdict" as never)}>
                <IconBadge name="ribbon-outline" bg={colors.primarySoft} color={colors.primary} size={36} rounded={false} />
                <View style={styles.verdictText}>
                  <Text style={typography.caption}>Weekly Verdict</Text>
                  <Text style={styles.verdictLabel}>{verdictLabel}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}

            <View style={styles.section}>
              <SectionHeader
                title="Today's Lifts"
                {...(groupedLifts.length > 0 ? { actionLabel: "Add", onAction: goLift } : {})}
              />
              {liftsError ? (
                <Banner
                  tone="danger"
                  message={liftsError}
                  actionLabel="Retry"
                  onAction={() => refetchLifts()}
                  style={styles.block}
                />
              ) : null}
              {liftsLoading && lifts.length === 0 ? (
                <LoadingState label="Loading lifts…" />
              ) : groupedLifts.length === 0 ? (
                <EmptyState
                  compact
                  icon="barbell-outline"
                  title="No lifts logged yet."
                  subtitle="Log your sets directly."
                >
                  <Button label="Add Lift" icon="add" onPress={goLift} />
                </EmptyState>
              ) : (
                <View style={styles.list}>
                  {groupedLifts.map((g) => (
                    <Card key={g.name} style={styles.liftCard}>
                      <Text style={typography.bodyStrong}>{g.name}</Text>
                      <View style={styles.setChips}>
                        {g.sets.map((s) => (
                          <Pressable
                            key={s.id}
                            style={styles.setChip}
                            onLongPress={() => confirmDeleteLift(s.id)}
                            accessibilityLabel={`${s.exercise_name} set ${s.weight_kg} by ${s.reps}`}
                          >
                            <Text style={styles.setChipText}>
                              {s.weight_kg} × {s.reps}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={[typography.caption, styles.hint]}>Long-press a set to delete</Text>
                    </Card>
                  ))}
                </View>
              )}
            </View>

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

            {profile?.meal_tracking_enabled !== false ? (
            <View style={styles.section}>
              <SectionHeader
                title="Meals"
                {...(meals.length > 0
                  ? {
                      actionLabel: "Log",
                      onAction: () =>
                        router.navigate({ pathname: "/coach/new", params: { agent: "meal" } } as never),
                    }
                  : {})}
              />
              {mealsError ? (
                <Banner
                  tone="danger"
                  message={mealsError}
                  actionLabel="Retry"
                  onAction={() => refetchMeals()}
                  style={styles.block}
                />
              ) : null}
              {mealsLoading && meals.length === 0 ? (
                <LoadingState label="Loading meals…" />
              ) : meals.length === 0 ? (
                <EmptyState
                  compact
                  icon="restaurant-outline"
                  title="No meals logged yet."
                  subtitle="Tell the coach what you ate — it estimates the calories and protein for you."
                >
                  <Button label="Log with coach" icon="sparkles-outline" onPress={() => router.navigate({ pathname: "/coach/new", params: { agent: "meal" } } as never)} />
                </EmptyState>
              ) : (
                <View style={styles.list}>
                  {meals.map((m) => (
                    <Pressable
                      key={m.id}
                      style={styles.mealRow}
                      onPress={() => setEditingMeal(m)}
                      accessibilityLabel={`${m.title} ${m.calories} calories`}
                    >
                      <IconBadge name="restaurant-outline" bg={colors.greenSoft} color={colors.green} size={36} rounded={false} />
                      <View style={styles.activityText}>
                        <Text style={typography.bodyStrong} numberOfLines={1}>
                          {m.title}
                        </Text>
                        <Text style={typography.small} numberOfLines={1}>
                          {m.calories} kcal · {m.protein_g} g protein
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </Pressable>
                  ))}
                  <Text style={[typography.caption, styles.hint]}>
                    From meals: {mealTotals.calories} kcal · {mealTotals.protein} g protein
                  </Text>
                </View>
              )}
            </View>
            ) : null}
          </>
        ) : null}

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
    greeting: { marginTop: spacing.md, marginBottom: spacing.sm, gap: 2 },
    dateStrip: { marginTop: spacing.sm },
    segment: { marginTop: spacing.md },
    block: { marginTop: spacing.md },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.sm, marginTop: spacing.md },
    section: { marginTop: spacing.xxl },
    list: { gap: spacing.sm },
    footerSpace: { height: spacing.xxl },

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

    defaultsHelp: { marginTop: spacing.xs, marginBottom: spacing.md, color: t.colors.textDim },
    defaultsButton: { marginTop: spacing.xs },

    verdictCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    verdictText: { flex: 1, gap: 2 },
    verdictLabel: { fontSize: 16, fontWeight: "700", color: t.colors.primary },

    liftCard: { gap: spacing.sm },
    setChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    setChip: {
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    setChipText: { fontSize: 13, fontWeight: "600", color: t.colors.text },
    hint: { color: t.colors.textMuted },

    activityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    activityText: { flex: 1, gap: 2 },
    mealRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
    },
  }),
);
