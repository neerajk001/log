import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { StepScaffold } from "../../src/components/onboarding/StepScaffold";
import { OptionCard } from "../../src/components/OptionCard";
import { Banner } from "../../src/components/ui/primitives";
import { useMe } from "../../src/hooks/useMe";
import { draftToPayload, getDraft, resetDraft } from "../../src/state/onboarding";

/**
 * Step 3 (final) — offer a plan, never force one. Every choice finishes
 * onboarding first, then routes, so leaving to import a plan is safe.
 */
export default function PlanStepScreen() {
  const { completeOnboarding } = useMe();
  const { typography } = useTheme();
  const styles = useStyles();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async (key: string, destination: string) => {
    setBusy(key);
    setError(null);
    try {
      await completeOnboarding(draftToPayload(getDraft()));
      resetDraft();
      router.replace(destination as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your setup. Try again.");
      setBusy(null);
    }
  };

  return (
    <StepScaffold
      step={3}
      title="Want a training plan?"
      subtitle="You can track everything without one."
      nextDisabled={busy != null}
      onNext={() => finish("later", "/(tabs)/today")}
    >
      {error ? <Banner tone="danger" message={error} /> : null}

      <OptionCard
        icon="barbell-outline"
        accent
        title="Build one for me"
        subtitle="Answer 3 quick steps and the coach writes it for you"
        disabled={busy != null}
        onPress={() => finish("coach", "/coach/onboarding")}
      />
      <OptionCard
        icon="document-text-outline"
        title="I already have a plan"
        subtitle="Import a file, or paste and type it in"
        disabled={busy != null}
        onPress={() => finish("import", "/plan/import")}
      />
      <OptionCard
        icon="leaf-outline"
        title="Skip for now"
        subtitle="Add a plan later. You can still log your workouts and get weekly insights"
        disabled={busy != null}
        onPress={() => finish("later", "/(tabs)/today")}
      />

      <View style={styles.note}>
        <Text style={typography.small}>
          Goal, experience and training days are only asked if you build a plan.
        </Text>
      </View>
    </StepScaffold>
  );
}

const useStyles = makeUseStyles(() =>
  StyleSheet.create({
    note: { paddingHorizontal: spacing.xs },
  }),
);
