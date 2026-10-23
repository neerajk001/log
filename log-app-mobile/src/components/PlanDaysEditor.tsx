import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { muscleGroupsForDay } from "../utils/derive";
import { muscleTagStyle } from "../utils/tags";
import { MAX_EDITOR_SET_FIELDS, editorSetCount } from "../utils/planTargets";
import { plateConfigError } from "../utils/plate";
import type { PlateUnit } from "../api/types";
import { Chip } from "./ui/controls";
import { Tag } from "./ui/primitives";

export interface EditableExercise {
  name: string;
  sets: string;
  reps: string;
  /** Free weights (kg) or a numbered machine stack. */
  loadMode: "weight" | "plate";
  /** One target weight (kg) per set, in set order. Blank = no target for that set. */
  setWeights: string[];
  /** Optional plate-stack calibration, in the editor's string form. */
  plateUnit: PlateUnit;
  plateIncrement: string;
  plateMin: string;
  plateMax: string;
}

export interface EditableDay {
  day_name: string;
  /** The coach's one-line "why this day". Carried through edits; not editable here. */
  rationale?: string;
  exercises: EditableExercise[];
}

export function emptyExercise(): EditableExercise {
  return {
    name: "",
    sets: "",
    reps: "",
    loadMode: "weight",
    setWeights: [],
    plateUnit: "kg",
    plateIncrement: "",
    plateMin: "",
    plateMax: "",
  };
}

export function emptyDay(): EditableDay {
  return { day_name: "", exercises: [emptyExercise()] };
}

/** Editor fields for a stored exercise's plate mode + calibration. */
export function plateFieldsFromExercise(exercise: {
  load_mode?: "weight" | "plate" | null;
  plate_config?: {
    unit: PlateUnit;
    increment: number;
    min_position: number;
    max_position: number;
  } | null;
}): Pick<
  EditableExercise,
  "loadMode" | "plateUnit" | "plateIncrement" | "plateMin" | "plateMax"
> {
  const config = exercise.plate_config;
  return {
    loadMode: exercise.load_mode === "plate" ? "plate" : "weight",
    plateUnit: config?.unit ?? "kg",
    plateIncrement: config ? String(config.increment) : "",
    plateMin: config ? String(config.min_position) : "",
    plateMax: config ? String(config.max_position) : "",
  };
}

/** Editable plan days + exercises (design 03.03 / 03.05). */
export function PlanDaysEditor({
  days,
  onChange,
}: {
  days: EditableDay[];
  onChange: (days: EditableDay[]) => void;
}) {
  const { colors, scheme, typography } = useTheme();
  const styles = useStyles();
  const tagTheme = { colors, scheme };
  const updateDay = (di: number, patch: Partial<EditableDay>) =>
    onChange(days.map((d, i) => (i === di ? { ...d, ...patch } : d)));

  const updateExercise = (di: number, ei: number, patch: Partial<EditableExercise>) =>
    onChange(
      days.map((d, i) =>
        i === di ? { ...d, exercises: d.exercises.map((e, j) => (j === ei ? { ...e, ...patch } : e)) } : d,
      ),
    );

  /** Writes one set's target weight, padding the array so positions stay aligned. */
  const updateSetWeight = (di: number, ei: number, index: number, value: string) => {
    const setWeights = [...days[di].exercises[ei].setWeights];
    while (setWeights.length <= index) setWeights.push("");
    setWeights[index] = value;
    updateExercise(di, ei, { setWeights });
  };

  return (
    <View style={styles.container}>
      {days.map((day, di) => {
        const muscles = muscleGroupsForDay(
          day.day_name,
          day.exercises.map((e) => e.name).filter(Boolean),
        );
        return (
          <View key={di} style={styles.dayCard}>
            <Text style={styles.label}>Day name</Text>
            <TextInput
              style={styles.dayNameInput}
              value={day.day_name}
              onChangeText={(t) => updateDay(di, { day_name: t })}
              placeholder="e.g. Push"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Muscle groups (auto-detected)</Text>
            <View style={styles.muscleRow}>
              {muscles.length > 0 ? (
                muscles.map((m) => (
                  <Tag key={m} label={m} bg={muscleTagStyle(m, tagTheme).bg} text={muscleTagStyle(m, tagTheme).text} />
                ))
              ) : (
                <Text style={typography.small}>Add exercises to detect muscles.</Text>
              )}
            </View>

            <View style={styles.exercisesHeader}>
              <Text style={styles.label}>Exercises</Text>
              <Pressable
                onPress={() => updateDay(di, { exercises: [...day.exercises, emptyExercise()] })}
                hitSlop={8}
              >
                <Text style={styles.addLink}>+ Add exercise</Text>
              </Pressable>
            </View>

            {day.exercises.map((ex, ei) => {
              const calibrationError = plateConfigError({
                loadMode: ex.loadMode,
                plateUnit: ex.plateUnit,
                plateIncrement: ex.plateIncrement,
                plateMin: ex.plateMin,
                plateMax: ex.plateMax,
              });
              return (
              <View key={ei} style={styles.exerciseBlock}>
                <View style={styles.exerciseRow}>
                  <Ionicons name="reorder-three-outline" size={18} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, styles.exName]}
                    value={ex.name}
                    onChangeText={(t) => updateExercise(di, ei, { name: t })}
                    placeholder="Exercise"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                  />
                  <TextInput
                    style={[styles.input, styles.exNum]}
                    value={ex.sets}
                    onChangeText={(t) => updateExercise(di, ei, { sets: t })}
                    placeholder="Sets"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.input, styles.exNum]}
                    value={ex.reps}
                    onChangeText={(t) => updateExercise(di, ei, { reps: t })}
                    placeholder="Reps"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Pressable
                    onPress={() =>
                      Alert.alert("Remove exercise?", "This removes the exercise from the plan.", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => updateDay(di, { exercises: day.exercises.filter((_, j) => j !== ei) }),
                        },
                      ])
                    }
                    hitSlop={8}
                    accessibilityLabel="Remove exercise"
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                </View>

                <View style={styles.modeRow}>
                  <Text style={styles.setWeightsLabel}>Load</Text>
                  <Chip
                    label="Weight"
                    active={ex.loadMode !== "plate"}
                    onPress={() => updateExercise(di, ei, { loadMode: "weight" })}
                  />
                  <Chip
                    label="Plate stack"
                    active={ex.loadMode === "plate"}
                    onPress={() => updateExercise(di, ei, { loadMode: "plate" })}
                  />
                </View>

                {ex.loadMode === "plate" ? (
                  <View style={styles.plateFields}>
                    <Text style={styles.setWeightsLabel}>Load per stack position (optional)</Text>
                    <View style={styles.plateRow}>
                      <Chip
                        label="kg"
                        active={ex.plateUnit === "kg"}
                        onPress={() => updateExercise(di, ei, { plateUnit: "kg" })}
                      />
                      <Chip
                        label="lb"
                        active={ex.plateUnit === "lb"}
                        onPress={() => updateExercise(di, ei, { plateUnit: "lb" })}
                      />
                      <TextInput
                        style={[styles.setWeightInput, styles.plateIncrement]}
                        value={ex.plateIncrement}
                        onChangeText={(t) => updateExercise(di, ei, { plateIncrement: t })}
                        placeholder="e.g. 5"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                      />
                    </View>
                    <Text style={styles.plateHint}>
                      Log the numbered position on the Lift screen. Leave this blank to log
                      positions without a weight estimate.
                    </Text>
                    {calibrationError ? (
                      <Text style={styles.plateError}>{calibrationError}</Text>
                    ) : null}
                  </View>
                ) : (
                  /* One target weight per set, so pyramids can be prescribed. */
                  <View style={styles.setWeights}>
                    <Text style={styles.setWeightsLabel}>
                      Target weight per set (kg)
                      {editorSetCount(ex.sets) < (parseInt(ex.sets, 10) || 1)
                        ? ` · first ${MAX_EDITOR_SET_FIELDS}`
                        : ""}
                    </Text>
                    <View style={styles.setWeightsRow}>
                      {Array.from({ length: editorSetCount(ex.sets) }, (_, si) => (
                        <View key={si} style={styles.setWeightField}>
                          <Text style={styles.setWeightIndex}>{si + 1}</Text>
                          <TextInput
                            style={styles.setWeightInput}
                            value={ex.setWeights[si] ?? ""}
                            onChangeText={(t) => updateSetWeight(di, ei, si, t)}
                            placeholder="kg"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numeric"
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
              );
            })}

            {days.length > 1 ? (
              <Pressable
                onPress={() => onChange(days.filter((_, i) => i !== di))}
                hitSlop={8}
                style={styles.removeDay}
              >
                <Text style={styles.removeDayText}>Remove day</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      <Pressable onPress={() => onChange([...days, emptyDay()])} style={styles.addDay}>
        <Ionicons name="add" size={16} color={colors.primary} />
        <Text style={styles.addDayText}>Add day</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { gap: spacing.md },
    dayCard: {
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    label: { ...t.typography.caption, color: t.colors.textDim },
    dayNameInput: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.md,
      height: 46,
      paddingHorizontal: spacing.md,
      fontSize: 15,
      color: t.colors.text,
    },
    muscleRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", minHeight: 20 },
    exercisesHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.sm,
    },
    addLink: { fontSize: 13, fontWeight: "600", color: t.colors.primary },
    exerciseRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    exerciseBlock: { gap: spacing.xs },
    modeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingLeft: 26 },
    plateFields: { gap: 4, paddingLeft: 26 },
    plateRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    plateIncrement: { width: 96 },
    plateHint: { ...t.typography.caption, color: t.colors.textMuted },
    plateError: { ...t.typography.caption, color: t.colors.danger },
    setWeights: { gap: 4, paddingLeft: 26 },
    setWeightsLabel: { ...t.typography.caption, color: t.colors.textMuted },
    setWeightsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    setWeightField: { alignItems: "center", gap: 1 },
    setWeightIndex: { fontSize: 10, fontWeight: "700", color: t.colors.textMuted },
    setWeightInput: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.sm,
      height: 40,
      width: 54,
      textAlign: "center",
      fontSize: 13,
      color: t.colors.text,
      paddingHorizontal: 0,
    },
    input: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.sm,
      height: 44,
      paddingHorizontal: spacing.md,
      fontSize: 14,
      color: t.colors.text,
    },
    exName: { flex: 1, minWidth: 0 },
    exNum: { width: 52, textAlign: "center", paddingHorizontal: spacing.xs },
    removeDay: { alignSelf: "flex-start", marginTop: spacing.xs },
    removeDayText: { ...t.typography.small, color: t.colors.danger },
    addDay: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: t.colors.primarySoftBorder,
      borderStyle: "dashed",
      borderRadius: radii.lg,
      paddingVertical: spacing.md,
    },
    addDayText: { fontSize: 15, fontWeight: "600", color: t.colors.primary },
  }),
);
