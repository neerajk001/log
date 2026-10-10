import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { StepScaffold } from "../../src/components/onboarding/StepScaffold";
import { SegmentedControl, TextField } from "../../src/components/ui/controls";
import { makeUseStyles } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { getDraft, setDraft } from "../../src/state/onboarding";

type Sex = "male" | "female" | "other";

/** Step 1 — about you. */
export default function BasicsScreen() {
  const d = getDraft();
  const [sex, setSex] = useState<Sex | null>(d.sex);
  const [age, setAge] = useState(d.age);
  const [height, setHeight] = useState(d.height_cm);
  const [weight, setWeight] = useState(d.weight_kg);
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
      <SegmentedControl<Sex | "">
        value={sex ?? ""}
        onChange={(v) => setSex(v === "" ? null : v)}
        options={[
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
          { value: "other", label: "Other" },
        ]}
      />
      <TextField label="Age" value={age} onChangeText={setAge} keyboardType="numeric" placeholder="22" />
      <View style={styles.row}>
        <TextField
          label="Height (cm)"
          value={height}
          onChangeText={setHeight}
          keyboardType="numeric"
          placeholder="175"
          style={styles.flex}
        />
        <TextField
          label="Current weight (kg)"
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          placeholder="65"
          style={styles.flex}
        />
      </View>
    </StepScaffold>
  );
}

const useStyles = makeUseStyles(() =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: spacing.sm },
    flex: { flex: 1 },
  }),
);
