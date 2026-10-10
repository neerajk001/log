import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { StepScaffold } from "../../src/components/onboarding/StepScaffold";
import { OptionCard } from "../../src/components/OptionCard";
import { Banner, Card, IconBadge } from "../../src/components/ui/primitives";
import { useMe } from "../../src/hooks/useMe";
import { draftToPayload, getDraft, resetDraft } from "../../src/state/onboarding";

/**
 * Step 3 (final) — offer a plan, never force one. Every choice finishes
 * onboarding first, then routes, so leaving to import a plan is safe.
 */
export default function PlanStepScreen() {
  const { completeOnboarding } = useMe();
  const { colors, typography } = useTheme();
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
      nextLabel={null}
      secondary={{
        label: "Skip for now — add a plan later",
        onPress: () => finish("later", "/(tabs)/today"),
        disabled: busy != null,
        loading: busy === "later",
      }}
    >
      <Card style={styles.hero}>
        <IconBadge name="list-outline" bg={colors.primarySoft} color={colors.primary} size={44} rounded={false} />
        <Text style={[typography.small, styles.heroText]}>
          A plan tells you what to lift each session. Without one you can still log lifts and get
          your weekly verdict.
        </Text>
      </Card>

      {error ? <Banner tone="danger" message={error} /> : null}

      <OptionCard
        icon="sparkles-outline"
        accent
        title="Build one for me"
        subtitle="Answer 3 quick steps and the coach writes it"
        disabled={busy != null}
        onPress={() => finish("coach", "/coach/onboarding")}
      />
      <OptionCard
        icon="cloud-upload-outline"
        title="I already have a plan"
        subtitle="Import a file, or paste and type it in"
        disabled={busy != null}
        onPress={() => finish("import", "/plan/import")}
      />

      <View style={styles.note}>
        <Text style={typography.caption}>
          Goal, experience and training days are only asked if you build a plan.
        </Text>
      </View>
    </StepScaffold>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    hero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    heroText: { flex: 1, color: t.colors.textDim },
    note: { paddingHorizontal: spacing.xs },
  }),
);
