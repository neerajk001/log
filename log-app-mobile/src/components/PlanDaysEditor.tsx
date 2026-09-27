import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { muscleGroupsForDay } from "../utils/derive";
import { muscleTagStyle } from "../utils/tags";
import { Tag } from "./ui/primitives";

export interface EditableExercise {
  name: string;
  sets: string;
  reps: string;
}

export interface EditableDay {
  day_name: string;
  exercises: EditableExercise[];
}

export function emptyExercise(): EditableExercise {
  return { name: "", sets: "", reps: "" };
}

export function emptyDay(): EditableDay {
  return { day_name: "", exercises: [emptyExercise()] };
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

            {day.exercises.map((ex, ei) => (
              <View key={ei} style={styles.exerciseRow}>
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
            ))}

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
      borderColor: t.colors.border,
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
    input: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.sm,
      height: 44,
      paddingHorizontal: spacing.md,
      fontSize: 14,
      color: t.colors.text,
    },
    exName: { flex: 1 },
    exNum: { width: 58, textAlign: "center" },
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
