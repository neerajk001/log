import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { colors } from "../../src/theme/colors";
import { typography } from "../../src/theme/typography";
import { spacing } from "../../src/theme/spacing";
import { usePlansApi } from "../../src/api/plans";
import { PlanEditor, emptyDay, type EditableDay } from "../../src/components/PlanEditor";
import type {
  ParsedPlanPreview,
  CreatePlanInput,
  WorkoutPlan,
  PlanExercise,
} from "../../src/api/types";

function toEditableDays(parsed: ParsedPlanPreview): EditableDay[] {
  return parsed.days.map((d) => ({
    day_name: d.day_name,
    exercises: d.exercises.map((e) => ({
      name: e.name,
      sets: String(e.sets),
      reps: e.reps,
    })),
  }));
}

const MUSCLE_GROUP_HINTS: Array<{ pattern: RegExp; groups: string[] }> = [
  { pattern: /\bpush\b/i, groups: ["Chest", "Shoulders", "Triceps"] },
  { pattern: /\bpull\b/i, groups: ["Back", "Biceps"] },
  { pattern: /\blegs?\b/i, groups: ["Quads", "Hamstrings", "Glutes", "Calves"] },
  { pattern: /\bupper\b/i, groups: ["Chest", "Back", "Shoulders", "Arms"] },
  { pattern: /\blower\b/i, groups: ["Quads", "Hamstrings", "Glutes", "Calves"] },
  { pattern: /chest|bench/i, groups: ["Chest", "Triceps"] },
  { pattern: /back|row|pulldown/i, groups: ["Back", "Biceps"] },
  { pattern: /shoulder|press|delt/i, groups: ["Shoulders", "Triceps"] },
  { pattern: /arm|bicep|tricep|curl/i, groups: ["Arms"] },
  { pattern: /core|ab/i, groups: ["Core"] },
];

function inferMuscleGroups(dayName: string): string[] {
  const matches: string[] = [];
  const seen = new Set<string>();
  for (const { pattern, groups } of MUSCLE_GROUP_HINTS) {
    if (pattern.test(dayName)) {
      for (const g of groups) {
        if (!seen.has(g)) {
          seen.add(g);
          matches.push(g);
        }
      }
    }
  }
  return matches;
}

export default function PlanScreen() {
  const api = usePlansApi();
  const [phase, setPhase] = useState<"library" | "input" | "editor">("library");
  const [text, setText] = useState("");
  const [planName, setPlanName] = useState("");
  const [days, setDays] = useState<EditableDay[]>([]);
  const [source, setSource] = useState<"manual" | "ai_parsed">("ai_parsed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [openDayId, setOpenDayId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setError("");
    try {
      const list = await api.getPlans();
      setPlans(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      setPlansLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (phase === "library") loadPlans();
  }, [phase, loadPlans]);

  const handleParsed = useCallback((parsed: ParsedPlanPreview) => {
    setDays(toEditableDays(parsed));
    setPlanName("My Workout Plan");
    setSource("ai_parsed");
    setError("");
    setPhase("editor");
  }, []);

  const handlePaste = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Paste some plan text first");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.parsePlanText(trimmed);
      handleParsed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't parse that");
    } finally {
      setLoading(false);
    }
  }, [text, api, handleParsed]);

  const handlePickPdf = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        setLoading(false);
        return;
      }
      const file = result.assets[0];

      const formData = new FormData();
      if ((file as any).file) {
        formData.append("file", (file as any).file);
      } else {
        formData.append("file", {
          uri: file.uri,
          name: file.name,
          type: file.mimeType ?? "application/pdf",
        } as unknown as Blob);
      }

      handleParsed(await api.parsePlanPdfForm(formData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't parse that PDF");
    } finally {
      setLoading(false);
    }
  }, [api, handleParsed]);

  const handleManual = useCallback(() => {
    setDays([emptyDay()]);
    setPlanName("My Workout Plan");
    setSource("manual");
    setError("");
    setPhase("editor");
  }, []);

  const handleConfirm = useCallback(async () => {
    for (const d of days) {
      if (!d.day_name.trim()) {
        setError("Every day needs a name");
        return;
      }
      for (const e of d.exercises) {
        if (!e.name.trim()) {
          setError("Every exercise needs a name");
          return;
        }
        if (!e.sets.trim() || isNaN(parseInt(e.sets, 10))) {
          setError("Every exercise needs a number of sets");
          return;
        }
        if (!e.reps.trim()) {
          setError("Every exercise needs a rep scheme");
          return;
        }
      }
    }

    const payload: CreatePlanInput = {
      name: planName.trim() || "My Workout Plan",
      source,
      days: days.map((d) => ({
        day_name: d.day_name.trim(),
        exercises: d.exercises.map((e) => ({
          name: e.name.trim(),
          sets: parseInt(e.sets, 10),
          reps: e.reps.trim(),
        })),
      })),
    };

    setLoading(true);
    setError("");
    try {
      await api.createPlan(payload);
      setPhase("library");
      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setLoading(false);
    }
  }, [days, planName, source, api, loadPlans]);

  const activePlan = plans.find((p) => p.is_active) ?? plans[0] ?? null;

  const renderLibrary = () => {
    if (plansLoading && plans.length === 0) {
      return <Text style={typography.bodySmall}>Loading plans...</Text>;
    }
    if (!activePlan) {
      return (
        <View style={styles.emptyState}>
          <Text style={[typography.bodyLabel, styles.emptyTitle]}>
            No plan yet
          </Text>
          <Text style={typography.bodySmall}>
            Import or build a workout plan to see it here.
          </Text>
        </View>
      );
    }

    return (
      <>
        <View style={styles.planHeaderCard}>
          <Text style={typography.bodyLabel}>{activePlan.name}</Text>
          <Text style={typography.bodySmall}>
            {activePlan.days.length} workout{" "}
            {activePlan.days.length === 1 ? "day" : "days"} ·{" "}
            {activePlan.source === "ai_parsed" ? "AI parsed" : "Manual"}
          </Text>
        </View>

        {activePlan.days.map((day) => {
          const muscleGroups = inferMuscleGroups(day.day_name);
          const isOpen = openDayId === day.id;
          return (
            <View key={day.id} style={styles.dayCard}>
              <Pressable
                style={styles.dayHeader}
                onPress={() => setOpenDayId(isOpen ? null : day.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, styles.dayName]}>
                    {day.day_name}
                  </Text>
                  {muscleGroups.length > 0 ? (
                    <Text style={[typography.bodySmall, styles.muscleGroups]}>
                      {muscleGroups.join(" · ")}
                    </Text>
                  ) : (
                    <Text style={[typography.bodySmall, styles.muscleGroups]}>
                      {day.exercises.length} exercise
                      {day.exercises.length === 1 ? "" : "s"}
                    </Text>
                  )}
                </View>
                <Text style={styles.dayChevron}>{isOpen ? "−" : "+"}</Text>
              </Pressable>

              {isOpen ? (
                <View style={styles.exerciseList}>
                  {day.exercises.length === 0 ? (
                    <Text style={typography.bodySmall}>No exercises yet.</Text>
                  ) : (
                    day.exercises.map((ex: PlanExercise, i: number) => (
                      <View key={i} style={styles.exerciseRow}>
                        <Text style={typography.body} numberOfLines={1}>
                          {ex.name}
                        </Text>
                        <Text style={typography.dataSmall}>
                          {ex.sets} × {ex.reps}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </>
    );
  };

  const renderInput = () => (
    <View style={styles.section}>
      <Text style={typography.sectionLabel}>Import workout plan</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.textArea}
          placeholder="Paste your plan text here..."
          placeholderTextColor={colors.chalkDim}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
        />
        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handlePaste}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Parsing..." : "Parse text"}
          </Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={typography.bodySmall}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={styles.buttonOutline}
          onPress={handlePickPdf}
          disabled={loading}
        >
          <Text style={styles.buttonOutlineText}>Upload PDF</Text>
        </Pressable>

        <Pressable style={styles.textButton} onPress={handleManual}>
          <Text style={typography.bodySmall}>Add exercises manually</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderEditor = () => (
    <View style={styles.section}>
      <Text style={typography.sectionLabel}>Review & edit</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.nameInput}
          value={planName}
          onChangeText={setPlanName}
          placeholder="Plan name"
          placeholderTextColor={colors.chalkDim}
        />
      </View>
      <PlanEditor days={days} onChange={setDays} />
      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleConfirm}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Saving..." : "Confirm & Save Plan"}
        </Text>
      </Pressable>
      <Pressable style={styles.textButton} onPress={() => setPhase("input")}>
        <Text style={typography.bodySmall}>Cancel</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          phase === "library" ? (
            <RefreshControl
              refreshing={plansLoading}
              onRefresh={loadPlans}
              tintColor={colors.rust}
            />
          ) : undefined
        }
      >
        <View style={styles.header}>
          <Text style={typography.screenTitle}>Plan</Text>
        </View>

        {phase === "library" ? (
          <>
            <View style={styles.section}>
              <Text style={typography.sectionLabel}>Your training program</Text>
              {renderLibrary()}
            </View>
            <View style={styles.libraryActions}>
              <Pressable
                style={[styles.button, styles.fullBtn]}
                onPress={() => setPhase("input")}
              >
                <Text style={styles.buttonText}>
                  {activePlan ? "Replace plan" : "Add a plan"}
                </Text>
              </Pressable>
              {activePlan ? (
                <Pressable
                  style={[styles.textButton, styles.viewToday]}
                  onPress={() => router.navigate("/(tabs)/lift" as any)}
                >
                  <Text style={typography.bodySmall}>
                    Jump to today's workout →
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

        {phase === "input" ? renderInput() : null}
        {phase === "editor" ? renderEditor() : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.graphite,
  },
  scroll: {
    padding: spacing.screenPadding,
    paddingBottom: 40,
  },
  header: {
    marginTop: spacing.sectionTop,
    marginBottom: spacing.sectionBottom,
  },
  section: {
    marginTop: spacing.sectionTop,
    marginBottom: spacing.sectionBottom,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 14,
    gap: 12,
  },
  textArea: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 12,
    fontFamily: "Inter",
    fontSize: 14,
    color: colors.chalk,
    minHeight: 120,
  },
  nameInput: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 12,
    fontFamily: "Inter",
    fontSize: 16,
    color: colors.chalk,
  },
  button: {
    backgroundColor: colors.rust,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  fullBtn: {
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: "Inter-SemiBold",
    fontSize: 16,
    color: colors.chalk,
  },
  buttonOutline: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 14,
    alignItems: "center",
  },
  buttonOutlineText: {
    fontFamily: "Inter-Medium",
    fontSize: 16,
    color: colors.chalk,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.hairline,
  },
  textButton: {
    alignSelf: "center",
    padding: 8,
  },
  errorBanner: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.rust,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    fontFamily: "Inter",
    fontSize: 13,
    color: colors.rustSoft,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    color: colors.chalk,
  },
  planHeaderCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 16,
    gap: 4,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    marginTop: 8,
    overflow: "hidden",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  dayName: {
    fontWeight: "600",
  },
  muscleGroups: {
    marginTop: 2,
    color: colors.chalkDim,
  },
  dayChevron: {
    fontFamily: "JetBrainsMono",
    fontSize: 22,
    color: colors.rustSoft,
    paddingHorizontal: 8,
  },
  exerciseList: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    gap: 8,
  },
  exerciseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  libraryActions: {
    marginTop: 20,
    gap: 8,
  },
  viewToday: {
    alignSelf: "center",
  },
});
