import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/spacing";
import { useMealsApi } from "../api/meals";
import { invalidateGetCache } from "../api/client";
import { parsePositiveInt } from "../utils/parse";
import { Banner, Button } from "./ui/primitives";
import { Sheet, TextField } from "./ui/controls";
import type { MealLog } from "../api/types";

/** View/edit/delete a logged meal. Remount per meal via `key`. */
export function MealSheet({
  meal,
  visible,
  onClose,
  onSaved,
}: {
  meal: MealLog | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useMealsApi();
  const { typography } = useTheme();
  const styles = useStyles();
  const [title, setTitle] = useState(meal?.title ?? "");
  const [calories, setCalories] = useState(meal ? String(meal.calories) : "");
  const [protein, setProtein] = useState(meal ? String(meal.protein_g) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!meal) return null;

  const save = async () => {
    const kcal = parsePositiveInt(calories, 10000);
    const prot = parsePositiveInt(protein, 1000) ?? 0;
    if (!title.trim() || kcal == null) {
      setError("Enter a title and a valid calorie amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateMeal(meal.id, {
        title: title.trim().slice(0, 120),
        items: meal.items,
        calories: kcal,
        protein_g: prot,
        source: meal.source,
      });
      invalidateGetCache();
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert("Delete meal?", `"${meal.title}" will be removed and the day's totals adjusted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await api.deleteMeal(meal.id);
            invalidateGetCache();
            onSaved();
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Edit meal">
      <View style={styles.body}>
        {meal.items.length > 0 ? (
          <View style={styles.items}>
            {meal.items.map((it, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={[typography.small, styles.itemName]} numberOfLines={1}>
                  {it.name}
                  {it.quantity ? ` (${it.quantity})` : ""}
                </Text>
                <Text style={typography.small}>
                  {it.calories} kcal · {it.protein_g} g
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <TextField label="Title" value={title} onChangeText={setTitle} autoCapitalize="sentences" />

        <View style={styles.row}>
          <View style={styles.col}>
            <TextField
              label="Calories (kcal)"
              value={calories}
              onChangeText={setCalories}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.col}>
            <TextField
              label="Protein (g)"
              value={protein}
              onChangeText={setProtein}
              keyboardType="numeric"
            />
          </View>
        </View>

        {error ? <Banner tone="danger" message={error} /> : null}

        <Button label="Save changes" icon="checkmark" onPress={save} loading={busy} />
        <Button
          label="Delete meal"
          icon="trash-outline"
          variant="ghost"
          disabled={busy}
          onPress={confirmDelete}
        />
      </View>
    </Sheet>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    body: { gap: spacing.lg, paddingTop: spacing.sm },
    items: { gap: spacing.xs, backgroundColor: t.colors.surfaceAlt, borderRadius: 12, padding: spacing.md },
    itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    itemName: { flex: 1, color: t.colors.text },
    row: { flexDirection: "row", gap: spacing.sm },
    col: { flex: 1 },
  }),
);
