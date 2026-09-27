import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/spacing";
import type { ActivityLogCreate, ActivityType } from "../api/types";
import { parsePositiveInt, parsePositiveNumber } from "../utils/parse";
import { Banner, Button } from "./ui/primitives";
import { Chip, ChipRow, Sheet, TextField } from "./ui/controls";
import { successTick } from "../hooks/useHaptics";

const TYPES: { value: ActivityType; label: string }[] = [
  { value: "run", label: "Run" },
  { value: "cycle", label: "Cycle" },
  { value: "walk", label: "Walk" },
  { value: "swim", label: "Swim" },
  { value: "other", label: "Other" },
];

const DEFAULT_DURATION: Record<ActivityType, string> = {
  run: "30",
  cycle: "45",
  walk: "30",
  swim: "30",
  other: "",
};

/** Bottom-sheet form for logging an activity (design "Activity" + Add). */
export function ActivitySheet({
  visible,
  date,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  onSubmit: (data: ActivityLogCreate) => Promise<void>;
}) {
  const { typography } = useTheme();
  const styles = useStyles();
  const [type, setType] = useState<ActivityType>("run");
  const [name, setName] = useState("Run");
  const [duration, setDuration] = useState("30");
  const [distance, setDistance] = useState("");
  const [calories, setCalories] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setType("run");
    setName("Run");
    setDuration(DEFAULT_DURATION.run);
    setDistance("");
    setCalories("");
    setError(null);
  }, []);

  const chooseType = useCallback((t: ActivityType) => {
    setType(t);
    setName(t.charAt(0).toUpperCase() + t.slice(1));
    setDuration(DEFAULT_DURATION[t]);
  }, []);

  const submit = useCallback(async () => {
    const dur = parsePositiveInt(duration, 9999);
    if (!name.trim() || name.trim().length > 200 || dur == null) {
      setError("Enter a name and a valid duration (1–9999).");
      return;
    }
    const dist = distance.trim() ? parsePositiveNumber(distance, 9999) : null;
    const kcal = calories.trim() ? parsePositiveInt(calories, 99999) : null;
    if ((distance.trim() && dist == null) || (calories.trim() && kcal == null)) {
      setError("Distance and calories must be positive numbers in range.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        date,
        activity_type: type,
        name: name.trim().slice(0, 200),
        duration_min: dur,
        distance_km: dist,
        calories_burned: kcal,
      });
      reset();
      onClose();
      successTick();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [name, duration, distance, calories, date, type, onSubmit, onClose, reset]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Log activity">
      <View style={styles.body}>
        <ChipRow>
          {TYPES.map((t) => (
            <Chip key={t.value} label={t.label} active={type === t.value} onPress={() => chooseType(t.value)} />
          ))}
        </ChipRow>

        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Morning run"
          autoCapitalize="sentences"
        />

        <View style={styles.row}>
          <View style={styles.col}>
            <TextField label="Duration (min)" value={duration} onChangeText={setDuration} keyboardType="numeric" placeholder="30" />
          </View>
          <View style={styles.col}>
            <TextField label="Distance (km)" value={distance} onChangeText={setDistance} keyboardType="numeric" placeholder="5" />
          </View>
          <View style={styles.col}>
            <TextField label="Kcal" value={calories} onChangeText={setCalories} keyboardType="numeric" placeholder="300" />
          </View>
        </View>

        {error ? <Banner tone="danger" message={error} /> : null}

        <Text style={[typography.caption, styles.hint]}>Distance and calories are optional.</Text>

        <Button label="Save activity" icon="checkmark" onPress={submit} loading={saving} />
      </View>
    </Sheet>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    body: { gap: spacing.lg, paddingTop: spacing.sm },
    row: { flexDirection: "row", gap: spacing.sm },
    col: { flex: 1 },
    hint: { color: t.colors.textMuted },
  }),
);
