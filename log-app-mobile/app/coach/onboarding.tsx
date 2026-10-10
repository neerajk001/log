import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Banner, Button, Card, LoadingState } from "../../src/components/ui/primitives";
import type { IoniconName } from "../../src/components/ui/primitives";
import { Chip, ChipRow, TextField } from "../../src/components/ui/controls";
import { OptionCard } from "../../src/components/OptionCard";
import { StepScaffold } from "../../src/components/onboarding/StepScaffold";
import { useCoachProfile } from "../../src/hooks/useCoachProfile";
import { useCoachApi } from "../../src/api/coach";
import { setPendingPlan } from "../../src/state/parsedPlan";
import { parsePositiveInt, parsePositiveNumber } from "../../src/utils/parse";
import type { CoachProfile, CoachProfileInput } from "../../src/api/types";
import type { EditableDay } from "../../src/components/PlanDaysEditor";

const GOALS: { value: string; subtitle: string; icon: IoniconName }[] = [
  { value: "Lose fat", subtitle: "Cut weight while keeping your strength", icon: "flame-outline" },
  { value: "Build muscle", subtitle: "Add size with steady progressive overload", icon: "barbell-outline" },
  { value: "Recomp", subtitle: "Lose fat and build muscle at the same time", icon: "swap-horizontal-outline" },
  { value: "Get stronger", subtitle: "Push your main lifts up", icon: "trending-up-outline" },
  { value: "General fitness", subtitle: "Stay consistent and healthy", icon: "heart-outline" },
];
const EXPERIENCE = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];
const EQUIPMENT = ["Full gym", "Home dumbbells", "Bodyweight"];
const DAYS = [2, 3, 4, 5, 6];

const STEPS = [
  {
    title: "What are you after?",
    subtitle: "Pick as many as you like — it shapes the plan the coach writes.",
  },
  {
    title: "Your training",
    subtitle: "How you train shapes the split and the exercise picks.",
  },
  {
    title: "Body & notes",
    subtitle: "Optional details the coach uses for volume and calorie targets.",
  },
];

const GOAL_VALUES = GOALS.map((g) => g.value);

/** Goals are stored as one comma-joined string; unknown values are kept so nothing is lost. */
function parseGoals(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return stored
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function orderGoals(selected: string[]): string[] {
  const known = GOAL_VALUES.filter((v) => selected.includes(v));
  const extra = selected.filter((v) => !GOAL_VALUES.includes(v));
  return [...known, ...extra];
}

function toEditableDays(
  days: { day_name: string; exercises: { name: string; sets: number; reps: string; weight_kg?: number | null }[] }[],
): EditableDay[] {
  return days.map((d) => ({
    day_name: d.day_name,
    exercises: d.exercises.map((e) => ({
      name: e.name,
      sets: String(e.sets),
      reps: e.reps,
      weight: e.weight_kg != null ? String(e.weight_kg) : "",
    })),
  }));
}

/** Optional plan-builder quiz — the AI coach uses these answers to write your plan. */
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

  return <PlanBuilderWizard initial={profile} onSave={save} />;
}

function PlanBuilderWizard({
  initial,
  onSave,
}: {
  initial: CoachProfile | null;
  onSave: (data: CoachProfileInput) => Promise<CoachProfile>;
}) {
  const { typography } = useTheme();
  const styles = useStyles();
  const coachApi = useCoachApi();

  const [step, setStep] = useState(1);
  const [goals, setGoals] = useState<string[]>(parseGoals(initial?.goal));
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
      goal: goals.length ? orderGoals(goals).join(", ") : null,
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
    [goals, experience, equipment, daysPerWeek, weight, target, height, dietNotes, injuries, notes],
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
        goal: goals.length ? orderGoals(goals).join(", ") : undefined,
        notes: notes.trim() || undefined,
      });
      setPendingPlan({ name: "AI Coach Plan", source: "ai_parsed", days: toEditableDays(result.days) });
      router.navigate("/plan/preview" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a plan. Try again.");
    } finally {
      setBusy(null);
    }
  }, [onSave, payload, coachApi, goals, notes]);

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
    <StepScaffold
      step={step}
      total={3}
      title={STEPS[step - 1].title}
      subtitle={STEPS[step - 1].subtitle}
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
      nextLabel={step === 3 ? "Generate my plan" : "Next"}
      nextDisabled={busy != null}
      onNext={step === 3 ? onGeneratePlan : () => setStep(step + 1)}
      secondary={
        step === 3
          ? {
              label: "Just save my answers",
              onPress: onSavePress,
              disabled: busy != null,
              loading: busy === "save",
            }
          : undefined
      }
    >
      {error ? <Banner tone="danger" message={error} /> : null}

      {step === 1
        ? GOALS.map((g) => (
            <OptionCard
              key={g.value}
              icon={g.icon}
              title={g.value}
              subtitle={g.subtitle}
              selected={goals.includes(g.value)}
              disabled={busy != null}
              onPress={() =>
                setGoals((cur) =>
                  cur.includes(g.value) ? cur.filter((v) => v !== g.value) : [...cur, g.value],
                )
              }
            />
          ))
        : null}

      {step === 2 ? (
        <>
          <Field label="Experience">
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
          </Field>

          <Field label="Days per week you can train">
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
          </Field>

          <Field label="Equipment">
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
          </Field>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <View style={styles.row}>
            <TextField
              label="Weight (kg)"
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
              placeholder="80"
              style={styles.flex}
            />
            <TextField
              label="Target (kg)"
              value={target}
              onChangeText={setTarget}
              keyboardType="numeric"
              placeholder="75"
              style={styles.flex}
            />
          </View>

          <TextField
            label="Height (cm)"
            value={height}
            onChangeText={setHeight}
            keyboardType="numeric"
            placeholder="180"
          />

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
        </>
      ) : null}
    </StepScaffold>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    padded: { padding: spacing.screen },
    field: { gap: spacing.sm },
    label: { ...t.typography.caption, color: t.colors.textDim },
    row: { flexDirection: "row", gap: spacing.sm },
    flex: { flex: 1 },
    analysis: { gap: spacing.sm },
    privacyNote: { color: t.colors.textMuted },
  }),
);
