import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button } from "../ui/primitives";
import { OnboardingProgress } from "./OnboardingProgress";

/** Shared frame for every onboarding step: progress, title, body, Back/Next. */
export function StepScaffold({
  step,
  total = 3,
  title,
  subtitle,
  nextLabel = "Next",
  nextDisabled = false,
  onNext,
  onBack,
  secondary,
  children,
}: {
  step: number;
  total?: number;
  title: string;
  subtitle?: string;
  /** Pass null to drop the primary button and let Back fill the row. */
  nextLabel?: string | null;
  nextDisabled?: boolean;
  onNext?: () => void;
  onBack?: () => void;
  secondary?: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean };
  children?: ReactNode;
}) {
  const { typography } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <OnboardingProgress step={step} total={total} />

        <View style={styles.header}>
          <Text style={typography.h2}>{title}</Text>
          {subtitle ? <Text style={[typography.small, styles.subtitle]}>{subtitle}</Text> : null}
        </View>

        <View style={styles.body}>{children}</View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        {secondary ? (
          <Button
            label={secondary.label}
            variant="ghost"
            onPress={secondary.onPress}
            disabled={secondary.disabled}
            loading={secondary.loading}
          />
        ) : null}
        <View style={styles.footerRow}>
          <Button
            label="Back"
            variant="outline"
            onPress={onBack ?? (() => router.back())}
            style={styles.flex}
          />
          {nextLabel && onNext ? (
            <Button label={nextLabel} onPress={onNext} disabled={nextDisabled} style={styles.flex} />
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xl, gap: spacing.lg },
    header: { gap: spacing.xs },
    subtitle: { color: t.colors.textDim },
    body: { gap: spacing.md },
    footer: {
      gap: spacing.sm,
      paddingHorizontal: spacing.screen,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
    },
    footerRow: { flexDirection: "row", gap: spacing.sm },
    flex: { flex: 1 },
  }),
);
