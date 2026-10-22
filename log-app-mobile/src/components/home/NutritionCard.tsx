import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, IconBadge, ProgressBar } from "../ui/primitives";
import { formatNumber } from "../../utils/derive";
import { MAX_DAILY, parsePositiveNumber } from "../../utils/parse";

/** Inline numeric editor for a column's logged total (tap the value to type). */
function EditableValue({
  value,
  target,
  unit,
  onSave,
}: {
  value: number;
  target: number | null;
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
        style={[styles.value, styles.editInput]}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${unit === "g" ? "protein" : "calories"}`}
      onPress={() => {
        setDraft(String(value));
        setEditing(true);
      }}
    >
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {formatNumber(value)}
        <Text style={[typography.metricUnit, styles.valueTarget]}>
          {target != null ? ` / ${formatNumber(target)}` : ""} {unit}
        </Text>
      </Text>
    </Pressable>
  );
}

function NutritionMacro({
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
    <View style={styles.macro}>
      <View style={styles.macroTop}>
        <Text style={[typography.small, styles.macroLabel]} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.macroRight}>
          <EditableValue value={value} target={target} unit={unit} onSave={onEdit} />
          {pct != null ? <Text style={[styles.pct, { color }]}>{pct}%</Text> : null}
        </View>
      </View>
      {hasTarget ? <ProgressBar value={value} max={target as number} color={color} /> : null}
    </View>
  );
}

/**
 * Today's nutrition: two macro rows (logged / target + bar) beside a one-tap
 * log action. Meals are reachable from the count chip when any are logged.
 */
export function NutritionCard({
  loggedCalories,
  calorieTarget,
  loggedProtein,
  proteinTarget,
  mealCount,
  onLogMeal,
  onPressMeals,
  onEdit,
}: {
  loggedCalories: number;
  calorieTarget: number | null;
  loggedProtein: number;
  proteinTarget: number | null;
  mealCount: number;
  onLogMeal: () => void;
  onPressMeals: () => void;
  onEdit: (field: "calories" | "protein_g", value: number | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconBadge name="restaurant" bg={colors.primarySoft} color={colors.primary} size={34} rounded={false} />
          <Text style={styles.title}>Nutrition</Text>
          {mealCount > 0 ? (
            <Pressable
              onPress={onPressMeals}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${mealCount} meals logged`}
              style={styles.mealChip}
            >
              <Text style={styles.mealChipText}>
                {mealCount} {mealCount === 1 ? "meal" : "meals"}
              </Text>
              <Ionicons name="chevron-forward" size={12} color={colors.textDim} />
            </Pressable>
          ) : null}
        </View>
        <Button label="Log meal" icon="add" variant="soft" size="sm" onPress={onLogMeal} />
      </View>

      <View style={styles.macros}>
        <NutritionMacro
          label="Calories"
          value={loggedCalories}
          target={calorieTarget}
          unit="kcal"
          color={colors.primary}
          onEdit={(v) => onEdit("calories", v)}
        />
        <NutritionMacro
          label="Protein"
          value={loggedProtein}
          target={proteinTarget}
          unit="g"
          color={colors.success}
          onEdit={(v) => onEdit("protein_g", v)}
        />
      </View>
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: { gap: spacing.lg, borderColor: t.colors.cardBorder },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1, minWidth: 0 },
    title: { fontSize: 17, fontWeight: "700", color: t.colors.text },
    mealChip: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 1, minWidth: 0 },
    mealChipText: { ...t.typography.caption, color: t.colors.textDim },

    macros: { gap: spacing.md },
    macro: { gap: 6 },
    macroTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
    macroLabel: { color: t.colors.text, flexShrink: 0 },
    macroRight: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexShrink: 1, minWidth: 0 },
    pct: { fontSize: 13, fontWeight: "700" },
    value: { fontSize: 17, fontWeight: "700", color: t.colors.text },
    valueTarget: { fontSize: 12, fontWeight: "500" },
    editInput: { padding: 0, minWidth: 48 },
  }),
);
