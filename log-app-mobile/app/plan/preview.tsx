import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { PlanDaysEditor, type EditableDay } from "../../src/components/PlanDaysEditor";
import { Button, Banner, Card, EmptyState } from "../../src/components/ui/primitives";
import { TextField } from "../../src/components/ui/controls";
import { parsePositiveInt } from "../../src/utils/parse";
import { usePlansApi } from "../../src/api/plans";
import { clearPendingPlan, getPendingPlan } from "../../src/state/parsedPlan";
import type { CreatePlanInput } from "../../src/api/types";

/** Review parsed plan before saving (design 03.05). */
export default function PlanPreviewScreen() {
  const api = usePlansApi();
  const pending = getPendingPlan();
  const editingPlanId = pending?.editingPlanId ?? null;
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const [name, setName] = useState(pending?.name ?? "My Workout Plan");
  const [days, setDays] = useState<EditableDay[]>(pending?.days ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pending) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="detail" title={editingPlanId ? "Update Plan" : "Import Preview"} onBack={() => router.back()} />
          <EmptyState
            icon="document-outline"
            title="Nothing to preview"
            subtitle="Import a plan first."
          >
            <Button label="Import a plan" onPress={() => router.replace("/plan/import" as never)} />
          </EmptyState>
        </View>
      </View>
    );
  }

  const save = async () => {
    if (saving) return;
    for (const d of days) {
      if (!d.day_name.trim() || d.day_name.trim().length > 200) {
        setError("Every day needs a name (max 200 chars).");
        return;
      }
      for (const e of d.exercises) {
        const sets = parsePositiveInt(e.sets, 99);
        if (!e.name.trim() || e.name.trim().length > 120 || sets == null || !e.reps.trim() || e.reps.trim().length > 20) {
          setError("Every exercise needs a name (≤120), sets 1–99 and reps (≤20 chars).");
          return;
        }
      }
    }

    const payload: CreatePlanInput = {
      name: (name.trim() || "My Workout Plan").slice(0, 200),
      source: pending.source,
      days: days.map((d) => ({
        day_name: d.day_name.trim().slice(0, 200),
        exercises: d.exercises.map((e) => ({
          name: e.name.trim().slice(0, 120),
          sets: parsePositiveInt(e.sets, 99) ?? 0,
          reps: e.reps.trim().slice(0, 20),
          weight_kg: parsePositiveInt(e.weight, 9999) ?? undefined,
        })),
      })),
    };

    setSaving(true);
    setError(null);
    try {
      if (editingPlanId) await api.updatePlan(editingPlanId, payload);
      else await api.createPlan(payload);
      clearPendingPlan();
      if (router.canDismiss()) router.dismissAll();
      router.replace("/(tabs)/plan" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  const totalExercises = days.reduce((sum, d) => sum + d.exercises.length, 0);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader variant="detail" title={editingPlanId ? "Update Plan" : "Import Preview"} onBack={() => router.back()} />

        {editingPlanId ? (
          <Banner tone="info" message="Your coach prepared these changes. Review them, then tap Update Plan." />
        ) : pending.source === "ai_parsed" ? (
          <Banner tone="success" message="Plan parsed successfully! Review and make changes before saving." />
        ) : null}

        {error ? <Banner tone="danger" message={error} /> : null}

        <Card style={styles.summary}>
          <Ionicons name="barbell" size={20} color={colors.primary} />
          <View style={styles.summaryText}>
            <Text style={typography.bodyStrong}>{name}</Text>
            <Text style={typography.small}>
              {days.length} workout day{days.length === 1 ? "" : "s"} • {totalExercises} exercise
              {totalExercises === 1 ? "" : "s"}
            </Text>
          </View>
        </Card>

        <TextField label="Plan name" value={name} onChangeText={setName} placeholder="My Workout Plan" autoCapitalize="words" />

        <PlanDaysEditor days={days} onChange={setDays} />

        <Button
          label={editingPlanId ? "Update Plan" : "Create Plan"}
          icon="checkmark"
          onPress={save}
          loading={saving}
        />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
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
    summaryText: { flex: 1, gap: 2 },
  }),
);
