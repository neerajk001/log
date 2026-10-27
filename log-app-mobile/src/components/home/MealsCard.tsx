import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { Card, type IoniconName } from "../ui/primitives";
import { formatNumber } from "../../utils/derive";
import type { MealLog } from "../../api/types";

const TILE_ICONS: IoniconName[] = ["restaurant-outline", "fast-food-outline", "pizza-outline"];

/** Up to three meal thumbnails; real food photos aren't stored yet, so each
 *  tile carries a food icon on an accent surface. */
function MealTiles({ meals }: { meals: MealLog[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const backgrounds = [colors.greenSoft, colors.amberSoft, colors.pinkSoft];
  const accents = [colors.green, colors.amber, colors.pink];

  return (
    <View style={styles.tiles}>
      {[0, 1, 2].map((i) => {
        const meal = meals[i];
        return (
          <View
            key={meal?.id ?? `empty-${i}`}
            style={[styles.tile, { backgroundColor: backgrounds[i] }]}
          >
            <Ionicons
              name={TILE_ICONS[i]}
              size={18}
              color={meal ? accents[i] : colors.textMuted}
            />
          </View>
        );
      })}
    </View>
  );
}

/** Compact meals strip: the day's meal count and calories, with quick actions. */
export function MealsCard({
  meals,
  onOpenMeals,
  onLogMeal,
}: {
  meals: MealLog[];
  onOpenMeals: () => void;
  onLogMeal: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const calories = meals.reduce((acc, meal) => acc + meal.calories, 0);
  const mealLabel = meals.length === 0 ? "No meals yet" : `${meals.length} ${meals.length === 1 ? "meal" : "meals"}`;

  return (
    <Card padded={false} style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${mealLabel}. View meals`}
        onPress={onOpenMeals}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <MealTiles meals={meals} />
        <View style={styles.text}>
          <Text style={[typography.bodyStrong, styles.title]} numberOfLines={1}>
            View meals
          </Text>
          <Text style={[typography.small, styles.subtitle]} numberOfLines={1}>
            {mealLabel}
            {meals.length > 0 ? ` · ${formatNumber(calories)} kcal` : ""}
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log a meal with the coach"
        onPress={onLogMeal}
        style={({ pressed }) => [styles.logButton, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={17} color={colors.onPrimary} />
        <Text style={styles.logText}>Log meal</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View meals"
        onPress={onOpenMeals}
        hitSlop={8}
        style={({ pressed }) => [styles.chevron, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </Pressable>
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radii.xl,
      borderColor: t.colors.cardBorder,
      padding: spacing.sm,
    },
    main: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 0 },
    tiles: { flexDirection: "row", gap: 4 },
    tile: { width: 34, height: 34, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
    text: { flex: 1, minWidth: 0, gap: 1 },
    title: { fontSize: 14, fontWeight: "700" },
    subtitle: { fontSize: 11 },
    logButton: {
      height: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderRadius: radii.pill,
      backgroundColor: t.colors.primary,
      paddingHorizontal: spacing.sm + 2,
    },
    logText: { fontSize: 12.5, fontWeight: "700", color: t.colors.onPrimary },
    chevron: { paddingLeft: 1 },
    pressed: { opacity: 0.7 },
  }),
);

