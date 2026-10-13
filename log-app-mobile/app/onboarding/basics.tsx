import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StepScaffold } from "../../src/components/onboarding/StepScaffold";
import { TextField } from "../../src/components/ui/controls";
import type { IoniconName } from "../../src/components/ui/primitives";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { getDraft, setDraft } from "../../src/state/onboarding";

type Sex = "male" | "female" | "other";

const SEX_OPTIONS: { value: Sex; label: string; icon: IoniconName }[] = [
  { value: "male", label: "Male", icon: "male" },
  { value: "female", label: "Female", icon: "female" },
  { value: "other", label: "Other", icon: "male-female" },
];

/** Step 1 — about you. */
export default function BasicsScreen() {
  const d = getDraft();
  const [sex, setSex] = useState<Sex | null>(d.sex);
  const [age, setAge] = useState(d.age);
  const [height, setHeight] = useState(d.height_cm);
  const [weight, setWeight] = useState(d.weight_kg);
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const ready = !!sex && !!age && !!height && !!weight;

  return (
    <StepScaffold
      step={1}
      title="Tell us about yourself"
      subtitle="A few basics so your insights and targets fit you."
      nextDisabled={!ready}
      onNext={() => {
        setDraft({ sex, age, height_cm: height, weight_kg: weight });
        router.navigate("/onboarding/appearance" as never);
      }}
    >
      <View style={styles.sexRow}>
        {SEX_OPTIONS.map((option) => {
          const active = sex === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setSex(option.value)}
              style={[styles.sexCard, active && styles.sexCardActive]}
            >
              <Ionicons
                name={option.icon}
                size={22}
                color={active ? colors.onPrimary : colors.textDim}
              />
              <Text style={[typography.body, active && styles.sexLabelActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label="Age"
        value={age}
        onChangeText={setAge}
        keyboardType="numeric"
        placeholder="22"
        unit="years"
      />

      <View style={styles.row}>
        <TextField
          label="Height"
          value={height}
          onChangeText={setHeight}
          keyboardType="numeric"
          placeholder="175"
          unit="cm"
          style={styles.flex}
        />
        <TextField
          label="Current weight"
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          placeholder="65"
          unit="kg"
          style={styles.flex}
        />
      </View>
    </StepScaffold>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    sexRow: { flexDirection: "row", gap: spacing.sm },
    sexCard: {
      flex: 1,
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: t.colors.cardBorder,
      backgroundColor: t.colors.surface,
    },
    sexCardActive: { borderColor: t.colors.primary, backgroundColor: t.colors.primary },
    sexLabelActive: { color: t.colors.onPrimary, fontWeight: "700" },
    row: { flexDirection: "row", gap: spacing.sm },
    flex: { flex: 1 },
  }),
);
