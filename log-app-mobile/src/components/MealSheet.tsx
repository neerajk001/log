import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { PostHogMaskView } from "posthog-react-native";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/spacing";
import { useMealsApi } from "../api/meals";
import { parsePositiveInt } from "../utils/parse";
import { scaleMealItems } from "../utils/mealMath";
import { Banner, Button } from "./ui/primitives";
import { Sheet, TextField } from "./ui/controls";
import type { MealLog } from "../api/types";

/** Where the numbers came from — an estimate is never presented as verified data. */
function sourceLabel(source: MealLog["source"]): string {
  if (source === "photo") return "Estimated from a photo — numbers are approximate.";
  if (source === "ai") return "Estimated by the coach — numbers are approximate.";
  return "Logged manually.";
}

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
    const proteinText = protein.trim();
    const prot = proteinText === "" ? 0 : parsePositiveInt(proteinText, 1000);
    if (!title.trim() || kcal == null || prot == null) {
      setError("Enter a title and valid calorie/protein amounts.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateMeal(meal.id, {
        title: title.trim().slice(0, 120),
        // Re-scale the items so their numbers still add up to the edited totals
        // — otherwise the detail view and the day's maths quietly disagree.
        items: scaleMealItems(meal.items, kcal, prot),
        calories: kcal,
        protein_g: prot,
        source: meal.source,
      });
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
      {/* Meal names/calories are health data — excluded from session replays. */}
      <PostHogMaskView style={styles.body}>
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

        <Text style={[typography.caption, styles.sourceNote]}>{sourceLabel(meal.source)}</Text>

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
      </PostHogMaskView>
    </Sheet>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    body: { gap: spacing.lg, paddingTop: spacing.sm },
    sourceNote: { color: t.colors.textDim },
    items: { gap: spacing.xs, backgroundColor: t.colors.surfaceAlt, borderRadius: 12, padding: spacing.md },
    itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    itemName: { flex: 1, color: t.colors.text },
    row: { flexDirection: "row", gap: spacing.sm },
    col: { flex: 1 },
  }),
);
