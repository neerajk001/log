import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import type { Palette } from "../../src/theme/colors";
import { radii, spacing } from "../../src/theme/spacing";
import { Button, IconBadge, type IoniconName } from "../../src/components/ui/primitives";

function features(colors: Palette): { icon: IoniconName; label: string; bg: string; color: string }[] {
  return [
    { icon: "barbell-outline", label: "Lift log", bg: colors.purpleSoft, color: colors.purple },
    { icon: "flame", label: "Calories", bg: colors.orangeSoft, color: colors.orange },
    { icon: "nutrition-outline", label: "Protein", bg: colors.greenSoft, color: colors.green },
    { icon: "moon", label: "Sleep", bg: colors.blueSoft, color: colors.blue },
  ];
}

/** Step 1 — pre-auth welcome. */
export default function WelcomeScreen() {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl }]}
      >
        <IconBadge name="stats-chart" bg={colors.primarySoft} color={colors.primary} size={64} rounded={false} />

        <View style={styles.header}>
          <Text style={typography.h1}>Track. Train. Improve.</Text>
          <Text style={[typography.body, styles.lead]}>
            Log your workouts, meals and daily habits, then get insights and an AI coach to reach
            your goals.
          </Text>
        </View>

        <View style={styles.grid}>
          {features(colors).map((f) => (
            <View key={f.label} style={styles.tile}>
              <IconBadge name={f.icon} bg={f.bg} color={f.color} size={36} rounded={false} />
              <Text style={typography.small}>{f.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button label="Get started" onPress={() => router.navigate("/sign-in" as never)} />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => router.navigate("/sign-in" as never)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xl, gap: spacing.xl, flexGrow: 1 },
    header: { gap: spacing.sm },
    lead: { color: t.colors.textDim },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    tile: {
      width: "48%",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      paddingVertical: spacing.md,
    },
    actions: { gap: spacing.sm, marginTop: "auto" },
  }),
);
