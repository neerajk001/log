import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, Divider, IconBadge, ProgressBar } from "../ui/primitives";
import { DonutChart } from "../ui/charts";
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

function NutritionColumn({
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
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const hasTarget = target != null && target > 0;
  const pct = hasTarget ? Math.min(100, Math.round((value / (target as number)) * 100)) : null;
  // Arc = logged / target. Without a target there's no progress to show, so the
  // ring stays solid; with one, the remainder is drawn in the track colour.
  const filled = hasTarget ? Math.min(value, target as number) : 1;
  const remaining = hasTarget ? Math.max(0, (target as number) - value) : 0;

  return (
    <View style={styles.col}>
      <DonutChart
        size={58}
        thickness={9}
        slices={[
          { label, value: filled, color },
          { label: `${label} remaining`, value: remaining, color: colors.chartTrack },
        ]}
      />
      <View style={styles.colText}>
        <View style={styles.labelRow}>
          <Text style={[typography.small, styles.colLabel]} numberOfLines={1}>
            {label}
          </Text>
          {pct != null ? <Text style={[styles.pct, { color }]}>{pct}%</Text> : null}
        </View>
        <EditableValue value={value} target={target} unit={unit} onSave={onEdit} />
        <ProgressBar value={value} max={hasTarget ? (target as number) : 1} color={color} />
      </View>
    </View>
  );
}

/**
 * Today's nutrition: calorie and protein rings on their targets beside a date
 * selector, then the day's meals and the "Log Meal" action under a divider.
 */
export function NutritionCard({
  loggedCalories,
  calorieTarget,
  loggedProtein,
  proteinTarget,
  mealCount,
  mealCalories,
  mealProtein,
  dateLabel,
  onPressDate,
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
  dateLabel: string;
  onPressDate: () => void;
  onLogMeal: () => void;
  onPressMeals: () => void;
  onEdit: (field: "calories" | "protein_g", value: number | null) => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const narrow = width < 380;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconBadge name="restaurant" bg={colors.primarySoft} color={colors.primary} size={34} rounded={false} />
          <Text style={styles.title}>Nutrition</Text>
        </View>
        <Pressable
          onPress={onPressDate}
          accessibilityRole="button"
          accessibilityLabel={`Change date, currently ${dateLabel}`}
          style={styles.datePill}
        >
          <Ionicons name="calendar-outline" size={13} color={colors.textDim} />
          <Text style={styles.dateText} numberOfLines={1}>
            {dateLabel}
          </Text>
          <Ionicons name="chevron-down" size={13} color={colors.textDim} />
        </Pressable>
      </View>

      <View style={styles.cols}>
        <NutritionColumn
          label="Calories"
          value={loggedCalories}
          target={calorieTarget}
          unit="kcal"
          color={colors.primary}
          onEdit={(v) => onEdit("calories", v)}
        />
        <View style={styles.vDivider} />
        <NutritionColumn
          label="Protein"
          value={loggedProtein}
          target={proteinTarget}
          unit="g"
          color={colors.success}
          onEdit={(v) => onEdit("protein_g", v)}
        />
      </View>

      <Divider />

      <View style={[styles.footer, narrow && styles.footerStack]}>
        <View style={styles.mealsInfo}>
          {mealCount > 0 ? (
            <Pressable
              onPress={onPressMeals}
              accessibilityRole="button"
              accessibilityLabel={`${mealCount} meals logged`}
              style={styles.mealsPress}
            >
              <View style={styles.thumbs}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <View key={i} style={[styles.thumb, i >= mealCount && styles.thumbEmpty]}>
                    <Ionicons
                      name="restaurant"
                      size={12}
                      color={i < mealCount ? colors.green : colors.textMuted}
                    />
                  </View>
                ))}
              </View>
              <Text
                style={[typography.small, styles.mealsText]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {mealCount} {mealCount === 1 ? "meal" : "meals"} · {formatNumber(mealCalories)} kcal ·{" "}
                {formatNumber(mealProtein)} g
              </Text>
            </Pressable>
          ) : (
            <Text style={[typography.small, styles.mealsText]} numberOfLines={1}>
              No meals logged yet
            </Text>
          )}
        </View>
        <Button
          label="Log Meal"
          icon="add"
          size="sm"
          onPress={onLogMeal}
          style={narrow ? styles.fullButton : undefined}
        />
      </View>
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: { gap: spacing.lg, borderColor: t.colors.border },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { fontSize: 17, fontWeight: "700", color: t.colors.text },
    datePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      height: 32,
      maxWidth: 140,
    },
    dateText: { fontSize: 12, fontWeight: "600", color: t.colors.text, flexShrink: 1 },

    cols: { flexDirection: "row", alignItems: "center" },
    col: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 0 },
    colText: { flex: 1, gap: 5, minWidth: 0 },
    labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    colLabel: { color: t.colors.text },
    pct: { fontSize: 13, fontWeight: "700" },
    value: { fontSize: 18, fontWeight: "700", color: t.colors.text },
    valueTarget: { fontSize: 12, fontWeight: "500" },
    editInput: { padding: 0, minWidth: 48 },
    vDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: "stretch",
      backgroundColor: t.colors.border,
      marginHorizontal: spacing.md,
    },

    footer: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    footerStack: { flexDirection: "column", alignItems: "stretch" },
    mealsInfo: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
    mealsPress: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 0 },
    thumbs: { flexDirection: "row", gap: 3 },
    thumb: {
      width: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: t.colors.greenSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    thumbEmpty: { backgroundColor: t.colors.surfaceAlt },
    mealsText: { flex: 1, color: t.colors.textDim, minWidth: 0 },
    fullButton: { flexGrow: 0 },
  }),
);
