import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { IconBadge, type IoniconName } from "../ui/primitives";

export type CoachQuickAction = "meal" | "training" | "plan" | "checkin";

const QUICK_ACTIONS: {
  key: CoachQuickAction;
  title: string;
  subtitle: string;
  icon: IoniconName;
  bg: "green" | "blue" | "neutral";
}[] = [
  {
    key: "meal",
    title: "Log or estimate a meal",
    subtitle: "Describe it or attach a photo",
    icon: "restaurant",
    bg: "green",
  },
  {
    key: "training",
    title: "Review my training",
    subtitle: "Progress, volume, exercise swaps",
    icon: "barbell",
    bg: "blue",
  },
  {
    key: "plan",
    title: "Change my plan",
    subtitle: "Adjust days, sets or exercises",
    icon: "document-text",
    bg: "neutral",
  },
  {
    key: "checkin",
    title: "Weekly check-in",
    subtitle: "Weight, protein and adherence",
    icon: "stats-chart",
    bg: "green",
  },
];

const SUGGESTIONS = [
  "Am I on track this week?",
  "How can I hit my protein target?",
  "Should I change my calories?",
  "How is my training volume?",
];

const RECENT = ["Give me this week's check-in", "Is my training volume enough?"];

/** The rich landing state for the Coach tab conversation. */
export function CoachLanding({
  onQuickAction,
  onPrompt,
  onOpenContext,
  showAllSuggestions,
  onToggleSuggestions,
}: {
  onQuickAction: (action: CoachQuickAction) => void;
  onPrompt: (prompt: string) => void;
  onOpenContext: () => void;
  showAllSuggestions: boolean;
  onToggleSuggestions: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const suggestions = showAllSuggestions ? SUGGESTIONS : SUGGESTIONS.slice(0, 2);

  return (
    <View style={styles.landing}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open coach context"
        onPress={onOpenContext}
        style={({ pressed }) => [styles.context, pressed && styles.pressed]}
      >
        <IconBadge name="sparkles" bg={colors.greenSoft} color={colors.green} size={46} rounded={false} />
        <View style={styles.contextText}>
          <Text style={styles.contextTitle}>Coach context</Text>
          <Text style={styles.contextBody} numberOfLines={1}>
            Your logs · Training plan · Weekly check-in
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <View style={styles.intro}>
        <Text style={styles.heading}>What do you want to do?</Text>
        <Text style={[typography.body, styles.body]}>
          Ask anything or tap a quick action. I&apos;ll use your logs, plan and weekly check-in to
          give personalized advice.
        </Text>
      </View>

      <View style={styles.quickGrid}>
        {QUICK_ACTIONS.map((action) => {
          const iconBg =
            action.bg === "green"
              ? colors.greenSoft
              : action.bg === "blue"
                ? colors.blueSoft
                : colors.surfaceAlt;
          const iconColor =
            action.bg === "green"
              ? colors.green
              : action.bg === "blue"
                ? colors.blue
                : colors.textDim;

          return (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={action.title}
              onPress={() => onQuickAction(action.key)}
              style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
            >
              <View style={styles.quickTop}>
                <IconBadge name={action.icon} bg={iconBg} color={iconColor} size={44} rounded={false} />
                <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
              </View>
              <Text style={styles.quickTitle}>{action.title}</Text>
              <Text style={styles.quickBody}>{action.subtitle}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Suggested for you</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all suggestions"
          onPress={onToggleSuggestions}
          hitSlop={8}
          style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
        >
          <Text style={styles.seeAllText}>{showAllSuggestions ? "Show less" : "See all"}</Text>
          <Ionicons
            name={showAllSuggestions ? "chevron-up" : "chevron-forward"}
            size={15}
            color={colors.primary}
          />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {suggestions.map((prompt) => (
          <Pressable
            key={prompt}
            accessibilityRole="button"
            accessibilityLabel={prompt}
            onPress={() => onPrompt(prompt)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <Ionicons name="chatbubble-outline" size={17} color={colors.textDim} />
            <Text style={styles.chipText}>{prompt}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.divider} />

      <Text style={styles.recentTitle}>Recent in this chat</Text>
      <View style={styles.recentCard}>
        {RECENT.map((prompt, i) => (
          <View key={prompt}>
            {i > 0 ? <View style={styles.recentDivider} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={prompt}
              onPress={() => onPrompt(prompt)}
              style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}
            >
              <Ionicons name="chatbubble-outline" size={19} color={colors.textDim} />
              <Text style={styles.recentText} numberOfLines={1}>
                {prompt}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    landing: { gap: spacing.lg, paddingTop: spacing.xs },
    pressed: { opacity: 0.7 },

    context: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      borderRadius: radii.xl,
      padding: spacing.md,
    },
    contextText: { flex: 1, minWidth: 0, gap: 2 },
    contextTitle: { fontSize: 15, fontWeight: "700", color: t.colors.text },
    contextBody: { fontSize: 13, color: t.colors.textDim },

    intro: { gap: spacing.sm },
    heading: { fontSize: 27, fontWeight: "800", letterSpacing: -0.5, color: t.colors.text },
    body: { color: t.colors.textDim, lineHeight: 22 },

    quickGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "stretch",
      justifyContent: "space-between",
      rowGap: spacing.md,
    },
    quickCard: {
      width: "48%",
      minHeight: 142,
      justifyContent: "space-between",
      gap: spacing.sm,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      borderRadius: radii.xl,
      padding: spacing.md,
    },
    quickTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
    quickTitle: { fontSize: 16, fontWeight: "700", color: t.colors.text, lineHeight: 21 },
    quickBody: { fontSize: 13, color: t.colors.textDim, lineHeight: 18 },

    sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    sectionTitle: { fontSize: 20, fontWeight: "800", color: t.colors.text },
    seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
    seeAllText: { fontSize: 13, fontWeight: "700", color: t.colors.primary },

    chipRow: { gap: spacing.sm, paddingVertical: 1 },
    chip: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      paddingHorizontal: spacing.md,
    },
    chipText: { fontSize: 13, fontWeight: "500", color: t.colors.text },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border },

    recentTitle: { fontSize: 16, fontWeight: "700", color: t.colors.text },
    recentCard: {
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      borderRadius: radii.xl,
      overflow: "hidden",
    },
    recentRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    recentText: { flex: 1, minWidth: 0, fontSize: 14, color: t.colors.text },
    recentDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.border,
      marginLeft: spacing.md + 19 + spacing.md,
    },
  }),
);
