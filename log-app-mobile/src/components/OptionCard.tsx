import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { IconBadge, type IoniconName } from "./ui/primitives";

/**
 * A large tappable card used both for picking one of several answers (`selected`)
 * and for triggering an action (no `selected` ⇒ trailing chevron).
 */
export function OptionCard({
  icon,
  title,
  subtitle,
  selected,
  accent = false,
  expanded,
  onPress,
  disabled = false,
  style,
}: {
  icon?: IoniconName;
  title: string;
  subtitle?: string;
  selected?: boolean;
  /** Highlights a recommended option. */
  accent?: boolean;
  /** Turns the trailing chevron into an up/down accordion affordance. */
  expanded?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const isPick = selected !== undefined;
  const active = isPick ? !!selected : accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isPick ? !!selected : undefined, disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.card,
        active && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {icon ? (
        <IconBadge
          name={icon}
          bg={active ? colors.primary : colors.surfaceAlt}
          color={active ? colors.onPrimary : colors.text}
          size={40}
          rounded={false}
        />
      ) : null}
      <View style={styles.text}>
        <Text style={[typography.bodyStrong, active && { color: colors.primary }]}>{title}</Text>
        {subtitle ? <Text style={[typography.small, styles.subtitle]}>{subtitle}</Text> : null}
      </View>
      {isPick ? (
        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={22}
          color={selected ? colors.primary : colors.textMuted}
        />
      ) : (
        <Ionicons
          name={expanded === undefined ? "chevron-forward" : expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.textMuted}
        />
      )}
    </Pressable>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.lg,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    text: { flex: 1, gap: 2 },
    subtitle: { color: t.colors.textDim },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.75 },
  }),
);
