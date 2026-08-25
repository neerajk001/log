import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

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

interface PlanEditorProps {
  days: EditableDay[];
  onChange: (days: EditableDay[]) => void;
}

export function PlanEditor({ days, onChange }: PlanEditorProps) {
  const updateDay = (di: number, patch: Partial<EditableDay>) => {
    onChange(days.map((d, i) => (i === di ? { ...d, ...patch } : d)));
  };

  const updateExercise = (di: number, ei: number, patch: Partial<EditableExercise>) => {
    onChange(
      days.map((d, i) =>
        i === di
          ? { ...d, exercises: d.exercises.map((e, j) => (j === ei ? { ...e, ...patch } : e)) }
          : d,
      ),
    );
  };

  const addDay = () => onChange([...days, emptyDay()]);
  const removeDay = (di: number) => onChange(days.filter((_, i) => i !== di));

  const addExercise = (di: number) =>
    onChange(
      days.map((d, i) =>
        i === di ? { ...d, exercises: [...d.exercises, emptyExercise()] } : d,
      ),
    );

  const removeExercise = (di: number, ei: number) =>
    onChange(
      days.map((d, i) =>
        i === di ? { ...d, exercises: d.exercises.filter((_, j) => j !== ei) } : d,
      ),
    );

  return (
    <View style={styles.container}>
      {days.map((day, di) => (
        <View key={di} style={styles.dayCard}>
          <View style={styles.dayHeader}>
            <TextInput
              style={[styles.input, styles.dayName]}
              value={day.day_name}
              onChangeText={(t) => updateDay(di, { day_name: t })}
              placeholder="Day name (e.g. Push)"
              placeholderTextColor={colors.chalkDim}
            />
            <Pressable onPress={() => removeDay(di)} hitSlop={8}>
              <Text style={styles.removeText}>Remove day</Text>
            </Pressable>
          </View>

          {day.exercises.map((ex, ei) => (
            <View key={ei} style={styles.exerciseRow}>
              <TextInput
                style={[styles.input, styles.exName]}
                value={ex.name}
                onChangeText={(t) => updateExercise(di, ei, { name: t })}
                placeholder="Exercise"
                placeholderTextColor={colors.chalkDim}
              />
              <TextInput
                style={[styles.input, styles.exNum]}
                value={ex.sets}
                onChangeText={(t) => updateExercise(di, ei, { sets: t })}
                placeholder="Sets"
                placeholderTextColor={colors.chalkDim}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.exNum]}
                value={ex.reps}
                onChangeText={(t) => updateExercise(di, ei, { reps: t })}
                placeholder="Reps"
                placeholderTextColor={colors.chalkDim}
              />
              <Pressable onPress={() => removeExercise(di, ei)} hitSlop={8}>
                <Text style={styles.removeX}>×</Text>
              </Pressable>
            </View>
          ))}

          <Pressable onPress={() => addExercise(di)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add exercise</Text>
          </Pressable>
        </View>
      ))}

      <Pressable onPress={addDay} style={styles.addDayBtn}>
        <Text style={styles.addBtnText}>+ Add day</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 14,
    gap: 10,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dayName: {
    flex: 1,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Inter",
    fontSize: 14,
    color: colors.chalk,
  },
  exName: {
    flex: 1,
  },
  exNum: {
    width: 56,
    textAlign: "center",
  },
  removeText: {
    fontFamily: "Inter",
    fontSize: 12,
    color: colors.steel,
  },
  removeX: {
    fontFamily: "Inter",
    fontSize: 18,
    color: colors.steel,
    paddingHorizontal: 4,
  },
  addBtn: {
    alignSelf: "flex-start",
  },
  addDayBtn: {
    alignItems: "center",
    padding: 10,
  },
  addBtnText: {
    fontFamily: "Inter-Medium",
    fontSize: 13,
    color: colors.rustSoft,
  },
});
