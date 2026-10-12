import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
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
        style={[typography.h3, styles.editInput]}
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
      <Text style={typography.h3} numberOfLines={1}>
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
  const remaining = target != null ? Math.max(0, target - value) : null;

  return (
    <View style={styles.ring}>
      <DonutChart
        size={68}
        thickness={9}
        slices={[{ label, value, color }]}
        centerTop={pct != null ? `${pct}%` : undefined}
      />
      <View style={styles.ringText}>
        <Text style={typography.caption}>{label}</Text>
        <EditableValue value={value} unit={unit} onSave={onEdit} />
        <Text style={typography.caption} numberOfLines={1}>
          {remaining != null ? `${formatNumber(remaining)} ${unit} remaining` : "No target set"}
        </Text>
      </View>
    </View>
  );
}

/**
 * Today's nutrition at a glance: calorie and protein rings on their targets, a
 * summary row of the day's meals, and the coach-powered "Log Meal" action.
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
  const hasTarget = calorieTarget != null && calorieTarget > 0;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconBadge name="restaurant" bg={colors.primarySoft} color={colors.primary} size={30} rounded={false} />
          <Text style={typography.caption}>Nutrition</Text>
        </View>
        <Text style={typography.caption}>
          Today: {formatNumber(loggedCalories)}
          {hasTarget ? ` / ${formatNumber(calorieTarget as number)}` : ""} kcal
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

      {mealCount > 0 ? (
        <Pressable
          onPress={onPressMeals}
          accessibilityRole="button"
          accessibilityLabel={`${mealCount} meals logged`}
          style={styles.mealsRow}
        >
          <View style={styles.thumbs}>
            {Array.from({ length: Math.min(mealCount, 3) }).map((_, i) => (
              <View key={i} style={[styles.thumb, i > 0 && styles.thumbOverlap]}>
                <Ionicons name="restaurant" size={13} color={colors.green} />
              </View>
            ))}
          </View>
          <View style={styles.mealsText}>
            <Text style={typography.bodyStrong} numberOfLines={1}>
              {mealCount} {mealCount === 1 ? "meal" : "meals"} logged
            </Text>
            <Text style={typography.small} numberOfLines={1}>
              {formatNumber(mealCalories)} kcal · {formatNumber(mealProtein)} g protein
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : (
        <Text style={[typography.small, styles.emptyNote]}>
          No meals logged yet — describe what you ate and the coach estimates it.
        </Text>
      )}

      <Button label="Log Meal" icon="add" onPress={onLogMeal} style={styles.logButton} />
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
    ringText: { flex: 1, gap: 2, minWidth: 0 },
    editInput: { padding: 0, minWidth: 48, color: t.colors.text },

    mealsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    thumbs: { flexDirection: "row" },
    thumb: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: t.colors.greenSoft,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: t.colors.surfaceAlt,
    },
    thumbOverlap: { marginLeft: -10 },
    mealsText: { flex: 1, gap: 2, minWidth: 0 },
    emptyNote: { color: t.colors.textDim },
    logButton: { marginTop: spacing.xs },
  }),
);
