import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, IconBadge } from "../ui/primitives";
import { DonutChart } from "../ui/charts";
import { formatNumber } from "../../utils/derive";
import { MAX_DAILY, parsePositiveNumber } from "../../utils/parse";

/** Inline numeric editor for a ring's logged total (tap the value to type). */
function EditableValue({
  value,
  unit,
  onSave,
}: {
  value: number | null;
  unit: string;
  onSave: (value: number | null) => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      onSave(null);
      return;
    }
    const num = parsePositiveNumber(trimmed, MAX_DAILY.calories);
    if (num != null) onSave(num);
  };

  if (editing) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        autoFocus
        selectTextOnFocus
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        style={[typography.bodyStrong, styles.editInput]}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${unit === "g" ? "protein" : "calories"}`}
      onPress={() => {
        setDraft(value != null ? String(value) : "");
        setEditing(true);
      }}
    >
      <Text style={typography.bodyStrong} numberOfLines={1}>
        {value != null ? formatNumber(value) : "—"}
        <Text style={typography.metricUnit}> {unit}</Text>
      </Text>
    </Pressable>
  );
}

function NutritionRing({
  label,
  value,
  target,
  unit,
  color,
  onEdit,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  color: string;
  onEdit: (value: number | null) => void;
}) {
  const { typography } = useTheme();
  const styles = useStyles();
  const hasTarget = target != null && target > 0;
  const pct = hasTarget ? Math.min(100, Math.round((value / (target as number)) * 100)) : null;

  return (
    <View style={styles.ring}>
      <DonutChart size={52} thickness={8} slices={[{ label, value, color }]} />
      <View style={styles.ringText}>
        <Text style={typography.caption} numberOfLines={1}>
          {label}
          {pct != null ? ` ${pct}%` : ""}
        </Text>
        <EditableValue value={value} unit={unit} onSave={onEdit} />
        <Text style={typography.caption} numberOfLines={1}>
          {target != null ? `of ${formatNumber(target)} ${unit}` : "no target"}
        </Text>
      </View>
    </View>
  );
}

/**
 * Today's nutrition at a glance: calorie and protein rings on their targets and,
 * on one row, the day's meal summary with the "Log Meal" action.
 */
export function NutritionCard({
  loggedCalories,
  calorieTarget,
  loggedProtein,
  proteinTarget,
  mealCount,
  mealCalories,
  mealProtein,
  onLogMeal,
  onPressMeals,
  onEdit,
}: {
  loggedCalories: number;
  calorieTarget: number | null;
  loggedProtein: number;
  proteinTarget: number | null;
  mealCount: number;
  mealCalories: number;
  mealProtein: number;
  onLogMeal: () => void;
  onPressMeals: () => void;
  onEdit: (field: "calories" | "protein_g", value: number | null) => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconBadge name="restaurant" bg={colors.primarySoft} color={colors.primary} size={26} rounded={false} />
          <Text style={typography.caption}>Nutrition</Text>
        </View>
        <Text style={typography.caption}>
          {formatNumber(loggedCalories)}
          {calorieTarget != null ? ` / ${formatNumber(calorieTarget)}` : ""} kcal
        </Text>
      </View>

      <View style={styles.ringsRow}>
        <NutritionRing
          label="Calories"
          value={loggedCalories}
          target={calorieTarget}
          unit="kcal"
          color={colors.primary}
          onEdit={(v) => onEdit("calories", v)}
        />
        <NutritionRing
          label="Protein"
          value={loggedProtein}
          target={proteinTarget}
          unit="g"
          color={colors.success}
          onEdit={(v) => onEdit("protein_g", v)}
        />
      </View>

      <View style={styles.mealsRow}>
        {mealCount > 0 ? (
          <Pressable
            onPress={onPressMeals}
            accessibilityRole="button"
            accessibilityLabel={`${mealCount} meals logged`}
            style={styles.mealsInfo}
          >
            <View style={styles.thumbs}>
              {Array.from({ length: Math.min(mealCount, 2) }).map((_, i) => (
                <View key={i} style={[styles.thumb, i > 0 && styles.thumbOverlap]}>
                  <Ionicons name="restaurant" size={11} color={colors.green} />
                </View>
              ))}
            </View>
            <Text style={[typography.caption, styles.mealsText]} numberOfLines={1}>
              {mealCount} {mealCount === 1 ? "meal" : "meals"} · {formatNumber(mealCalories)} kcal ·{" "}
              {formatNumber(mealProtein)} g
            </Text>
          </Pressable>
        ) : (
          <Text style={[typography.caption, styles.mealsText]} numberOfLines={1}>
            No meals logged yet
          </Text>
        )}
        <Button label="Log Meal" icon="add" size="sm" onPress={onLogMeal} />
      </View>
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: { gap: spacing.md, borderColor: t.colors.primarySoftBorder },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

    ringsRow: { flexDirection: "row", gap: spacing.md },
    ring: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 0 },
    ringText: { flex: 1, gap: 1, minWidth: 0 },
    editInput: { padding: 0, minWidth: 44, color: t.colors.text },

    mealsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    mealsInfo: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minWidth: 0,
    },
    thumbs: { flexDirection: "row" },
    thumb: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: t.colors.greenSoft,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: t.colors.surface,
    },
    thumbOverlap: { marginLeft: -10 },
    mealsText: { flex: 1, color: t.colors.textDim, minWidth: 0 },
  }),
);
