import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "../../src/components/ui/primitives";
import { useCoachMemory } from "../../src/hooks/useCoachMemory";
import { formatMediumDate } from "../../src/utils/date";

/** What the coach remembers long-term, with a clear action. */
export default function CoachMemoryScreen() {
  const { typography } = useTheme();
  const styles = useStyles();
  const { memory, loading, error, clear, refetch } = useCoachMemory();

  const confirmClear = () =>
    Alert.alert("Clear memory?", "The coach will forget what it has learned about you.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => clear() },
    ]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader variant="detail" title="What the coach remembers" onBack={() => router.back()} />

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}

        {loading ? (
          <LoadingState label="Loading…" />
        ) : memory?.summary ? (
          <>
            <Card style={styles.card}>
              <Text style={typography.body}>{memory.summary}</Text>
              <Text style={styles.note}>Updated {formatMediumDate(memory.updated_at.slice(0, 10))}</Text>
            </Card>
            <Button
              label="Clear memory"
              variant="outline"
              icon="trash-outline"
              onPress={confirmClear}
            />
          </>
        ) : (
          <EmptyState
            icon="bulb-outline"
            title="Nothing remembered yet"
            subtitle="After a few chats the coach keeps a short summary of your goals and preferences here."
          />
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
  }),
);
