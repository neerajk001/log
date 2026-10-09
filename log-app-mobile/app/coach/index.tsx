import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Banner, IconBadge } from "../../src/components/ui/primitives";
import { Chip, ChipRow, IconButton } from "../../src/components/ui/controls";
import { useCoachChat, type ChatMessage } from "../../src/hooks/useCoachChat";

const STARTERS = [
  "Give me this week's check-in",
  "Is my training volume enough?",
  "How's my protein intake?",
  "Should I change my calories?",
];

export default function CoachScreen() {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { messages, loading, streaming, error, send, stop, retry } = useCoachChat();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const submit = (text: string) => {
    if (!text.trim() || streaming) return;
    setInput("");
    send(text);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader
        variant="detail"
        title="Coach"
        onBack={() => router.back()}
        right={
          <IconButton
            name="options-outline"
            accessibilityLabel="Your goals"
            onPress={() => router.navigate("/coach/onboarding" as never)}
          />
        }
      />

      {error ? <Banner tone="warning" message={error} /> : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <IconBadge name="sparkles" bg={colors.primarySoft} color={colors.primary} size={56} rounded={false} />
              <Text style={[typography.h3, styles.emptyTitle]}>Your AI coach</Text>
              <Text style={[typography.small, styles.emptyText]}>
                It can see your logs, your plan and your weekly verdict. Ask it anything, or start with one of these.
              </Text>
              <ChipRow style={styles.starters}>
                {STARTERS.map((s) => (
                  <Chip key={s} label={s} onPress={() => submit(s)} />
                ))}
              </ChipRow>
            </View>
          )
        }
        renderItem={({ item }) => {
          const mine = item.role === "user";
          const thinking = !!item.streaming && item.content.length === 0;
          return (
            <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {thinking ? (
                  <View style={styles.typing}>
                    <ActivityIndicator size="small" color={colors.textDim} />
                    <Text style={typography.small}>Coach is thinking…</Text>
                  </View>
                ) : (
                  <Text style={[typography.body, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                    {item.content}
                    {item.streaming ? "▍" : ""}
                  </Text>
                )}
                {item.failed ? (
                  <Pressable onPress={retry} hitSlop={8} style={styles.retryRow}>
                    <Ionicons name="refresh" size={14} color={colors.danger} />
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <View style={[styles.inputRow, { paddingBottom: spacing.md + insets.bottom }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask your coach…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          multiline
        />
        {streaming ? (
          <IconButton
            name="stop-circle"
            accessibilityLabel="Stop generating"
            size={30}
            color={colors.danger}
            onPress={stop}
          />
        ) : (
          <IconButton
            name="arrow-up-circle"
            accessibilityLabel="Send message"
            size={30}
            color={input.trim() ? colors.primary : colors.textMuted}
            onPress={() => submit(input)}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg, gap: spacing.sm },
    list: { padding: spacing.screen, gap: spacing.sm, flexGrow: 1 },

    empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.md },
    emptyTitle: { marginTop: spacing.sm },
    emptyText: { textAlign: "center", color: t.colors.textDim },
    starters: { alignSelf: "stretch", marginTop: spacing.sm },

    bubbleRow: { flexDirection: "row" },
    rowMine: { justifyContent: "flex-end" },
    rowTheirs: { justifyContent: "flex-start" },
    bubble: { maxWidth: "84%", borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 4 },
    bubbleMine: { backgroundColor: t.colors.primary },
    bubbleTheirs: { backgroundColor: t.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
    bubbleTextMine: { color: t.colors.onPrimary },
    bubbleTextTheirs: { color: t.colors.text },
    typing: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    retryRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
    retryText: { fontSize: 12, fontWeight: "700", color: t.colors.danger },

    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
      paddingHorizontal: spacing.screen,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    input: {
      flex: 1,
      maxHeight: 120,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 15,
      color: t.colors.text,
    },
  }),
);
