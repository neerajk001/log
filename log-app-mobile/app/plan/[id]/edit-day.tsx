import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { makeUseStyles } from "../../../src/theme/ThemeContext";
import { spacing } from "../../../src/theme/spacing";
import { ScreenHeader } from "../../../src/components/ScreenHeader";
import {
  PlanDaysEditor,
  type EditableDay,
} from "../../../src/components/PlanDaysEditor";
import { Button, Banner, LoadingState, EmptyState } from "../../../src/components/ui/primitives";
import { usePlans } from "../../../src/hooks/usePlans";
import { usePlansApi } from "../../../src/api/plans";
import { parsePositiveInt } from "../../../src/utils/parse";
import type { CreatePlanInput } from "../../../src/api/types";

function toEditable(
  dayName: string,
  exercises: { name: string; sets: number; reps: string; weight_kg?: number | null }[],
): EditableDay {
  return {
    day_name: dayName,
    exercises: exercises.map((e) => ({
      name: e.name,
      sets: String(e.sets),
      reps: e.reps,
      weight: e.weight_kg != null ? String(e.weight_kg) : "",
    })),
  };
}

/** Edit a single plan day (design 03.03). */
export default function EditDayScreen() {
  const { dayId } = useLocalSearchParams<{ id: string; dayId: string }>();
  const { activePlan, days, loading, refetch } = usePlans();
  const api = usePlansApi();

  const day = useMemo(() => days.find((d) => d.id === dayId) ?? null, [days, dayId]);

  const [edited, setEdited] = useState<EditableDay | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = useStyles();

  const current: EditableDay | null = edited ?? (day ? toEditable(day.day_name, day.exercises) : null);

  if (loading && !day) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="detail" title="Edit Day" onBack={() => router.back()} />
          <LoadingState />
        </View>
      </View>
    );
  }

  if (!day || !current || !activePlan) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="detail" title="Edit Day" onBack={() => router.back()} />
          <EmptyState icon="clipboard-outline" title="Day not found" subtitle="This plan may have changed." />
        </View>
      </View>
    );
  }

  const save = async () => {
    if (!current.day_name.trim()) {
      setError("Give the day a name.");
      return;
    }
    for (const e of current.exercises) {
      if (!e.name.trim() || !e.sets.trim() || Number.isNaN(parseInt(e.sets, 10)) || !e.reps.trim()) {
        setError("Every exercise needs a name, sets and reps.");
        return;
      }
    }

    const payload: CreatePlanInput = {
      name: activePlan.name,
      source: activePlan.source,
      days: days.map((d) =>
        d.id === day.id
          ? {
              day_name: current.day_name.trim(),
              exercises: current.exercises.map((e) => ({
                name: e.name.trim(),
                sets: parseInt(e.sets, 10),
                reps: e.reps.trim(),
                weight_kg: parsePositiveInt(e.weight, 9999) ?? undefined,
              })),
            }
          : {
              day_name: d.day_name,
              exercises: d.exercises.map((e) => ({
                name: e.name,
                sets: e.sets,
                reps: e.reps,
                weight_kg: e.weight_kg ?? undefined,
              })),
            },
      ),
    };

    setSaving(true);
    setError(null);
    try {
      await api.updatePlan(activePlan.id, payload);
      await refetch();
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save day");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          variant="detail"
          title="Edit Day"
          onBack={() => router.back()}
          right={<Button label="Save" size="sm" onPress={save} loading={saving} />}
        />

        {error ? <Banner tone="danger" message={error} /> : null}

        <PlanDaysEditor days={[current]} onChange={(next) => setEdited(next[0] ?? current)} />

        <Button
          label="Discard changes"
          variant="ghost"
          onPress={() =>
            Alert.alert("Discard changes?", "Unsaved edits to this day will be lost.", [
              { text: "Keep editing", style: "cancel" },
              { text: "Discard", style: "destructive", onPress: () => router.back() },
            ])
          }
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
  }),
);
