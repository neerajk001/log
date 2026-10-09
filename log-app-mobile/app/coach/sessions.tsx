import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Button, EmptyState, ErrorState, LoadingState } from "../../src/components/ui/primitives";
import { useCoachSessions } from "../../src/hooks/useCoachSessions";
import { formatMediumDate } from "../../src/utils/date";

/** Coach chat history. */
export default function CoachSessionsScreen() {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { sessions, loading, error, remove, refetch } = useCoachSessions();

  const confirmDelete = (id: string, title: string) =>
    Alert.alert("Delete chat?", `“${title}” and its messages will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove(id) },
    ]);

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <>
            <ScreenHeader variant="detail" title="Chats" onBack={() => router.back()} />
            {error ? <ErrorState message={error} onRetry={refetch} /> : null}
            <Button label="New chat" icon="add" onPress={() => router.replace("/coach" as never)} />
          </>
        }
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading your chats…" />
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="No chats yet"
              subtitle="Ask your coach something and it'll show up here."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/coach/${item.id}` as never)}>
            <View style={styles.rowText}>
              <Text style={typography.bodyStrong} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={typography.caption}>
                {formatMediumDate(item.updated_at.slice(0, 10))} · {item.message_count} message
                {item.message_count === 1 ? "" : "s"}
              </Text>
            </View>
            <Pressable
              onPress={() => confirmDelete(item.id, item.title)}
              hitSlop={8}
              accessibilityLabel="Delete chat"
            >
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.md },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
    },
    rowText: { flex: 1, gap: 2 },
  }),
);
