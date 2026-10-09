import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Banner, IconBadge } from "../../src/components/ui/primitives";
import { Chip, ChipRow, IconButton } from "../../src/components/ui/controls";
import { useCoachChat } from "../../src/hooks/useCoachChat";
import type { CoachMessage } from "../../src/api/types";

const STARTERS = [
  "Give me this week's check-in",
  "Is my training volume enough?",
  "How's my protein intake?",
  "Should I change my calories?",
];

export default function CoachScreen() {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { messages, loading, sending, error, send } = useCoachChat();
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList<CoachMessage>>(null);

  useEffect(() => {
    if (messages.length > 0) {
      const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      return () => clearTimeout(t);
    }
  }, [messages.length, sending]);

  const submit = (text: string) => {
    setInput("");
    void send(text);
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
          return (
            <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[typography.body, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                  {item.content}
                </Text>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          sending ? (
            <View style={[styles.bubbleRow, styles.rowTheirs]}>
              <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
                <ActivityIndicator size="small" color={colors.textDim} />
                <Text style={[typography.small]}>Coach is thinking…</Text>
              </View>
            </View>
          ) : null
        }
      />

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask your coach…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          multiline
          editable={!sending}
        />
        <IconButton
          name="arrow-up-circle"
          accessibilityLabel="Send message"
          size={30}
          color={input.trim() && !sending ? colors.primary : colors.textMuted}
          onPress={() => {
            if (input.trim()) submit(input);
          }}
        />
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
    bubble: { maxWidth: "84%", borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    bubbleMine: { backgroundColor: t.colors.primary },
    bubbleTheirs: { backgroundColor: t.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
    bubbleTextMine: { color: t.colors.onPrimary },
    bubbleTextTheirs: { color: t.colors.text },
    typing: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
      paddingHorizontal: spacing.screen,
      paddingBottom: spacing.md,
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
