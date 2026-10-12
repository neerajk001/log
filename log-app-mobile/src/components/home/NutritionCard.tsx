import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
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
  const { colors } = useTheme();
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
      <Text style={styles.value} numberOfLines={2}>
        {formatNumber(value)}
        <Text style={styles.valueTarget}>
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
  const styles = useStyles();
  const hasTarget = target != null && target > 0;
  const pct = hasTarget ? Math.min(100, Math.round((value / (target as number)) * 100)) : null;

  return (
    <View style={styles.col}>
      <DonutChart size={48} thickness={8} slices={[{ label, value, color }]} />
      <View style={styles.colText}>
        <View style={styles.labelRow}>
          <Text style={styles.colLabel} numberOfLines={1}>
            {label}
          </Text>
          {pct != null ? <Text style={[styles.pct, { color }]}>{pct}%</Text> : null}
        </View>
        <EditableValue value={value} target={target} unit={unit} onSave={onEdit} />
        <ProgressBar value={value} max={hasTarget ? (target as number) : 1} color={color} height={8} />
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
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  // The icons + summary + button don't fit on one row on narrow phones — drop
  // the button to its own row rather than letting the row overflow.
  const narrow = width < 400;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconBadge name="restaurant" bg={colors.primarySoft} color={colors.primary} size={48} rounded={false} />
          <Text style={styles.title}>Nutrition</Text>
        </View>
        <Pressable
          onPress={onPressDate}
          accessibilityRole="button"
          accessibilityLabel={`Change date, currently ${dateLabel}`}
          style={styles.datePill}
        >
          <Ionicons name="calendar-outline" size={15} color={colors.textDim} />
          <Text style={styles.dateText} numberOfLines={1}>
            {dateLabel}
          </Text>
          <Ionicons name="chevron-down" size={15} color={colors.textDim} />
        </Pressable>
      </View>

      <Divider />

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
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.thumb, i >= Math.min(mealCount, 3) && styles.thumbEmpty]}>
                    <Ionicons
                      name="restaurant"
                      size={14}
                      color={i < Math.min(mealCount, 3) ? colors.green : colors.textMuted}
                    />
                  </View>
                ))}
              </View>
              <View style={styles.mealsText}>
                <Text style={styles.mealsCount} numberOfLines={1}>
                  {mealCount} {mealCount === 1 ? "meal" : "meals"}
                </Text>
                <Text style={styles.mealsSummary} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {formatNumber(mealCalories)} kcal · {formatNumber(mealProtein)} g
                </Text>
              </View>
            </Pressable>
          ) : (
            <Text style={styles.mealsSummary} numberOfLines={1}>
              No meals logged yet
            </Text>
          )}
        </View>
        {narrow ? null : <View style={styles.footerDivider} />}
        <Button
          label="Log Meal"
          icon="add"
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

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    title: { fontSize: 21, fontWeight: "700", color: t.colors.text },
    datePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: t.colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      height: 34,
      maxWidth: 150,
      flexShrink: 1,
    },
    dateText: { fontSize: 13, fontWeight: "600", color: t.colors.text, flexShrink: 1 },

    cols: { flexDirection: "row", alignItems: "center" },
    col: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 0 },
    colText: { flex: 1, gap: 4, minWidth: 0 },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    colLabel: { ...t.typography.small, color: t.colors.textDim, flexShrink: 1 },
    pct: { fontSize: 13, fontWeight: "700", flexShrink: 0 },
    value: { fontSize: 19, fontWeight: "700", color: t.colors.text },
    valueTarget: { fontSize: 12, fontWeight: "500", color: t.colors.textDim },
    editInput: { padding: 0, minWidth: 44 },
    vDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: "stretch",
      backgroundColor: t.colors.border,
      marginHorizontal: spacing.md,
    },

    footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    footerStack: { flexDirection: "column", alignItems: "stretch" },
    mealsInfo: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
    mealsPress: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 0 },
    thumbs: { flexDirection: "row", gap: 5 },
    thumb: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: t.colors.greenSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    thumbEmpty: { backgroundColor: t.colors.surfaceAlt },
    mealsText: { flex: 1, gap: 1, minWidth: 0 },
    mealsCount: { ...t.typography.bodyStrong, fontSize: 14, color: t.colors.text },
    mealsSummary: { ...t.typography.small, color: t.colors.textDim },
    footerDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: "stretch",
      backgroundColor: t.colors.border,
      marginHorizontal: spacing.xs,
    },
    fullButton: { marginTop: spacing.sm },
  }),
);
