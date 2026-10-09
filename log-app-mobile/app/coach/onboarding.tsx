import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Banner, Button, Card, IconBadge, LoadingState } from "../../src/components/ui/primitives";
import { Chip, ChipRow, TextField } from "../../src/components/ui/controls";
import { useCoachProfile } from "../../src/hooks/useCoachProfile";
import { useCoachApi } from "../../src/api/coach";
import { setPendingPlan } from "../../src/state/parsedPlan";
import { parsePositiveInt, parsePositiveNumber } from "../../src/utils/parse";
import type { CoachProfile, CoachProfileInput } from "../../src/api/types";
import type { EditableDay } from "../../src/components/PlanDaysEditor";

const GOALS = ["Lose fat", "Build muscle", "Recomp", "Get stronger", "General fitness"];
const EXPERIENCE = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];
const EQUIPMENT = ["Full gym", "Home dumbbells", "Bodyweight"];
const DAYS = [2, 3, 4, 5, 6];

function toEditableDays(
  days: { day_name: string; exercises: { name: string; sets: number; reps: string }[] }[],
): EditableDay[] {
  return days.map((d) => ({
    day_name: d.day_name,
    exercises: d.exercises.map((e) => ({ name: e.name, sets: String(e.sets), reps: e.reps })),
  }));
}

/** Optional onboarding quiz — the AI coach uses this to build your plan. */
export default function CoachOnboardingScreen() {
  const { profile, loading, save } = useCoachProfile();
  const styles = useStyles();

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.padded}>
          <ScreenHeader variant="detail" title="Your goals" onBack={() => router.back()} />
          <LoadingState label="Loading your answers…" />
        </View>
      </View>
    );
  }

  if (!profile) {
    // Rendered once the initial fetch settles; `initial` seeds the form.
    return <OnboardingForm initial={null} onSave={save} />;
  }

  return <OnboardingForm initial={profile} onSave={save} />;
}

function OnboardingForm({
  initial,
  onSave,
}: {
  initial: CoachProfile | null;
  onSave: (data: CoachProfileInput) => Promise<CoachProfile>;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const coachApi = useCoachApi();

  const [goal, setGoal] = useState<string | null>(initial?.goal ?? null);
  const [experience, setExperience] = useState<string | null>(initial?.experience ?? null);
  const [equipment, setEquipment] = useState<string | null>(initial?.equipment ?? null);
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(initial?.days_per_week ?? null);
  const [weight, setWeight] = useState(initial?.weight_kg != null ? String(initial.weight_kg) : "");
  const [target, setTarget] = useState(
    initial?.target_weight_kg != null ? String(initial.target_weight_kg) : "",
  );
  const [height, setHeight] = useState(initial?.height_cm != null ? String(initial.height_cm) : "");
  const [dietNotes, setDietNotes] = useState(initial?.diet_notes ?? "");
  const [injuries, setInjuries] = useState(initial?.injuries ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "plan" | "photo">(null);
  const [error, setError] = useState<string | null>(null);

  const payload = useCallback(
    (): CoachProfileInput => ({
      goal,
      experience,
      equipment,
      days_per_week: daysPerWeek,
      weight_kg: parsePositiveNumber(weight.trim(), 999),
      target_weight_kg: parsePositiveNumber(target.trim(), 999),
      height_cm: parsePositiveInt(height.trim(), 300),
      diet_notes: dietNotes.trim() || null,
      injuries: injuries.trim() || null,
      notes: notes.trim() || null,
    }),
    [goal, experience, equipment, daysPerWeek, weight, target, height, dietNotes, injuries, notes],
  );

  const onSavePress = useCallback(async () => {
    setBusy("save");
    setError(null);
    try {
      await onSave(payload());
      Alert.alert("Saved", "Your coach will use this from now on.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setBusy(null);
    }
  }, [onSave, payload]);

  const onGeneratePlan = useCallback(async () => {
    setBusy("plan");
    setError(null);
    try {
      await onSave(payload());
      const result = await coachApi.generatePlan({
        goal: goal ?? undefined,
        notes: notes.trim() || undefined,
      });
      setPendingPlan({ name: "AI Coach Plan", source: "ai_parsed", days: toEditableDays(result.days) });
      router.navigate("/plan/preview" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a plan. Try again.");
    } finally {
      setBusy(null);
    }
  }, [onSave, payload, coachApi, goal, notes]);

  const onPickPhoto = useCallback(async () => {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      const form = new FormData();
      form.append("file", {
        uri: file.uri,
        name: file.name ?? "photo.jpg",
        type: file.mimeType ?? "image/jpeg",
      } as unknown as Blob);
      if (notes.trim()) form.append("description", notes.trim());
      setBusy("photo");
      const { analysis: text } = await coachApi.analyzePhoto(form);
      setAnalysis(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyze that photo.");
    } finally {
      setBusy(null);
    }
  }, [coachApi, notes]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader variant="detail" title="Your goals" onBack={() => router.back()} />

        <Card style={styles.hero}>
          <IconBadge name="sparkles" bg={colors.primarySoft} color={colors.primary} size={48} rounded={false} />
          <Text style={[typography.small, styles.heroText]}>
            All of this is optional. Fill in what you know and your coach can build a plan around it.
          </Text>
        </Card>

        {error ? <Banner tone="danger" message={error} /> : null}

        <View style={styles.field}>
          <Text style={styles.label}>Primary goal</Text>
          <ChipRow>
            {GOALS.map((g) => (
              <Chip key={g} label={g} active={goal === g} onPress={() => setGoal((cur) => (cur === g ? null : g))} />
            ))}
          </ChipRow>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Experience</Text>
          <ChipRow>
            {EXPERIENCE.map((e) => (
              <Chip
                key={e.value}
                label={e.label}
                active={experience === e.value}
                onPress={() => setExperience((cur) => (cur === e.value ? null : e.value))}
              />
            ))}
          </ChipRow>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Days per week you can train</Text>
          <ChipRow>
            {DAYS.map((d) => (
              <Chip
                key={d}
                label={String(d)}
                active={daysPerWeek === d}
                onPress={() => setDaysPerWeek((cur) => (cur === d ? null : d))}
              />
            ))}
          </ChipRow>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Equipment</Text>
          <ChipRow>
            {EQUIPMENT.map((eq) => (
              <Chip
                key={eq}
                label={eq}
                active={equipment === eq}
                onPress={() => setEquipment((cur) => (cur === eq ? null : eq))}
              />
            ))}
          </ChipRow>
        </View>

        <View style={styles.row}>
          <TextField label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="80" style={styles.flex} />
          <TextField label="Target (kg)" value={target} onChangeText={setTarget} keyboardType="numeric" placeholder="75" style={styles.flex} />
          <TextField label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="180" style={styles.flex} />
        </View>

        <TextField
          label="Diet approach / targets (optional)"
          value={dietNotes}
          onChangeText={setDietNotes}
          placeholder="e.g. 2200 kcal, 160 g protein"
          multiline
          autoCapitalize="sentences"
        />
        <TextField
          label="Injuries or limitations (optional)"
          value={injuries}
          onChangeText={setInjuries}
          placeholder="e.g. cranky right shoulder"
          multiline
          autoCapitalize="sentences"
        />
        <TextField
          label="Anything else about your goal? (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Describe what you want to achieve…"
          multiline
          autoCapitalize="sentences"
        />

        <Button
          label="Add a body photo (optional)"
          icon="camera-outline"
          variant="outline"
          onPress={onPickPhoto}
          loading={busy === "photo"}
          disabled={busy != null}
        />
        {analysis ? (
          <Card style={styles.analysis}>
            <Text style={typography.bodyStrong}>{"Coach's read on your photo"}</Text>
            <Text style={typography.small}>{analysis}</Text>
            <Text style={[typography.caption, styles.privacyNote]}>
              Photo analyzed in the moment, never stored.
            </Text>
          </Card>
        ) : null}

        <Button label="Generate my plan" icon="sparkles-outline" onPress={onGeneratePlan} loading={busy === "plan"} disabled={busy != null} />
        <Button label="Save answers" icon="checkmark" variant="soft" onPress={onSavePress} loading={busy === "save"} disabled={busy != null} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    padded: { padding: spacing.screen },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    hero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    heroText: { flex: 1, color: t.colors.textDim },
    field: { gap: spacing.sm },
    label: { ...t.typography.caption, color: t.colors.textDim },
    row: { flexDirection: "row", gap: spacing.sm },
    flex: { flex: 1 },
    analysis: { gap: spacing.sm },
    privacyNote: { color: t.colors.textMuted },
  }),
);
