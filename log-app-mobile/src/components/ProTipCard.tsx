import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";

/** Small coaching box shown under a set logger. */
export function ProTipCard({
  text,
  onDismiss,
  title = "Pro Tip",
}: {
  text: string;
  onDismiss?: () => void;
  title?: string;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Ionicons name="bulb-outline" size={18} color={colors.primary} />
      <View style={styles.textWrap}>
        <Text style={[typography.bodyStrong, styles.title]}>{title}</Text>
        <Text style={[typography.small, styles.text]}>{text}</Text>
      </View>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Dismiss tip">
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    textWrap: { flex: 1, gap: 2 },
    title: { color: t.colors.text },
    text: { color: t.colors.textDim, lineHeight: 18 },
  }),
);
