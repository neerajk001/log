import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { IconBadge, type IoniconName } from "../ui/primitives";
import { useMe } from "../../hooks/useMe";
import type { AgentId } from "../../api/types";

/**
 * In-context entry into the coach: opens a fresh chat on `agent`, optionally
 * pre-filling a contextual question (never auto-sent).
 */
export function AskCoachRow({
  agent,
  label,
  question,
  hint,
  icon = "sparkles-outline",
}: {
  agent: AgentId;
  label: string;
  question?: string;
  hint?: string;
  icon?: IoniconName;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { profile } = useMe();

  // Hidden when the athlete turned the AI coach off during onboarding.
  if (profile?.ai_coach_enabled === false) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() =>
        router.navigate({
          pathname: "/coach/new",
          params: { agent, ...(question ? { q: question } : {}) },
        } as never)
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <IconBadge name={icon} bg={colors.primarySoft} color={colors.primary} size={36} rounded={false} />
      <View style={styles.text}>
        <Text style={typography.bodyStrong}>{label}</Text>
        {hint ? (
          <Text style={typography.small} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
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
    pressed: { opacity: 0.85 },
    text: { flex: 1, gap: 2 },
  }),
);
