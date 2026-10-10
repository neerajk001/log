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
import { router } from "expo-router";
import { useClerk } from "@clerk/clerk-expo";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DayBanner } from "../../src/components/DayBanner";
import { ExerciseRow } from "../../src/components/ExerciseRow";
import { Banner, Button, Card, EmptyState, LoadingState, ErrorState } from "../../src/components/ui/primitives";
import { Chip, ChipRow, IconButton, OverflowMenu, TextField } from "../../src/components/ui/controls";
import { usePlanToday } from "../../src/hooks/usePlanToday";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { usePlans } from "../../src/hooks/usePlans";
import { useLiftLogs } from "../../src/hooks/useLiftLogs";
import { useRecentExercises } from "../../src/hooks/useRecentExercises";
import { muscleGroupsForDay } from "../../src/utils/derive";
import { successTick } from "../../src/hooks/useHaptics";

interface QuickSet {
  key: string;
  weight: string;
  reps: string;
}

let quickKey = 0;
function blankQuickSet(): QuickSet {
  quickKey += 1;
  return { key: `q${quickKey}`, weight: "", reps: "" };
}

export default function LiftScreen() {
  const today = useCurrentDate();
  const { signOut } = useClerk();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const { planId, day: rotatedDay, loading: planLoading, error: planError, refetch: refetchPlan } = usePlanToday(today);
  const { days } = usePlans();
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
  const { names: recent, lastByExercise } = useRecentExercises();

  const [overrideDayId, setOverrideDayId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [quickName, setQuickName] = useState("");
  const [quickSets, setQuickSets] = useState<QuickSet[]>([blankQuickSet()]);
  const [quickSaving, setQuickSaving] = useState(false);

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

  const quickLog = useCallback(async () => {
    const name = quickName.trim().slice(0, 120);
    if (!name) {
      Alert.alert("Enter an exercise name first.");
      return;
    }
    const valid = quickSets
      .map((q) => ({
        key: q.key,
        weight: parseFloat(q.weight),
        reps: parseInt(q.reps, 10),
      }))
      .filter(
        (q) => !Number.isNaN(q.weight) && q.weight > 0 && Number.isInteger(q.reps) && q.reps > 0,
      );
    if (valid.length === 0) {
      Alert.alert("Enter weight and reps for at least one set.");
      return;
    }
    setQuickSaving(true);
    try {
      for (const q of valid) {
        await addEntry({ date: today, exercise_name: name, weight_kg: q.weight, reps: q.reps, plan_day_id: null });
      }
      setQuickName("");
      setQuickSets([blankQuickSet()]);
      successTick();
    } catch {
      // hook surfaces the error; keep drafts so nothing is lost
    } finally {
      setQuickSaving(false);
    }
  }, [quickName, quickSets, addEntry, today]);

  const completedExercises = useMemo(() => {
    if (!day) return 0;
    return day.exercises.filter((ex) => (completedByExercise.get(ex.name) ?? 0) > 0).length;
  }, [day, completedByExercise]);

  const refetch = useCallback(() => {
    refetchPlan();
    refetchLifts();
  }, [refetchPlan, refetchLifts]);

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

        {planError ? <ErrorState message={planError} onRetry={refetchPlan} /> : null}
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
            <Chip label="Today" active={overrideDayId == null} onPress={() => setOverrideDayId(null)} />
            {days.map((d) => (
              <Chip
                key={d.id}
                label={d.day_name}
                active={(overrideDayId ?? rotatedDay?.id) === d.id}
                onPress={() => setOverrideDayId((cur) => (cur === d.id ? null : d.id))}
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
                    muscle={muscleGroupsForDay(day.day_name, [ex.name])[0]}
                    lastLog={lastByExercise.get(ex.name) ?? null}
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
        ) : (
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
            onChangeText={setQuickName}
            placeholder="e.g. Barbell Bench Press"
            autoCapitalize="words"
          />
          {recent.length > 0 ? (
            <ChipRow>
              {recent.map((r) => (
                <Chip key={r} label={r} active={r === quickName} onPress={() => setQuickName(r)} />
              ))}
            </ChipRow>
          ) : null}
          {quickSets.map((q, i) => (
            <View key={q.key} style={styles.quickSet}>
              <Text style={styles.quickNum}>{i + 1}</Text>
              <View style={styles.quickSmall}>
                <TextField
                  label={i === 0 ? "Weight (kg)" : undefined}
                  value={q.weight}
                  onChangeText={(t) => patchQuickSet(q.key, { weight: t })}
                  keyboardType="numeric"
                  placeholder="60"
                />
              </View>
              <View style={styles.quickSmall}>
                <TextField
                  label={i === 0 ? "Reps" : undefined}
                  value={q.reps}
                  onChangeText={(t) => patchQuickSet(q.key, { reps: t })}
                  keyboardType="numeric"
                  placeholder="8"
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
                <Chip key={r} label={r} onPress={() => setQuickName(r)} />
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
    quickRemove: { padding: 4 },
  }),
);
