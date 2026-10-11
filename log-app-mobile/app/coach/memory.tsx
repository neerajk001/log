import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../src/components/ui/primitives";
import { useCoachMemory } from "../../src/hooks/useCoachMemory";
import { useCoachDecisions } from "../../src/hooks/useCoachDecisions";
import { formatMediumDate } from "../../src/utils/date";

/** What the coach knows about you, and what it has advised you to change. */
export default function CoachMemoryScreen() {
  const { typography } = useTheme();
  const styles = useStyles();
  const { memory, loading, error, clear, refetch } = useCoachMemory();
  const {
    decisions,
    loading: decisionsLoading,
    error: decisionsError,
    clear: clearDecisions,
    refetch: refetchDecisions,
  } = useCoachDecisions();

  const confirmClear = () =>
    Alert.alert("Clear memory?", "The coach will forget what it has learned about you.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => clear() },
    ]);

  const confirmClearDecisions = () =>
    Alert.alert("Clear advice log?", "The coach will stop following up on what it advised.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => clearDecisions() },
    ]);

  const empty = !memory?.summary && decisions.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader variant="detail" title="What the coach remembers" onBack={() => router.back()} />

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}
        {decisionsError ? <ErrorState message={decisionsError} onRetry={refetchDecisions} /> : null}

        {(loading || decisionsLoading) && empty ? (
          <LoadingState label="Loading…" />
        ) : empty ? (
          <EmptyState
            icon="bulb-outline"
            title="Nothing remembered yet"
            subtitle="After a few chats the coach keeps a short note of your preferences here, plus a log of what it advised you to change."
          />
        ) : (
          <>
            {memory?.summary ? (
              <>
                <Card style={styles.card}>
                  <Text style={typography.bodyStrong}>What it knows about your preferences</Text>
                  <Text style={typography.body}>{memory.summary}</Text>
                  <Text style={styles.note}>
                    Updated {formatMediumDate(memory.updated_at.slice(0, 10))}
                  </Text>
                </Card>
                <Button
                  label="Clear memory"
                  variant="outline"
                  icon="trash-outline"
                  onPress={confirmClear}
                />
              </>
            ) : null}

            {decisions.length > 0 ? (
              <>
                <Card style={styles.card}>
                  <Text style={typography.bodyStrong}>What it advised</Text>
                  <Text style={styles.note}>Your coach follows these up on its own.</Text>
                  <View style={styles.list}>
                    {decisions.map((d, i) => {
                      const meta = [
                        d.topic,
                        d.outcome
                          ? `outcome: ${d.outcome}`
                          : d.review_on
                            ? `review ${formatMediumDate(d.review_on)}`
                            : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <View key={d.id} style={styles.row}>
                          {i > 0 ? <Divider style={styles.divider} /> : null}
                          <Text style={styles.date}>
                            {formatMediumDate(d.created_at.slice(0, 10))}
                          </Text>
                          <Text style={typography.bodyStrong}>{d.summary}</Text>
                          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                        </View>
                      );
                    })}
                  </View>
                </Card>
                <Button
                  label="Clear advice log"
                  variant="outline"
                  icon="trash-outline"
                  onPress={confirmClearDecisions}
                />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    card: { gap: spacing.sm },
    note: { ...t.typography.caption, color: t.colors.textMuted },
    list: { gap: spacing.xs },
    row: { gap: 2 },
    divider: { marginVertical: spacing.sm },
    date: { ...t.typography.caption, color: t.colors.textMuted },
    meta: { ...t.typography.caption, color: t.colors.textDim },
  }),
);
