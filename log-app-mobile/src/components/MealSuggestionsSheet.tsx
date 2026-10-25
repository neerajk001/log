import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { PostHogMaskView } from "posthog-react-native";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/spacing";
import { useMealsApi } from "../api/meals";
import { useMealSuggestions } from "../hooks/useMealSuggestions";
import { successTick } from "../hooks/useHaptics";
import { formatMediumDate } from "../utils/date";
import { Banner, Button, Card, IconBadge, LoadingState, Tag } from "./ui/primitives";
import { Sheet } from "./ui/controls";
import type { MealSuggestion } from "../api/types";

/** "Leaves 380 kcal · 32 g protein", omitting a macro with no target. */
function afterLine(suggestion: MealSuggestion): string | null {
  const parts: string[] = [];
  if (suggestion.remaining_after.calories != null) {
    parts.push(`${suggestion.remaining_after.calories} kcal`);
  }
  if (suggestion.remaining_after.protein_g != null) {
    parts.push(`${suggestion.remaining_after.protein_g} g protein`);
  }
  return parts.length > 0 ? `Leaves ${parts.join(" · ")}` : null;
}

function Macro({ label, value }: { label: string; value: string }) {
  const { typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[typography.caption, styles.macroLabel]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Pro "What can I eat now?": reuses meals the athlete has already logged and
 * ranks the ones that fit today's remaining calories/protein. Nothing is
 * invented — a suggestion is a real past meal with its original estimate.
 */
export function MealSuggestionsSheet({
  visible,
  date,
  onClose,
  onLogged,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  onLogged: () => void | Promise<void>;
}) {
  const api = useMealsApi();
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { data, loading, error, refetch } = useMealSuggestions(date, visible);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  const logSuggestion = async (suggestion: MealSuggestion) => {
    setBusyId(suggestion.id);
    setLogError(null);
    try {
      await api.createMeal({
        id: Crypto.randomUUID(),
        date,
        title: suggestion.title,
        items: suggestion.items,
        calories: suggestion.calories,
        protein_g: suggestion.protein_g,
        source: suggestion.source,
      });
      successTick();
      await onLogged();
      onClose();
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Couldn't log that meal.");
    } finally {
      setBusyId(null);
    }
  };

  const remaining = data?.remaining;
  const calorieText = remaining?.calories == null ? "—" : String(remaining.calories);
  const proteinText = remaining?.protein_g == null ? "—" : `${remaining.protein_g} g`;

  return (
    <Sheet visible={visible} onClose={onClose} title="What can I eat?">
      <PostHogMaskView style={styles.body}>
        <View style={styles.remainingRow}>
          <Macro label="kcal left" value={calorieText} />
          <View style={styles.remainingDivider} />
          <Macro label="protein left" value={proteinText} />
          <IconBadge name="sparkles" bg={colors.primarySoft} color={colors.primary} size={34} />
        </View>

        {loading && !data ? <LoadingState label="Looking at what you've eaten before…" /> : null}
        {error ? (
          <Banner tone="danger" message={error} actionLabel="Retry" onAction={() => void refetch()} />
        ) : null}

        {data ? (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {data.reason === "no_targets" ? (
              <Card style={styles.emptyCard}>
                <Text style={typography.bodyStrong}>Set your targets first</Text>
                <Text style={typography.small}>
                  Suggestions need your daily calorie and protein targets to know what is left.
                </Text>
                <Button
                  label="Open settings"
                  icon="settings-outline"
                  variant="outline"
                  onPress={() => {
                    onClose();
                    router.navigate("/settings" as never);
                  }}
                />
              </Card>
            ) : null}

            {data.reason === "target_met" ? (
              <Card style={styles.emptyCard}>
                <Text style={typography.bodyStrong}>Today&apos;s calories are done</Text>
                <Text style={typography.small}>
                  You&apos;ve reached your calorie target. Nothing else is needed unless you want to
                  log something extra.
                </Text>
              </Card>
            ) : null}

            {data.reason === "no_history" ? (
              <Card style={styles.emptyCard}>
                <Text style={typography.bodyStrong}>No meals to suggest yet</Text>
                <Text style={typography.small}>
                  Suggestions come from meals you&apos;ve already logged. Log a couple of meals and
                  they&apos;ll show up here.
                </Text>
              </Card>
            ) : null}

            {data.reason === "nothing_fits" ? (
              <Card style={styles.emptyCard}>
                <Text style={typography.bodyStrong}>Nothing you&apos;ve had before fits</Text>
                <Text style={typography.small}>
                  What&apos;s left is smaller than your usual meals. Try a lighter portion, or log
                  something manually.
                </Text>
              </Card>
            ) : null}

            {data.suggestions.map((suggestion) => (
              <Card key={suggestion.id} style={styles.suggestion}>
                <View style={styles.suggestionTop}>
                  <View style={styles.suggestionText}>
                    <Text style={typography.bodyStrong} numberOfLines={2}>
                      {suggestion.title}
                    </Text>
                    <Text style={typography.small} numberOfLines={1}>
                      {suggestion.calories} kcal · {suggestion.protein_g} g protein
                    </Text>
                  </View>
                  <Tag label="YOU'VE HAD THIS" bg={colors.surfaceAlt} text={colors.textDim} />
                </View>

                <View style={styles.macros}>
                  <Text style={[typography.small, styles.items]} numberOfLines={2}>
                    {suggestion.items
                      .map((item) => `${item.name}${item.quantity ? ` (${item.quantity})` : ""}`)
                      .join(" · ")}
                  </Text>
                  {afterLine(suggestion) ? (
                    <Text style={[typography.caption, styles.after]}>
                      {afterLine(suggestion)}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.suggestionFooter}>
                  <Text style={[typography.caption, styles.lastLogged]}>
                    Last logged {formatMediumDate(suggestion.last_logged)}
                  </Text>
                  <Button
                    label="Log it"
                    icon="add"
                    size="sm"
                    loading={busyId === suggestion.id}
                    disabled={busyId != null && busyId !== suggestion.id}
                    onPress={() => void logSuggestion(suggestion)}
                  />
                </View>
              </Card>
            ))}

            {logError ? <Banner tone="danger" message={logError} /> : null}

            <Text style={[typography.caption, styles.footnote]}>
              Suggestions are meals you logged before. Their calories and protein are the estimates
              you confirmed then.
            </Text>
          </ScrollView>
        ) : null}
      </PostHogMaskView>
    </Sheet>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    body: { gap: spacing.md, paddingTop: spacing.sm },
    remainingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: 16,
      padding: spacing.md,
    },
    macro: { gap: 1 },
    macroValue: { fontSize: 20, fontWeight: "700", color: t.colors.text },
    macroLabel: { color: t.colors.textDim },
    remainingDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: t.colors.border },
    scroll: { maxHeight: 430 },
    emptyCard: { gap: spacing.sm },
    suggestion: { gap: spacing.sm, marginBottom: spacing.sm },
    suggestionTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    suggestionText: { flex: 1, gap: 2, minWidth: 0 },
    macros: { gap: 2 },
    items: { color: t.colors.textDim },
    after: { color: t.colors.success },
    suggestionFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    lastLogged: { color: t.colors.textMuted, flexShrink: 1 },
    footnote: { color: t.colors.textMuted, textAlign: "center", lineHeight: 17 },
  }),
);
