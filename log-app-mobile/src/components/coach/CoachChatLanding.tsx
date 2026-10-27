import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/clerk-expo";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { IconBadge, type IoniconName } from "../ui/primitives";
import type { AgentId } from "../../api/types";

const SUGGESTIONS: Record<AgentId, { text: string; icon: IoniconName }[]> = {
  general: [
    { text: "Give me this week's check-in", icon: "calendar-outline" },
    { text: "Is my protein intake on track?", icon: "restaurant-outline" },
    { text: "Am I progressing on my lifts?", icon: "bar-chart-outline" },
    { text: "Should I change my calories?", icon: "disc-outline" },
  ],
  meal: [
    { text: "Is my protein intake on track?", icon: "restaurant-outline" },
    { text: "Am I over my calories today?", icon: "flame-outline" },
    { text: "What should I eat next?", icon: "leaf-outline" },
    { text: "How can I hit my protein target?", icon: "bar-chart-outline" },
  ],
  training: [
    { text: "Is my training volume enough?", icon: "barbell-outline" },
    { text: "Am I progressing on my lifts?", icon: "trending-up-outline" },
    { text: "Should I deload this week?", icon: "refresh-outline" },
    { text: "How is my recovery looking?", icon: "moon-outline" },
  ],
};

const QUESTIONS: Record<AgentId, string> = {
  general: "How can I help you today?",
  meal: "What can I help with your meals today?",
  training: "How can I help with your training today?",
};

/** Full-chat empty state: a greeting from the coach plus tappable prompts. */
export function CoachChatLanding({
  agent,
  onPrompt,
}: {
  agent: AgentId;
  onPrompt: (prompt: string) => void;
}) {
  const { user } = useUser();
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const name = user?.firstName?.trim() || user?.fullName?.split(" ")[0] || "there";
  const suggestions = SUGGESTIONS[agent];

  return (
    <View style={styles.landing}>
      <View style={styles.greetingRow}>
        <IconBadge name="sparkles" bg={colors.greenSoft} color={colors.green} size={38} rounded={false} />
        <View style={styles.bubble}>
          <Text style={styles.greeting}>Hey {name}!</Text>
          <Text style={[typography.bodyStrong, styles.question]}>{QUESTIONS[agent]}</Text>
          <Text style={[typography.small, styles.body]}>
            I can see your logs, plan and weekly check-in. Ask me anything or choose a suggestion
            below.
          </Text>
        </View>
      </View>

      <Text style={styles.tryLabel}>You can try:</Text>

      <View style={styles.suggestions}>
        {suggestions.map((item) => (
          <Pressable
            key={item.text}
            accessibilityRole="button"
            accessibilityLabel={item.text}
            onPress={() => onPrompt(item.text)}
            style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
          >
            <Ionicons name={item.icon} size={18} color={colors.textDim} />
            <Text style={styles.suggestionText}>{item.text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    landing: { gap: spacing.lg, paddingTop: spacing.md },
    pressed: { opacity: 0.7 },

    greetingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    bubble: {
      flex: 1,
      minWidth: 0,
      gap: 4,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      borderRadius: radii.xl,
      padding: spacing.md,
    },
    greeting: { fontSize: 16, fontWeight: "700", color: t.colors.text },
    question: { fontSize: 16 },
    body: { color: t.colors.textDim, lineHeight: 19 },

    tryLabel: { ...t.typography.small, color: t.colors.textDim, marginTop: spacing.xs },
    suggestions: { gap: spacing.sm },
    suggestion: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
    },
    suggestionText: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "500", color: t.colors.text },
  }),
);

