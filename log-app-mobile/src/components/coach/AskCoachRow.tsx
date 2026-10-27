import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { IconBadge, type IoniconName } from "../ui/primitives";
import { useMe } from "../../hooks/useMe";
import { useEntitlement } from "../../hooks/useEntitlement";
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
  compact = false,
}: {
  agent: AgentId;
  label: string;
  question?: string;
  hint?: string;
  icon?: IoniconName;
  /** A slim text link instead of a full bordered row — for nesting inside a card. */
  compact?: boolean;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { profile } = useMe();
  const { isLocked, remaining } = useEntitlement();

  // Hidden when the athlete turned the AI coach off during onboarding.
  if (profile?.ai_coach_enabled === false) return null;

  const exhausted = isLocked("chat");
  const left = remaining("chat");
  const quotaHint =
    exhausted
      ? "You've used this week's free messages"
      : left !== null && left <= 1
        ? `${left} free message${left === 1 ? "" : "s"} left this week`
        : null;

  // Out of free messages: the row becomes the upgrade entry point rather than
  // opening a chat that would immediately 402.
  const open = () => {
    if (exhausted) {
      router.navigate("/paywall" as never);
      return;
    }
    router.navigate({
      pathname: "/coach/chat",
      params: { agent, q: question ?? "", date: "", fresh: "" },
    } as never);
  };

  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={open}
        hitSlop={8}
        style={({ pressed }) => [styles.compact, pressed && styles.pressed]}
      >
        <Ionicons name={icon} size={15} color={colors.primary} />
        <Text style={styles.compactText} numberOfLines={1}>
          {exhausted ? "Coach — included with Pro" : label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={open}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <IconBadge name={icon} bg={colors.primarySoft} color={colors.primary} size={36} rounded={false} />
      <View style={styles.text}>
        <Text style={typography.bodyStrong} numberOfLines={1}>
          {exhausted ? "Ask the coach — included with Pro" : label}
        </Text>
        {quotaHint ?? hint ? (
          <Text style={typography.small} numberOfLines={1}>
            {quotaHint ?? hint}
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
      borderColor: t.colors.cardBorder,
      padding: spacing.md,
    },
    pressed: { opacity: 0.85 },
    text: { flex: 1, gap: 2 },
    compact: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4 },
    compactText: { flexShrink: 1, fontSize: 13, fontWeight: "600", color: t.colors.primary },
  }),
);
