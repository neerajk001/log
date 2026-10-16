import { StyleSheet } from "react-native";
import { PostHogMaskView } from "posthog-react-native";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/spacing";
import { Button, ListRow } from "./ui/primitives";
import { Sheet } from "./ui/controls";
import type { MealLog } from "../api/types";

/**
 * The day's meals in a sheet — the entry point to per-meal editing now that the
 * Meals list no longer lives inline on Today.
 */
export function MealsSheet({
  visible,
  meals,
  onClose,
  onSelect,
  onLogMeal,
}: {
  visible: boolean;
  meals: MealLog[];
  onClose: () => void;
  onSelect: (meal: MealLog) => void;
  onLogMeal: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <Sheet visible={visible} onClose={onClose} title="Meals">
      {/* Meal names/calories are health data — excluded from session replays. */}
      <PostHogMaskView style={styles.body}>
        {meals.map((m) => (
          <ListRow
            key={m.id}
            icon="restaurant-outline"
            iconBg={colors.greenSoft}
            iconColor={colors.green}
            title={m.title}
            subtitle={`${m.calories} kcal · ${m.protein_g} g protein`}
            onPress={() => onSelect(m)}
          />
        ))}
        <Button label="Log a meal" icon="add" onPress={onLogMeal} />
      </PostHogMaskView>
    </Sheet>
  );
}

const useStyles = makeUseStyles(() =>
  StyleSheet.create({
    body: { gap: spacing.sm, paddingTop: spacing.sm },
  }),
);
