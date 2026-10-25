import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Card, IconBadge, Tag, type IoniconName } from "../ui/primitives";
import { useEntitlement, type Gate } from "../../hooks/useEntitlement";

/**
 * Renders `children` when the athlete has access, otherwise a locked card that
 * explains what Pro adds. Never renders placeholder or blurred real data — the
 * locked state is an honest "not included", not a fake preview.
 */
export function ProGate({
  gate,
  title,
  subtitle,
  icon = "sparkles-outline",
  children,
}: {
  gate: Gate;
  title: string;
  subtitle: string;
  icon?: IoniconName;
  children: ReactNode;
}) {
  const { isLocked } = useEntitlement();
  if (!isLocked(gate)) return <>{children}</>;
  return <LockedCard title={title} subtitle={subtitle} icon={icon} />;
}

/** The locked card on its own, for call sites that decide the gate themselves. */
export function LockedCard({
  title,
  subtitle,
  icon = "sparkles-outline",
}: {
  title: string;
  subtitle: string;
  icon?: IoniconName;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle} See what Pro includes.`}
      onPress={() => router.navigate("/paywall" as never)}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={styles.card}>
        <IconBadge name={icon} bg={colors.primarySoft} color={colors.primary} size={38} rounded={false} />
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <Text style={typography.bodyStrong} numberOfLines={1}>
              {title}
            </Text>
            <Tag label="PRO" bg={colors.primarySoft} text={colors.primary} />
          </View>
          <Text style={typography.small} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    text: { flex: 1, gap: 2 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    pressed: { opacity: 0.85 },
  }),
);
