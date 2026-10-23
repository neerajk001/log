import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import * as Crypto from "expo-crypto";
import { useClerk } from "@clerk/clerk-expo";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DayBanner } from "../../src/components/DayBanner";
import { ExerciseRow } from "../../src/components/ExerciseRow";
import { Banner, Button, Card, EmptyState, LoadingState, ErrorState, IconBadge } from "../../src/components/ui/primitives";
import { Chip, ChipRow, IconButton, OverflowMenu, SegmentedControl, StepField, TextField } from "../../src/components/ui/controls";
import { usePlanToday } from "../../src/hooks/usePlanToday";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { usePlans } from "../../src/hooks/usePlans";
import { useLiftLogs } from "../../src/hooks/useLiftLogs";
import { useRecentExercises } from "../../src/hooks/useRecentExercises";
import { muscleGroupsForDay } from "../../src/utils/derive";
import { isBodyweightName, type LoadMode } from "../../src/utils/bodyweight";
import { requestIdForAttempt } from "../../src/utils/parse";
import { successTick } from "../../src/hooks/useHaptics";
import { AskCoachRow } from "../../src/components/coach/AskCoachRow";

interface QuickSet {
  key: string;
  /** Stable per payload, so retrying a partial failure can't log the set twice. */
  requestId: string;
  /** The parsed payload the last attempt sent ("weight|reps"), null before any. */
  lastAttempt: string | null;
  weight: string;
  reps: string;
}

let quickKey = 0;
function blankQuickSet(): QuickSet {
  quickKey += 1;
  return { key: `q${quickKey}`, requestId: Crypto.randomUUID(), lastAttempt: null, weight: "", reps: "" };
}

export default function LiftScreen() {
  const today = useCurrentDate();
  const { signOut } = useClerk();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const { planId, day: rotatedDay, loading: planLoading, error: planError, refetch: refetchPlan } = usePlanToday(today);
  const { days, error: plansError, refetch: refetchPlans } = usePlans();
  const {
    entries,
    addEntry,
    deleteEntry,
    loading: liftsLoading,
    loadError: liftsLoadError,
    mutationError: liftsMutationError,
    pendingIds,
    clearMutationError,
    refetch: refetchLifts,
  } = useLiftLogs(today);
  const { names: recent, lastByExercise, lastSetsByExercise } = useRecentExercises();

  // The selected plan day lives in the route param, so Today's workout strip can
  // open this screen on its day — and the choice sticks for the next set.
  const params = useLocalSearchParams<{ dayId?: string }>();
  const overrideDayId = typeof params.dayId === "string" ? params.dayId : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [quickName, setQuickName] = useState("");
  const [quickSets, setQuickSets] = useState<QuickSet[]>([blankQuickSet()]);
  const [quickModeOverride, setQuickModeOverride] = useState<LoadMode | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);

  // Bodyweight exercises are detected from the name; the toggle below overrides it.
  const quickMode: LoadMode =
    quickModeOverride ?? (isBodyweightName(quickName) ? "bw" : "kg");
  const quickBodyweight = quickMode === "bw";

  const day = useMemo(() => {
    if (overrideDayId) return days.find((d) => d.id === overrideDayId) ?? rotatedDay;
    return rotatedDay;
  }, [overrideDayId, days, rotatedDay]);

  const completedByExercise = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.exercise_name, (map.get(e.exercise_name) ?? 0) + 1);
    return map;
  }, [entries]);

  const setsByExercise = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const e of entries) {
      const arr = map.get(e.exercise_name) ?? [];
      arr.push(e);
      map.set(e.exercise_name, arr);
    }
    return map;
  }, [entries]);

  const patchQuickSet = useCallback((key: string, patch: Partial<QuickSet>) => {
    setQuickSets((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }, []);

  const addQuickSetRow = useCallback(() => {
    setQuickSets((prev) => [...prev, blankQuickSet()]);
  }, []);

  /**
   * Picking a recent exercise fills the sets it was last done in, so re-logging a
   * familiar lift is one tap instead of six. Only replaces rows when the exercise
   * actually changes — values already typed for this one are never thrown away.
   */
  const pickRecentExercise = useCallback(
    (name: string) => {
      if (name === quickName) return;
      setQuickName(name);
      const last = lastSetsByExercise.get(name)?.sets ?? [];
      // Last session wins; otherwise fall back to the name heuristic.
      const mode: LoadMode =
        last.length > 0
          ? last.every((set) => set.weight_kg == null)
            ? "bw"
            : "kg"
          : isBodyweightName(name)
            ? "bw"
            : "kg";
      setQuickModeOverride(mode);
      if (last.length === 0) return;
      const hasTyped = quickSets.some((q) => q.weight.trim() !== "" || q.reps.trim() !== "");
      if (hasTyped) return;
      setQuickSets(
        last.map((set) => ({
          ...blankQuickSet(),
          weight: set.weight_kg == null ? "" : String(set.weight_kg),
          reps: String(set.reps),
        })),
      );
    },
    [lastSetsByExercise, quickName, quickSets],
  );

  const quickLog = useCallback(async () => {
    const name = quickName.trim().slice(0, 120);
    if (!name) {
      Alert.alert("Enter an exercise name first.");
      return;
    }
    const valid = quickSets
      .map((q) => ({
        key: q.key,
        requestId: q.requestId,
        lastAttempt: q.lastAttempt,
        weight: quickBodyweight ? null : parseFloat(q.weight),
        reps: parseInt(q.reps, 10),
      }))
      .filter(
        (q) =>
          Number.isInteger(q.reps) &&
          q.reps > 0 &&
          (quickBodyweight || (q.weight != null && !Number.isNaN(q.weight) && q.weight > 0)),
      );
    if (valid.length === 0) {
      Alert.alert(
        quickBodyweight
          ? "Enter reps for at least one set."
          : "Enter weight and reps for at least one set.",
      );
      return;
    }
    // Ids stay stable while the values are unchanged (a retry replays the same
    // request); editing a row after a failure mints a new id so the old one's
    // changed-payload 409 can never lock the row. Reminted ids are written back
    // so the next retry continues from the right request.
    const prepared = valid.map((q) => ({
      ...q,
      ...requestIdForAttempt(q, `${q.weight ?? "bw"}|${q.reps}`, () => Crypto.randomUUID()),
    }));
    setQuickSets((prev) =>
      prev.map((q) => {
        const p = prepared.find((x) => x.key === q.key);
        return p ? { ...q, requestId: p.requestId, lastAttempt: p.lastAttempt } : q;
      }),
    );
    setQuickSaving(true);
    const results = await Promise.all(
      prepared.map(async (q) => {
        try {
          await addEntry({
            id: q.requestId,
            date: today,
            exercise_name: name,
            weight_kg: q.weight,
            reps: q.reps,
            plan_day_id: null,
          });
          return { key: q.key, ok: true };
        } catch {
          // The hook surfaces the message; keep the draft so nothing is lost.
          return { key: q.key, ok: false };
        }
      }),
    );

    const saved = new Set(results.filter((r) => r.ok).map((r) => r.key));
    setQuickSets((prev) => {
      const remaining = prev.filter((q) => !saved.has(q.key));
      return remaining.length > 0 ? remaining : [blankQuickSet()];
    });
    if (saved.size > 0) {
      successTick();
      // Clear the exercise only once nothing is left to retry.
      if (results.every((r) => r.ok)) setQuickName("");
    }
    setQuickSaving(false);
  }, [quickName, quickSets, quickBodyweight, addEntry, today]);

  const completedExercises = useMemo(() => {
    if (!day) return 0;
    return day.exercises.filter((ex) => (completedByExercise.get(ex.name) ?? 0) > 0).length;
  }, [day, completedByExercise]);

  const refetch = useCallback(() => {
    refetchPlan();
    refetchLifts();
    refetchPlans();
  }, [refetchPlan, refetchLifts, refetchPlans]);

  // A plan that couldn't be fetched is not the same as having no plan: status errors
  // win, and the "no plan yet" empty state only shows when nothing failed.
  const planFailure = planError ?? plansError;

  if (planLoading && !planId && days.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="brand" />
          <LoadingState label="Loading your plan…" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={planLoading || liftsLoading} onRefresh={refetch} tintColor={colors.primary} />}
      >
        <ScreenHeader
          variant="brand"
          right={
            <>
              <IconButton
                name="calendar-outline"
                accessibilityLabel="Open history"
                onPress={() => router.navigate("/(tabs)/history" as never)}
              />
              <IconButton name="ellipsis-horizontal" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} />
            </>
          }
        />

        {planFailure ? <ErrorState message={planFailure} onRetry={refetch} /> : null}
        {liftsLoadError ? <ErrorState message={liftsLoadError} onRetry={refetchLifts} /> : null}
        {liftsMutationError ? (
          <Banner
            tone="warning"
            message={liftsMutationError}
            actionLabel="Dismiss"
            onAction={clearMutationError}
          />
        ) : null}

        {days.length > 1 ? (
          <ChipRow style={styles.dayChips}>
            <Chip label="Today" active={overrideDayId == null} onPress={() => router.setParams({ dayId: undefined })} />
            {days.map((d) => (
              <Chip
                key={d.id}
                label={d.day_name}
                active={overrideDayId === d.id}
                onPress={() => router.setParams({ dayId: overrideDayId === d.id ? undefined : d.id })}
              />
            ))}
          </ChipRow>
        ) : null}

        {day ? (
          <>
            <DayBanner
              dayName={day.day_name}
              muscles={muscleGroupsForDay(day.day_name, day.exercises.map((e) => e.name))}
              completed={completedExercises}
              total={day.exercises.length}
              />

            <View style={styles.list}>
              {day.exercises.map((ex, i) => {
                const key = `${day.id}:${ex.name}`;
                return (
                  <ExerciseRow
                    key={`${today}:${day.id}:${ex.name}`}
                    index={i + 1}
                    name={ex.name}
                    sets={ex.sets}
                    reps={ex.reps}
                    plannedWeight={ex.weight_kg ?? null}
                    plateMode={ex.load_mode === "plate"}
                    plateConfig={ex.plate_config ?? null}
                    muscle={muscleGroupsForDay(day.day_name, [ex.name])[0]}
                    lastLog={lastByExercise.get(ex.name) ?? null}
                    lastSession={lastSetsByExercise.get(ex.name) ?? null}
                    setTargets={ex.set_targets ?? null}
                    loggedSets={setsByExercise.get(ex.name) ?? []}
                    planDayId={day.id}
                    date={today}
                    expanded={expanded === key}
                    onToggle={() => setExpanded((cur) => (cur === key ? null : key))}
                    onAddSet={addEntry}
                    onDeleteSet={(id) => deleteEntry(id).catch(() => {})}
                    logsLoading={liftsLoading}
                    pendingIds={pendingIds}
                  />
                );
              })}
            </View>

            <AskCoachRow
              agent="training"
              label="Ask the coach about my training"
              hint="Swap an exercise, check your progress"
              question="About my training — "
            />

            <View style={styles.actions}>
              <Button
                label="Save as Plan"
                icon="bookmark-outline"
                variant="outline"
                onPress={() => router.navigate("/(tabs)/plan" as never)}
                style={styles.flex}
              />
            </View>
          </>
        ) : planFailure ? null : (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="barbell-outline"
              title="No workout plan yet"
              subtitle="Import or build a plan, or just log a lift below."
            >
              <Button label="Add a plan" icon="add" onPress={() => router.navigate("/(tabs)/plan" as never)} />
            </EmptyState>
          </View>
        )}

        <Card style={styles.quickCard}>
          <Text style={typography.bodyStrong}>Quick log</Text>
          <TextField
            label="Exercise"
            value={quickName}
            onChangeText={(text) => {
              setQuickName(text);
              // A typed name re-derives the mode; the toggle still overrides it.
              setQuickModeOverride(null);
            }}
            placeholder="e.g. Barbell Bench Press"
            autoCapitalize="words"
          />
          <SegmentedControl
            options={[
              { value: "kg", label: "Weighted" },
              { value: "bw", label: "Bodyweight" },
            ]}
            value={quickMode}
            onChange={(mode) => setQuickModeOverride(mode)}
          />
          {recent.length > 0 ? (
            <ChipRow>
              {recent.map((r) => (
                <Chip key={r} label={r} active={r === quickName} onPress={() => pickRecentExercise(r)} />
              ))}
            </ChipRow>
          ) : null}
          {quickSets.map((q, i) => (
            <View key={q.key} style={styles.quickSet}>
              <Text style={styles.quickNum}>{i + 1}</Text>
              {quickBodyweight ? (
                <View style={styles.quickSmall}>
                  {i === 0 ? <Text style={typography.caption}>Load</Text> : null}
                  <View style={styles.quickBw}>
                    <Text style={styles.quickBwText}>BW</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.quickSmall}>
                  {i === 0 ? <Text style={typography.caption}>Weight (kg)</Text> : null}
                  <StepField
                    value={q.weight}
                    onChangeText={(t) => patchQuickSet(q.key, { weight: t })}
                    placeholder="60"
                    label="Weight"
                  />
                </View>
              )}
              <View style={styles.quickSmall}>
                {i === 0 ? <Text style={typography.caption}>Reps</Text> : null}
                <StepField
                  value={q.reps}
                  onChangeText={(t) => patchQuickSet(q.key, { reps: t })}
                  placeholder="8"
                  label="Reps"
                  step={1}
                  minNonZero={1}
                />
              </View>
              {quickSets.length > 1 ? (
                <Pressable
                  onPress={() => setQuickSets((prev) => prev.filter((x) => x.key !== q.key))}
                  hitSlop={8}
                  accessibilityLabel="Remove set"
                  style={styles.quickRemove}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))}
          <Button label="Add set" icon="add" variant="soft" onPress={addQuickSetRow} />
          <Button label={`Log ${quickSets.length > 1 ? `${quickSets.length} sets` : "set"}`} icon="checkmark" onPress={quickLog} loading={quickSaving} />
        </Card>

        {!day && recent.length > 0 ? (
          <View style={styles.recentWrap}>
            <Text style={typography.caption}>Recent exercises</Text>
            <ChipRow>
              {recent.map((r) => (
                <Chip key={r} label={r} onPress={() => pickRecentExercise(r)} />
              ))}
            </ChipRow>
          </View>
        ) : null}
      </ScrollView>

      <OverflowMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          { label: "Settings", icon: "settings-outline", onPress: () => router.navigate("/settings" as never) },
          { label: "Log out", icon: "log-out-outline", destructive: true, onPress: () => signOut().catch(() => {}) },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    padded: { padding: spacing.screen },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    dayChips: { marginTop: spacing.xs },
    list: { gap: spacing.sm, marginTop: spacing.sm },
    actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    flex: { flex: 1 },
    emptyWrap: { marginTop: spacing.lg },
    recentWrap: { gap: spacing.sm },
    quickCard: { gap: spacing.md },
    quickSet: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    quickNum: { fontSize: 13, fontWeight: "700", color: t.colors.textDim, width: 16, textAlign: "center" },
    quickSmall: { flex: 1 },
    quickBw: {
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    quickBwText: { fontSize: 14, fontWeight: "700", color: t.colors.textDim, letterSpacing: 0.5 },
    quickRemove: { padding: 4 },

    errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
    errorTitle: { textAlign: "center" },
    errorText: { textAlign: "center", color: t.colors.textDim },
  }),
);

/**
 * Route-level fallback (expo-router picks this up): a render crash on Lift becomes a
 * friendly, retryable card instead of a red box.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <View style={styles.errorWrap}>
        <IconBadge name="alert-circle-outline" bg={colors.surface} color={colors.danger} size={56} rounded={false} />
        <Text style={[typography.h3, styles.errorTitle]}>Lift couldn&apos;t load</Text>
        <Text style={[typography.small, styles.errorText]}>
          {error?.message ?? "Something went wrong on this screen."}
        </Text>
        <Button label="Try again" icon="refresh" onPress={() => void retry()} />
      </View>
    </View>
  );
}
